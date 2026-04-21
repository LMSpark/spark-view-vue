package com.spark.ai.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.config.OpenAiProperties;
import com.spark.ai.model.GeneralChatRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 通用 AI 流式对话服务（DeepSeek 深度适配）。
 *
 * <ul>
 *   <li>调用 OpenAI 兼容端点（stream: true），逐 token 流式转发给客户端 SSE。</li>
 *   <li>仅服务通用聊天场景，不再承载页面配置生成链路。</li>
 * </ul>
 *
 * <h3>DeepSeek 适配要点</h3>
 * <ul>
 *   <li><b>deepseek-reasoner</b>：流式 delta 中先出 reasoning_content（思考过程），再出 content（最终回答）</li>
 *   <li>reasoning_content 以独立 SSE 事件 "reasoning" 推送，与 "delta"（正文内容）分离</li>
 *   <li>reasoner 模型不传 temperature / top_p / response_format 参数</li>
 *   <li>DeepSeek 支持 stream_options.include_usage=true，在流式最后一条 chunk 返回 token 用量</li>
 *   <li>DeepSeek 上下文缓存命中率（prompt_cache_hit_tokens）通过 usage 事件透传</li>
 * </ul>
 */
@Service
public class AiStreamService {

    private static final Logger log = LoggerFactory.getLogger(AiStreamService.class);

    /** 默认系统提示词（可被请求体中的 systemPrompt 覆盖） */
    private static final String DEFAULT_SYSTEM_PROMPT =
            "你是一个友好、专业的 AI 助手。用中文回答，清晰简洁、有条理。";

    private final OpenAiProperties props;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;
    private final ExecutorService executor = Executors.newCachedThreadPool();

    public AiStreamService(OpenAiProperties props, ObjectMapper objectMapper) {
        this.props = props;
        this.objectMapper = objectMapper;

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(15_000);
        // DeepSeek-reasoner 思考过程可能较长，适当延长超时
        factory.setReadTimeout(props.isReasonerModel() ? 300_000 : 180_000);

        this.restClient = RestClient.builder()
                .requestFactory(factory)
                .baseUrl(props.getBaseUrl())
                .defaultHeader("Authorization", "Bearer " + props.getApiKey())
                .defaultHeader("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .build();

        if (props.isDeepSeek()) {
            log.info("[SPARK-AI][STREAM] DeepSeek 模式已激活 model={} reasoner={}",
                    props.getModel(), props.isReasonerModel());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 公共入口：创建 SseEmitter 并在后台线程执行流式调用
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 异步流式对话。
     *
     * @param request 前端请求（messages + mode + systemPrompt）
     * @return SseEmitter，立即返回给控制器
     */
    public SseEmitter streamChat(GeneralChatRequest request) {
        // DeepSeek-reasoner 思考时间更长，SSE 超时延长到 5 分钟
        long timeout = props.isReasonerModel() ? 300_000L : 180_000L;
        SseEmitter emitter = new SseEmitter(timeout);
        executor.execute(() -> doStream(request, emitter));
        return emitter;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 核心流式处理
    // ─────────────────────────────────────────────────────────────────────────

    private void doStream(GeneralChatRequest request, SseEmitter emitter) {
        try {
            List<Map<String, String>> messages = buildMessages(request);

            Map<String, Object> body = buildRequestBody(messages);
            String bodyJson = objectMapper.writeValueAsString(body);
            log.info("[SPARK-AI][STREAM] start msgCount={} model={} deepseek={} reasoner={}",
                    messages.size(), props.getModel(), props.isDeepSeek(), props.isReasonerModel());

            restClient.post()
                    .uri("/v1/chat/completions")
                    .body(bodyJson)
                    .exchange((httpRequest, response) -> {
                        try (BufferedReader reader = new BufferedReader(
                                new InputStreamReader(response.getBody(), StandardCharsets.UTF_8))) {
                            processStreamLines(reader, emitter);
                        } catch (IOException e) {
                            log.error("[SPARK-AI][STREAM] read error: {}", e.getMessage());
                            emitter.completeWithError(e);
                        }
                        return null;
                    }, false);

        } catch (Exception e) {
            log.error("[SPARK-AI][STREAM] error: {}", e.getMessage(), e);
            try {
                emitter.send(SseEmitter.event()
                        .name("error")
                        .data("{\"error\":\"" + escapeJson(e.getMessage()) + "\"}"));
            } catch (IOException ignored) { /* ignore */ }
            emitter.completeWithError(e);
        }
    }

    /**
     * 构建请求体，自动适配 DeepSeek / OpenAI 差异。
     *
     * <p>DeepSeek-reasoner 限制：
     * <ul>
     *   <li>不支持 temperature / top_p / presence_penalty / frequency_penalty</li>
     *   <li>不支持 response_format</li>
     * </ul>
     */
    private Map<String, Object> buildRequestBody(List<Map<String, String>> messages) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", props.getModel());
        body.put("messages", messages);
        body.put("stream", true);
        body.put("max_tokens", props.getEffectiveMaxTokens());

        // temperature / top_p — DeepSeek-reasoner 不支持
        Double effectiveTemp = props.getEffectiveTemperature();
        if (effectiveTemp != null) {
            body.put("temperature", effectiveTemp);
        }
        if (!props.isReasonerModel() && props.getTopP() != null) {
            body.put("top_p", props.getTopP());
        }

        // frequency_penalty / presence_penalty — DeepSeek-reasoner 不支持
        if (!props.isReasonerModel()) {
            if (props.getFrequencyPenalty() != null) {
                body.put("frequency_penalty", props.getFrequencyPenalty());
            }
            if (props.getPresencePenalty() != null) {
                body.put("presence_penalty", props.getPresencePenalty());
            }
        }

        // DeepSeek：启用 stream_options 获取 token 用量统计（含缓存命中率）
        if (props.isDeepSeek()) {
            body.put("stream_options", Map.of("include_usage", true));
        }

        // 流式模式不设 response_format（json_object 不兼容 stream）
        return body;
    }

    /**
     * 逐行解析 SSE 流，将 delta.content 和 delta.reasoning_content 分别转发给客户端。
     *
     * <p>OpenAI 流格式：
     * <pre>
     * data: {"id":"...","choices":[{"delta":{"content":"hello"},"finish_reason":null}]}
     * data: [DONE]
     * </pre>
     *
     * <p>DeepSeek-reasoner 流格式（先 reasoning 再 content）：
     * <pre>
     * data: {"choices":[{"delta":{"reasoning_content":"让我想想..."}}]}
     * data: {"choices":[{"delta":{"reasoning_content":"分析步骤..."}}]}
     * data: {"choices":[{"delta":{"content":"最终答案..."}}]}
     * data: {"usage":{...,"prompt_cache_hit_tokens":1024}}
     * data: [DONE]
     * </pre>
     *
     * <p>SSE 事件类型：
     * <ul>
     *   <li><b>delta</b>：正文内容增量 {"delta":"..."}</li>
     *   <li><b>reasoning</b>：推理过程增量 {"reasoning":"..."}（仅 DeepSeek-reasoner）</li>
     *   <li><b>usage</b>：token 用量统计 {"usage":{...}}（仅 DeepSeek + stream_options.include_usage）</li>
     *   <li><b>done</b>：流结束 {"done":true}</li>
     *   <li><b>error</b>：错误 {"error":"..."}</li>
     * </ul>
     */
    private void processStreamLines(BufferedReader reader, SseEmitter emitter) throws IOException {
        String line;
        while ((line = reader.readLine()) != null) {
            if (!line.startsWith("data: ")) continue;

            String data = line.substring("data: ".length()).trim();
            if ("[DONE]".equals(data)) {
                emitter.send(SseEmitter.event().name("done").data("{\"done\":true}"));
                emitter.complete();
                return;
            }

            try {
                Map<String, Object> parsed = objectMapper.readValue(data, new TypeReference<>() {});

                // ── DeepSeek-reasoner: reasoning_content（思考过程） ──
                String reasoning = extractReasoningContent(parsed);
                if (reasoning != null && !reasoning.isEmpty()) {
                    String payload = "{\"reasoning\":" + objectMapper.writeValueAsString(reasoning) + "}";
                    emitter.send(SseEmitter.event().name("reasoning").data(payload));
                }

                // ── 正文内容：delta.content ──
                String delta = extractDelta(parsed);
                if (delta != null && !delta.isEmpty()) {
                    String payload = "{\"delta\":" + objectMapper.writeValueAsString(delta) + "}";
                    emitter.send(SseEmitter.event().name("delta").data(payload));
                }

                // ── DeepSeek: usage 统计（最后一个 chunk，含缓存命中） ──
                Map<String, Object> usage = extractUsage(parsed);
                if (usage != null) {
                    String usageJson = objectMapper.writeValueAsString(Map.of("usage", usage));
                    emitter.send(SseEmitter.event().name("usage").data(usageJson));
                    logUsageStats(usage);
                }
            } catch (Exception ignored) {
                // 跳过非 JSON 或格式不符的行
            }
        }
        // 流结束（无 [DONE]）
        emitter.send(SseEmitter.event().name("done").data("{\"done\":true}"));
        emitter.complete();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 辅助方法
    // ─────────────────────────────────────────────────────────────────────────

    private List<Map<String, String>> buildMessages(GeneralChatRequest request) {
        List<Map<String, String>> messages = new ArrayList<>();

        // system 消息（优先使用请求体中的自定义提示词）
        String sysPrompt = (request.getSystemPrompt() != null && !request.getSystemPrompt().isBlank())
                ? request.getSystemPrompt()
                : DEFAULT_SYSTEM_PROMPT;
        messages.add(Map.of("role", "system", "content", sysPrompt));

        // 用户/助手历史消息
        if (request.getMessages() != null) {
            for (GeneralChatRequest.MessageDto msg : request.getMessages()) {
                if (msg.getRole() != null && msg.getContent() != null) {
                    messages.add(Map.of("role", msg.getRole(), "content", msg.getContent()));
                }
            }
        }
        return messages;
    }

    /** 提取 delta.content（所有模型通用） */
    private String extractDelta(Map<String, Object> parsed) {
        Map<?, ?> delta = getFirstDelta(parsed);
        if (delta == null) return null;
        Object content = delta.get("content");
        return content instanceof String s ? s : null;
    }

    /**
     * 提取 delta.reasoning_content（DeepSeek-reasoner 特有）。
     * <p>deepseek-reasoner 在流式 chunk 的 delta 中返回 reasoning_content 字段，
     * 包含模型的思考推理过程，先于 content 出现。
     */
    private String extractReasoningContent(Map<String, Object> parsed) {
        Map<?, ?> delta = getFirstDelta(parsed);
        if (delta == null) return null;
        Object reasoning = delta.get("reasoning_content");
        return reasoning instanceof String s ? s : null;
    }

    /** 提取 usage 对象（DeepSeek stream_options.include_usage=true 时返回） */
    @SuppressWarnings("unchecked")
    private Map<String, Object> extractUsage(Map<String, Object> parsed) {
        Object usageObj = parsed.get("usage");
        if (usageObj instanceof Map<?, ?> usage && !usage.isEmpty()) {
            return (Map<String, Object>) usageObj;
        }
        return null;
    }

    /** 从 choices[0] 获取 delta 对象 */
    private Map<?, ?> getFirstDelta(Map<String, Object> parsed) {
        Object choicesObj = parsed.get("choices");
        if (!(choicesObj instanceof List<?> choices) || choices.isEmpty()) return null;
        Object firstObj = choices.get(0);
        if (!(firstObj instanceof Map<?, ?> first)) return null;
        Object deltaObj = first.get("delta");
        return deltaObj instanceof Map<?, ?> delta ? delta : null;
    }

    /** 记录 token 用量（含 DeepSeek 缓存命中率） */
    private void logUsageStats(Map<String, Object> usage) {
        Object promptTokens = usage.get("prompt_tokens");
        Object completionTokens = usage.get("completion_tokens");
        Object totalTokens = usage.get("total_tokens");
        // DeepSeek 特有：上下文缓存命中信息
        Object cacheHit = usage.get("prompt_cache_hit_tokens");
        Object cacheMiss = usage.get("prompt_cache_miss_tokens");

        if (cacheHit != null || cacheMiss != null) {
            log.info("[SPARK-AI][STREAM] usage: prompt={} completion={} total={} cacheHit={} cacheMiss={}",
                    promptTokens, completionTokens, totalTokens, cacheHit, cacheMiss);
        } else {
            log.info("[SPARK-AI][STREAM] usage: prompt={} completion={} total={}",
                    promptTokens, completionTokens, totalTokens);
        }
    }

    private static String escapeJson(String s) {
        if (s == null) return "unknown error";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
    }
}
