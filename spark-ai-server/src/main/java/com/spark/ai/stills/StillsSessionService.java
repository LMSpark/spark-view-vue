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

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Stills 会话服务 — 按 sessionId 管理对话历史 + 滑动窗口 + LLM 调用。
 *
 * <h3>职责（通信层）</h3>
 * <ul>
 *   <li>每个 sessionId 维护独立的对话历史</li>
 *   <li>LLM 调用前自动应用滑动窗口裁剪，控制 token 消耗</li>
 *   <li>会话创建/销毁/超时自动清理</li>
 * </ul>
 *
 * <h3>用户隔离</h3>
 * SSE 已天然做到一个连接对应一个浏览器会话，sessionId（UUID）即隔离凭据。
 * 无需额外 userId 嵌套。
 *
 * <h3>不做的事</h3>
 * <ul>
 *   <li>不理解 Stills 协议块内容（纯通信层）</li>
 *   <li>不执行 still（由前端编排器负责）</li>
 *   <li>不管理 IStillSession 状态</li>
 * </ul>
 */
@Service
public class StillsSessionService {

    private static final Logger log = LoggerFactory.getLogger(StillsSessionService.class);

    /** 默认滑动窗口大小（对话消息条数） */
    private static final int DEFAULT_WINDOW_SIZE = 30;

    /** 会话超时时间（毫秒，30 分钟） */
    private static final long SESSION_TIMEOUT_MS = 30 * 60 * 1000L;

    /** 会话存储：sessionId → Session */
    private final ConcurrentHashMap<String, Session> sessions = new ConcurrentHashMap<>();

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
     * 创建会话 — 设置 system prompt 和初始用户消息。
     *
     * @return sessionId（UUID，即为隔离凭据）
     */
    public String createSession(String systemPrompt, String userPrompt, int windowSize) {
        String sessionId = UUID.randomUUID().toString();

        Session session = new Session();
        session.systemPrompt = systemPrompt;
        session.windowSize = windowSize > 0 ? windowSize : DEFAULT_WINDOW_SIZE;
        session.lastActiveTime = System.currentTimeMillis();
        session.conversation.add(new Message("user", userPrompt));

        sessions.put(sessionId, session);

        log.info("[STILLS-SESSION] created sessionId={} windowSize={}",
                sessionId, session.windowSize);
        return sessionId;
    }

    /**
     * 执行一轮对话：将当前对话历史（滑动窗口裁剪后）发给 LLM，返回回复。
     *
     * @return LLM 回复（text + reasoning），null 表示会话不存在或 LLM 调用失败
     */
    public TurnResult executeTurn(String sessionId) {
        Session session = sessions.get(sessionId);
        if (session == null) {
            return null;
        }

        session.lastActiveTime = System.currentTimeMillis();

        // 1. 构建消息（system + 滑动窗口裁剪后的对话历史）
        List<Map<String, String>> messages = buildWindowedMessages(session);

        // 2. 调用 LLM
        log.info("[STILLS-SESSION] turn sessionId={} msgCount={}",
                sessionId, messages.size());
        LlmResult llmResult = callLlm(messages);

        if (llmResult == null) {
            return null;
        }

        // 3. 记录 assistant 回复到对话历史
        session.conversation.add(new Message("assistant", llmResult.text));

        return new TurnResult(llmResult.text, llmResult.reasoning);
    }

    /**
     * 向对话追加消息（通常是工具执行结果，以 user 角色注入）。
     */
    public boolean appendMessage(String sessionId, String role, String content) {
        Session session = sessions.get(sessionId);
        if (session == null) {
            return false;
        }
        session.lastActiveTime = System.currentTimeMillis();
        session.conversation.add(new Message(role, content));
        return true;
    }

    /**
     * 获取完整对话记录（供下游 self-check 等后处理使用）。
     */
    public List<Map<String, String>> getConversation(String sessionId) {
        Session session = sessions.get(sessionId);
        if (session == null) {
            return List.of();
        }
        List<Map<String, String>> result = new ArrayList<>();
        for (Message msg : session.conversation) {
            result.add(Map.of("role", msg.role, "content", msg.content));
        }
        return result;
    }

    /**
     * 销毁会话。
     */
    public void destroySession(String sessionId) {
        sessions.remove(sessionId);
        log.info("[STILLS-SESSION] destroyed sessionId={}", sessionId);
    }

    /**
     * 批量销毁指定会话（前端切换用户时调用）。
     *
     * @param sessionIds 要销毁的会话 ID 列表
     * @return 实际销毁的数量
     */
    public int destroySessions(List<String> sessionIds) {
        int count = 0;
        for (String id : sessionIds) {
            if (sessions.remove(id) != null) {
                count++;
            }
        }
        log.info("[STILLS-SESSION] bulk destroyed {} sessions", count);
        return count;
    }

    /**
     * 清理超时会话（可由定时任务调用）。
     */
    public int cleanupExpiredSessions() {
        long now = System.currentTimeMillis();
        int cleaned = 0;
        var it = sessions.entrySet().iterator();
        while (it.hasNext()) {
            var entry = it.next();
            if (now - entry.getValue().lastActiveTime > SESSION_TIMEOUT_MS) {
                it.remove();
                cleaned++;
                log.info("[STILLS-SESSION] expired sessionId={}", entry.getKey());
            }
        }
        return cleaned;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 内部方法
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * 滑动窗口裁剪：保留首条用户消息 + 最近 windowSize-1 条。
     * 确保从 assistant 消息开始（assistant + user 成对）。
     */
    private List<Map<String, String>> buildWindowedMessages(Session session) {
        List<Map<String, String>> result = new ArrayList<>();

        // system prompt 始终在最前
        result.add(Map.of("role", "system", "content", session.systemPrompt));

        List<Message> conv = session.conversation;
        int windowSize = session.windowSize;

        if (conv.size() <= windowSize) {
            // 不需要裁剪
            for (Message msg : conv) {
                result.add(Map.of("role", msg.role, "content", msg.content));
            }
        } else {
            // 保留首条用户消息 + 最近 windowSize-1 条
            Message first = conv.get(0);
            result.add(Map.of("role", first.role, "content", first.content));

            int startIdx = conv.size() - (windowSize - 1);
            // 确保从 assistant 消息开始（assistant + user 成对）
            if (startIdx < conv.size() && !"assistant".equals(conv.get(startIdx).role)) {
                startIdx++;
            }
            for (int i = startIdx; i < conv.size(); i++) {
                Message msg = conv.get(i);
                result.add(Map.of("role", msg.role, "content", msg.content));
            }
        }

        return result;
    }

    /**
     * 调用 LLM（非流式）。
     */
    private LlmResult callLlm(List<Map<String, String>> messages) {
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
                log.error("[STILLS-SESSION] LLM returned null response");
                return null;
            }

            Map<String, Object> responseMap = objectMapper.readValue(
                    responseJson, new TypeReference<>() {});

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> choices =
                    (List<Map<String, Object>>) responseMap.get("choices");
            if (choices == null || choices.isEmpty()) {
                log.error("[STILLS-SESSION] LLM returned no choices");
                return null;
            }

            @SuppressWarnings("unchecked")
            Map<String, Object> message =
                    (Map<String, Object>) choices.get(0).get("message");
            if (message == null) {
                return null;
            }

            String text = message.get("content") instanceof String s ? s : null;
            String reasoning = message.get("reasoning_content") instanceof String s ? s : null;

            return new LlmResult(text != null ? text : "", reasoning);

        } catch (Exception e) {
            log.error("[STILLS-SESSION] LLM call failed: {}", e.getMessage(), e);
            return null;
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 内部类型
    // ═════════════════════════════════════════════════════════════════════════

    private static class Session {
        String systemPrompt;
        int windowSize;
        long lastActiveTime;
        final List<Message> conversation = new ArrayList<>();
    }

    private static class Message {
        final String role;
        final String content;

        Message(String role, String content) {
            this.role = role;
            this.content = content;
        }
    }

    private static class LlmResult {
        final String text;
        final String reasoning;

        LlmResult(String text, String reasoning) {
            this.text = text;
            this.reasoning = reasoning;
        }
    }

    /** 单轮对话结果 */
    public static class TurnResult {
        private final String text;
        private final String reasoning;

        public TurnResult(String text, String reasoning) {
            this.text = text;
            this.reasoning = reasoning;
        }

        public String getText() { return text; }
        public String getReasoning() { return reasoning; }
    }
}
