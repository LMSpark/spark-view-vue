package com.spark.ai.stills;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.config.OpenAiProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Stills 协议 AI 助手 — 工具回路闭环。
 *
 * <h3>流程</h3>
 * <ol>
 *   <li>将用户消息 + Stills 系统提示词发给 LLM</li>
 *   <li>LLM 每轮最多输出一个 {@code @@request} 或 {@code @@describe} 协议块，或直接输出纯文本</li>
 *   <li>协议块送入 {@link StillsOrchestrator} 执行，执行结果以 {@code @@result} 或 {@code @@error} 回灌给 LLM</li>
 *   <li>收到 {@code @@error} 时继续让 LLM 自动修正；收到 {@code @@result} 时只再请求一轮自然语言总结并立即返回</li>
 * </ol>
 *
 * <p><b>静默纠错</b>：纠错过程对用户完全透明，用户只看到最终结果。
 */
@Service
public class StillsAssistantService {

    private static final Logger log = LoggerFactory.getLogger(StillsAssistantService.class);

    /** 工具回路最大轮次（防止无限循环） */
    private static final int MAX_TOOL_ROUNDS = 5;

    private static final String PROTOCOL_SYSTEM_PROMPT = """
            你是一个 Stills 协议驱动的智能助手。你不能直接操作外部世界，必须通过 Stills 协议。
            
            ## 交互闭环协议：
            1. **输出规范**：当你需要执行操作时，必须构造如下格式：
               @@request:<action>#<id>
               <JSON 参数>
               @@end
               
               其中 <action> 是操作类型（如 file.write、db.query），<id> 是唯一请求标识。
                    每次回复最多只能包含一个 Stills 协议块；如果需要多个动作，必须等上一轮结果返回后再决定下一步。

                1.1 **查看能力**：当你需要查看当前支持的动作时，必须输出：
                    @@describe:system.capabilities#<id>
                    {}
                    @@end
            
            2. **自我修正**：如果你收到 @@error，这代表你的参数被系统拦截了。
               - 你必须仔细阅读 msg 和 fix 字段。
               - **禁止** 向用户抱怨或解释错误。
               - **立即** 修正参数并再次发起请求。
            
            3. **直到成功**：只有收到 @@result 后，你才能根据结果回答用户的问题。
            
            4. **纯文本回答**：当不需要执行操作时，直接用自然语言回答。
            """;

    /** Stills 模式系统提示词 — 与 STILLS_RUNTIME_PROMPT.md 保持一致 */
    private static final String STILLS_SYSTEM_PROMPT = """
            你通过 Stills 协议与 Stills 引擎交互。
            
            ══ 协议语法 ══
            
              @@<type>:<action>#<id>
              <JSON>
              @@end
            
            type：describe（查询）/ request（执行）。
            系统返回 @@result（成功）或 @@error（失败，含 code + msg + fix）。
            一轮只能发一个协议块。
            
            ══ 发现优先 ══
            
            你的角色、目标、可用动作、参数格式、守卫条件——全部由引擎动态提供：
            
              session.describe      → 当前角色 + 状态 + 推荐下一步
              stills.capabilities   → 全部动作目录（params / example / guard）
              stills.actionSpec     → 单个动作详细规格
            
            **以上三个发现动作是唯一真实来源。不假设任何动作名或参数格式。**
            
            ══ 执行纪律 ══
            
            1. 首轮必须 @@describe:session.describe —— 获取角色与状态
            2. 首次执行前必须 @@describe:stills.capabilities —— 获取全部动作规格
            3. 参数格式以 stills.capabilities 返回值为准
            4. 一轮最多一个协议块
            5. 引擎有状态守卫，违反时返回 @@error + fix
            6. @@error 的 fix 字段是必读输入，不允许忽略
            7. 连续 2 次同一错误 → 向用户请求澄清
            8. 口头声明不算数 —— 只有收到 @@result 的变更才存在
            
            ══ 蓝图纪律 ══
            
            引擎支持蓝图工作流（blueprint）。当 session.describe 指示需要蓝图时：
            - 先创建 blueprint，再执行写动作
            - blueprint 管步骤，不存业务数据
            - 不确定的项放 openQuestions
            - 不替用户决定关键业务事实 —— 必须确认后再执行
            """;

    private final StillsOrchestrator orchestrator;
    private final OpenAiProperties props;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    public StillsAssistantService(StillsOrchestrator orchestrator,
                               OpenAiProperties props,
                               ObjectMapper objectMapper) {
        this.orchestrator = orchestrator;
        this.props = props;
        this.objectMapper = objectMapper;

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10_000);
        factory.setReadTimeout(props.isReasonerModel() ? 300_000 : 120_000);

        this.restClient = RestClient.builder()
                .requestFactory(factory)
                .baseUrl(props.getBaseUrl())
                .defaultHeader("Authorization", "Bearer " + props.getApiKey())
                .defaultHeader("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .build();
    }

    /**
     * 处理用户对话 — 工具回路。
     *
     * @param userMessage 用户输入
     * @param mode        "protocol"（默认通用协议）或 "stills"（Stills 引擎协议）
     * @return AI 最终回答（已完成所有工具调用）
     */
    public StillsChatResponse chat(String userMessage, String mode) {
        String systemPrompt = "stills".equalsIgnoreCase(mode) ? STILLS_SYSTEM_PROMPT : PROTOCOL_SYSTEM_PROMPT;
        List<Map<String, String>> messages = new ArrayList<>();
        messages.add(Map.of("role", "system", "content", systemPrompt));
        messages.add(Map.of("role", "user", "content", userMessage));

        List<String> toolTrace = new ArrayList<>();
        int round = 0;

        while (round < MAX_TOOL_ROUNDS) {
            round++;
            log.info("[STILLS-ASSISTANT] 轮次 {}/{}", round, MAX_TOOL_ROUNDS);

            // 调用 LLM
            String aiOutput = callLlm(messages);
            if (aiOutput == null || aiOutput.isBlank()) {
                return new StillsChatResponse("AI 未返回有效内容", toolTrace, round);
            }

            // 检查是否包含 Stills 协议块
            if (!aiOutput.contains("@@") || !aiOutput.contains("@@end")) {
                // 纯文本回答 — 结束回路
                return new StillsChatResponse(aiOutput, toolTrace, round);
            }

            // 送入编排器执行
            String toolResult = orchestrator.processProtocol(aiOutput);
            toolTrace.add("Round " + round + " → " + summarize(toolResult));

            // 将 AI 输出和工具结果加入对话历史
            messages.add(Map.of("role", "assistant", "content", aiOutput));
            messages.add(Map.of("role", "user", "content",
                    "[系统工具执行结果]\n" + toolResult));

            // 如果工具返回的是 @@result（成功），让 AI 再回答一轮总结
            if (toolResult.contains("@@result:")) {
                String finalAnswer = callLlm(messages);
                return new StillsChatResponse(
                        finalAnswer != null ? finalAnswer : "操作已完成",
                        toolTrace, round);
            }

            // @@error — 继续回路让 AI 自动修正
        }

        return new StillsChatResponse("达到最大工具调用轮次 (" + MAX_TOOL_ROUNDS + ")，请简化操作后重试",
                toolTrace, round);
    }

    // ─────────────────────────────────────────────────────────────────────────

    private String callLlm(List<Map<String, String>> messages) {
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("model", props.getModel());
            body.put("messages", messages);
            body.put("max_tokens", props.getEffectiveMaxTokens());

            Double temp = props.getEffectiveTemperature();
            if (temp != null) {
                body.put("temperature", temp);
            }

            String bodyJson = objectMapper.writeValueAsString(body);

            String responseJson = restClient.post()
                    .uri("/v1/chat/completions")
                    .body(bodyJson)
                    .retrieve()
                    .body(String.class);

            if (responseJson == null) {
                return null;
            }

            Map<String, Object> responseMap = objectMapper.readValue(
                    responseJson, new TypeReference<>() {});

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> choices = (List<Map<String, Object>>) responseMap.get("choices");
            if (choices == null || choices.isEmpty()) {
                return null;
            }

            @SuppressWarnings("unchecked")
            Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");
            return message != null ? (String) message.get("content") : null;

        } catch (Exception e) {
            log.error("[STILLS-ASSISTANT] LLM 调用失败: {}", e.getMessage(), e);
            return null;
        }
    }

    private String summarize(String toolResult) {
        if (toolResult.length() > 200) {
            return toolResult.substring(0, 200) + "...";
        }
        return toolResult;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 响应载体
    // ─────────────────────────────────────────────────────────────────────────

    public static class StillsChatResponse {
        private final String answer;
        private final List<String> toolTrace;
        private final int rounds;

        public StillsChatResponse(String answer, List<String> toolTrace, int rounds) {
            this.answer = answer;
            this.toolTrace = toolTrace;
            this.rounds = rounds;
        }

        public String getAnswer()        { return answer; }
        public List<String> getToolTrace() { return toolTrace; }
        public int getRounds()            { return rounds; }
    }
}
