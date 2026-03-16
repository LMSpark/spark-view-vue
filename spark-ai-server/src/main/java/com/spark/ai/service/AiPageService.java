package com.spark.ai.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.config.OpenAiProperties;
import com.spark.ai.model.AiChatRequest;
import com.spark.ai.model.AiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 核心服务：构建提示词 → 调用 LLM → 解析响应。
 *
 * 支持所有 OpenAI 兼容端点（OpenAI / Azure / Ollama / Qwen / DeepSeek 等）。
 * 内置文件校验 + 重试机制：解析失败或 JSON 不合法时自动重试。
 */
@Service
public class AiPageService {

    /** 每阶段最大重试次数 */
    private static final int MAX_RETRIES = 1;
    /** 自动迭代最大轮次（含首次生成） */
    private static final int MAX_ITERATIONS = 1;
    /** Phase-1 必须包含的文件（UI 层：结构 + 样式） */
    private static final List<String> PHASE1_REQUIRED = List.of("rule.json");
    /** Phase-2 必须包含的文件（数据 + 行为层） */
    private static final List<String> PHASE2_REQUIRED = List.of("pagedata.json");

    /** Phase 结果内部载体 */
    private record PhaseResult(Map<String, String> files, String explanation, boolean needsIteration) {}

    private static final Logger log = LoggerFactory.getLogger(AiPageService.class);

    private final OpenAiProperties props;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;
    private final ComponentMetadataService metadataService;
    private final ExecutorService executor = Executors.newCachedThreadPool();

    public AiPageService(OpenAiProperties props, ObjectMapper objectMapper,
                         ComponentMetadataService metadataService) {
        this.props = props;
        this.objectMapper = objectMapper;
        this.metadataService = metadataService;

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10_000);   // 连接超时 10s
        // DeepSeek-reasoner 思考阶段可能较长，延长读取超时
        factory.setReadTimeout(props.isReasonerModel() ? 300_000 : 120_000);

        this.restClient = RestClient.builder()
                .requestFactory(factory)
                .baseUrl(props.getBaseUrl())
                .defaultHeader("Authorization", "Bearer " + props.getApiKey())
                .defaultHeader("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .build();

        if (props.isDeepSeek()) {
            log.info("[SPARK-AI] DeepSeek 模式已激活 model={} reasoner={} jsonMode={}",
                    props.getModel(), props.isReasonerModel(), props.isEffectiveJsonMode());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 公共入口
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 两阶段生成 + 自动迭代流程：
     * <p>
     * 每轮包含 Phase-1（rule.json + style.css）和 Phase-2（pagedata.json + script.js）。
     * Phase-2 若标记 needsIteration=true，自动以 iterate 模式重跑下一轮，
     * 最多 {@link #MAX_ITERATIONS} 轮。前端通过 iterationRound 字段感知当前轮次。
     */
    public AiResponse processRequest(AiChatRequest request) {
        try {
            String systemPrompt = buildSystemPrompt(request);
            String pid = request.getPageId() != null ? request.getPageId() : "ai-page";

            // 多轮对话：所有阶段和迭代共享一条对话链
            List<Map<String, String>> conversation = new ArrayList<>();
            conversation.add(Map.of("role", "system", "content", systemPrompt));
            log.info("[SPARK-AI] 多轮对话初始化 systemPromptLen={}", systemPrompt.length());

            int round = 0;
            Map<String, String> merged = null;
            String explanation = "";
            boolean needsIter = false;
            AiChatRequest currentReq = request;

            do {
                round++;
                log.info("[SPARK-AI] ====== 迭代轮次 {}/{} action={} pageId={} ======",
                         round, MAX_ITERATIONS, currentReq.getAction(), pid);

                // ── Phase 1: rule.json + style.css（UI 层）──
                String phase1Msg = buildPhase1Message(currentReq);
                log.info("[SPARK-AI] R{}-Phase1 start, msgLen={}", round, phase1Msg.length());

                PhaseResult phase1 = callPhase(conversation, phase1Msg, PHASE1_REQUIRED,
                                                "R" + round + "-Phase1");
                if (phase1 == null) {
                    return buildErrorResponse(request,
                            "第" + round + "轮 UI 层（rule.json + style.css）生成失败，请重试");
                }

                // ── Phase 2: pagedata.json + script.js（数据 + 行为层）──
                String phase2Msg = buildPhase2Message(currentReq, phase1.files());
                log.info("[SPARK-AI] R{}-Phase2 start, msgLen={}", round, phase2Msg.length());

                PhaseResult phase2 = callPhase(conversation, phase2Msg, PHASE2_REQUIRED,
                                                "R" + round + "-Phase2");

                // ── Merge ──
                merged = mergePhaseFiles(phase1.files(), phase2 != null ? phase2.files() : null);
                merged.putIfAbsent("pagedata.json", "{}");
                merged.putIfAbsent("style.css", "");
                merged.putIfAbsent("script.js", "");

                String roundExpl = phase1.explanation() != null ? phase1.explanation() : "";
                if (phase2 != null && phase2.explanation() != null && !phase2.explanation().isBlank()) {
                    roundExpl += "\n" + phase2.explanation();
                }
                explanation = roundExpl;

                needsIter = (phase2 != null && phase2.needsIteration());

                if (needsIter && round < MAX_ITERATIONS) {
                    log.info("[SPARK-AI] 第{}轮 AI 标记 needsIteration=true，自动进入下一轮迭代", round);
                    currentReq = buildIterateRequest(request, merged, roundExpl);
                }

            } while (needsIter && round < MAX_ITERATIONS);

            if (needsIter) {
                log.warn("[SPARK-AI] 达到最大迭代次数 {}，AI 仍标记 needsIteration=true", MAX_ITERATIONS);
            }

            log.info("[SPARK-AI] 完成 totalRounds={} files={} needsIteration={} conversationMsgs={}",
                     round, merged.keySet(), needsIter, conversation.size());
            return new AiResponse(merged, explanation, needsIter, round);

        } catch (Exception e) {
            log.error("[SPARK-AI] error: {}", e.getMessage(), e);
            return buildErrorResponse(request, e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 流式页面生成入口（SSE）
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 流式版两阶段生成：逐 token 推送 LLM 输出到 SseEmitter。
     *
     * <p>SSE 事件类型：
     * <ul>
     *   <li><b>phase</b>：阶段进度 {"phase":1,"status":"start","message":"..."}</li>
     *   <li><b>delta</b>：LLM 正文内容增量 {"delta":"..."}</li>
     *   <li><b>reasoning</b>：推理过程增量 {"reasoning":"..."}（仅 DeepSeek-reasoner）</li>
     *   <li><b>result</b>：最终合并结果 {"files":{...},"explanation":"...","needsIteration":false,"iterationRound":1}</li>
     *   <li><b>error</b>：错误 {"error":"..."}</li>
     *   <li><b>done</b>：流结束 {"done":true}</li>
     * </ul>
     */
    public SseEmitter processRequestStream(AiChatRequest request) {
        long timeout = props.isReasonerModel() ? 600_000L : 300_000L;
        SseEmitter emitter = new SseEmitter(timeout);
        executor.execute(() -> doProcessRequestStream(request, emitter));
        return emitter;
    }

    private void doProcessRequestStream(AiChatRequest request, SseEmitter emitter) {
        try {
            String systemPrompt = buildSystemPrompt(request);
            String pid = request.getPageId() != null ? request.getPageId() : "ai-page";

            List<Map<String, String>> conversation = new ArrayList<>();
            conversation.add(Map.of("role", "system", "content", systemPrompt));

            int round = 0;
            Map<String, String> merged = null;
            String explanation = "";
            boolean needsIter = false;
            AiChatRequest currentReq = request;

            do {
                round++;
                log.info("[SPARK-AI][STREAM] ====== R{}/{} action={} pageId={} ======",
                         round, MAX_ITERATIONS, currentReq.getAction(), pid);

                // ── Phase 1 ──
                sendPhaseEvent(emitter, 1, "start", "生成 UI 层（rule.json + style.css）...");
                String phase1Msg = buildPhase1Message(currentReq);
                List<String> phase1Failures = new ArrayList<>();
                PhaseResult phase1 = callPhaseStream(conversation, phase1Msg, PHASE1_REQUIRED,
                                                      "R" + round + "-Phase1", emitter, phase1Failures);
                if (phase1 == null) {
                    sendErrorEvent(emitter, "第" + round + "轮 UI 层生成失败: " + summarizePhaseFailures(phase1Failures));
                    emitter.complete();
                    return;
                }
                sendPhaseEvent(emitter, 1, "done", "UI 层生成完成");

                // ── Phase 2 ──
                sendPhaseEvent(emitter, 2, "start", "生成数据/行为层（pagedata.json + script.js）...");
                String phase2Msg = buildPhase2Message(currentReq, phase1.files());
                List<String> phase2Failures = new ArrayList<>();
                PhaseResult phase2 = callPhaseStream(conversation, phase2Msg, PHASE2_REQUIRED,
                                                      "R" + round + "-Phase2", emitter, phase2Failures);
                sendPhaseEvent(emitter, 2, "done", "数据/行为层生成完成");

                // ── Merge ──
                merged = mergePhaseFiles(phase1.files(), phase2 != null ? phase2.files() : null);
                merged.putIfAbsent("pagedata.json", "{}");
                merged.putIfAbsent("style.css", "");
                merged.putIfAbsent("script.js", "");

                String roundExpl = phase1.explanation() != null ? phase1.explanation() : "";
                if (phase2 != null && phase2.explanation() != null && !phase2.explanation().isBlank()) {
                    roundExpl += "\n" + phase2.explanation();
                }
                explanation = roundExpl;

                needsIter = (phase2 != null && phase2.needsIteration());
                if (needsIter && round < MAX_ITERATIONS) {
                    sendPhaseEvent(emitter, 0, "iterate",
                            "AI 标记需迭代，进入第 " + (round + 1) + " 轮...");
                    currentReq = buildIterateRequest(request, merged, roundExpl);
                }
            } while (needsIter && round < MAX_ITERATIONS);

            // ── 发送最终结果 ──
            AiResponse finalResult = new AiResponse(merged, explanation, needsIter, round);
            String resultJson = objectMapper.writeValueAsString(finalResult);
            emitter.send(SseEmitter.event().name("result").data(resultJson));
            emitter.send(SseEmitter.event().name("done").data("{\"done\":true}"));
            emitter.complete();

            log.info("[SPARK-AI][STREAM] 完成 totalRounds={} files={}", round, merged.keySet());

        } catch (Exception e) {
            log.error("[SPARK-AI][STREAM] error: {}", e.getMessage(), e);
            sendErrorEvent(emitter, e.getMessage());
            emitter.completeWithError(e);
        }
    }

    /**
     * 流式版阶段调用：使用 callLlmStream 替代 callLlm。
     */
    private PhaseResult callPhaseStream(List<Map<String, String>> conversation, String userMessage,
                                         List<String> requiredFiles, String phaseName, SseEmitter emitter,
                                         List<String> failuresOut) {
        conversation.add(Map.of("role", "user", "content", userMessage));

        List<String> failures = new ArrayList<>();
        if (failuresOut != null) {
            failuresOut.clear();
        }
        for (int attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                if (attempt > 1) {
                    sendPhaseEvent(emitter, 0, "retry",
                            phaseName + " 第 " + attempt + " 次重试...");
                }

                String llmContent = callLlmStream(conversation, emitter);
                log.info("[SPARK-AI][STREAM] {} attempt={} responseLen={}", phaseName, attempt, llmContent.length());

                AiResponse response = parseResponse(llmContent);
                if (response.getFiles() == null || response.getFiles().isEmpty()) {
                    String reason = "JSON 解析失败（无 files 字段）";
                    log.warn("[SPARK-AI][STREAM] {} attempt={} {}", phaseName, attempt, reason);
                    failures.add("第" + attempt + "次: " + reason);
                    continue;
                }

                String err = validatePhaseFiles(response, requiredFiles);
                if (err != null) {
                    log.warn("[SPARK-AI][STREAM] {} attempt={} validation: {}", phaseName, attempt, err);
                    failures.add("第" + attempt + "次: " + err);
                    continue;
                }

                log.info("[SPARK-AI][STREAM] {} ok attempt={} files={}", phaseName, attempt, response.getFiles().keySet());
                conversation.add(Map.of("role", "assistant", "content", llmContent));
                boolean iterFlag = Boolean.TRUE.equals(response.getNeedsIteration());
                return new PhaseResult(response.getFiles(), response.getExplanation(), iterFlag);

            } catch (Exception e) {
                failures.add("第" + attempt + "次异常: " + e.getMessage());
                log.warn("[SPARK-AI][STREAM] {} attempt={} error: {}", phaseName, attempt, e.getMessage());
            }
        }

        log.error("[SPARK-AI][STREAM] {} 全部 {} 次尝试均失败: {}", phaseName, MAX_RETRIES, String.join("; ", failures));
        if (failuresOut != null) {
            failuresOut.addAll(failures);
        }
        conversation.remove(conversation.size() - 1);
        return null;
    }

    private String summarizePhaseFailures(List<String> failures) {
        if (failures == null || failures.isEmpty()) {
            return "未知错误";
        }
        String joined = String.join("; ", failures);
        if (joined.length() <= 600) {
            return joined;
        }
        return joined.substring(0, 600) + "...";
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 流式 LLM 调用（stream: true）
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 流式调用 LLM，逐 token 转发 delta/reasoning 到 SseEmitter，
     * 同时累积完整内容并返回。
     */
    private String callLlmStream(List<Map<String, String>> messages, SseEmitter emitter) throws Exception {
        log.info("[SPARK-AI][STREAM] callLlmStream msgCount={} model={}", messages.size(), props.getModel());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", props.getModel());
        body.put("messages", messages);
        body.put("stream", true);
        body.put("max_tokens", props.getEffectiveMaxTokens());

        Double effectiveTemp = props.getEffectiveTemperature();
        if (effectiveTemp != null) {
            body.put("temperature", effectiveTemp);
        }
        if (!props.isReasonerModel() && props.getTopP() != null) {
            body.put("top_p", props.getTopP());
        }
        if (!props.isReasonerModel()) {
            if (props.getFrequencyPenalty() != null) {
                body.put("frequency_penalty", props.getFrequencyPenalty());
            }
            if (props.getPresencePenalty() != null) {
                body.put("presence_penalty", props.getPresencePenalty());
            }
        }
        if (props.isDeepSeek()) {
            body.put("stream_options", Map.of("include_usage", true));
        }

        String bodyJson = objectMapper.writeValueAsString(body);
        StringBuilder contentBuffer = new StringBuilder();

        restClient.post()
                .uri("/v1/chat/completions")
                .body(bodyJson)
                .exchange((httpRequest, response) -> {
                    try (BufferedReader reader = new BufferedReader(
                            new InputStreamReader(response.getBody(), StandardCharsets.UTF_8))) {
                        processStreamLinesForPage(reader, emitter, contentBuffer);
                    }
                    return null;
                }, false);

        String content = contentBuffer.toString();
        log.info("[SPARK-AI][STREAM] callLlmStream responseLen={}", content.length());
        if (content.isEmpty()) {
            throw new RuntimeException("LLM 流式响应累积内容为空");
        }
        return content;
    }

    /**
     * 逐行解析 OpenAI 流式 SSE，转发 delta/reasoning 到客户端 emitter，
     * 同时将 content 累积到 contentBuffer。
     */
    @SuppressWarnings("unchecked")
    private void processStreamLinesForPage(BufferedReader reader, SseEmitter emitter,
                                            StringBuilder contentBuffer) throws IOException {
        String line;
        while ((line = reader.readLine()) != null) {
            if (!line.startsWith("data: ")) continue;
            String data = line.substring("data: ".length()).trim();
            if ("[DONE]".equals(data)) return;

            try {
                Map<String, Object> parsed = objectMapper.readValue(data, new TypeReference<>() {});

                // reasoning_content（DeepSeek-reasoner 特有）
                String reasoning = extractStreamField(parsed, "reasoning_content");
                if (reasoning != null && !reasoning.isEmpty()) {
                    String payload = "{\"reasoning\":" + objectMapper.writeValueAsString(reasoning) + "}";
                    emitter.send(SseEmitter.event().name("reasoning").data(payload));
                }

                // delta.content
                String delta = extractStreamField(parsed, "content");
                if (delta != null && !delta.isEmpty()) {
                    contentBuffer.append(delta);
                    String payload = "{\"delta\":" + objectMapper.writeValueAsString(delta) + "}";
                    emitter.send(SseEmitter.event().name("delta").data(payload));
                }

                // usage 统计
                Object usageObj = parsed.get("usage");
                if (usageObj instanceof Map<?, ?> usage && !usage.isEmpty()) {
                    String usageJson = objectMapper.writeValueAsString(Map.of("usage", usage));
                    emitter.send(SseEmitter.event().name("usage").data(usageJson));
                }
            } catch (Exception ignored) {
                // 跳过非 JSON 行
            }
        }
    }

    /** 从 choices[0].delta 中提取指定字段 */
    private String extractStreamField(Map<String, Object> parsed, String fieldName) {
        Object choicesObj = parsed.get("choices");
        if (!(choicesObj instanceof List<?> choices) || choices.isEmpty()) return null;
        Object firstObj = choices.get(0);
        if (!(firstObj instanceof Map<?, ?> first)) return null;
        Object deltaObj = first.get("delta");
        if (!(deltaObj instanceof Map<?, ?> delta)) return null;
        Object value = delta.get(fieldName);
        return value instanceof String s ? s : null;
    }

    /** 发送阶段进度 SSE 事件 */
    private void sendPhaseEvent(SseEmitter emitter, int phase, String status, String message) {
        try {
            String json = String.format("{\"phase\":%d,\"status\":\"%s\",\"message\":\"%s\"}",
                    phase, status, escapeJson(message));
            emitter.send(SseEmitter.event().name("phase").data(json));
        } catch (IOException e) {
            log.warn("[SPARK-AI][STREAM] 发送 phase 事件失败: {}", e.getMessage());
        }
    }

    /** 发送错误 SSE 事件 */
    private void sendErrorEvent(SseEmitter emitter, String errorMessage) {
        try {
            emitter.send(SseEmitter.event().name("error")
                    .data("{\"error\":\"" + escapeJson(errorMessage) + "\"}"));
        } catch (IOException e) {
            log.warn("[SPARK-AI][STREAM] 发送 error 事件失败: {}", e.getMessage());
        }
    }

    private static String escapeJson(String s) {
        if (s == null) return "unknown error";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
    }

    /**
     * 构建自动迭代请求：以上一轮的合并文件 + AI 自检说明作为 iterate 输入。
     */
    private AiChatRequest buildIterateRequest(AiChatRequest original,
                                               Map<String, String> currentFiles,
                                               String aiExplanation) {
        AiChatRequest req = new AiChatRequest();
        req.setAction("iterate");
        req.setPageId(original.getPageId());
        req.setPrompt(original.getPrompt());
        req.setFeedback("AI 自检发现以下问题需要修正：\n" + aiExplanation);
        req.setCurrentFiles(currentFiles);
        req.setLogs(original.getLogs());
        req.setSkillCatalog(original.getSkillCatalog());
        return req;
    }

    /**
     * 执行一个阶段的 LLM 调用（多轮对话），带重试和校验。
     * <p>将 userMessage 追加到 conversation 末尾，成功后追加 assistant 响应。
     * 全部失败时移除追加的 user 消息，保持 conversation 不变。
     * @return 成功返回 PhaseResult，全部失败返回 null
     */
    private PhaseResult callPhase(List<Map<String, String>> conversation, String userMessage,
                                   List<String> requiredFiles, String phaseName) {
        conversation.add(Map.of("role", "user", "content", userMessage));

        List<String> failures = new ArrayList<>();
        for (int attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                String llmContent = callLlm(conversation);
                log.info("[SPARK-AI] {} attempt={} responseLen={}", phaseName, attempt, llmContent.length());

                AiResponse response = parseResponse(llmContent);
                if (response.getFiles() == null || response.getFiles().isEmpty()) {
                    String reason = "JSON 解析失败（无 files 字段）";
                    log.warn("[SPARK-AI] {} attempt={} {}", phaseName, attempt, reason);
                    failures.add("第" + attempt + "次: " + reason);
                    continue;
                }

                String err = validatePhaseFiles(response, requiredFiles);
                if (err != null) {
                    log.warn("[SPARK-AI] {} attempt={} validation: {}", phaseName, attempt, err);
                    failures.add("第" + attempt + "次: " + err);
                    continue;
                }

                log.info("[SPARK-AI] {} ok attempt={} files={}", phaseName, attempt, response.getFiles().keySet());
                // 多轮对话：追加 assistant 响应，后续阶段可看到前面完整对话
                conversation.add(Map.of("role", "assistant", "content", llmContent));
                boolean iterFlag = Boolean.TRUE.equals(response.getNeedsIteration());
                return new PhaseResult(response.getFiles(), response.getExplanation(), iterFlag);

            } catch (Exception e) {
                failures.add("第" + attempt + "次异常: " + e.getMessage());
                log.warn("[SPARK-AI] {} attempt={} error: {}", phaseName, attempt, e.getMessage());
            }
        }
        log.error("[SPARK-AI] {} 全部 {} 次尝试均失败: {}", phaseName, MAX_RETRIES, String.join("; ", failures));
        // 全部失败：移除本阶段追加的 user 消息
        conversation.remove(conversation.size() - 1);
        return null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 分阶段用户消息构建
    // ─────────────────────────────────────────────────────────────────────────

    /** Phase-1：请求 rule.json + style.css（UI 层：结构 + 样式） */
    private String buildPhase1Message(AiChatRequest request) {
        StringBuilder sb = new StringBuilder();
        String pid = request.getPageId() != null ? request.getPageId() : "ai-page";

        if ("iterate".equals(request.getAction())) {
            sb.append("请根据以下反馈修改页面 `").append(pid).append("` 的配置。\n\n");
            String feedback = request.getFeedback() != null ? request.getFeedback() : request.getPrompt();
            if (feedback != null && !feedback.isBlank()) {
                sb.append("**用户反馈**：").append(feedback).append("\n\n");
            }
            if (request.getCurrentFiles() != null) {
                appendFileBlock(sb, "当前 rule.json", "json", request.getCurrentFiles().get("rule.json"));
                appendFileBlock(sb, "当前 style.css", "css", request.getCurrentFiles().get("style.css"));
            }
            appendLogs(sb, request);
        } else {
            sb.append("请为页面 `").append(pid).append("` 生成配置。\n\n");
            sb.append("**用户需求**：").append(request.getPrompt() != null ? request.getPrompt() : "").append("\n\n");
            appendLogs(sb, request);
        }

        sb.append("⚠️ 【分步生成 - 第 1 轮】本轮只需生成 rule.json 和 style.css。\n");
        sb.append("返回的 JSON 中 files 对象只包含 \"rule.json\" 和 \"style.css\" 两个键。\n");
        sb.append("不要包含 pagedata.json 和 script.js，它们将在下一轮生成。\n");
        return sb.toString();
    }

    /** Phase-2：以 Phase-1 结果为上下文，请求 pagedata.json + script.js（数据 + 行为层） */
    private String buildPhase2Message(AiChatRequest request, Map<String, String> phase1Files) {
        StringBuilder sb = new StringBuilder();
        String pid = request.getPageId() != null ? request.getPageId() : "ai-page";

        if ("iterate".equals(request.getAction())) {
            sb.append("请根据以下反馈修改页面 `").append(pid).append("` 的配置（第 2 轮：数据 + 行为层）。\n\n");
            String feedback = request.getFeedback() != null ? request.getFeedback() : request.getPrompt();
            if (feedback != null && !feedback.isBlank()) {
                sb.append("**用户反馈**：").append(feedback).append("\n\n");
            }
        } else {
            sb.append("请为页面 `").append(pid).append("` 生成配置（第 2 轮：数据 + 行为层）。\n\n");
            sb.append("**用户需求**：").append(request.getPrompt() != null ? request.getPrompt() : "").append("\n\n");
        }

        // Phase-1 已确定的 UI 层文件
        appendFileBlock(sb, "已确定的 rule.json", "json", phase1Files.get("rule.json"));
        appendFileBlock(sb, "已确定的 style.css", "css", phase1Files.get("style.css"));

        // iterate 模式下提供当前 pagedata.json / script.js 作为参考
        if ("iterate".equals(request.getAction()) && request.getCurrentFiles() != null) {
            appendFileBlock(sb, "当前 pagedata.json", "json", request.getCurrentFiles().get("pagedata.json"));
            appendFileBlock(sb, "当前 script.js", "javascript", request.getCurrentFiles().get("script.js"));
        }

        // 运行时日志（帮助 AI 定位 script.js 层面的错误）
        appendLogs(sb, request);

        sb.append("⚠️ 【分步生成 - 第 2 轮】本轮必须生成 pagedata.json 和 script.js。\n");
        sb.append("返回的 JSON 中 files 对象必须包含 \"pagedata.json\" 和 \"script.js\" 两个键。\n");
        sb.append("确保 pagedata.json 的表名与 rule.json 中 dataKey 引用的表名一致。\n");
        sb.append("确保 script.js 中包含 rule.json 引用的所有事件处理函数（on 中的函数名）和 Render* 渲染函数。\n\n");
        sb.append("📌 生成前必需自检（按项逐一确认）：\n");
        sb.append("1. pagedata.json 顶层结构是否为 { \"dataset\": { \"dataSetName\": \"...\", \"tables\": {...}, \"relations\": [...] } }？\n");
        sb.append("2. 每张表是否都有 views.default（缺少则表格无法渲染）？\n");
        sb.append("3. 如有 relation，父表主键字歗是否标记 isPrimaryKey: true？关联得 dependencyType 是否正确？\n");
        sb.append("4. script.js 中是否包含 __init__() 函数（必需）？\n");
        sb.append("5. rule.json on: 引用的所有函数名，script.js 中是否全部定义？\n");
        sb.append("6. rule.json Render* type 引用的函数，script.js 中是否全部定义？\n");
        sb.append("7. Render* 函数中 h() 第一个参数是否都是原生 HTML 标签（不得用 el-*/r-* 组件名）？\n");
        sb.append("8. pagedata.json 中是否存在 autoLoad、cascadeDelete 等非标准字段（如有请删除）？\n");
        sb.append("📌 如果你在生成 pagedata.json / script.js 过程中发现第 1 轮的 rule.json 或 style.css 有问题（如 dataKey 表名不合理、class 名遗漏、事件函数名需调整等），");
        sb.append("可以在 files 中额外包含修正后的 \"rule.json\" 和/或 \"style.css\"，它们会覆盖第 1 轮的版本。\n");
        sb.append("📌 如果你认为当前生成结果可能存在需要用户确认或进一步调整的问题，请设置 \"needsIteration\": true 并在 explanation 中说明原因。\n");
        return sb.toString();
    }

    /** 向 StringBuilder 追加一个文件代码块 */
    private void appendFileBlock(StringBuilder sb, String label, String lang, String content) {
        if (content == null || content.isBlank()) return;
        sb.append("**").append(label).append("**：\n```").append(lang).append("\n")
          .append(content).append("\n```\n\n");
    }

    /** 追加运行时日志（如有） */
    private void appendLogs(StringBuilder sb, AiChatRequest request) {
        if (request.getLogs() == null || request.getLogs().isEmpty()) return;
        sb.append("**运行时日志**（供你判断错误原因）：\n");
        for (AiChatRequest.LogSnapshot l : request.getLogs()) {
            sb.append("  [").append(l.getLevel()).append("] ").append(l.getMessage());
            if (l.getComponentType() != null && !l.getComponentType().isBlank()) {
                sb.append("  [组件: ").append(l.getComponentType()).append("]");
            }
            if (l.getMeta() != null && !l.getMeta().isEmpty()) {
                sb.append("  meta: ").append(l.getMeta());
            }
            sb.append("\n");
        }
        sb.append("\n");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 调用 LLM（OpenAI 兼容 API，DeepSeek 深度适配）
    // ─────────────────────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private String callLlm(List<Map<String, String>> messages) throws Exception {
        log.info("[SPARK-AI] callLlm msgCount={} model={} deepseek={} reasoner={}",
                messages.size(), props.getModel(), props.isDeepSeek(), props.isReasonerModel());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", props.getModel());
        body.put("messages", messages);
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

        // json_mode — 使用智能判断（DeepSeek-reasoner 自动禁用）
        if (props.isEffectiveJsonMode()) {
            body.put("response_format", Map.of("type", "json_object"));
        }

        Map<String, Object> responseMap = restClient.post()
                .uri("/v1/chat/completions")
                .body(body)
                .retrieve()
                .body(new ParameterizedTypeReference<Map<String, Object>>() {});

        if (responseMap == null) {
            throw new RuntimeException("LLM 返回空响应");
        }
        List<Map<String, Object>> choices =
                (List<Map<String, Object>>) responseMap.get("choices");
        if (choices == null || choices.isEmpty()) {
            throw new RuntimeException("LLM choices 为空");
        }
        Map<String, Object> firstChoice = choices.get(0);

        // 检测 finish_reason：length 表示输出被 max_tokens 截断
        String finishReason = firstChoice.get("finish_reason") instanceof String s ? s : "unknown";
        if ("length".equals(finishReason)) {
            log.warn("[SPARK-AI] ⚠️ 输出被 max_tokens 截断 (finish_reason=length)，响应可能不完整");
        }

        Map<String, Object> message = (Map<String, Object>) firstChoice.get("message");

        // DeepSeek-reasoner：记录推理过程（reasoning_content）
        Object reasoningContent = message.get("reasoning_content");
        if (reasoningContent instanceof String rc && !rc.isEmpty()) {
            log.info("[SPARK-AI] DeepSeek reasoning_content length={}", rc.length());
            log.debug("[SPARK-AI] reasoning: {}", rc.substring(0, Math.min(500, rc.length())));
        }

        // DeepSeek: 记录 token 用量（含缓存命中率）
        Object usageObj = responseMap.get("usage");
        if (usageObj instanceof Map<?, ?> usage) {
            Object cacheHit = usage.get("prompt_cache_hit_tokens");
            if (cacheHit != null) {
                log.info("[SPARK-AI] usage: prompt={} completion={} total={} cacheHit={} cacheMiss={}",
                        usage.get("prompt_tokens"), usage.get("completion_tokens"),
                        usage.get("total_tokens"), cacheHit, usage.get("prompt_cache_miss_tokens"));
            } else {
                log.info("[SPARK-AI] usage: prompt={} completion={} total={}",
                        usage.get("prompt_tokens"), usage.get("completion_tokens"),
                        usage.get("total_tokens"));
            }
        }

        String content = (String) message.get("content");
        log.debug("[SPARK-AI] raw content length={} finish_reason={}", content.length(), finishReason);
        return content;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 解析 LLM 输出 → AiResponse
    // ─────────────────────────────────────────────────────────────────────────

    private AiResponse parseResponse(String content) {
        // 1. 尝试直接解析
        AiResponse response = tryParseJson(content);
        if (response != null) return response;

        // 2. 尝试从 ```json ... ``` 代码块提取
        Pattern codeBlock = Pattern.compile("```(?:json)?\\s*([\\s\\S]+?)```");
        Matcher matcher = codeBlock.matcher(content);
        while (matcher.find()) {
            response = tryParseJson(matcher.group(1).trim());
            if (response != null) return response;
        }

        // 3. fallback：把整个内容放入 explanation
        log.warn("[SPARK-AI] 响应解析失败，内容片段：{}", content.substring(0, Math.min(200, content.length())));
        return buildErrorResponse(null, "响应解析失败，LLM 未返回标准 JSON");
    }

    @SuppressWarnings("unchecked")
    private AiResponse tryParseJson(String text) {
        try {
            Map<String, Object> raw = objectMapper.readValue(text,
                    new TypeReference<Map<String, Object>>() {});

            AiResponse response = new AiResponse();

            // 处理 files：LLM 可能返回嵌套 JSON 或字符串，都要转成字符串
            if (raw.get("files") instanceof Map<?, ?> rawFiles) {
                Map<String, String> files = new LinkedHashMap<>();
                for (Map.Entry<?, ?> entry : rawFiles.entrySet()) {
                    String key = entry.getKey().toString();
                    Object val = entry.getValue();
                    if (val instanceof String s) {
                        files.put(key, s);
                    } else if (val != null) {
                        // 嵌套 JSON → 序列化回字符串
                        files.put(key, objectMapper.writeValueAsString(val));
                    }
                }
                response.setFiles(files);
            }

            if (raw.get("explanation") instanceof String s) {
                response.setExplanation(s);
            }
            if (raw.get("needsIteration") instanceof Boolean b) {
                response.setNeedsIteration(b);
            }

            // 必须至少有 files 才算成功
            if (response.getFiles() == null || response.getFiles().isEmpty()) {
                return null;
            }
            return response;

        } catch (Exception e) {
            return null;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 文件校验
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 校验某一阶段返回的文件内容完整性。
     * @param requiredFiles 本阶段必须包含的文件列表
     * @return null = 校验通过；非 null = 错误描述
     */
    private String validatePhaseFiles(AiResponse response, List<String> requiredFiles) {
        Map<String, String> files = response.getFiles();

        // 1. 检查必须文件
        List<String> missing = new ArrayList<>();
        for (String name : requiredFiles) {
            if (!files.containsKey(name) || files.get(name) == null || files.get(name).isBlank()) {
                missing.add(name);
            }
        }
        if (!missing.isEmpty()) {
            return "缺少必须文件: " + missing;
        }

        // 2. 校验 JSON 文件语法（仅检查本次响应中实际存在的 JSON 文件）
        for (String jsonFile : List.of("rule.json", "pagedata.json")) {
            String content = files.get(jsonFile);
            if (content == null) continue;
            String trimmed = content.trim();
            if (!trimmed.isEmpty()) {
                char last = trimmed.charAt(trimmed.length() - 1);
                if (last != ']' && last != '}') {
                    return jsonFile + " 内容被截断（未以 ]/} 结尾）";
                }
            }
            try {
                objectMapper.readTree(content);
            } catch (Exception e) {
                return jsonFile + " JSON 格式无效: " + e.getMessage();
            }
        }

        // 3. 检查 script.js 花括号平衡 + __init__ 存在性
        String scriptContent = files.get("script.js");
        if (scriptContent != null && !scriptContent.isBlank()) {
            long opens = scriptContent.chars().filter(c -> c == '{').count();
            long closes = scriptContent.chars().filter(c -> c == '}').count();
            if (opens > closes) {
                return "script.js 可能被截断（花括号未闭合: { =" + opens + " } =" + closes + "）";
            }
            // 要求 script.js 中必须定义 __init__ 函数
            if (!scriptContent.contains("__init__")) {
                return "script.js 缺少 __init__() 函数（页面加载入口，必须定义）";
            }
        }

        return null;
    }

    private Map<String, String> mergePhaseFiles(Map<String, String> phase1Files,
                                                Map<String, String> phase2Files) {
        Map<String, String> mergedFiles = new LinkedHashMap<>(phase1Files);
        if (phase2Files == null || phase2Files.isEmpty()) {
            return mergedFiles;
        }

        for (Map.Entry<String, String> entry : phase2Files.entrySet()) {
            String key = entry.getKey();
            String value = entry.getValue();

            // Phase-2 允许额外修正 Phase-1 文件，但空字符串不应抹掉已生成结果。
            if (("rule.json".equals(key) || "style.css".equals(key))
                    && (value == null || value.isBlank())) {
                continue;
            }
            mergedFiles.put(key, value);
        }

        return mergedFiles;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 错误响应
    // ─────────────────────────────────────────────────────────────────────────

    private AiResponse buildErrorResponse(AiChatRequest request, String errorMessage) {
        String pid = (request != null && request.getPageId() != null)
                ? request.getPageId() : "ai-page";
        // 转义特殊字符防止 JSON 注入
        String safeMsg = errorMessage != null
                ? errorMessage.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ")
                : "未知错误";

        String ruleJson = "[{\"type\":\"h2\",\"children\":[\"⚠️ AI 生成失败\"]},"
                + "{\"type\":\"p\",\"children\":[\"" + safeMsg + "\"]},"
                + "{\"type\":\"p\",\"children\":[\"请检查控制台日志或 application.yml 配置\"]}]";

        Map<String, String> files = new HashMap<>();
        files.put("rule.json", ruleJson);
        return new AiResponse(files, "错误：" + safeMsg, false);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 系统提示词：从 classpath 资源加载 + 运行时拼接 Skill Catalog
    // ─────────────────────────────────────────────────────────────────────────

    /** 基础系统提示词（从 resources/prompts/system-prompt.txt 加载） */
    private static final String BASE_SYSTEM_PROMPT = loadResourceFile("prompts/system-prompt.txt");

    /** 加载 classpath 资源文件 */
    private static String loadResourceFile(String path) {
        try (InputStream is = AiPageService.class.getClassLoader().getResourceAsStream(path)) {
            if (is == null) {
                throw new RuntimeException("资源文件未找到: " + path);
            }
            return new String(is.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new RuntimeException("加载资源文件失败: " + path, e);
        }
    }

    /**
     * 拼接完整系统提示词 = 基础模板 + Skill Catalog。
     *
     * 优先级：
     * 1. 服务端存储的组件元数据（由构建时上传的 spark-component-metadata.json 提供）
     * 2. 请求体中的 skillCatalog（前端运行时传入，作为 fallback）
     * 3. 无 Skill 信息时仅使用基础模板
     */
    private String buildSystemPrompt(AiChatRequest request) {
        StringBuilder prompt = new StringBuilder(BASE_SYSTEM_PROMPT);

        // 优先使用服务端存储的元数据索引，再按需附加相关 skill 详情
        String storedIndexPrompt = metadataService.getSkillPromptIndex();
        if (storedIndexPrompt != null && !storedIndexPrompt.isBlank()) {
            appendPromptSection(prompt, storedIndexPrompt);

            List<String> relevantSkills = detectRelevantSkillTypes(request);
            String relevantSkillPrompt = metadataService.getSkillPromptForTypes(relevantSkills);
            if (relevantSkillPrompt != null && !relevantSkillPrompt.isBlank()) {
                appendPromptSection(prompt, relevantSkillPrompt);
                log.debug("[SPARK-AI] 使用服务端 Skill Index + 定向 Skill 详情 skills={} buildTime={}",
                        relevantSkills, metadataService.getBuildTime());
            } else {
                log.debug("[SPARK-AI] 使用服务端 Skill Index buildTime={}", metadataService.getBuildTime());
            }
            return prompt.toString();
        }

        String storedCompactPrompt = metadataService.getSkillPromptCompact();
        if (storedCompactPrompt != null && !storedCompactPrompt.isBlank()) {
            appendPromptSection(prompt, storedCompactPrompt);
            log.debug("[SPARK-AI] 使用服务端存储的 Compact Skill Prompt (buildTime={})",
                    metadataService.getBuildTime());
            return prompt.toString();
        }

        // Fallback: 使用请求体传入的 skillCatalog
        String requestSkillCatalog = request != null ? request.getSkillCatalog() : null;
        if (requestSkillCatalog != null && !requestSkillCatalog.isBlank()) {
            appendPromptSection(prompt, requestSkillCatalog);
            log.debug("[SPARK-AI] 使用请求体传入的 Skill Catalog");
        }

        return prompt.toString();
    }

    private void appendPromptSection(StringBuilder prompt, String section) {
        if (section == null || section.isBlank()) {
            return;
        }
        prompt.append("\n\n").append(section.trim());
    }

    private List<String> detectRelevantSkillTypes(AiChatRequest request) {
        if (request == null) {
            return List.of();
        }

        String context = collectSkillDetectionContext(request).toLowerCase(Locale.ROOT);
        if (context.isBlank()) {
            return List.of();
        }

        LinkedHashSet<String> skillTypes = new LinkedHashSet<>();
        if (containsAny(context,
                "\"type\":\"r-tree\"", "\"type\": \"r-tree\"",
                "r-tree", "renderer-tree", "树容器", "树形", "树节点", "nodeclick", "node-key", "lazy")) {
            skillTypes.add("r-tree");
        }
        if (containsAny(context,
                "\"type\":\"r-form\"", "\"type\": \"r-form\"",
                "r-form", "renderer-form", "表单容器", "双向编辑", "currentrow 编辑", "context_data")) {
            skillTypes.add("r-form");
        }
        if (containsAny(context,
                "\"type\":\"r-detail\"", "\"type\": \"r-detail\"",
                "r-detail", "renderer-detail", "详情容器", "只读详情", "只读展示", "信息面板")) {
            skillTypes.add("r-detail");
        }
        if (containsAny(context,
                "\"type\":\"r-table\"", "\"type\": \"r-table\"",
                "r-table", "renderer-table", "表格容器", "datakey 绑定表格")) {
            skillTypes.add("r-table");
        }
        return new ArrayList<>(skillTypes);
    }

    private String collectSkillDetectionContext(AiChatRequest request) {
        StringBuilder context = new StringBuilder();
        appendDetectionText(context, request.getPrompt());
        appendDetectionText(context, request.getFeedback());

        if (request.getCurrentFiles() != null) {
            for (String content : request.getCurrentFiles().values()) {
                appendDetectionText(context, content);
            }
        }

        if (request.getLogs() != null) {
            for (AiChatRequest.LogSnapshot logSnapshot : request.getLogs()) {
                appendDetectionText(context, logSnapshot.getMessage());
                appendDetectionText(context, logSnapshot.getComponentType());
                if (logSnapshot.getMeta() != null && !logSnapshot.getMeta().isEmpty()) {
                    appendDetectionText(context, String.valueOf(logSnapshot.getMeta()));
                }
            }
        }

        return context.toString();
    }

    private void appendDetectionText(StringBuilder context, String value) {
        if (value == null || value.isBlank()) {
            return;
        }
        if (!context.isEmpty()) {
            context.append('\n');
        }
        context.append(value);
    }

    private boolean containsAny(String text, String... needles) {
        for (String needle : needles) {
            if (needle != null && !needle.isBlank() && text.contains(needle.toLowerCase(Locale.ROOT))) {
                return true;
            }
        }
        return false;
    }
}
