package com.spark.ai.controller;

import com.spark.ai.service.AiSessionService;
import com.spark.ai.service.AiSessionService.AppendMessageResult;
import com.spark.ai.service.AiSessionService.TurnResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 统一 AI 会话端点 — Generate/Iterate 统一。
 *
 * <ul>
 *   <li>POST   /api/ai/sessions           — 创建会话</li>
 *   <li>POST   /api/ai/sessions/{id}/turn  — 执行一轮 LLM（支持 SSE 流式）</li>
 *   <li>POST   /api/ai/sessions/{id}/turn/append — 按 turn 追加前端已完成消息</li>
 *   <li>POST   /api/ai/sessions/{id}/append — 追加消息</li>
 *   <li>GET    /api/ai/sessions/{id}/conversation — 获取完整对话</li>
 *   <li>DELETE /api/ai/sessions/{id}       — 销毁会话</li>
 *   <li>DELETE /api/ai/sessions            — 批量销毁</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/ai/sessions")
public class AiSessionController {

    private static final Logger log = LoggerFactory.getLogger(AiSessionController.class);
    private static final int PROTOCOL_VERSION_V3 = 3;

    private final AiSessionService sessionService;

    public AiSessionController(AiSessionService sessionService) {
        this.sessionService = sessionService;
    }

    // ─────────────────────────────────────────────────────────
    // POST /api/ai/sessions — 创建会话
    // ─────────────────────────────────────────────────────────

    /**
     * 创建会话。
     *
     * <p>请求体：
     * <pre>{
     *   "systemPrompt": "...",
     *   "userPrompt": "...",
     *   "windowSize": 30,
     *   "tools": [...],           // FC tool definitions（可选）
     *   "mode": "generate"        // "generate" | "function"
     * }</pre>
     */
    @PostMapping
    public ResponseEntity<Map<String, Object>> createSession(
            @RequestBody Map<String, Object> request) {
        if (!isProtocolV3(request)) {
            return requestError("INVALID_PROTOCOL_VERSION", "仅支持 protocolVersion=3");
        }
        String systemPrompt = getRequiredString(request, "systemPrompt");
        if (systemPrompt == null) {
            return requestError("MISSING_REQUIRED_FIELD", "systemPrompt 不能为空");
        }
        String userPrompt = getOptionalString(request, "userPrompt");
        String requestedSessionId = getOptionalString(request, "sessionId");
        List<Map<String, Object>> messages = extractMessages(request);
        if ((userPrompt == null || userPrompt.isBlank()) && (messages == null || messages.isEmpty()) && requestedSessionId == null) {
            return requestError("MISSING_REQUIRED_FIELD", "userPrompt 或 messages 不能为空");
        }
        int windowSize = request.get("windowSize") instanceof Number n ? n.intValue() : 30;
        String mode = request.get("mode") instanceof String s ? s : "generate";
        boolean reuseScopeSession = !(request.get("reuseScopeSession") instanceof Boolean b) || b;

        List<Map<String, Object>> tools = extractTools(request);

        Map<String, Object> scope = extractScope(request);
        String sessionId = messages != null && !messages.isEmpty()
            ? sessionService.createSession(systemPrompt, messages, windowSize, tools, mode, scope, reuseScopeSession, requestedSessionId)
            : sessionService.createSession(systemPrompt, userPrompt, windowSize, tools, mode, scope, reuseScopeSession, requestedSessionId);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("sessionId", sessionId);
        body.put("protocolVersion", PROTOCOL_VERSION_V3);
        if (scope != null && !scope.isEmpty()) {
            body.put("scope", scope);
        }
        return ResponseEntity.ok(body);
    }

    // ─────────────────────────────────────────────────────────
    // POST /api/ai/sessions/{id}/turn — 执行一轮 LLM 对话
    // ─────────────────────────────────────────────────────────

    /**
     * 非流式 turn — 返回 JSON。
     */
    @PostMapping("/{sessionId}/turn")
    public ResponseEntity<Map<String, Object>> executeTurn(
            @PathVariable String sessionId,
            @RequestBody(required = false) Map<String, Object> request) {

        if (!isProtocolV3(request)) {
            return requestError("INVALID_PROTOCOL_VERSION", "仅支持 protocolVersion=3");
        }

        boolean stream = request != null
                && request.get("stream") instanceof Boolean b && b;

        if (stream) {
            // 不应该走这里；流式走 SSE 端点
            return requestError("INVALID_STREAM_ENDPOINT", "流式请求请使用 SSE 端点");
        }

        TurnResult result = sessionService.executeTurn(sessionId, extractScope(request), extractMessages(request));
        if (result == null) {
            return notFoundError("SESSION_NOT_FOUND", "会话不存在或 LLM 调用失败", sessionId);
        }

        if (result.getErrorCode() != null) {
            return errorEnvelopeFromTurnResult(result, sessionId);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("text", result.getText());
        body.put("sessionId", sessionId);
        Map<String, Object> turn = extractTurn(request);
        String turnId = getOptionalString(turn, "turnId");
        if (turnId != null) {
            body.put("turnId", turnId);
        }
        if (result.getReasoning() != null) {
            body.put("reasoning", result.getReasoning());
        }
        if (result.getToolCalls() != null && !result.getToolCalls().isEmpty()) {
            body.put("toolCalls", result.getToolCalls());
        }
        if (result.getState() != null) {
            body.put("state", result.getState());
        }
        if (result.getStateTransition() != null) {
            body.put("stateTransition", result.getStateTransition());
        }
        if (result.getRuntimeMeta() != null) {
            body.put("runtime", result.getRuntimeMeta());
        }
        body.put("protocolVersion", PROTOCOL_VERSION_V3);
        return ResponseEntity.ok(body);
    }

    /**
     * 流式 turn — SSE 推送。
     */
    @PostMapping(value = "/{sessionId}/turn/stream",
            produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter executeTurnStream(
            @PathVariable String sessionId,
            @RequestBody(required = false) Map<String, Object> request) {
        SseEmitter emitter = new SseEmitter(300_000L); // 5 min timeout

        if (!isProtocolV3(request)) {
            sendSseErrorAndComplete(emitter, "INVALID_PROTOCOL_VERSION", "仅支持 protocolVersion=3");
            return emitter;
        }

        Map<String, Object> turn = extractTurn(request);
        int windowSize = request != null && request.get("windowSize") instanceof Number n ? n.intValue() : 30;
        String mode = request != null && request.get("mode") instanceof String s ? s : "function";
        sessionService.executeTurnStream(
                sessionId,
                emitter,
                extractScope(request),
                getOptionalString(turn, "turnId"),
                getOptionalString(turn, "streamKey"),
                extractMessages(request),
                getOptionalString(request, "systemPrompt"),
                windowSize,
                extractTools(request),
                mode);

        return emitter;
    }

    @PostMapping("/{sessionId}/turn/append")
    public ResponseEntity<Map<String, Object>> appendTurnMessages(
            @PathVariable String sessionId,
            @RequestBody Map<String, Object> request) {
        if (!isProtocolV3(request)) {
            return requestError("INVALID_PROTOCOL_VERSION", "仅支持 protocolVersion=3");
        }

        List<Map<String, Object>> messages = extractMessages(request);
        if (messages == null || messages.isEmpty()) {
            return requestError("MISSING_REQUIRED_FIELD", "messages 不能为空");
        }

        for (Map<String, Object> msg : messages) {
            String role = msg.get("role") instanceof String s ? s : "user";
            String content = msg.get("content") instanceof String s ? s : "";
            String toolCallId = msg.get("tool_call_id") instanceof String s ? s : null;

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> toolCalls = msg.get("tool_calls") instanceof List<?> list
                    ? (List<Map<String, Object>>) list : null;

            AppendMessageResult appendResult = sessionService.appendMessage(
                    sessionId, role, content, toolCallId, toolCalls, extractScope(request));
            if (appendResult == AppendMessageResult.SESSION_NOT_FOUND) {
                return notFoundError("SESSION_NOT_FOUND", "会话不存在", sessionId);
            }
            if (appendResult == AppendMessageResult.SCOPE_MISMATCH) {
                return scopeMismatchError(sessionId);
            }
        }

        Map<String, Object> turn = extractTurn(request);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("sessionId", sessionId);
        String turnId = getOptionalString(turn, "turnId");
        if (turnId != null) body.put("turnId", turnId);
        body.put("protocolVersion", PROTOCOL_VERSION_V3);
        return ResponseEntity.ok(body);
    }

    // ─────────────────────────────────────────────────────────
    // POST /api/ai/sessions/{id}/append — 追加消息
    // ─────────────────────────────────────────────────────────

    /**
     * 追加消息（支持批量）。
     *
     * <p>请求体：
     * <pre>{
     *   "messages": [
     *     { "role": "assistant", "content": "...", "tool_calls": [...] },
     *     { "role": "tool", "content": "...", "tool_call_id": "call_xxx" }
     *   ]
     * }</pre>
     */
    @PostMapping("/{sessionId}/append")
    public ResponseEntity<Map<String, Object>> appendMessages(
            @PathVariable String sessionId,
            @RequestBody Map<String, Object> request) {

        if (!isProtocolV3(request)) {
            return requestError("INVALID_PROTOCOL_VERSION", "仅支持 protocolVersion=3");
        }

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> messages = request.get("messages") instanceof List<?> list
                ? (List<Map<String, Object>>) list : null;

        if (messages == null || messages.isEmpty()) {
            return requestError("MISSING_REQUIRED_FIELD", "messages 不能为空");
        }

        for (Map<String, Object> msg : messages) {
            String role = msg.get("role") instanceof String s ? s : "user";
            String content = msg.get("content") instanceof String s ? s : "";
            String toolCallId = msg.get("tool_call_id") instanceof String s ? s : null;

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> toolCalls = msg.get("tool_calls") instanceof List<?> list
                    ? (List<Map<String, Object>>) list : null;

            AppendMessageResult appendResult = sessionService.appendMessage(
                    sessionId, role, content, toolCallId, toolCalls, extractScope(request));
            if (appendResult == AppendMessageResult.SESSION_NOT_FOUND) {
                return notFoundError("SESSION_NOT_FOUND", "会话不存在", sessionId);
            }
            if (appendResult == AppendMessageResult.SCOPE_MISMATCH) {
                return scopeMismatchError(sessionId);
            }
        }

        return ResponseEntity.ok(Map.of(
            "ok", true,
            "sessionId", sessionId,
            "protocolVersion", PROTOCOL_VERSION_V3));
    }

    // ─────────────────────────────────────────────────────────
    // GET /api/ai/sessions/{id}/conversation
    // ─────────────────────────────────────────────────────────

    @GetMapping("/{sessionId}/conversation")
    public ResponseEntity<Map<String, Object>> getConversation(
            @PathVariable String sessionId) {
        List<Map<String, Object>> conversation =
                sessionService.getConversationFull(sessionId);
        return ResponseEntity.ok(Map.of("conversation", conversation));
    }

    // ─────────────────────────────────────────────────────────
    // DELETE /api/ai/sessions/{id}
    // ─────────────────────────────────────────────────────────

    @DeleteMapping("/{sessionId}")
    public ResponseEntity<Map<String, Object>> destroySession(
            @PathVariable String sessionId) {
        sessionService.destroySession(sessionId);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    // ─────────────────────────────────────────────────────────
    // DELETE /api/ai/sessions — 批量销毁
    // ─────────────────────────────────────────────────────────

    @DeleteMapping
    @SuppressWarnings("unchecked")
    public ResponseEntity<Map<String, Object>> destroySessions(
            @RequestBody Map<String, Object> request) {
        Object raw = request.get("sessionIds");
        if (!(raw instanceof List<?> list) || list.isEmpty()) {
            return requestError("MISSING_REQUIRED_FIELD", "sessionIds 不能为空");
        }
        List<String> sessionIds = ((List<Object>) list).stream()
                .filter(String.class::isInstance)
                .map(String.class::cast)
                .toList();
        int destroyed = sessionService.destroySessions(sessionIds);
        return ResponseEntity.ok(Map.of("destroyed", destroyed));
    }

    // ─────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────

    private static String getRequiredString(Map<String, Object> map, String key) {
        Object val = map.get(key);
        if (val instanceof String s && !s.isBlank()) {
            return s;
        }
        return null;
    }

    private static String getOptionalString(Map<String, Object> map, String key) {
        if (map == null) return null;
        Object val = map.get(key);
        if (val instanceof String s) {
            return s;
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> extractMessages(Map<String, Object> request) {
        if (request == null) return null;
        Object messages = request.get("messages");
        if (messages instanceof List<?> list) {
            return (List<Map<String, Object>>) list;
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> extractTools(Map<String, Object> request) {
        if (request == null) return null;
        return request.get("tools") instanceof List<?> list
                ? (List<Map<String, Object>>) list : null;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> extractTurn(Map<String, Object> request) {
        if (request == null) return Map.of();
        Object turn = request.get("turn");
        if (turn instanceof Map<?, ?> map) {
            return (Map<String, Object>) map;
        }
        return Map.of();
    }

    private static boolean isProtocolV3(Map<String, Object> request) {
        if (request == null) {
            return false;
        }
        Object protocolVersion = request.get("protocolVersion");
        if (protocolVersion instanceof Number n) {
            return n.intValue() == PROTOCOL_VERSION_V3;
        }
        return false;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> extractScope(Map<String, Object> request) {
        if (request == null) return null;
        Object scope = request.get("scope");
        if (scope instanceof Map<?, ?> map) {
            return (Map<String, Object>) map;
        }
        Object metadata = request.get("metadata");
        if (metadata instanceof Map<?, ?> metadataMap) {
            Object trace = metadataMap.get("trace");
            if (trace instanceof Map<?, ?> traceMap) {
                return (Map<String, Object>) traceMap;
            }
        }
        return null;
    }

    private static void sendSseErrorAndComplete(SseEmitter emitter, String code, String message) {
        try {
            emitter.send(SseEmitter.event().name("error").data(Map.of(
                    "error", Map.of(
                            "severity", "error",
                            "category", "request-validation",
                            "code", code,
                            "message", message
                    ),
                    "protocolVersion", PROTOCOL_VERSION_V3
            )));
            emitter.complete();
        } catch (IOException ignored) {}
    }

    private static ResponseEntity<Map<String, Object>> requestError(
            String code,
            String message) {
        return errorEnvelope(
                HttpStatus.BAD_REQUEST,
                "request-validation",
                code,
                "fix-request",
                message,
                null,
                null,
                null,
                null,
                null
        );
    }

    private static ResponseEntity<Map<String, Object>> notFoundError(
            String code,
            String message,
            String sessionId) {
        return errorEnvelope(
                HttpStatus.NOT_FOUND,
                "session",
                code,
                "recreate-session",
                message,
                sessionId,
                null,
                null,
                null,
                null
        );
    }

    private static ResponseEntity<Map<String, Object>> scopeMismatchError(String sessionId) {
        return errorEnvelope(
                HttpStatus.CONFLICT,
                "session-scope",
                "SESSION_SCOPE_MISMATCH",
                "recreate-session",
                "后端 AI 会话与当前模块实例不匹配",
                sessionId,
                null,
                null,
                null,
                null
        );
    }

    private static ResponseEntity<Map<String, Object>> errorEnvelopeFromTurnResult(
            TurnResult result,
            String sessionId) {
        String code = result.getErrorCode();
        HttpStatus status = switch (code) {
            case "INVALID_STATE_TRANSITION", "HANDOFF_REQUIRED",
                    "IDEMPOTENCY_REPLAY_BLOCKED", "DUPLICATE_TOOL_CALL_ID",
                    "PARALLEL_WRITE_BUDGET_EXCEEDED", "PARALLEL_WRITE_NOT_ALLOWED_STAGE1",
                    "SESSION_SCOPE_MISMATCH" -> HttpStatus.CONFLICT;
            case "LLM_CALL_FAILED" -> HttpStatus.BAD_GATEWAY;
            default -> HttpStatus.INTERNAL_SERVER_ERROR;
        };

        String category = switch (code) {
            case "INVALID_STATE_TRANSITION" -> "state-transition";
            case "HANDOFF_REQUIRED" -> "handoff";
            case "LLM_CALL_FAILED" -> "llm-call";
            case "SESSION_SCOPE_MISMATCH" -> "session-scope";
            case "IDEMPOTENCY_REPLAY_BLOCKED" -> "idempotency";
            case "DUPLICATE_TOOL_CALL_ID" -> "tool-call";
            case "PARALLEL_WRITE_BUDGET_EXCEEDED", "PARALLEL_WRITE_NOT_ALLOWED_STAGE1" -> "parallelism";
            default -> "unknown";
        };

        String retryPolicy = switch (code) {
            case "INVALID_STATE_TRANSITION", "HANDOFF_REQUIRED" -> "manual";
            case "LLM_CALL_FAILED" -> "safe-retry";
            case "SESSION_SCOPE_MISMATCH" -> "recreate-session";
            case "IDEMPOTENCY_REPLAY_BLOCKED", "DUPLICATE_TOOL_CALL_ID" -> "regenerate-plan";
            case "PARALLEL_WRITE_BUDGET_EXCEEDED", "PARALLEL_WRITE_NOT_ALLOWED_STAGE1" -> "serialize-or-split";
            default -> "none";
        };

        return errorEnvelope(
                status,
                category,
                code,
                retryPolicy,
                errorMessageForCode(code),
                sessionId,
                result.getState(),
                result.getStateTransition(),
                result.getHandoff(),
                result.getRuntimeMeta()
        );
    }

    private static ResponseEntity<Map<String, Object>> errorEnvelope(
            HttpStatus status,
            String category,
            String code,
            String retryPolicy,
            String message,
            String sessionId,
            String state,
            String stateTransition,
            Map<String, Object> handoff,
            Map<String, Object> runtimeMeta) {

        Map<String, Object> error = new LinkedHashMap<>();
        error.put("severity", "error");
        error.put("category", category);
        error.put("code", code);
        error.put("retryPolicy", retryPolicy);
        if (message != null && !message.isBlank()) {
            error.put("message", message);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", error);
        if (sessionId != null && !sessionId.isBlank()) {
            body.put("sessionId", sessionId);
        }
        if (state != null) {
            body.put("state", state);
        }
        if (stateTransition != null) {
            body.put("stateTransition", stateTransition);
        }
        body.put("protocolVersion", PROTOCOL_VERSION_V3);
        if (handoff != null) {
            body.put("handoff", handoff);
        }
        if (runtimeMeta != null) {
            body.put("runtime", runtimeMeta);
        }

        return ResponseEntity.status(status).body(body);
    }

    private static String errorMessageForCode(String code) {
        return switch (code) {
            case "INVALID_STATE_TRANSITION" -> "AI 会话状态不可直接进入下一轮，请重新生成计划或重建会话";
            case "HANDOFF_REQUIRED" -> "AI 会话已进入人工接管状态，请先确认上次失败后再继续";
            case "LLM_CALL_FAILED" -> "LLM 调用失败，请稍后重试或检查模型服务配置";
            case "SESSION_SCOPE_MISMATCH" -> "后端 AI 会话与当前页面实例不匹配，请重建会话后继续";
            case "IDEMPOTENCY_REPLAY_BLOCKED" -> "AI 生成了重复的工具调用，已阻止执行，请重新生成计划";
            case "DUPLICATE_TOOL_CALL_ID" -> "AI 返回了重复的工具调用 ID，已阻止执行，请重新生成计划";
            case "PARALLEL_WRITE_BUDGET_EXCEEDED" -> "AI 本轮写入工具调用过多，请拆成更小步骤执行";
            case "PARALLEL_WRITE_NOT_ALLOWED_STAGE1" -> "AI 本轮包含并行写入计划，请改为串行或拆分执行";
            default -> null;
        };
    }
}
