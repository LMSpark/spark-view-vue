package com.spark.ai.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.api.ApiResponseFactory;
import com.spark.ai.config.AiSessionProperties;
import com.spark.ai.config.OpenAiProperties;
import com.spark.ai.entity.AiContextSnapshotEntity;
import com.spark.ai.entity.AiMessageEntity;
import com.spark.ai.entity.AiSessionEntity;
import com.spark.ai.entity.AiToolCallEntity;
import com.spark.ai.repository.AiContextSnapshotRepository;
import com.spark.ai.repository.AiMessageRepository;
import com.spark.ai.repository.AiSessionRepository;
import com.spark.ai.repository.AiToolCallRepository;
import com.spark.ai.security.AccessGuardService;
import com.spark.ai.security.AuthenticatedRequestContext;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * AI 会话服务 — 按 sessionId 管理对话历史 + 滑动窗口 + LLM 调用。
 *
 * <h3>职责（通信层）</h3>
 * <ul>
 *   <li>每个 sessionId 维护独立的对话历史</li>
 *   <li>LLM 调用前自动应用滑动窗口裁剪，控制 token 消耗</li>
 *   <li>会话创建/销毁/超时自动清理</li>
 *   <li>支持 Function Calling（tools 定义 + tool_calls 解析）</li>
 *   <li>支持 turn 启动命令，并通过 APP 公共 SSE 广播模型事件</li>
 * </ul>
 */
@Service
public class AiSessionService {

    private static final Logger log = LoggerFactory.getLogger(AiSessionService.class);

    private static final int DEFAULT_WINDOW_SIZE = 30;
    private static final String LLM_STREAM_ID = "llm-stream";
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
    private final ConcurrentHashMap<String, String> sessionIdsByScopeKey = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, PostedTurnRecord> postedTurnRecords = new ConcurrentHashMap<>();
    private final ExecutorService streamExecutor = Executors.newCachedThreadPool();

    private final OpenAiProperties props;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;
    private final AiSessionRepository aiSessionRepository;
    private final AiMessageRepository aiMessageRepository;
    private final AiToolCallRepository aiToolCallRepository;
    private final AiContextSnapshotRepository aiContextSnapshotRepository;
    private final AiSessionProperties aiSessionProperties;
    private final AccessGuardService accessGuardService;
    private final SseService sseService;

    public AiSessionService(OpenAiProperties props, ObjectMapper objectMapper) {
        this(props, objectMapper, null, null, null, null, null, null, null);
    }

    @Autowired
    public AiSessionService(
            OpenAiProperties props,
            ObjectMapper objectMapper,
            AiSessionRepository aiSessionRepository,
            AiMessageRepository aiMessageRepository,
            AiToolCallRepository aiToolCallRepository,
            AiContextSnapshotRepository aiContextSnapshotRepository,
            AiSessionProperties aiSessionProperties,
            AccessGuardService accessGuardService,
            SseService sseService) {
        this.props = props;
        this.objectMapper = objectMapper;
        this.aiSessionRepository = aiSessionRepository;
        this.aiMessageRepository = aiMessageRepository;
        this.aiToolCallRepository = aiToolCallRepository;
        this.aiContextSnapshotRepository = aiContextSnapshotRepository;
        this.aiSessionProperties = aiSessionProperties != null ? aiSessionProperties : new AiSessionProperties();
        this.accessGuardService = accessGuardService;
        this.sseService = sseService != null ? sseService : new SseService();

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

    @PreDestroy
    public void shutdown() {
        streamExecutor.shutdownNow();
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 公共 API
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * 创建会话（支持 tools + mode）。
     */
    public String createSession(String systemPrompt, String userPrompt, int windowSize,
                                List<Map<String, Object>> tools, String mode) {
        return createSession(systemPrompt, userPrompt, windowSize, tools, mode, null);
    }

    /**
     * 创建会话（支持 tools + mode），可绑定前端 AI Core 的模块实例 scope。
     */
    public String createSession(String systemPrompt, String userPrompt, int windowSize,
                                List<Map<String, Object>> tools, String mode,
                                Map<String, Object> scope) {
        return createSession(systemPrompt, userPrompt, windowSize, tools, mode, scope, true);
    }

    /**
     * 创建会话（支持 tools + mode），可控制是否复用同 scope 的 READY 会话。
     */
    public String createSession(String systemPrompt, String userPrompt, int windowSize,
                                List<Map<String, Object>> tools, String mode,
                                Map<String, Object> scope,
                                boolean reuseScopeSession) {
        return createSession(systemPrompt, userPrompt, windowSize, tools, mode, scope, reuseScopeSession, null);
    }

    public String createSession(String systemPrompt, String userPrompt, int windowSize,
                                List<Map<String, Object>> tools, String mode,
                                Map<String, Object> scope,
                                boolean reuseScopeSession,
                                String requestedSessionId) {
        List<Map<String, Object>> messages = userPrompt == null || userPrompt.isBlank()
                ? List.of()
                : List.of(messageMap("user", userPrompt));
        return createSessionFromMessages(
            systemPrompt,
            messages,
            windowSize,
            tools,
            mode,
            scope,
            reuseScopeSession,
            requestedSessionId);
        }

        /**
         * 创建会话（protocol v3），使用前端传入的 messages 初始化对话历史。
         */
        public String createSession(String systemPrompt, List<Map<String, Object>> messages, int windowSize,
                    List<Map<String, Object>> tools, String mode,
                    Map<String, Object> scope,
                    boolean reuseScopeSession) {
        return createSessionFromMessages(systemPrompt, messages, windowSize, tools, mode, scope, reuseScopeSession, null);
        }

        public String createSession(String systemPrompt, List<Map<String, Object>> messages, int windowSize,
                    List<Map<String, Object>> tools, String mode,
                    Map<String, Object> scope,
                    boolean reuseScopeSession,
                    String requestedSessionId) {
        return createSessionFromMessages(systemPrompt, messages, windowSize, tools, mode, scope, reuseScopeSession, requestedSessionId);
        }

        private String createSessionFromMessages(String systemPrompt,
                             List<Map<String, Object>> messages,
                             int windowSize,
                             List<Map<String, Object>> tools,
                             String mode,
                             Map<String, Object> scope,
                             boolean reuseScopeSession,
                             String requestedSessionId) {
        SessionScope normalizedScope = normalizeScope(scope);
        AuthenticatedRequestContext requestContext = guardAiScope(scope);
        List<Map<String, Object>> safeMessages = messages != null ? messages : List.of();
        String providedSessionId = stringValue(requestedSessionId);
        if (providedSessionId != null) {
            Session existingSession = sessions.get(providedSessionId);
            if (existingSession != null && matchesScope(existingSession, scope)) {
                existingSession.moduleId = normalizedScope.moduleId;
                existingSession.moduleInstanceId = normalizedScope.moduleInstanceId;
                existingSession.instanceId = normalizedScope.instanceId;
                existingSession.runtimeInstanceId = normalizedScope.runtimeInstanceId;
                existingSession.scopeKey = normalizedScope.scopeKey;
                existingSession.scope = normalizedScope.toMap();
                existingSession.systemPrompt = systemPrompt;
                existingSession.windowSize = windowSize > 0 ? windowSize : DEFAULT_WINDOW_SIZE;
                existingSession.tools = tools;
                existingSession.mode = mode != null ? mode : "function";
                existingSession.lastActiveTime = System.currentTimeMillis();
                applyRequestIdentity(existingSession, scope, requestContext);
                if (existingSession.scopeKey != null) {
                    sessionIdsByScopeKey.put(existingSession.scopeKey, providedSessionId);
                }
                persistSession(providedSessionId, existingSession);
                log.info("[SESSION] ensured sessionId={} scope={} windowSize={} mode={} tools={}",
                        providedSessionId, existingSession.scopeKey, existingSession.windowSize, existingSession.mode,
                        tools != null ? tools.size() : 0);
                return providedSessionId;
            }
            if (existingSession != null) {
                sessions.remove(providedSessionId);
                sessionIdsByScopeKey.remove(existingSession.scopeKey, providedSessionId);
                log.warn("[SESSION] replaced scope-mismatched requested sessionId={}", providedSessionId);
            }
        }
        if (reuseScopeSession && normalizedScope.scopeKey != null) {
            String existingSessionId = sessionIdsByScopeKey.get(normalizedScope.scopeKey);
            if (existingSessionId != null) {
                Session existingSession = sessions.get(existingSessionId);
                if (existingSession != null && existingSession.state == SessionState.READY) {
                    log.info("[SESSION] reused sessionId={} scope={}/{}",
                            existingSessionId, normalizedScope.moduleId, normalizedScope.moduleInstanceId);
                    return existingSessionId;
                }

                // 旧会话不在可复用状态（如 CALL/FAILED/HANDOFF）时，替换为新会话以避免恢复死循环。
                sessions.remove(existingSessionId);
                sessionIdsByScopeKey.remove(normalizedScope.scopeKey, existingSessionId);
                if (existingSession != null) {
                    log.warn("[SESSION] replaced stale sessionId={} state={} scope={}/{}",
                            existingSessionId,
                            existingSession.state != null ? existingSession.state.name() : "null",
                            normalizedScope.moduleId,
                            normalizedScope.moduleInstanceId);
                }
            }
        }

        String sessionId = providedSessionId != null ? providedSessionId : UUID.randomUUID().toString();

        Session session = new Session();
        session.moduleId = normalizedScope.moduleId;
        session.moduleInstanceId = normalizedScope.moduleInstanceId;
        session.instanceId = normalizedScope.instanceId;
        session.runtimeInstanceId = normalizedScope.runtimeInstanceId;
        session.scopeKey = normalizedScope.scopeKey;
        session.scope = normalizedScope.toMap();
        session.systemPrompt = systemPrompt;
        session.windowSize = windowSize > 0 ? windowSize : DEFAULT_WINDOW_SIZE;
        session.lastActiveTime = System.currentTimeMillis();
        session.tools = tools;
        session.mode = mode != null ? mode : "function";
        session.state = SessionState.READY;
        session.consecutiveFailures = 0;
        applyRequestIdentity(session, scope, requestContext);

        for (Map<String, Object> message : safeMessages) {
            session.conversation.add(messageFromMap(message));
        }

        sessions.put(sessionId, session);
        if ((reuseScopeSession || providedSessionId != null) && session.scopeKey != null) {
            sessionIdsByScopeKey.put(session.scopeKey, sessionId);
        }

        log.info("[SESSION] created sessionId={} scope={} windowSize={} mode={} tools={}",
                sessionId, session.scopeKey, session.windowSize, session.mode,
                tools != null ? tools.size() : 0);
        persistSession(sessionId, session);
        persistMessages(sessionId, session.conversation);
        persistContextSnapshot(sessionId, null, session.scope);
        return sessionId;
    }

    /**
     * 执行一轮对话（非流式），支持 Function Calling。
     */
    public TurnResult executeTurn(String sessionId) {
        return executeTurn(sessionId, null);
    }

    /**
     * 执行一轮对话（非流式），并校验请求 scope 是否匹配后端 session。
     */
    public TurnResult executeTurn(String sessionId, Map<String, Object> scope) {
        return executeTurn(sessionId, scope, List.of());
    }

    /**
     * 执行一轮对话（非流式），用已提交历史 + 本轮消息构造 LLM 输入。
     */
    public TurnResult executeTurn(String sessionId, Map<String, Object> scope, List<Map<String, Object>> turnMessages) {
        guardAiScope(scope);
        Session session = getOrLoadSession(sessionId);
        if (session == null) return null;
        if (!matchesScope(session, scope)) {
            return TurnResult.error(
                    session.state != null ? session.state.name() : null,
                    null,
                    "SESSION_SCOPE_MISMATCH",
                    buildScopeMismatchPayload(session, scope));
        }

        try {
            int round = ++session.roundCounter;
            if (session.state == SessionState.HANDOFF) {
                return TurnResult.error(
                        session.state.name(),
                        null,
                        "HANDOFF_REQUIRED",
                        buildHandoffPayload("HANDOFF_REQUIRED", "请人工确认后恢复到 PLAN"));
            }

            List<Message> parsedTurnMessages;
            List<Map<String, Object>> messages;
            synchronized (session) {
                session.lastActiveTime = System.currentTimeMillis();
                parsedTurnMessages = messagesFromMaps(turnMessages);
                List<Message> llmConversation = new ArrayList<>(session.conversation);
                llmConversation.addAll(parsedTurnMessages);
                messages = buildWindowedMessages(session, llmConversation);
            }
            transition(session, SessionState.PLAN);
            transition(session, SessionState.CALL);

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

            Map<String, Object> runtimeMeta = null;
            if (llmResult.toolCalls != null && !llmResult.toolCalls.isEmpty()) {
                runtimeMeta = buildRuntimeMeta(sessionId, round, session, llmResult.toolCalls);
                Map<String, Object> guard = getRuntimeGuard(runtimeMeta);
                boolean blocked = guard.get("blocked") instanceof Boolean b && b;
                if (blocked) {
                    persistToolCalls(sessionId, String.valueOf(round), llmResult.toolCalls, runtimeMeta, "blocked");
                    persistContextSnapshot(sessionId, String.valueOf(round), session.scope);
                    persistSession(sessionId, session);
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

            // Only persist assistant tool_calls after runtime guards allow them. Persisting
            // blocked tool_calls without matching tool messages leaves the chat history invalid
            // for the next LLM request.
            Message assistantMsg = new Message("assistant");
            assistantMsg.content = llmResult.text;
            if (llmResult.toolCalls != null && !llmResult.toolCalls.isEmpty()) {
                assistantMsg.toolCalls = llmResult.toolCalls;
            }
            synchronized (session) {
                session.conversation.addAll(parsedTurnMessages);
                session.conversation.add(assistantMsg);
            }
            persistMessages(sessionId, parsedTurnMessages);
            persistMessage(sessionId, assistantMsg);
            persistToolCalls(sessionId, String.valueOf(round), llmResult.toolCalls, runtimeMeta, "planned");
            persistContextSnapshot(sessionId, String.valueOf(round), session.scope);

            transition(session, SessionState.APPLY);
            transition(session, SessionState.VERIFY);
            transition(session, SessionState.DONE);
            session.consecutiveFailures = 0;
            String stateTransition = "VERIFY->DONE";
            transition(session, SessionState.READY);
            persistSession(sessionId, session);

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
     * 启动一轮模型 turn。
     */
    public void executeTurnStream(String sessionId) {
        executeTurnStream(sessionId, null, null, null);
    }

    /**
     * 启动一轮模型 turn，并在 APP SSE 事件上附带 turn/scope 元数据。
     */
    public void executeTurnStream(
            String sessionId,
            Map<String, Object> scope,
            String turnId,
            String streamKey) {
        executeTurnStream(sessionId, scope, turnId, null, null, null, streamKey, List.of(), null, DEFAULT_WINDOW_SIZE, null, null);
    }

    /**
     * 启动一轮模型 turn，用已提交历史 + 本轮消息构造 LLM 输入。
     */
    public void executeTurnStream(
            String sessionId,
            Map<String, Object> scope,
            String turnId,
            String streamKey,
            List<Map<String, Object>> turnMessages) {
        executeTurnStream(sessionId, scope, turnId, null, null, null, streamKey, turnMessages, null, DEFAULT_WINDOW_SIZE, null, null);
    }

    /**
     * 启动一轮模型 turn；前端用 sessionId/turnId 驱动协议，缺失 session 时按 sessionId 初始化。
     */
    public void executeTurnStream(
            String sessionId,
            Map<String, Object> scope,
            String turnId,
            String turnKey,
            Integer seq,
            Integer baseRevision,
            String streamKey,
            List<Map<String, Object>> turnMessages,
            String systemPrompt,
            int windowSize,
            List<Map<String, Object>> tools,
            String mode) {
        AuthenticatedRequestContext requestContext = guardAiScope(scope);
        Session session = getOrLoadSession(sessionId);
        if (session == null) {
            String prompt = stringValue(systemPrompt);
            if (prompt == null) {
                emitTurnError(
                        org.springframework.http.HttpStatus.NOT_FOUND,
                        "SESSION_NOT_FOUND",
                        "会话不存在",
                        "session",
                        "recreate-session",
                        null,
                        ApiResponseFactory.currentRequestId(),
                        streamContext(sessionId, turnId, turnKey, seq, baseRevision, streamKey, scope));
                return;
            }
            createSessionFromMessages(prompt, List.of(), windowSize, tools, mode, scope, false, sessionId);
            session = sessions.get(sessionId);
        }

        if (!matchesScope(session, scope)) {
            emitTurnError(
                    org.springframework.http.HttpStatus.CONFLICT,
                    "SESSION_SCOPE_MISMATCH",
                    "会话 scope 不匹配",
                    "session-scope",
                    "recreate-session",
                    Map.of("sessionId", sessionId,
                            "turnId", turnId != null ? turnId : "",
                            "streamKey", streamKey != null ? streamKey : "",
                            "scope", session.scope != null ? session.scope : Map.of()),
                    ApiResponseFactory.currentRequestId(),
                    streamContext(sessionId, turnId, turnKey, seq, baseRevision, streamKey, session.scope));
            return;
        }

        List<Map<String, Object>> messages;
        StreamMeta streamMeta;
        synchronized (session) {
            applySessionConfig(session, scope, systemPrompt, windowSize, tools, mode);
            applyRequestIdentity(session, scope, requestContext);
            session.lastActiveTime = System.currentTimeMillis();
            List<Message> parsedTurnMessages = messagesFromMaps(turnMessages);
            List<Message> llmConversation = new ArrayList<>(session.conversation);
            llmConversation.addAll(parsedTurnMessages);
            messages = buildWindowedMessages(session, llmConversation);
            streamMeta = new StreamMeta(sessionId, turnId, turnKey, seq, baseRevision, streamKey, session.scope, parsedTurnMessages,
                    ApiResponseFactory.currentRequestId());
        }
        persistSession(sessionId, session);
        persistContextSnapshot(sessionId, turnId, session.scope);
        Session streamSession = session;
        List<Map<String, Object>> streamMessages = messages;

        streamExecutor.submit(() -> {
            try {
                callLlmStream(streamMessages, streamSession.tools, streamSession, streamMeta);
            } catch (Exception e) {
                log.error("[SESSION] stream error sessionId={}: {}", sessionId, e.getMessage());
                emitTurnError(
                        org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR,
                        "AI_STREAM_ERROR",
                        e.getMessage(),
                        "stream",
                        "safe-retry",
                        null,
                        streamMeta.requestId,
                        streamContext(streamMeta));
            }
        });
    }

    /**
     * 新 AI turn 命令：一次 HTTP POST 启动一次后端 turn task，并通过当前
     * app client 的 APP SSE 连接投递中性 LLM frame。
     */
    public PostedTurnStartResult executePostedTurn(
            String appClientId,
            String sessionId,
            String turnId,
            List<Map<String, Object>> turnMessages,
            String systemPrompt,
            Integer windowSize) {
        AuthenticatedRequestContext requestContext = guardAiScope(null);
        Session session = getOrLoadSession(sessionId);
        if (session == null) {
            return PostedTurnStartResult.rejected(PostedTurnStatus.SESSION_NOT_FOUND, "会话不存在");
        }

        String prompt = stringValue(systemPrompt);
        String effectivePrompt = prompt != null ? prompt : stringValue(session.systemPrompt);
        if (effectivePrompt == null) {
            return PostedTurnStartResult.rejected(PostedTurnStatus.MISSING_SYSTEM_PROMPT, "systemPrompt 不能为空");
        }
        int effectiveWindowSize = windowSize != null && windowSize > 0
                ? windowSize
                : (session.windowSize > 0 ? session.windowSize : DEFAULT_WINDOW_SIZE);
        String inputHash = postedTurnInputHash(sessionId, turnId, turnMessages, effectivePrompt, effectiveWindowSize);
        String turnKey = postedTurnKey(sessionId, turnId);
        PostedTurnRecord record = new PostedTurnRecord(inputHash);
        PostedTurnRecord existing = postedTurnRecords.putIfAbsent(turnKey, record);
        if (existing != null) {
            if (existing.inputHash.equals(inputHash)) {
                return PostedTurnStartResult.accepted(false);
            }
            return PostedTurnStartResult.rejected(PostedTurnStatus.TURN_ID_REUSED, "turnId 已被不同输入使用");
        }

        List<Map<String, Object>> messages;
        PostedTurnMeta turnMeta;
        synchronized (session) {
            session.systemPrompt = effectivePrompt;
            session.windowSize = effectiveWindowSize;
            applyRequestIdentity(session, null, requestContext);
            session.lastActiveTime = System.currentTimeMillis();
            List<Message> parsedTurnMessages = messagesFromMaps(turnMessages);
            List<Message> llmConversation = new ArrayList<>(session.conversation);
            llmConversation.addAll(parsedTurnMessages);
            messages = buildWindowedMessages(session, llmConversation);
            turnMeta = new PostedTurnMeta(
                    appClientId,
                    sessionId,
                    turnId,
                    session.scope,
                    parsedTurnMessages,
                    ApiResponseFactory.currentRequestId());
        }

        persistSession(sessionId, session);
        persistContextSnapshot(sessionId, turnId, session.scope);
        Session streamSession = session;
        List<Map<String, Object>> streamMessages = messages;
        PostedTurnMeta streamMeta = turnMeta;
        streamExecutor.submit(() -> {
            try {
                callLlmNeutralStream(streamMessages, streamSession, streamMeta);
                record.markCompleted();
            } catch (Exception error) {
                record.markFailed();
                log.error("[SESSION] posted turn error sessionId={} turnId={}: {}",
                        sessionId, turnId, error.getMessage());
                sendLlmFrame(
                        streamMeta,
                        "error",
                        Map.of(
                                "code", "AI_STREAM_ERROR",
                                "message", error.getMessage() != null ? error.getMessage() : "AI stream failed"),
                        true);
            }
        });
        return PostedTurnStartResult.accepted(true);
    }

    /**
     * 向对话追加消息（支持 FC 消息格式）。
     */
    public boolean appendMessage(String sessionId, String role, String content,
                                  String toolCallId, List<Map<String, Object>> toolCalls) {
        return appendMessage(sessionId, role, content, toolCallId, toolCalls, null) == AppendMessageResult.OK;
    }

    /**
     * 向对话追加消息（支持 FC 消息格式），并校验请求 scope。
     */
    public AppendMessageResult appendMessage(String sessionId, String role, String content,
                                             String toolCallId, List<Map<String, Object>> toolCalls,
                                             Map<String, Object> scope) {
        guardAiScope(scope);
        Session session = getOrLoadSession(sessionId);
        if (session == null) return AppendMessageResult.SESSION_NOT_FOUND;
        if (!matchesScope(session, scope)) return AppendMessageResult.SCOPE_MISMATCH;

        Message msg = new Message(role);
        msg.content = content;
        msg.toolCallId = toolCallId;
        msg.toolCalls = toolCalls;
        synchronized (session) {
            session.lastActiveTime = System.currentTimeMillis();
            session.conversation.add(msg);
        }
        persistMessage(sessionId, msg);
        persistSession(sessionId, session);
        return AppendMessageResult.OK;
    }

    /**
     * 获取完整对话记录（包含 FC 字段）。
     */
    public List<Map<String, Object>> getConversationFull(String sessionId) {
        Session session = getOrLoadSession(sessionId);
        if (session == null) {
            return loadConversationFromPersistence(sessionId);
        }

        List<Map<String, Object>> result = new ArrayList<>();
        synchronized (session) {
            for (Message msg : session.conversation) {
                result.add(msg.toMap());
            }
        }
        return result;
    }

    public void destroySession(String sessionId) {
        Session removed = sessions.remove(sessionId);
        if (removed != null && removed.scopeKey != null) {
            sessionIdsByScopeKey.remove(removed.scopeKey, sessionId);
        }
        markSessionDestroyed(sessionId);
        log.info("[SESSION] destroyed sessionId={}", sessionId);
    }

    public int destroySessions(List<String> sessionIds) {
        int count = 0;
        for (String id : sessionIds) {
            if (sessions.remove(id) != null) count++;
            markSessionDestroyed(id);
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
                Session expired = entry.getValue();
                it.remove();
                if (expired.scopeKey != null) {
                    sessionIdsByScopeKey.remove(expired.scopeKey, entry.getKey());
                }
                cleaned++;
                log.info("[SESSION] expired sessionId={}", entry.getKey());
            }
        }
        return cleaned;
    }

    private boolean persistenceEnabled() {
        return aiSessionRepository != null
                && aiMessageRepository != null
                && aiToolCallRepository != null
                && aiContextSnapshotRepository != null;
    }

    private Session getOrLoadSession(String sessionId) {
        Session hot = sessions.get(sessionId);
        if (hot != null || !persistenceEnabled()) {
            return hot;
        }
        Optional<AiSessionEntity> entity = aiSessionRepository.findById(sessionId);
        if (entity.isEmpty()) {
            return null;
        }
        Session session = new Session();
        AiSessionEntity row = entity.get();
        session.tenantId = row.getTenantId();
        session.projectId = row.getProjectId();
        session.username = row.getUsername();
        session.systemPrompt = row.getSystemPrompt();
        session.windowSize = row.getWindowSize() > 0 ? row.getWindowSize() : DEFAULT_WINDOW_SIZE;
        session.mode = row.getMode() != null ? row.getMode() : "function";
        session.state = parseState(row.getState());
        session.lastActiveTime = row.getLastActiveAt() != null ? row.getLastActiveAt().toEpochMilli() : System.currentTimeMillis();
        session.scope = readMap(row.getScopeJson());
        session.tools = readList(row.getToolsJson());
        SessionScope normalizedScope = normalizeScope(session.scope);
        session.moduleId = normalizedScope.moduleId;
        session.moduleInstanceId = normalizedScope.moduleInstanceId;
        session.instanceId = normalizedScope.instanceId;
        session.runtimeInstanceId = normalizedScope.runtimeInstanceId;
        session.scopeKey = normalizedScope.scopeKey;
        for (Map<String, Object> message : loadConversationFromPersistence(sessionId)) {
            session.conversation.add(messageFromMap(message));
        }
        sessions.put(sessionId, session);
        if (session.scopeKey != null) {
            sessionIdsByScopeKey.put(session.scopeKey, sessionId);
        }
        return session;
    }

    private List<Map<String, Object>> loadConversationFromPersistence(String sessionId) {
        if (!persistenceEnabled()) {
            return List.of();
        }
        List<Map<String, Object>> result = new ArrayList<>();
        for (AiMessageEntity entity : aiMessageRepository.findBySessionIdOrderBySeqNoAsc(sessionId)) {
            Map<String, Object> message = new LinkedHashMap<>();
            message.put("role", entity.getRole());
            message.put("content", entity.getContent() != null ? entity.getContent() : "");
            if (entity.getToolCallId() != null) {
                message.put("tool_call_id", entity.getToolCallId());
            }
            List<Map<String, Object>> toolCalls = readList(entity.getToolCallsJson());
            if (toolCalls != null && !toolCalls.isEmpty()) {
                message.put("tool_calls", toolCalls);
            }
            result.add(message);
        }
        return result;
    }

    private void persistSession(String sessionId, Session session) {
        if (!persistenceEnabled() || session == null) {
            return;
        }
        try {
            AiSessionEntity entity = aiSessionRepository.findById(sessionId).orElseGet(AiSessionEntity::new);
            normalizePersistenceIdentity(session);
            entity.setSessionId(sessionId);
            entity.setTenantId(session.tenantId);
            entity.setProjectId(session.projectId);
            entity.setUsername(session.username);
            entity.setSystemPrompt(session.systemPrompt);
            entity.setMode(session.mode);
            entity.setState(session.state != null ? session.state.name() : "READY");
            entity.setScopeJson(writeJson(session.scope));
            entity.setToolsJson(writeJson(session.tools));
            entity.setWindowSize(session.windowSize);
            Instant lastActiveAt = Instant.ofEpochMilli(session.lastActiveTime > 0 ? session.lastActiveTime : System.currentTimeMillis());
            entity.setLastActiveAt(lastActiveAt);
            int retentionDays = Math.max(1, aiSessionProperties.getRetentionDays());
            entity.setExpiresAt(lastActiveAt.plus(retentionDays, ChronoUnit.DAYS));
            aiSessionRepository.save(entity);
        } catch (Exception error) {
            log.warn("[SESSION] persist session failed sessionId={}: {}", sessionId, error.getMessage());
        }
    }

    private void persistMessages(String sessionId, List<Message> messages) {
        if (!persistenceEnabled() || messages == null || messages.isEmpty()) {
            return;
        }
        try {
            Session session = sessions.get(sessionId);
            int nextSeq = aiMessageRepository.findTopBySessionIdOrderBySeqNoDesc(sessionId)
                    .map(AiMessageEntity::getSeqNo)
                    .orElse(0) + 1;
            List<AiMessageEntity> rows = new ArrayList<>();
            for (Message message : messages) {
                AiMessageEntity entity = new AiMessageEntity();
                entity.setSessionId(sessionId);
                applyPersistenceIdentity(entity, session);
                entity.setSeqNo(nextSeq++);
                entity.setRole(message.role);
                entity.setContent(message.content);
                entity.setToolCallId(message.toolCallId);
                entity.setToolCallsJson(writeJson(message.toolCalls));
                rows.add(entity);
            }
            aiMessageRepository.saveAll(rows);
        } catch (Exception error) {
            log.warn("[SESSION] persist messages failed sessionId={}: {}", sessionId, error.getMessage());
        }
    }

    private void persistMessage(String sessionId, Message message) {
        if (message != null) {
            persistMessages(sessionId, List.of(message));
        }
    }

    private void persistToolCalls(String sessionId,
                                  String turnId,
                                  List<Map<String, Object>> toolCalls,
                                  Map<String, Object> runtimeMeta,
                                  String status) {
        if (!persistenceEnabled() || toolCalls == null || toolCalls.isEmpty()) {
            return;
        }
        try {
            Session session = sessions.get(sessionId);
            String runtimeMetaJson = writeJson(runtimeMeta);
            List<AiToolCallEntity> rows = new ArrayList<>();
            for (Map<String, Object> call : toolCalls) {
                @SuppressWarnings("unchecked")
                Map<String, Object> function = call.get("function") instanceof Map<?, ?> raw
                        ? (Map<String, Object>) raw
                        : Map.of();
                AiToolCallEntity entity = new AiToolCallEntity();
                entity.setSessionId(sessionId);
                applyPersistenceIdentity(entity, session);
                entity.setTurnId(turnId);
                entity.setCallId(stringValue(call.get("id")));
                entity.setName(stringValue(function.get("name")));
                entity.setArgumentsJson(stringValue(function.get("arguments")));
                entity.setStatus(status);
                entity.setRuntimeMetaJson(runtimeMetaJson);
                rows.add(entity);
            }
            aiToolCallRepository.saveAll(rows);
        } catch (Exception error) {
            log.warn("[SESSION] persist tool calls failed sessionId={}: {}", sessionId, error.getMessage());
        }
    }

    private void persistContextSnapshot(String sessionId, String turnId, Map<String, Object> scope) {
        if (!persistenceEnabled()) {
            return;
        }
        try {
            Session session = sessions.get(sessionId);
            AiContextSnapshotEntity entity = new AiContextSnapshotEntity();
            entity.setSessionId(sessionId);
            applyPersistenceIdentity(entity, session);
            entity.setTurnId(turnId);
            entity.setScopeJson(writeJson(scope));
            aiContextSnapshotRepository.save(entity);
        } catch (Exception error) {
            log.warn("[SESSION] persist context snapshot failed sessionId={}: {}", sessionId, error.getMessage());
        }
    }

    private void applyPersistenceIdentity(AiMessageEntity entity, Session session) {
        if (session == null) return;
        normalizePersistenceIdentity(session);
        entity.setTenantId(session.tenantId);
        entity.setProjectId(session.projectId);
    }

    private void applyPersistenceIdentity(AiToolCallEntity entity, Session session) {
        if (session == null) return;
        normalizePersistenceIdentity(session);
        entity.setTenantId(session.tenantId);
        entity.setProjectId(session.projectId);
    }

    private void applyPersistenceIdentity(AiContextSnapshotEntity entity, Session session) {
        if (session == null) return;
        normalizePersistenceIdentity(session);
        entity.setTenantId(session.tenantId);
        entity.setProjectId(session.projectId);
    }

    private void normalizePersistenceIdentity(Session session) {
        if (session == null) return;
        if (session.projectId == null || session.projectId.isBlank()) {
            session.projectId = ProjectService.HOMEPAGE_PROJECT_ID;
        }
    }

    private void markSessionDestroyed(String sessionId) {
        if (!persistenceEnabled()) {
            return;
        }
        aiSessionRepository.findById(sessionId).ifPresent(entity -> {
            entity.setState("DESTROYED");
            aiSessionRepository.save(entity);
        });
    }

    private AuthenticatedRequestContext guardAiScope(Map<String, Object> scope) {
        AuthenticatedRequestContext ctx = AuthenticatedRequestContext.currentOrNull();
        if (accessGuardService == null) {
            return ctx;
        }
        String scopedTenantId = stringValue(scope != null ? scope.get("tenantId") : null);
        String scopedProjectId = stringValue(scope != null ? scope.get("projectId") : null);
        String tenantId = scopedTenantId != null ? scopedTenantId : (ctx != null ? ctx.tenantId() : null);
        if (tenantId == null) {
            return ctx;
        }
        if (scopedProjectId != null) {
            accessGuardService.requireProjectAccess(tenantId, scopedProjectId);
        } else if (ctx != null && ctx.projectId() != null) {
            accessGuardService.requireProjectAccess(tenantId, ctx.projectId());
        } else {
            accessGuardService.requireTenantUser(tenantId);
        }
        return ctx;
    }

    private void applyRequestIdentity(Session session, Map<String, Object> scope, AuthenticatedRequestContext ctx) {
        String scopedTenantId = stringValue(scope != null ? scope.get("tenantId") : null);
        String scopedProjectId = stringValue(scope != null ? scope.get("projectId") : null);
        if (scopedTenantId != null) {
            session.tenantId = scopedTenantId;
        } else if (ctx != null) {
            session.tenantId = ctx.tenantId();
        }
        if (scopedProjectId != null) {
            session.projectId = scopedProjectId;
        } else if (ctx != null && ctx.projectId() != null) {
            session.projectId = ctx.projectId();
        }
        normalizePersistenceIdentity(session);
        if (ctx != null) {
            session.username = ctx.username();
        }
    }

    private String writeJson(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception error) {
            return null;
        }
    }

    private Map<String, Object> readMap(String json) {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception error) {
            return Map.of();
        }
    }

    private List<Map<String, Object>> readList(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<List<Map<String, Object>>>() {});
        } catch (Exception error) {
            return List.of();
        }
    }

    private SessionState parseState(String state) {
        if (state == null || state.isBlank()) {
            return SessionState.READY;
        }
        try {
            return SessionState.valueOf(state);
        } catch (IllegalArgumentException error) {
            return SessionState.READY;
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 内部方法 — 消息构建
    // ═════════════════════════════════════════════════════════════════════════

    private static Map<String, Object> messageMap(String role, String content) {
        Map<String, Object> message = new LinkedHashMap<>();
        message.put("role", role);
        message.put("content", content != null ? content : "");
        return message;
    }

    @SuppressWarnings("unchecked")
    private static Message messageFromMap(Map<String, Object> rawMessage) {
        String role = rawMessage.get("role") instanceof String s && !s.isBlank() ? s : "user";
        Message message = new Message(role);
        message.content = rawMessage.get("content") instanceof String s ? s : "";
        message.toolCallId = rawMessage.get("tool_call_id") instanceof String s ? s : null;
        message.toolCalls = rawMessage.get("tool_calls") instanceof List<?> list
                ? (List<Map<String, Object>>) list
                : null;
        return message;
    }

    private static List<Message> messagesFromMaps(List<Map<String, Object>> rawMessages) {
        if (rawMessages == null || rawMessages.isEmpty()) return List.of();
        List<Message> messages = new ArrayList<>();
        for (Map<String, Object> rawMessage : rawMessages) {
            if (rawMessage == null || rawMessage.isEmpty()) continue;
            messages.add(messageFromMap(rawMessage));
        }
        return messages;
    }

    private static void applySessionConfig(
            Session session,
            Map<String, Object> scope,
            String systemPrompt,
            int windowSize,
            List<Map<String, Object>> tools,
            String mode) {
        SessionScope normalizedScope = normalizeScope(scope);
        session.moduleId = normalizedScope.moduleId;
        session.moduleInstanceId = normalizedScope.moduleInstanceId;
        session.instanceId = normalizedScope.instanceId;
        session.runtimeInstanceId = normalizedScope.runtimeInstanceId;
        session.scopeKey = normalizedScope.scopeKey;
        session.scope = normalizedScope.toMap();
        String prompt = stringValue(systemPrompt);
        if (prompt != null) {
            session.systemPrompt = prompt;
        }
        if (windowSize > 0) {
            session.windowSize = windowSize;
        }
        if (tools != null) {
            session.tools = tools;
        }
        String normalizedMode = stringValue(mode);
        if (normalizedMode != null) {
            session.mode = normalizedMode;
        }
    }

    private List<Map<String, Object>> buildWindowedMessages(Session session) {
        return buildWindowedMessages(session, session.conversation);
    }

    private List<Map<String, Object>> buildWindowedMessages(Session session, List<Message> conversation) {
        List<Map<String, Object>> result = new ArrayList<>();

        // system prompt 始终在最前
        result.add(Map.of("role", "system", "content", session.systemPrompt));

        List<Message> conv = conversation;
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
            body.put("max_tokens", effectiveMaxTokens(tools));

            Double temp = effectiveTemperature(tools);
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

            return filterInvalidToolCalls(parseLlmResponse(responseJson), tools);

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
    // 内部方法 — LLM 调用（provider stream 内部消费，APP SSE 广播结果）
    // ═════════════════════════════════════════════════════════════════════════

    @SuppressWarnings("unchecked")
    private void callLlmStream(List<Map<String, Object>> messages,
                                List<Map<String, Object>> tools,
                                Session session,
                                StreamMeta streamMeta) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", props.getModel());
        body.put("messages", messages);
        body.put("max_tokens", effectiveMaxTokens(tools));
        body.put("stream", true);

        Double temp = effectiveTemperature(tools);
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

        // OpenAI-compatible providers vary a lot in streaming tool_calls deltas.
        // For function-calling turns, request one complete assistant message from
        // the provider, then deliver it through the APP SSE channel as a
        // stable result event. Text-only turns still use provider streaming below.
        if (tools != null && !tools.isEmpty()) {
            LlmResult result = callLlm(messages, tools);
            if (result == null) {
                throw new RuntimeException("LLM tool-call request failed");
            }
            emitFinalResult(session, result.text, result.reasoning, result.toolCalls, streamMeta);
            return;
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
                                sendTurnOk("delta", Map.of("delta", s), streamMeta, false);
                            }

                            // reasoning 增量
                            if (delta.get("reasoning_content") instanceof String s && !s.isEmpty()) {
                                reasoningBuilder.append(s);
                                sendTurnOk("reasoning", Map.of("reasoning", s), streamMeta, false);
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
            emitFinalResult(session, fallback.text, fallback.reasoning, fallback.toolCalls, streamMeta);
            return;
        }

        // 拼装最终结果
        String text = contentBuilder.toString();
        String reasoning = !reasoningBuilder.isEmpty() ? reasoningBuilder.toString() : null;
        List<Map<String, Object>> toolCalls = toolCallsMap.isEmpty()
            ? null : new ArrayList<>(toolCallsMap.values());

        emitFinalResult(session, text, reasoning, toolCalls, streamMeta);
    }

    @SuppressWarnings("unchecked")
    private void callLlmNeutralStream(
            List<Map<String, Object>> messages,
            Session session,
            PostedTurnMeta turnMeta) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", props.getModel());
        body.put("messages", messages);
        body.put("max_tokens", effectiveMaxTokens(null));
        body.put("stream", true);

        Double temp = effectiveTemperature(null);
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

        String bodyJson = objectMapper.writeValueAsString(body);
        StringBuilder contentBuilder = new StringBuilder();
        StringBuilder reasoningBuilder = new StringBuilder();
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
                            log.warn("[SESSION] neutral stream provider failed, fallback to non-stream. detail={}", detail);
                            fallbackHolder[0] = callLlm(messages, null);
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

                                if (delta.get("content") instanceof String s && !s.isEmpty()) {
                                    contentBuilder.append(s);
                                    sendLlmFrame(
                                            turnMeta,
                                            "message.delta",
                                            Map.of("part", "content", "delta", s),
                                            false);
                                }

                                if (delta.get("reasoning_content") instanceof String s && !s.isEmpty()) {
                                    reasoningBuilder.append(s);
                                    sendLlmFrame(
                                            turnMeta,
                                            "message.delta",
                                            Map.of("part", "reasoning", "delta", s),
                                            false);
                                }
                            }
                        }
                        return null;
                    }, false);
        } catch (Exception streamEx) {
            String message = streamEx.getMessage() != null ? streamEx.getMessage() : "";
            boolean isProvider4xx = message.contains("HTTP response code: 400")
                    || message.contains("HTTP response code: 401")
                    || message.contains("HTTP response code: 403")
                    || message.contains("HTTP response code: 404")
                    || message.contains("/v1/chat/completions");

            if (isProvider4xx) {
                String detail = message.isBlank() ? streamEx.toString() : message;
                providerErrorDetail[0] = detail;
                log.warn("[SESSION] neutral stream provider exception, fallback to non-stream. detail={}", detail);
                fallbackHolder[0] = callLlm(messages, null);
            } else {
                throw streamEx;
            }
        }

        if (providerErrorDetail[0] != null) {
            LlmResult fallback = fallbackHolder[0];
            if (fallback == null) {
                throw new RuntimeException("SSE provider error 且 fallback 失败: " + providerErrorDetail[0]);
            }
            emitNeutralFinalResult(session, fallback.text, fallback.reasoning, fallback.toolCalls, turnMeta);
            return;
        }

        String text = contentBuilder.toString();
        String reasoning = !reasoningBuilder.isEmpty() ? reasoningBuilder.toString() : null;
        emitNeutralFinalResult(session, text, reasoning, null, turnMeta);
    }

    private void emitNeutralFinalResult(
            Session session,
            String text,
            String reasoning,
            List<Map<String, Object>> toolCalls,
            PostedTurnMeta turnMeta) {
        synchronized (session) {
            session.conversation.addAll(turnMeta.turnMessages);
            persistMessages(turnMeta.sessionId, turnMeta.turnMessages);
            Message assistantMsg = new Message("assistant");
            assistantMsg.content = text != null ? text : "";
            session.conversation.add(assistantMsg);
            persistMessage(turnMeta.sessionId, assistantMsg);
        }
        persistSession(turnMeta.sessionId, session);

        Map<String, Object> resultMap = new LinkedHashMap<>();
        resultMap.put("text", text != null ? text : "");
        if (reasoning != null) resultMap.put("reasoning", reasoning);
        if (toolCalls != null && !toolCalls.isEmpty()) resultMap.put("toolCalls", toolCalls);
        sendLlmFrame(turnMeta, "message.completed", resultMap, false);
        sendLlmFrame(turnMeta, "done", Map.of("done", true), true);
    }

    private void sendLlmFrame(
            PostedTurnMeta turnMeta,
            String frameType,
            Object frameData,
            boolean terminal) {
        Map<String, Object> frame = new LinkedHashMap<>();
        frame.put("type", frameType);
        frame.put("data", frameData);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("sessionId", turnMeta.sessionId);
        payload.put("turnId", turnMeta.turnId);
        payload.put("frame", frame);
        sseService.emitToAppClient(
                turnMeta.appClientId,
                SseService.EVENT_LLM_FRAME,
                payload,
                turnMeta.requestId,
                llmFrameContext(turnMeta),
                terminal);
    }

    private Map<String, Object> llmFrameContext(PostedTurnMeta turnMeta) {
        Map<String, Object> context = new LinkedHashMap<>();
        context.put("session", Map.of("sessionId", turnMeta.sessionId));
        context.put("turn", Map.of("turnId", turnMeta.turnId));
        if (turnMeta.scope != null && !turnMeta.scope.isEmpty()) {
            context.put("scope", ApiResponseFactory.wireScope(turnMeta.scope));
        }
        return context;
    }

    private LlmResult filterInvalidToolCalls(LlmResult result, List<Map<String, Object>> tools) {
        if (result == null || result.toolCalls == null || result.toolCalls.isEmpty() || tools == null || tools.isEmpty()) {
            return result;
        }
        Map<String, Set<String>> requiredByToolName = requiredToolArguments(tools);
        if (requiredByToolName.isEmpty()) {
            return result;
        }
        List<Map<String, Object>> validCalls = new ArrayList<>();
        for (Map<String, Object> call : result.toolCalls) {
            if (isValidToolCall(call, requiredByToolName)) {
                validCalls.add(call);
                continue;
            }
            Map<String, Object> function = asMap(call.get("function"));
            log.warn("[SESSION] dropped invalid tool_call name={} id={} arguments={}",
                    stringValue(function.get("name")),
                    stringValue(call.get("id")),
                    stringValue(function.get("arguments")));
        }
        return new LlmResult(
                result.text,
                result.reasoning,
                validCalls.isEmpty() ? null : validCalls);
    }

    private Map<String, Set<String>> requiredToolArguments(List<Map<String, Object>> tools) {
        Map<String, Set<String>> requiredByToolName = new HashMap<>();
        for (Map<String, Object> tool : tools) {
            Map<String, Object> function = asMap(tool.get("function"));
            String name = stringValue(function.get("name"));
            if (name == null) {
                continue;
            }
            Map<String, Object> parameters = asMap(function.get("parameters"));
            Set<String> required = stringSet(parameters.get("required"));
            requiredByToolName.put(name, required);
        }
        return requiredByToolName;
    }

    private boolean isValidToolCall(Map<String, Object> call, Map<String, Set<String>> requiredByToolName) {
        Map<String, Object> function = asMap(call.get("function"));
        String name = stringValue(function.get("name"));
        if (name == null) {
            return false;
        }
        Set<String> required = requiredByToolName.get(name);
        if (required == null || required.isEmpty()) {
            return true;
        }
        Map<String, Object> args = readMap(stringValue(function.get("arguments")));
        return args.keySet().containsAll(required);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> asMap(Object value) {
        return value instanceof Map<?, ?> map ? (Map<String, Object>) map : Map.of();
    }

    private Set<String> stringSet(Object value) {
        if (!(value instanceof List<?> items) || items.isEmpty()) {
            return Set.of();
        }
        Set<String> out = new HashSet<>();
        for (Object item : items) {
            if (item instanceof String text && !text.isBlank()) {
                out.add(text);
            }
        }
        return out;
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

    private int effectiveMaxTokens(List<Map<String, Object>> tools) {
        int configured = props.getEffectiveMaxTokens();
        return hasTools(tools) ? Math.min(configured, 2200) : configured;
    }

    private Double effectiveTemperature(List<Map<String, Object>> tools) {
        Double configured = props.getEffectiveTemperature();
        if (configured == null || !hasTools(tools)) {
            return configured;
        }
        return Math.min(configured, 0.1);
    }

    private boolean hasTools(List<Map<String, Object>> tools) {
        return tools != null && !tools.isEmpty();
    }

    private void emitFinalResult(
            Session session,
            String text,
            String reasoning,
            List<Map<String, Object>> toolCalls,
            StreamMeta streamMeta) {
        // 记录到对话历史。
        // 当有 tool_calls 时，前端 FC 循环会通过 appendMessages 追加 assistant + tool results，
        // 因此后端不再自动写入，避免出现两条相邻的 assistant(tool_calls) 导致 DeepSeek 400。
        synchronized (session) {
            session.conversation.addAll(streamMeta.turnMessages);
            persistMessages(streamMeta.sessionId, streamMeta.turnMessages);
            if (toolCalls == null || toolCalls.isEmpty()) {
                Message assistantMsg = new Message("assistant");
                assistantMsg.content = text;
                session.conversation.add(assistantMsg);
                persistMessage(streamMeta.sessionId, assistantMsg);
            }
        }
        persistToolCalls(streamMeta.sessionId, streamMeta.turnId, toolCalls, null, "planned");
        persistSession(streamMeta.sessionId, session);

        // 发送最终结果。v4 wire 元数据放入 context，业务 data 只保留模型输出本身。
        Map<String, Object> resultMap = new LinkedHashMap<>();
        resultMap.put("text", text);
        if (reasoning != null) resultMap.put("reasoning", reasoning);
        if (toolCalls != null) resultMap.put("toolCalls", toolCalls);

        sendTurnOk("result", resultMap, streamMeta, false);
        Map<String, Object> doneMap = new LinkedHashMap<>();
        doneMap.put("done", true);
        sendTurnOk("done", doneMap, streamMeta, true);
    }

    private void sendTurnOk(
            String eventName,
            Object data,
            StreamMeta streamMeta,
            boolean terminal) {
        sseService.emit(toAiTurnEventName(eventName), data, streamContext(streamMeta), terminal);
    }

    private void emitTurnError(
            org.springframework.http.HttpStatus status,
            String code,
            String message,
            String category,
            String retryPolicy,
            Map<String, Object> details,
            String requestId,
            Map<String, Object> context) {
        sseService.emitError(
                SseService.EVENT_AI_TURN_ERROR,
                status,
                code,
                message,
                category,
                retryPolicy,
                details,
                requestId,
                context);
    }

    private String toAiTurnEventName(String eventName) {
        return switch (eventName) {
            case "delta" -> SseService.EVENT_AI_TURN_DELTA;
            case "reasoning" -> SseService.EVENT_AI_TURN_REASONING;
            case "usage" -> SseService.EVENT_AI_TURN_USAGE;
            case "result" -> SseService.EVENT_AI_TURN_RESULT;
            case "done" -> SseService.EVENT_AI_TURN_DONE;
            default -> "ai-turn-" + eventName;
        };
    }

    private Map<String, Object> streamContext(StreamMeta streamMeta) {
        return streamContext(
                streamMeta.sessionId,
                streamMeta.turnId,
                streamMeta.turnKey,
                streamMeta.seq,
                streamMeta.baseRevision,
                streamMeta.streamKey,
                streamMeta.scope);
    }

    private Map<String, Object> streamContext(
            String sessionId,
            String turnId,
            String turnKey,
            Integer seq,
            Integer baseRevision,
            String streamKey,
            Map<String, Object> scope) {
        return ApiResponseFactory.aiStreamContext(
                sessionId,
                turnId,
                turnKey,
                seq,
                baseRevision,
                LLM_STREAM_ID,
                streamKey,
                scope);
    }

    private String postedTurnInputHash(
            String sessionId,
            String turnId,
            List<Map<String, Object>> messages,
            String systemPrompt,
            int windowSize) {
        Map<String, Object> input = new LinkedHashMap<>();
        input.put("sessionId", sessionId);
        input.put("turnId", turnId);
        input.put("messages", messages != null ? messages : List.of());
        input.put("systemPrompt", systemPrompt);
        input.put("windowSize", windowSize);
        try {
            return shortSha256(objectMapper.writeValueAsString(input));
        } catch (Exception error) {
            return shortSha256(String.valueOf(input));
        }
    }

    private static String postedTurnKey(String sessionId, String turnId) {
        return sessionId + "\u0000" + turnId;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 内部类型
    // ═════════════════════════════════════════════════════════════════════════

    public enum PostedTurnStatus {
        ACCEPTED,
        SESSION_NOT_FOUND,
        MISSING_SYSTEM_PROMPT,
        TURN_ID_REUSED
    }

    public static final class PostedTurnStartResult {
        private final PostedTurnStatus status;
        private final boolean started;
        private final String message;

        private PostedTurnStartResult(PostedTurnStatus status, boolean started, String message) {
            this.status = status;
            this.started = started;
            this.message = message;
        }

        public static PostedTurnStartResult accepted(boolean started) {
            return new PostedTurnStartResult(PostedTurnStatus.ACCEPTED, started, null);
        }

        public static PostedTurnStartResult rejected(PostedTurnStatus status, String message) {
            return new PostedTurnStartResult(status, false, message);
        }

        public PostedTurnStatus getStatus() {
            return status;
        }

        public boolean isStarted() {
            return started;
        }

        public String getMessage() {
            return message;
        }
    }

    private static class Session {
        String systemPrompt;
        String tenantId;
        String projectId;
        String username;
        String moduleId;
        String moduleInstanceId;
        String instanceId;
        String runtimeInstanceId;
        String scopeKey;
        Map<String, Object> scope;
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

    private record StreamMeta(
            String sessionId,
            String turnId,
            String turnKey,
            Integer seq,
            Integer baseRevision,
            String streamKey,
            Map<String, Object> scope,
            List<Message> turnMessages,
            String requestId) {}

    private record PostedTurnMeta(
            String appClientId,
            String sessionId,
            String turnId,
            Map<String, Object> scope,
            List<Message> turnMessages,
            String requestId) {}

    private static final class PostedTurnRecord {
        private final String inputHash;
        private volatile String status = "started";

        private PostedTurnRecord(String inputHash) {
            this.inputHash = inputHash;
        }

        private void markCompleted() {
            status = "completed";
        }

        private void markFailed() {
            status = "failed";
        }
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
            case FAILED -> to == SessionState.PLAN || to == SessionState.HANDOFF;
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
        return createSession("test-system", "test-user", DEFAULT_WINDOW_SIZE, null, "function");
    }

    // 包级测试辅助：直接设置会话状态，便于覆盖 scope 复用与恢复场景。
    void setSessionStateForTesting(String sessionId, String state) {
        Session session = sessions.get(sessionId);
        if (session == null) {
            throw new IllegalArgumentException("session not found: " + sessionId);
        }
        session.state = SessionState.valueOf(state);
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
        if (session.scope != null && !session.scope.isEmpty()) {
            meta.put("scope", session.scope);
        }
        meta.put("idempotency", idempotency);
        meta.put("scheduling", scheduling);
        meta.put("guard", guard);
        return meta;
    }

    public enum AppendMessageResult {
        OK,
        SESSION_NOT_FOUND,
        SCOPE_MISMATCH
    }

    private static SessionScope normalizeScope(Map<String, Object> raw) {
        if (raw == null || raw.isEmpty()) return SessionScope.empty();
        String moduleId = stringValue(raw.get("moduleId"));
        String moduleInstanceId = stringValue(raw.get("moduleInstanceId"));
        String instanceId = stringValue(raw.get("instanceId"));
        String runtimeInstanceId = stringValue(raw.get("runtimeInstanceId"));
        if (moduleId == null || moduleInstanceId == null) return SessionScope.empty();
        if (instanceId == null) instanceId = moduleInstanceId;
        if (runtimeInstanceId == null) runtimeInstanceId = instanceId;
        return new SessionScope(moduleId, moduleInstanceId, instanceId, runtimeInstanceId);
    }

    private static String stringValue(Object value) {
        if (!(value instanceof String text)) return null;
        String trimmed = text.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static boolean matchesScope(Session session, Map<String, Object> rawScope) {
        if (session.scopeKey == null) return true;
        SessionScope requested = normalizeScope(rawScope);
        return session.scopeKey.equals(requested.scopeKey);
    }

    private static Map<String, Object> buildScopeMismatchPayload(Session session, Map<String, Object> rawScope) {
        SessionScope requested = normalizeScope(rawScope);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("reasonCode", "SESSION_SCOPE_MISMATCH");
        payload.put("nextAction", "重新创建或切换到匹配当前 moduleId/moduleInstanceId 的 AI 后端会话");
        payload.put("expected", session.scope != null ? session.scope : Map.of());
        payload.put("actual", requested.toMap());
        return payload;
    }

    private static final class SessionScope {
        final String moduleId;
        final String moduleInstanceId;
        final String instanceId;
        final String runtimeInstanceId;
        final String scopeKey;

        private SessionScope(String moduleId, String moduleInstanceId, String instanceId, String runtimeInstanceId) {
            this.moduleId = moduleId;
            this.moduleInstanceId = moduleInstanceId;
            this.instanceId = instanceId;
            this.runtimeInstanceId = runtimeInstanceId;
            this.scopeKey = moduleId == null || moduleInstanceId == null
                    ? null
                    : moduleId + "\u0000" + moduleInstanceId;
        }

        static SessionScope empty() {
            return new SessionScope(null, null, null, null);
        }

        Map<String, Object> toMap() {
            if (scopeKey == null) return Map.of();
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("moduleId", moduleId);
            out.put("moduleInstanceId", moduleInstanceId);
            out.put("instanceId", instanceId);
            out.put("runtimeInstanceId", runtimeInstanceId);
            return out;
        }
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
        String projectedDomain = projectedActionDomain(action);
        if (projectedDomain != null) {
            return projectedDomain;
        }
        int idx = action.indexOf('.');
        if (idx <= 0) {
            return "global";
        }
        return action.substring(0, idx);
    }

    private String projectedActionDomain(String action) {
        String[] encodedSegments = action.split("__");
        if (encodedSegments.length >= 2) {
            String domain = encodedSegments[encodedSegments.length - 2];
            if (!domain.isBlank()) {
                return domain;
            }
        }

        String[] addressSegments = action.split("@");
        if (addressSegments.length >= 2) {
            String domain = addressSegments[addressSegments.length - 2];
            if (!domain.isBlank()) {
                return domain;
            }
        }

        return null;
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
        String leaf = actionLeaf(action).toLowerCase(Locale.ROOT);
        if (isReadLikeAction(lower) || isReadLikeAction(leaf)) {
            return "read";
        }
        return "write";
    }

    private boolean isReadLikeAction(String value) {
        return value.startsWith("get")
                || value.startsWith("list")
                || value.startsWith("query")
                || value.startsWith("describe")
                || value.startsWith("read")
                || value.startsWith("count")
                || value.startsWith("find")
                || value.startsWith("has")
                || value.startsWith("collect")
                || value.startsWith("can")
                || value.startsWith("history")
                || value.startsWith("export")
                || value.contains(".get")
                || value.contains(".list")
                || value.contains(".query")
                || value.contains(".describe")
                || value.contains(".read")
                || value.contains(".count")
                || value.contains(".find");
    }

    private String actionLeaf(String action) {
        int encodedIdx = action.lastIndexOf("__");
        if (encodedIdx >= 0 && encodedIdx + 2 < action.length()) {
            return action.substring(encodedIdx + 2);
        }

        int atIdx = action.lastIndexOf('@');
        if (atIdx >= 0 && atIdx + 1 < action.length()) {
            return action.substring(atIdx + 1);
        }

        int dotIdx = action.lastIndexOf('.');
        if (dotIdx >= 0 && dotIdx + 1 < action.length()) {
            return action.substring(dotIdx + 1);
        }

        int slashIdx = action.lastIndexOf('/');
        if (slashIdx >= 0 && slashIdx + 1 < action.length()) {
            return action.substring(slashIdx + 1);
        }

        return action;
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
