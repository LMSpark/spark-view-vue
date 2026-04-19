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
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 统一会话服务 — 按 sessionId 管理对话历史 + 滑动窗口 + LLM 调用。
 *
 * <h3>职责（通信层）</h3>
 * <ul>
 *   <li>每个 sessionId 维护独立的对话历史</li>
 *   <li>LLM 调用前自动应用滑动窗口裁剪，控制 token 消耗</li>
 *   <li>会话创建/销毁/超时自动清理</li>
 *   <li>支持 Function Calling（tools 定义 + tool_calls 解析）</li>
 *   <li>支持 SSE 流式推送</li>
 * </ul>
 */
@Service
public class StillsSessionService {

    private static final Logger log = LoggerFactory.getLogger(StillsSessionService.class);

    private static final int DEFAULT_WINDOW_SIZE = 30;
    private static final long SESSION_TIMEOUT_MS = 30 * 60 * 1000L;
    private static final int HANDOFF_FAILURE_THRESHOLD = 2;
    private static final int STAGE1_MAX_WRITE_CALLS_PER_ROUND = 8;
        private static final Set<String> ENTITY_KEY_HINTS = Set.of(
            "id", "ids", "rowId", "recordId", "entityId", "pageId", "table", "tableName", "path");
            private static final Map<String, ActionRule> ACTION_RULES_EXACT = Map.ofEntries(
                Map.entry("dataset.query", new ActionRule(
                "read",
                "describe-only",
                List.of("table", "tableName", "id"),
                "low"
            )),
            Map.entry("dataset.batch", new ActionRule(
                "write",
                "windowed",
                List.of("table", "tableName", "ids"),
                "high"
                ))
            );
            private static final LinkedHashMap<String, ActionRule> ACTION_RULES_PREFIX = new LinkedHashMap<>();

            static {
            ACTION_RULES_PREFIX.put("dataset.", new ActionRule(
                null,
                null,
                List.of("table", "tableName", "id", "rowId", "recordId", "ids"),
                "medium"
            ));
            ACTION_RULES_PREFIX.put("page.", new ActionRule(
                null,
                null,
                List.of("pageId", "id"),
                "medium"
            ));
            ACTION_RULES_PREFIX.put("file.", new ActionRule(
                null,
                null,
                List.of("path", "id"),
                "high"
            ));
            ACTION_RULES_PREFIX.put("nav.", new ActionRule(
                null,
                null,
                List.of("id", "nodeId", "pageId"),
                "medium"
            ));
            }

    private final ConcurrentHashMap<String, Session> sessions = new ConcurrentHashMap<>();
    private final ExecutorService streamExecutor = Executors.newCachedThreadPool();

    private final OpenAiProperties props;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    public StillsSessionService(OpenAiProperties props, ObjectMapper objectMapper) {
        this.props = props;
        this.objectMapper = objectMapper;

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(15_000);
        factory.setReadTimeout(props.isReasonerModel() ? 300_000 : 180_000);

        this.restClient = RestClient.builder()
                .requestFactory(factory)
                .baseUrl(props.getBaseUrl())
                .defaultHeader("Authorization", "Bearer " + props.getApiKey())
                .defaultHeader("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .build();
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 公共 API
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * 创建会话（支持 tools + mode）。
     */
    public String createSession(String systemPrompt, String userPrompt, int windowSize,
                                List<Map<String, Object>> tools, String mode) {
        String sessionId = UUID.randomUUID().toString();

        Session session = new Session();
        session.systemPrompt = systemPrompt;
        session.windowSize = windowSize > 0 ? windowSize : DEFAULT_WINDOW_SIZE;
        session.lastActiveTime = System.currentTimeMillis();
        session.tools = tools;
        session.mode = mode != null ? mode : "stills";
        session.state = SessionState.READY;
        session.consecutiveFailures = 0;

        Message userMsg = new Message("user");
        userMsg.content = userPrompt;
        session.conversation.add(userMsg);

        sessions.put(sessionId, session);

        log.info("[SESSION] created sessionId={} windowSize={} mode={} tools={}",
                sessionId, session.windowSize, session.mode,
                tools != null ? tools.size() : 0);
        return sessionId;
    }

    /**
     * 执行一轮对话（非流式），支持 Function Calling。
     */
    public TurnResult executeTurn(String sessionId) {
        Session session = sessions.get(sessionId);
        if (session == null) return null;

        try {
            int round = ++session.roundCounter;
            if (session.state == SessionState.HANDOFF) {
                return TurnResult.error(
                        session.state.name(),
                        null,
                        "HANDOFF_REQUIRED",
                        buildHandoffPayload("HANDOFF_REQUIRED", "请人工确认后恢复到 PLAN"));
            }

            session.lastActiveTime = System.currentTimeMillis();
            transition(session, SessionState.PLAN);
            transition(session, SessionState.CALL);

            List<Map<String, Object>> messages = buildWindowedMessages(session);

            log.info("[SESSION] turn sessionId={} msgCount={} tools={}",
                    sessionId, messages.size(),
                    session.tools != null ? session.tools.size() : 0);

            LlmResult llmResult = callLlm(messages, session.tools);
            if (llmResult == null) {
                transition(session, SessionState.FAILED);
                session.consecutiveFailures++;
                if (session.consecutiveFailures >= HANDOFF_FAILURE_THRESHOLD) {
                    transition(session, SessionState.HANDOFF);
                    return TurnResult.error(
                            session.state.name(),
                            "FAILED->HANDOFF",
                            "LLM_CALL_FAILED",
                            buildHandoffPayload("LLM_CALL_FAILED", "连续失败，进入人工接管"));
                }
                return TurnResult.error(
                        session.state.name(),
                        "CALL->FAILED",
                        "LLM_CALL_FAILED",
                        null);
            }

            // 记录 assistant 回复到对话历史
            Message assistantMsg = new Message("assistant");
            assistantMsg.content = llmResult.text;
            if (llmResult.toolCalls != null && !llmResult.toolCalls.isEmpty()) {
                assistantMsg.toolCalls = llmResult.toolCalls;
            }
            session.conversation.add(assistantMsg);

            Map<String, Object> runtimeMeta = null;
            if (llmResult.toolCalls != null && !llmResult.toolCalls.isEmpty()) {
                runtimeMeta = buildRuntimeMeta(sessionId, round, session, llmResult.toolCalls);
                Map<String, Object> guard = getRuntimeGuard(runtimeMeta);
                boolean blocked = guard.get("blocked") instanceof Boolean b && b;
                if (blocked) {
                    String reasonCode = guard.get("reasonCode") instanceof String s
                            ? s : "RUNTIME_GUARD_BLOCKED";
                    transition(session, SessionState.FAILED);
                    return TurnResult.error(
                            session.state.name(),
                            "CALL->FAILED",
                            reasonCode,
                            buildHandoffPayload(reasonCode, "请根据 runtime.guard.details 处理后重试"),
                            runtimeMeta);
                }
            }

            transition(session, SessionState.APPLY);
            transition(session, SessionState.VERIFY);
            transition(session, SessionState.DONE);
            session.consecutiveFailures = 0;
            String stateTransition = "VERIFY->DONE";
            transition(session, SessionState.READY);

            return new TurnResult(
                    llmResult.text,
                    llmResult.reasoning,
                    llmResult.toolCalls,
                    session.state.name(),
                    stateTransition,
                    null,
                    null,
                    runtimeMeta);
        } catch (IllegalStateException ex) {
            log.warn("[SESSION] invalid state transition sessionId={}: {}", sessionId, ex.getMessage());
            return TurnResult.error(
                    session.state != null ? session.state.name() : null,
                    null,
                    "INVALID_STATE_TRANSITION",
                    buildHandoffPayload("INVALID_STATE_TRANSITION", "请人工确认后恢复到 PLAN"));
        }
    }

    /**
     * 执行一轮对话（SSE 流式）。
     */
    public void executeTurnStream(String sessionId, SseEmitter emitter) {
        Session session = sessions.get(sessionId);
        if (session == null) {
            try {
                emitter.send(SseEmitter.event().name("error")
                        .data("{\"error\":\"会话不存在\"}"));
                emitter.complete();
            } catch (IOException ignored) {}
            return;
        }

        session.lastActiveTime = System.currentTimeMillis();
        List<Map<String, Object>> messages = buildWindowedMessages(session);

        streamExecutor.submit(() -> {
            try {
                callLlmStream(messages, session.tools, emitter, session);
            } catch (Exception e) {
                log.error("[SESSION] stream error sessionId={}: {}", sessionId, e.getMessage());
                try {
                    emitter.send(SseEmitter.event().name("error")
                            .data("{\"error\":\"" + e.getMessage().replace("\"", "'") + "\"}"));
                    emitter.complete();
                } catch (IOException ignored) {}
            }
        });
    }

    /**
     * 向对话追加消息（支持 FC 消息格式）。
     */
    public boolean appendMessage(String sessionId, String role, String content,
                                  String toolCallId, List<Map<String, Object>> toolCalls) {
        Session session = sessions.get(sessionId);
        if (session == null) return false;

        session.lastActiveTime = System.currentTimeMillis();
        Message msg = new Message(role);
        msg.content = content;
        msg.toolCallId = toolCallId;
        msg.toolCalls = toolCalls;
        session.conversation.add(msg);
        return true;
    }

    /**
     * 获取完整对话记录（包含 FC 字段）。
     */
    public List<Map<String, Object>> getConversationFull(String sessionId) {
        Session session = sessions.get(sessionId);
        if (session == null) return List.of();

        List<Map<String, Object>> result = new ArrayList<>();
        for (Message msg : session.conversation) {
            result.add(msg.toMap());
        }
        return result;
    }

    public void destroySession(String sessionId) {
        sessions.remove(sessionId);
        log.info("[SESSION] destroyed sessionId={}", sessionId);
    }

    public int destroySessions(List<String> sessionIds) {
        int count = 0;
        for (String id : sessionIds) {
            if (sessions.remove(id) != null) count++;
        }
        log.info("[SESSION] bulk destroyed {} sessions", count);
        return count;
    }

    public int cleanupExpiredSessions() {
        long now = System.currentTimeMillis();
        int cleaned = 0;
        var it = sessions.entrySet().iterator();
        while (it.hasNext()) {
            var entry = it.next();
            if (now - entry.getValue().lastActiveTime > SESSION_TIMEOUT_MS) {
                it.remove();
                cleaned++;
                log.info("[SESSION] expired sessionId={}", entry.getKey());
            }
        }
        return cleaned;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 内部方法 — 消息构建
    // ═════════════════════════════════════════════════════════════════════════

    private List<Map<String, Object>> buildWindowedMessages(Session session) {
        List<Map<String, Object>> result = new ArrayList<>();

        // system prompt 始终在最前
        result.add(Map.of("role", "system", "content", session.systemPrompt));

        List<Message> conv = session.conversation;
        int windowSize = session.windowSize;

        if (conv.size() <= windowSize) {
            for (Message msg : conv) {
                result.add(msg.toMap());
            }
        } else {
            // 保留首条用户消息 + 最近 windowSize-1 条
            result.add(conv.get(0).toMap());

            int startIdx = conv.size() - (windowSize - 1);

            // 1. 如果 startIdx 落在 tool 消息上，向前回溯找到对应的 assistant(tool_calls) 消息，
            //    保证 assistant+tool_calls 块的完整性。
            while (startIdx > 1 && "tool".equals(conv.get(startIdx).role)) {
                startIdx--;
            }

            // 2. 如果 startIdx 落在 assistant 消息且该 assistant 带 tool_calls，
            //    则这个 assistant 及其后续 tool 消息必须一起包含（已由上步保证）。
            //    但若 startIdx 仍不是 user/assistant，再后移一步跳过孤立消息。
            if (startIdx < conv.size()) {
                String role = conv.get(startIdx).role;
                if (!"user".equals(role) && !"assistant".equals(role)) {
                    startIdx++;
                }
            }

            for (int i = startIdx; i < conv.size(); i++) {
                result.add(conv.get(i).toMap());
            }
        }

        return result;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 内部方法 — LLM 调用（非流式）
    // ═════════════════════════════════════════════════════════════════════════

    private LlmResult callLlm(List<Map<String, Object>> messages,
                               List<Map<String, Object>> tools) {
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("model", props.getModel());
            body.put("messages", messages);
            body.put("max_tokens", props.getEffectiveMaxTokens());

            Double temp = props.getEffectiveTemperature();
            if (temp != null) body.put("temperature", temp);

            if (tools != null && !tools.isEmpty()) {
                body.put("tools", tools);
            }

            String bodyJson = objectMapper.writeValueAsString(body);

            String responseJson = restClient.post()
                    .uri("/v1/chat/completions")
                    .body(bodyJson)
                    .retrieve()
                    .body(String.class);

            if (responseJson == null) {
                log.error("[SESSION] LLM returned null response");
                return null;
            }

            return parseLlmResponse(responseJson);

        } catch (Exception e) {
            log.error("[SESSION] LLM call failed: {}", e.getMessage(), e);
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private LlmResult parseLlmResponse(String responseJson) throws Exception {
        Map<String, Object> responseMap = objectMapper.readValue(
                responseJson, new TypeReference<>() {});

        List<Map<String, Object>> choices =
                (List<Map<String, Object>>) responseMap.get("choices");
        if (choices == null || choices.isEmpty()) {
            log.error("[SESSION] LLM returned no choices");
            return null;
        }

        Map<String, Object> message =
                (Map<String, Object>) choices.get(0).get("message");
        if (message == null) return null;

        String text = message.get("content") instanceof String s ? s : null;
        String reasoning = message.get("reasoning_content") instanceof String s ? s : null;

        // 解析 tool_calls
        List<Map<String, Object>> toolCalls = null;
        if (message.get("tool_calls") instanceof List<?> tcList && !tcList.isEmpty()) {
            toolCalls = (List<Map<String, Object>>) message.get("tool_calls");
        }

        return new LlmResult(text != null ? text : "", reasoning, toolCalls);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 内部方法 — LLM 调用（SSE 流式）
    // ═════════════════════════════════════════════════════════════════════════

    @SuppressWarnings("unchecked")
    private void callLlmStream(List<Map<String, Object>> messages,
                                List<Map<String, Object>> tools,
                                SseEmitter emitter,
                                Session session) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", props.getModel());
        body.put("messages", messages);
        body.put("max_tokens", props.getEffectiveMaxTokens());
        body.put("stream", true);

        Double temp = props.getEffectiveTemperature();
        if (temp != null) body.put("temperature", temp);

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

        if (tools != null && !tools.isEmpty()) {
            body.put("tools", tools);
        }

        String bodyJson = objectMapper.writeValueAsString(body);

        StringBuilder contentBuilder = new StringBuilder();
        StringBuilder reasoningBuilder = new StringBuilder();
        // toolCalls 增量拼装
        Map<Integer, Map<String, Object>> toolCallsMap = new LinkedHashMap<>();

        final String[] providerErrorDetail = new String[1];
        final LlmResult[] fallbackHolder = new LlmResult[1];

        try {
            restClient.post()
                    .uri("/v1/chat/completions")
                    .body(bodyJson)
                    .exchange((httpRequest, response) -> {
                    int statusCode = response.getStatusCode().value();
                    if (statusCode >= 400) {
                        String errorBody = readBodyAsString(response.getBody());
                        String detail = "HTTP " + statusCode + (errorBody.isBlank() ? "" : ": " + errorBody);
                        providerErrorDetail[0] = detail;
                        log.warn("[SESSION] stream provider failed, fallback to non-stream. detail={}", detail);
                        fallbackHolder[0] = callLlm(messages, tools);
                        return null;
                    }

                    try (BufferedReader reader = new BufferedReader(
                            new InputStreamReader(response.getBody(), StandardCharsets.UTF_8))) {

                        String line;
                        while ((line = reader.readLine()) != null) {
                            if (!line.startsWith("data: ")) continue;
                            String data = line.substring(6).trim();
                            if ("[DONE]".equals(data)) break;

                            Map<String, Object> chunk = objectMapper.readValue(
                                    data, new TypeReference<>() {});
                            List<Map<String, Object>> choices =
                                    (List<Map<String, Object>>) chunk.get("choices");
                            if (choices == null || choices.isEmpty()) continue;

                            Map<String, Object> delta =
                                    (Map<String, Object>) choices.get(0).get("delta");
                            if (delta == null) continue;

                            // 文本增量
                            if (delta.get("content") instanceof String s && !s.isEmpty()) {
                                contentBuilder.append(s);
                                emitter.send(SseEmitter.event().name("delta").data(s));
                            }

                            // reasoning 增量
                            if (delta.get("reasoning_content") instanceof String s && !s.isEmpty()) {
                                reasoningBuilder.append(s);
                                emitter.send(SseEmitter.event().name("reasoning").data(s));
                            }

                            // tool_calls 增量
                            if (delta.get("tool_calls") instanceof List<?> tcDeltas) {
                                for (Object tcd : tcDeltas) {
                                    if (!(tcd instanceof Map<?, ?> tcDelta)) continue;
                                    int idx = tcDelta.get("index") instanceof Number n ? n.intValue() : 0;

                                    Map<String, Object> existing = toolCallsMap.computeIfAbsent(idx,
                                            k -> {
                                                Map<String, Object> m = new LinkedHashMap<>();
                                                m.put("id", "");
                                                m.put("type", "function");
                                                Map<String, Object> fn = new LinkedHashMap<>();
                                                fn.put("name", "");
                                                fn.put("arguments", "");
                                                m.put("function", fn);
                                                return m;
                                            });

                                    if (tcDelta.get("id") instanceof String id && !id.isEmpty()) {
                                        existing.put("id", id);
                                    }

                                    if (tcDelta.get("function") instanceof Map<?, ?> fn) {
                                        Map<String, Object> existingFn =
                                                (Map<String, Object>) existing.get("function");
                                        if (fn.get("name") instanceof String name && !name.isEmpty()) {
                                            existingFn.put("name", name);
                                        }
                                        if (fn.get("arguments") instanceof String args) {
                                            existingFn.put("arguments",
                                                    existingFn.get("arguments") + args);
                                        }
                                    }
                                }
                            }
                        }
                    }

                        return null;
                    }, false);
        } catch (Exception streamEx) {
            String message = streamEx.getMessage() != null ? streamEx.getMessage() : "";
            // 某些 HttpURLConnection 实现会在 4xx 时直接抛异常，不会进入 exchange 回调。
            boolean isProvider4xx = message.contains("HTTP response code: 400")
                    || message.contains("HTTP response code: 401")
                    || message.contains("HTTP response code: 403")
                    || message.contains("HTTP response code: 404")
                    || message.contains("/v1/chat/completions");

            if (isProvider4xx) {
                String detail = message.isBlank() ? streamEx.toString() : message;
                providerErrorDetail[0] = detail;
                log.warn("[SESSION] stream provider exception, fallback to non-stream. detail={}", detail);
                fallbackHolder[0] = callLlm(messages, tools);
            } else {
                throw streamEx;
            }
        }

        if (providerErrorDetail[0] != null) {
            LlmResult fallback = fallbackHolder[0];
            if (fallback == null) {
                throw new RuntimeException("SSE provider error 且 fallback 失败: " + providerErrorDetail[0]);
            }
            emitFinalResult(emitter, session, fallback.text, fallback.reasoning, fallback.toolCalls);
            return;
        }

        // 拼装最终结果
        String text = contentBuilder.toString();
        String reasoning = !reasoningBuilder.isEmpty() ? reasoningBuilder.toString() : null;
        List<Map<String, Object>> toolCalls = toolCallsMap.isEmpty()
            ? null : new ArrayList<>(toolCallsMap.values());

        emitFinalResult(emitter, session, text, reasoning, toolCalls);
    }

    private String readBodyAsString(InputStream inputStream) throws IOException {
        if (inputStream == null) {
            return "";
        }
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream, StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                if (!sb.isEmpty()) sb.append('\n');
                sb.append(line);
            }
            return sb.toString();
        }
    }

        private void emitFinalResult(SseEmitter emitter,
                     Session session,
                     String text,
                     String reasoning,
                     List<Map<String, Object>> toolCalls) throws Exception {
        // 记录到对话历史。
        // 当有 tool_calls 时，前端 FC 循环会通过 appendMessages 追加 assistant + tool results，
        // 因此后端不再自动写入，避免出现两条相邻的 assistant(tool_calls) 导致 DeepSeek 400。
        if (toolCalls == null || toolCalls.isEmpty()) {
            Message assistantMsg = new Message("assistant");
            assistantMsg.content = text;
            session.conversation.add(assistantMsg);
        }

        // 发送最终结果
        Map<String, Object> resultMap = new LinkedHashMap<>();
        resultMap.put("text", text);
        if (reasoning != null) resultMap.put("reasoning", reasoning);
        if (toolCalls != null) resultMap.put("toolCalls", toolCalls);

        emitter.send(SseEmitter.event().name("result")
            .data(objectMapper.writeValueAsString(resultMap)));
        emitter.send(SseEmitter.event().name("done").data("{}"));
        emitter.complete();
        }

    // ═════════════════════════════════════════════════════════════════════════
    // 内部类型
    // ═════════════════════════════════════════════════════════════════════════

    private static class Session {
        String systemPrompt;
        int windowSize;
        long lastActiveTime;
        String mode;
        SessionState state;
        int consecutiveFailures;
        int roundCounter;
        final Set<String> idempotencyLedger = new HashSet<>();
        List<Map<String, Object>> tools;
        final List<Message> conversation = new ArrayList<>();
    }

    private enum SessionState {
        READY,
        PLAN,
        CALL,
        APPLY,
        VERIFY,
        DONE,
        FAILED,
        HANDOFF
    }

    private void transition(Session session, SessionState target) {
        SessionState current = session.state;
        if (current == null) {
            session.state = target;
            return;
        }
        if (current == target) {
            return;
        }
        if (!isTransitionAllowed(current, target)) {
            throw new IllegalStateException("INVALID_STATE_TRANSITION: " + current + " -> " + target);
        }
        session.state = target;
    }

    private boolean isTransitionAllowed(SessionState from, SessionState to) {
        return switch (from) {
            case READY -> to == SessionState.PLAN;
            case PLAN -> to == SessionState.CALL || to == SessionState.FAILED;
            case CALL -> to == SessionState.APPLY || to == SessionState.FAILED;
            case APPLY -> to == SessionState.VERIFY || to == SessionState.FAILED;
            case VERIFY -> to == SessionState.DONE || to == SessionState.PLAN || to == SessionState.FAILED;
            case DONE -> to == SessionState.READY;
            case FAILED -> to == SessionState.HANDOFF;
            case HANDOFF -> to == SessionState.PLAN;
        };
    }

    private Map<String, Object> buildHandoffPayload(String reasonCode, String nextAction) {
        Map<String, Object> handoff = new LinkedHashMap<>();
        handoff.put("reasonCode", reasonCode);
        handoff.put("nextAction", nextAction);
        handoff.put("checklist", List.of("检查上次失败工具调用参数", "确认是否继续执行", "必要时手工修复后再恢复"));
        return handoff;
    }

    // 包级测试辅助：用于验证阶段一状态机白名单与 HANDOFF 载荷，不影响生产调用。
    boolean isTransitionAllowedForTesting(String from, String to) {
        SessionState fromState = SessionState.valueOf(from);
        SessionState toState = SessionState.valueOf(to);
        return isTransitionAllowed(fromState, toState);
    }

    // 包级测试辅助：模拟单步迁移，非法迁移会抛 IllegalStateException。
    String applyTransitionForTesting(String from, String to) {
        Session session = new Session();
        session.state = SessionState.valueOf(from);
        transition(session, SessionState.valueOf(to));
        return session.state.name();
    }

    // 包级测试辅助：校验 HANDOFF 载荷结构。
    Map<String, Object> buildHandoffPayloadForTesting(String reasonCode, String nextAction) {
        return buildHandoffPayload(reasonCode, nextAction);
    }

    // 包级测试辅助：创建最小会话并返回 sessionId。
    String createSessionForTesting() {
        return createSession("test-system", "test-user", DEFAULT_WINDOW_SIZE, null, "stills");
    }

    // 包级测试辅助：对给定 toolCalls 生成 runtime meta（复用真实幂等账本与并行判定）。
    Map<String, Object> analyzeRuntimeMetaForTesting(String sessionId,
                                                     int round,
                                                     List<Map<String, Object>> toolCalls) {
        Session session = sessions.get(sessionId);
        if (session == null) {
            throw new IllegalArgumentException("session not found: " + sessionId);
        }
        return buildRuntimeMeta(sessionId, round, session, toolCalls);
    }

    private Map<String, Object> buildRuntimeMeta(String sessionId,
                                                 int round,
                                                 Session session,
                                                 List<Map<String, Object>> toolCalls) {
        List<Map<String, Object>> idempotency = new ArrayList<>();
        List<Map<String, Object>> classified = new ArrayList<>();
        List<Map<String, Object>> blocked = new ArrayList<>();
        Set<String> toolCallIds = new HashSet<>();

        for (Map<String, Object> call : toolCalls) {
            @SuppressWarnings("unchecked")
            Map<String, Object> fn = call.get("function") instanceof Map<?, ?> m
                    ? (Map<String, Object>) m : Map.of();

            String callId = call.get("id") instanceof String s ? s : "";
            String action = fn.get("name") instanceof String s ? s : "unknown.action";
            String args = fn.get("arguments") instanceof String s ? s : "";
            ActionRuleMatch ruleMatch = resolveActionRule(action);
            ActionRule rule = ruleMatch.rule;
            String mode = modeForAction(action, rule);
            EntityResolution entityResolution = resolveEntity(action, args, mode);
            String resourceKey = resourceKeyForAction(action, entityResolution, mode);

            if (!callId.isEmpty() && !toolCallIds.add(callId)) {
                Map<String, Object> reason = new LinkedHashMap<>();
                reason.put("toolCallId", callId);
                reason.put("action", action);
                reason.put("reasonCode", "DUPLICATE_TOOL_CALL_ID");
                blocked.add(reason);
            }

            String argsHash = shortSha256(args);
            String key = sessionId + ":" + round + ":" + action + ":" + argsHash + ":" + callId;
            boolean replayed = !session.idempotencyLedger.add(key);
            String policy = policyForAction(action, rule, mode);
            String riskLevel = riskLevelForAction(mode, rule);

            if (replayed && ("strong".equals(policy) || "windowed".equals(policy))) {
                Map<String, Object> reason = new LinkedHashMap<>();
                reason.put("toolCallId", callId);
                reason.put("action", action);
                reason.put("reasonCode", "IDEMPOTENCY_REPLAY_BLOCKED");
                reason.put("idempotencyKey", key);
                blocked.add(reason);
            }

            Map<String, Object> idem = new LinkedHashMap<>();
            idem.put("toolCallId", callId);
            idem.put("action", action);
            idem.put("policy", policy);
            idem.put("idempotencyKey", key);
            idem.put("argsHash", argsHash);
            idem.put("replayed", replayed);
            idem.put("riskLevel", riskLevel);
            idem.put("ruleSource", ruleMatch.source);
            idempotency.add(idem);

            Map<String, Object> item = new LinkedHashMap<>();
            item.put("toolCallId", callId);
            item.put("action", action);
            item.put("resourceKey", resourceKey);
            item.put("mode", mode);
            item.put("classification", resourceKey.contains("@entity:") ? "entity" : "domain");
            item.put("entityHintSource", entityResolution.source);
            item.put("riskLevel", riskLevel);
            item.put("ruleSource", ruleMatch.source);
            classified.add(item);
        }

        Map<String, Object> scheduling = buildConflictAwareSchedule(classified);
        blocked.addAll(evaluateParallelismRisks(scheduling, classified));
        Map<String, Object> guard = buildRuntimeGuard(blocked);

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("round", round);
        meta.put("idempotency", idempotency);
        meta.put("scheduling", scheduling);
        meta.put("guard", guard);
        return meta;
    }

    private Map<String, Object> getRuntimeGuard(Map<String, Object> runtimeMeta) {
        @SuppressWarnings("unchecked")
        Map<String, Object> guard = runtimeMeta.get("guard") instanceof Map<?, ?> m
                ? (Map<String, Object>) m : Map.of("blocked", false);
        return guard;
    }

    private Map<String, Object> buildRuntimeGuard(List<Map<String, Object>> blockedReasons) {
        Map<String, Object> guard = new LinkedHashMap<>();
        if (blockedReasons.isEmpty()) {
            guard.put("blocked", false);
            guard.put("reasonCode", null);
            guard.put("details", List.of());
            return guard;
        }

        String reasonCode = blockedReasons.stream()
                .map(item -> item.get("reasonCode") instanceof String s ? s : "RUNTIME_GUARD_BLOCKED")
                .findFirst()
                .orElse("RUNTIME_GUARD_BLOCKED");

        guard.put("blocked", true);
        guard.put("reasonCode", reasonCode);
        guard.put("details", blockedReasons);
        return guard;
    }

    private Map<String, Object> buildConflictAwareSchedule(List<Map<String, Object>> items) {
        List<List<Map<String, Object>>> groups = new ArrayList<>();

        for (Map<String, Object> item : items) {
            String resourceKey = item.get("resourceKey") instanceof String s ? s : "global";
            String mode = item.get("mode") instanceof String s ? s : "write";

            boolean placed = false;
            for (List<Map<String, Object>> group : groups) {
                if (!hasConflict(group, resourceKey, mode)) {
                    group.add(item);
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                List<Map<String, Object>> newGroup = new ArrayList<>();
                newGroup.add(item);
                groups.add(newGroup);
            }
        }

        List<Map<String, Object>> parallelGroups = new ArrayList<>();
        Set<String> scheduleRuleSources = new LinkedHashSet<>();
        int maxParallelWidth = 0;
        for (int i = 0; i < groups.size(); i++) {
            List<Map<String, Object>> group = groups.get(i);
            List<String> ids = new ArrayList<>();
            List<String> modes = new ArrayList<>();
            Set<String> ruleSources = new LinkedHashSet<>();
            for (Map<String, Object> item : group) {
                ids.add(item.get("toolCallId") instanceof String s ? s : "");
                modes.add(item.get("mode") instanceof String s ? s : "write");
                String source = item.get("ruleSource") instanceof String s ? s : "fallback";
                ruleSources.add(source);
            }
            scheduleRuleSources.addAll(ruleSources);
            maxParallelWidth = Math.max(maxParallelWidth, group.size());
            Map<String, Object> g = new LinkedHashMap<>();
            g.put("groupIndex", i);
            g.put("toolCallIds", ids);
            g.put("modes", modes);
            g.put("ruleSources", new ArrayList<>(ruleSources));
            g.put("dominantRuleSource", dominantRuleSource(ruleSources));
            parallelGroups.add(g);
        }

        long writeCalls = items.stream()
                .filter(item -> "write".equals(item.get("mode")))
                .count();

        Map<String, Object> scheduling = new LinkedHashMap<>();
        scheduling.put("strategy", "conflict-aware");
        scheduling.put("groups", parallelGroups);
        scheduling.put("maxParallelWidth", maxParallelWidth);
        scheduling.put("writeCalls", writeCalls);
        scheduling.put("executionMode", writeCalls > 0 ? "serial-write-guard" : "parallel-read-safe");
        scheduling.put("collisionScope", "domain+entity");
        scheduling.put("classificationStrategy", "action-rule-object+runtime-fallback");
        scheduling.put("ruleMatchStrategy", "exact-first-prefix-second-fallback");
        scheduling.put("ruleSources", new ArrayList<>(scheduleRuleSources));
        scheduling.put("dominantRuleSource", dominantRuleSource(scheduleRuleSources));
        return scheduling;
    }

    private String dominantRuleSource(Set<String> sources) {
        if (sources.contains("exact")) {
            return "exact";
        }
        if (sources.contains("prefix")) {
            return "prefix";
        }
        return "fallback";
    }

    private List<Map<String, Object>> evaluateParallelismRisks(Map<String, Object> scheduling,
                                                               List<Map<String, Object>> classified) {
        List<Map<String, Object>> blocked = new ArrayList<>();

        long writeCalls = scheduling.get("writeCalls") instanceof Number n ? n.longValue() : 0L;
        if (writeCalls > STAGE1_MAX_WRITE_CALLS_PER_ROUND) {
            Map<String, Object> reason = new LinkedHashMap<>();
            reason.put("reasonCode", "PARALLEL_WRITE_BUDGET_EXCEEDED");
            reason.put("writeCalls", writeCalls);
            reason.put("maxAllowed", STAGE1_MAX_WRITE_CALLS_PER_ROUND);
            blocked.add(reason);
        }

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> groups = scheduling.get("groups") instanceof List<?> list
                ? (List<Map<String, Object>>) list : List.of();

        for (Map<String, Object> group : groups) {
            @SuppressWarnings("unchecked")
            List<String> modes = group.get("modes") instanceof List<?> list
                    ? (List<String>) list : List.of();
            int width = group.get("toolCallIds") instanceof List<?> list ? list.size() : 0;
            boolean containsWrite = modes.stream().anyMatch("write"::equals);
            if (width > 1 && containsWrite) {
                Map<String, Object> reason = new LinkedHashMap<>();
                reason.put("reasonCode", "PARALLEL_WRITE_NOT_ALLOWED_STAGE1");
                reason.put("groupIndex", group.get("groupIndex"));
                reason.put("parallelWidth", width);
                blocked.add(reason);
            }
        }

        if (blocked.isEmpty() && !classified.isEmpty()) {
            // Stage-1: keep the decision explicit for observability even when pass-through.
            scheduling.put("decision", "allow");
        } else {
            scheduling.put("decision", "block");
        }

        return blocked;
    }

    private boolean hasConflict(List<Map<String, Object>> group, String resourceKey, String mode) {
        for (Map<String, Object> existing : group) {
            String existingResource = existing.get("resourceKey") instanceof String s ? s : "global";
            String existingMode = existing.get("mode") instanceof String s ? s : "write";

            if (!existingResource.equals(resourceKey)) {
                continue;
            }
            if ("read".equals(mode) && "read".equals(existingMode)) {
                continue;
            }
            return true;
        }
        return false;
    }

    private String policyForAction(String action, ActionRule rule, String mode) {
        if (rule != null && rule.idempotencyPolicy != null) {
            return rule.idempotencyPolicy;
        }
        if ("read".equals(mode)) {
            return "describe-only";
        }
        if (action.contains("batch") || action.contains("import")) {
            return "windowed";
        }
        return "strong";
    }

    private String riskLevelForAction(String mode, ActionRule rule) {
        if (rule != null && rule.riskLevel != null) {
            return rule.riskLevel;
        }
        if ("read".equals(mode)) {
            return "low";
        }
        return "medium";
    }

    private String modeForAction(String action, ActionRule rule) {
        if (rule != null && rule.mode != null) {
            return rule.mode;
        }
        return modeByHeuristic(action);
    }

    private ActionRuleMatch resolveActionRule(String action) {
        ActionRule exact = ACTION_RULES_EXACT.get(action);
        if (exact != null) {
            return ActionRuleMatch.of(exact, "exact");
        }
        for (Map.Entry<String, ActionRule> entry : ACTION_RULES_PREFIX.entrySet()) {
            if (action.startsWith(entry.getKey())) {
                return ActionRuleMatch.of(entry.getValue(), "prefix");
            }
        }
        return ActionRuleMatch.none();
    }

    private String resourceKeyForAction(String action, EntityResolution entityResolution, String mode) {
        String domainKey = actionDomain(action);
        if ("read".equals(mode)) {
            return domainKey;
        }

        String entity = entityResolution.value;
        if (entity == null || entity.isBlank()) {
            return domainKey;
        }
        return domainKey + "@entity:" + entity;
    }

    private String actionDomain(String action) {
        int idx = action.indexOf('.');
        if (idx <= 0) {
            return "global";
        }
        return action.substring(0, idx);
    }

    private EntityResolution resolveEntity(String action, String args, String mode) {
        if ("read".equals(mode)) {
            return EntityResolution.none();
        }

        Map<String, Object> argsMap = parseArgsMap(args);
        if (argsMap == null) {
            return EntityResolution.none();
        }

        List<String> declaredHints = declaredHintsForAction(action);
        String declared = pickEntityByHints(argsMap, declaredHints);
        if (declared != null) {
            return EntityResolution.of(declared, "static-declared");
        }

        String fallback = pickEntityByHints(argsMap, new ArrayList<>(ENTITY_KEY_HINTS));
        if (fallback != null) {
            return EntityResolution.of(fallback, "runtime-fallback");
        }

        return EntityResolution.none();
    }

    private Map<String, Object> parseArgsMap(String args) {
        if (args == null || args.isBlank()) {
            return null;
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> map = objectMapper.readValue(args, new TypeReference<>() {});
            return map;
        } catch (Exception ex) {
            return null;
        }
    }

    private List<String> declaredHintsForAction(String action) {
        ActionRule rule = resolveActionRule(action).rule;
        if (rule != null && !rule.entityHints.isEmpty()) {
            return rule.entityHints;
        }
        return List.of();
    }

    private String pickEntityByHints(Map<String, Object> map, List<String> hints) {
        for (String hint : hints) {
            Object raw = map.get(hint);
            if (raw instanceof String s && !s.isBlank()) {
                return normalizeDiscriminator(s);
            }
            if (raw instanceof Number n) {
                return String.valueOf(n.longValue());
            }
            if (raw instanceof List<?> list && !list.isEmpty()) {
                Object first = list.get(0);
                if (first instanceof String s && !s.isBlank()) {
                    return normalizeDiscriminator(s);
                }
                if (first instanceof Number n) {
                    return String.valueOf(n.longValue());
                }
            }
        }
        return null;
    }

    private String normalizeDiscriminator(String raw) {
        String cleaned = raw.trim();
        if (cleaned.length() > 64) {
            return shortSha256(cleaned);
        }
        return cleaned.replace(' ', '_');
    }

    private static class EntityResolution {
        final String value;
        final String source;

        private EntityResolution(String value, String source) {
            this.value = value;
            this.source = source;
        }

        static EntityResolution of(String value, String source) {
            return new EntityResolution(value, source);
        }

        static EntityResolution none() {
            return new EntityResolution(null, "none");
        }
    }

    private String modeByHeuristic(String action) {
        String lower = action.toLowerCase(Locale.ROOT);
        if (lower.startsWith("get") || lower.startsWith("list") || lower.startsWith("query")
                || lower.startsWith("describe") || lower.contains(".get")
                || lower.contains(".list") || lower.contains(".query") || lower.contains(".describe")) {
            return "read";
        }
        return "write";
    }

    private static class ActionRule {
        final String mode;
        final String idempotencyPolicy;
        final List<String> entityHints;
        final String riskLevel;

        ActionRule(String mode, String idempotencyPolicy, List<String> entityHints, String riskLevel) {
            this.mode = mode;
            this.idempotencyPolicy = idempotencyPolicy;
            this.entityHints = entityHints;
            this.riskLevel = riskLevel;
        }
    }

    private static class ActionRuleMatch {
        final ActionRule rule;
        final String source;

        private ActionRuleMatch(ActionRule rule, String source) {
            this.rule = rule;
            this.source = source;
        }

        static ActionRuleMatch of(ActionRule rule, String source) {
            return new ActionRuleMatch(rule, source);
        }

        static ActionRuleMatch none() {
            return new ActionRuleMatch(null, "fallback");
        }
    }

    private String shortSha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 8 && i < bytes.length; i++) {
                sb.append(String.format("%02x", bytes[i]));
            }
            return sb.toString();
        } catch (Exception e) {
            return Integer.toHexString(value.hashCode());
        }
    }

    /**
     * 消息 — 支持 FC 字段（tool_calls, tool_call_id）。
     */
    private static class Message {
        final String role;
        String content;
        String toolCallId;
        List<Map<String, Object>> toolCalls;

        Message(String role) {
            this.role = role;
        }

        Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("role", role);

            if ("tool".equals(role)) {
                m.put("content", content != null ? content : "");
                if (toolCallId != null) m.put("tool_call_id", toolCallId);
            } else if ("assistant".equals(role) && toolCalls != null && !toolCalls.isEmpty()) {
                if (content != null) m.put("content", content);
                m.put("tool_calls", toolCalls);
            } else {
                m.put("content", content != null ? content : "");
            }

            return m;
        }
    }

    private static class LlmResult {
        final String text;
        final String reasoning;
        final List<Map<String, Object>> toolCalls;

        LlmResult(String text, String reasoning, List<Map<String, Object>> toolCalls) {
            this.text = text;
            this.reasoning = reasoning;
            this.toolCalls = toolCalls;
        }
    }

    /** 单轮对话结果（含 FC toolCalls） */
    public static class TurnResult {
        private final String text;
        private final String reasoning;
        private final List<Map<String, Object>> toolCalls;
        private final String state;
        private final String stateTransition;
        private final String errorCode;
        private final Map<String, Object> handoff;
        private final Map<String, Object> runtimeMeta;

        public TurnResult(String text, String reasoning, List<Map<String, Object>> toolCalls) {
            this(text, reasoning, toolCalls, null, null, null, null, null);
        }

        public TurnResult(String text,
                          String reasoning,
                          List<Map<String, Object>> toolCalls,
                          String state,
                          String stateTransition,
                          String errorCode,
                          Map<String, Object> handoff,
                          Map<String, Object> runtimeMeta) {
            this.text = text;
            this.reasoning = reasoning;
            this.toolCalls = toolCalls;
            this.state = state;
            this.stateTransition = stateTransition;
            this.errorCode = errorCode;
            this.handoff = handoff;
            this.runtimeMeta = runtimeMeta;
        }

        public TurnResult(String text, String reasoning) {
            this(text, reasoning, null);
        }

        public static TurnResult error(String state,
                                       String stateTransition,
                                       String errorCode,
                                       Map<String, Object> handoff) {
            return new TurnResult("", null, null, state, stateTransition, errorCode, handoff, null);
        }

        public static TurnResult error(String state,
                                       String stateTransition,
                                       String errorCode,
                                       Map<String, Object> handoff,
                                       Map<String, Object> runtimeMeta) {
            return new TurnResult("", null, null, state, stateTransition, errorCode, handoff, runtimeMeta);
        }

        public String getText() { return text; }
        public String getReasoning() { return reasoning; }
        public List<Map<String, Object>> getToolCalls() { return toolCalls; }
        public String getState() { return state; }
        public String getStateTransition() { return stateTransition; }
        public String getErrorCode() { return errorCode; }
        public Map<String, Object> getHandoff() { return handoff; }
        public Map<String, Object> getRuntimeMeta() { return runtimeMeta; }
    }
}
