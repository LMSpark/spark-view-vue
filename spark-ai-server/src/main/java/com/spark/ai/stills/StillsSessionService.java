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
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
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

        Message userMsg = new Message("user");
        userMsg.content = userPrompt;
        session.conversation.add(userMsg);

        sessions.put(sessionId, session);

        log.info("[SESSION] created sessionId={} windowSize={} mode={} tools={}",
                sessionId, session.windowSize, session.mode,
                tools != null ? tools.size() : 0);
        return sessionId;
    }

    /** 兼容旧 API（无 tools/mode） */
    public String createSession(String systemPrompt, String userPrompt, int windowSize) {
        return createSession(systemPrompt, userPrompt, windowSize, null, null);
    }

    /**
     * 执行一轮对话（非流式），支持 Function Calling。
     */
    public TurnResult executeTurn(String sessionId) {
        Session session = sessions.get(sessionId);
        if (session == null) return null;

        session.lastActiveTime = System.currentTimeMillis();

        List<Map<String, Object>> messages = buildWindowedMessages(session);

        log.info("[SESSION] turn sessionId={} msgCount={} tools={}",
                sessionId, messages.size(),
                session.tools != null ? session.tools.size() : 0);

        LlmResult llmResult = callLlm(messages, session.tools);
        if (llmResult == null) return null;

        // 记录 assistant 回复到对话历史
        Message assistantMsg = new Message("assistant");
        assistantMsg.content = llmResult.text;
        if (llmResult.toolCalls != null && !llmResult.toolCalls.isEmpty()) {
            assistantMsg.toolCalls = llmResult.toolCalls;
        }
        session.conversation.add(assistantMsg);

        return new TurnResult(llmResult.text, llmResult.reasoning, llmResult.toolCalls);
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

    /** 兼容旧 API（简单文本消息） */
    public boolean appendMessage(String sessionId, String role, String content) {
        return appendMessage(sessionId, role, content, null, null);
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

    /** 兼容旧 API（简单格式） */
    public List<Map<String, String>> getConversation(String sessionId) {
        Session session = sessions.get(sessionId);
        if (session == null) return List.of();

        List<Map<String, String>> result = new ArrayList<>();
        for (Message msg : session.conversation) {
            result.add(Map.of("role", msg.role, "content",
                    msg.content != null ? msg.content : ""));
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
            if (startIdx < conv.size() && !"assistant".equals(conv.get(startIdx).role)) {
                startIdx++;
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

        if (tools != null && !tools.isEmpty()) {
            body.put("tools", tools);
        }

        String bodyJson = objectMapper.writeValueAsString(body);

        // 使用原始 HttpURLConnection 消费 SSE 流
        URI uri = URI.create(props.getBaseUrl() + "/v1/chat/completions");
        HttpURLConnection conn = (HttpURLConnection) uri.toURL().openConnection();
        conn.setRequestMethod("POST");
        conn.setDoOutput(true);
        conn.setRequestProperty("Authorization", "Bearer " + props.getApiKey());
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setReadTimeout(300_000);
        conn.setConnectTimeout(15_000);

        try (OutputStream os = conn.getOutputStream()) {
            os.write(bodyJson.getBytes(StandardCharsets.UTF_8));
        }

        StringBuilder contentBuilder = new StringBuilder();
        StringBuilder reasoningBuilder = new StringBuilder();
        // toolCalls 增量拼装
        Map<Integer, Map<String, Object>> toolCallsMap = new LinkedHashMap<>();

        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {

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
        } finally {
            conn.disconnect();
        }

        // 拼装最终结果
        String text = contentBuilder.toString();
        String reasoning = !reasoningBuilder.isEmpty() ? reasoningBuilder.toString() : null;
        List<Map<String, Object>> toolCalls = toolCallsMap.isEmpty()
                ? null : new ArrayList<>(toolCallsMap.values());

        // 记录到对话历史
        Message assistantMsg = new Message("assistant");
        assistantMsg.content = text;
        assistantMsg.toolCalls = toolCalls;
        session.conversation.add(assistantMsg);

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
        List<Map<String, Object>> tools;
        final List<Message> conversation = new ArrayList<>();
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

        public TurnResult(String text, String reasoning, List<Map<String, Object>> toolCalls) {
            this.text = text;
            this.reasoning = reasoning;
            this.toolCalls = toolCalls;
        }

        public TurnResult(String text, String reasoning) {
            this(text, reasoning, null);
        }

        public String getText() { return text; }
        public String getReasoning() { return reasoning; }
        public List<Map<String, Object>> getToolCalls() { return toolCalls; }
    }
}
