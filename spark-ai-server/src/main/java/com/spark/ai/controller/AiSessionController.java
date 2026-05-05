package com.spark.ai.controller;

import com.spark.ai.service.AiSessionService;
import com.spark.ai.service.AiSessionService.TurnResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 统一 AI 会话端点 — Generate/Iterate 统一。
 *
 * <ul>
 *   <li>POST   /api/ai/sessions           — 创建会话</li>
 *   <li>POST   /api/ai/sessions/{id}/turn  — 执行一轮 LLM（支持 SSE 流式）</li>
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
        String userPrompt = getRequiredString(request, "userPrompt");
        if (userPrompt == null) {
            return requestError("MISSING_REQUIRED_FIELD", "userPrompt 不能为空");
        }
        int windowSize = request.get("windowSize") instanceof Number n ? n.intValue() : 30;
        String mode = request.get("mode") instanceof String s ? s : "generate";

        // tools 是 JSON Array，直接存储转发给 LLM
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> tools = request.get("tools") instanceof List<?> list
                ? (List<Map<String, Object>>) list : null;

        String sessionId = sessionService.createSession(
                systemPrompt, userPrompt, windowSize, tools, mode);

        return ResponseEntity.ok(Map.of(
            "sessionId", sessionId,
            "protocolVersion", PROTOCOL_VERSION_V3));
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

        TurnResult result = sessionService.executeTurn(sessionId);
        if (result == null) {
            return notFoundError("SESSION_NOT_FOUND", "会话不存在或 LLM 调用失败", sessionId);
        }

        if (result.getErrorCode() != null) {
            return errorEnvelopeFromTurnResult(result, sessionId);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("text", result.getText());
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
    public SseEmitter executeTurnStream(@PathVariable String sessionId) {
        SseEmitter emitter = new SseEmitter(300_000L); // 5 min timeout

        sessionService.executeTurnStream(sessionId, emitter);

        return emitter;
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

            boolean ok = sessionService.appendMessage(
                    sessionId, role, content, toolCallId, toolCalls);
            if (!ok) {
                return notFoundError("SESSION_NOT_FOUND", "会话不存在", sessionId);
            }
        }

        return ResponseEntity.ok(Map.of(
            "ok", true,
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

    private static ResponseEntity<Map<String, Object>> errorEnvelopeFromTurnResult(
            TurnResult result,
            String sessionId) {
        String code = result.getErrorCode();
        HttpStatus status = switch (code) {
            case "INVALID_STATE_TRANSITION", "HANDOFF_REQUIRED",
                    "IDEMPOTENCY_REPLAY_BLOCKED", "DUPLICATE_TOOL_CALL_ID",
                    "PARALLEL_WRITE_BUDGET_EXCEEDED", "PARALLEL_WRITE_NOT_ALLOWED_STAGE1" -> HttpStatus.CONFLICT;
            case "LLM_CALL_FAILED" -> HttpStatus.BAD_GATEWAY;
            default -> HttpStatus.INTERNAL_SERVER_ERROR;
        };

        String category = switch (code) {
            case "INVALID_STATE_TRANSITION" -> "state-transition";
            case "HANDOFF_REQUIRED" -> "handoff";
            case "LLM_CALL_FAILED" -> "llm-call";
            case "IDEMPOTENCY_REPLAY_BLOCKED" -> "idempotency";
            case "DUPLICATE_TOOL_CALL_ID" -> "tool-call";
            case "PARALLEL_WRITE_BUDGET_EXCEEDED", "PARALLEL_WRITE_NOT_ALLOWED_STAGE1" -> "parallelism";
            default -> "unknown";
        };

        String retryPolicy = switch (code) {
            case "INVALID_STATE_TRANSITION", "HANDOFF_REQUIRED" -> "manual";
            case "LLM_CALL_FAILED" -> "safe-retry";
            case "IDEMPOTENCY_REPLAY_BLOCKED", "DUPLICATE_TOOL_CALL_ID" -> "regenerate-plan";
            case "PARALLEL_WRITE_BUDGET_EXCEEDED", "PARALLEL_WRITE_NOT_ALLOWED_STAGE1" -> "serialize-or-split";
            default -> "none";
        };

        return errorEnvelope(
                status,
                category,
                code,
                retryPolicy,
                null,
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
}
