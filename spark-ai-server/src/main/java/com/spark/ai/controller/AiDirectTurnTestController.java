package com.spark.ai.controller;

import com.spark.ai.service.AiSessionService;
import com.spark.ai.service.AiSessionService.TurnResult;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Test-only direct AI turn endpoint.
 *
 * <p>This keeps model-guide verification off the APP SSE channel: callers post
 * the exact system prompt, messages and function tools, then receive the
 * non-streaming LLM turn result directly in the HTTP response.
 */
@RestController
@RequestMapping("/api/ai/test")
public class AiDirectTurnTestController {

    private static final Set<String> ALLOWED_FIELDS = Set.of(
            "systemPrompt",
            "messages",
            "turnMessages",
            "tools",
            "mode",
            "windowSize",
            "scope",
            "reuseScopeSession",
            "sessionId");

    private final AiSessionService sessionService;

    public AiDirectTurnTestController(AiSessionService sessionService) {
        this.sessionService = sessionService;
    }

    @PostMapping("/direct-turn")
    public ResponseEntity<Map<String, Object>> executeDirectTurn(
            @RequestBody(required = false) Map<String, Object> request) {
        if (request == null || request.isEmpty()) {
            return error(HttpStatus.BAD_REQUEST, "MISSING_REQUEST_BODY", "请求体不能为空");
        }
        String invalidField = firstInvalidField(request);
        if (invalidField != null) {
            return error(
                    HttpStatus.BAD_REQUEST,
                    "INVALID_AI_DIRECT_TURN_FIELD",
                    "AI direct turn body 不允许字段: " + invalidField);
        }

        String systemPrompt = requiredString(request, "systemPrompt");
        if (systemPrompt == null) {
            return error(HttpStatus.BAD_REQUEST, "MISSING_REQUIRED_FIELD", "systemPrompt 不能为空");
        }

        List<Map<String, Object>> messages = messages(request.get("messages"));
        List<Map<String, Object>> turnMessages = optionalMessages(request.get("turnMessages"));
        if ((messages == null || messages.isEmpty()) && (turnMessages == null || turnMessages.isEmpty())) {
            return error(HttpStatus.BAD_REQUEST, "MISSING_REQUIRED_FIELD", "messages 或 turnMessages 不能为空");
        }

        List<Map<String, Object>> tools = optionalMessages(request.get("tools"));
        Map<String, Object> scope = optionalMap(request.get("scope"));
        int windowSize = optionalInteger(request, "windowSize", 30);
        String mode = optionalString(request, "mode");
        if (mode == null) mode = "function";
        boolean reuseScopeSession = request.get("reuseScopeSession") instanceof Boolean value && value;
        String requestedSessionId = optionalString(request, "sessionId");

        String sessionId = sessionService.createSession(
                systemPrompt,
                messages != null ? messages : List.of(),
                windowSize,
                tools,
                mode,
                scope,
                reuseScopeSession,
                requestedSessionId);
        TurnResult result = sessionService.executeTurn(
                sessionId,
                scope,
                turnMessages != null ? turnMessages : List.of());

        if (result == null) {
            return error(HttpStatus.BAD_GATEWAY, "LLM_DIRECT_TURN_FAILED", "会话不存在或 LLM 调用失败");
        }
        if (result.getErrorCode() != null) {
            Map<String, Object> details = new LinkedHashMap<>();
            details.put("sessionId", sessionId);
            details.put("state", result.getState());
            details.put("stateTransition", result.getStateTransition());
            if (result.getErrorDetails() != null) details.put("errorDetails", result.getErrorDetails());
            if (result.getRuntimeMeta() != null) details.put("runtime", result.getRuntimeMeta());
            return error(HttpStatus.BAD_GATEWAY, result.getErrorCode(), "AI direct turn 执行失败", details);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("sessionId", sessionId);
        body.put("text", result.getText());
        if (result.getReasoning() != null) body.put("reasoning", result.getReasoning());
        if (result.getToolCalls() != null && !result.getToolCalls().isEmpty()) {
            body.put("toolCalls", result.getToolCalls());
        }
        if (result.getState() != null) body.put("state", result.getState());
        if (result.getStateTransition() != null) body.put("stateTransition", result.getStateTransition());
        if (result.getRuntimeMeta() != null) body.put("runtime", result.getRuntimeMeta());
        return ResponseEntity.ok(body);
    }

    private static String firstInvalidField(Map<String, Object> request) {
        for (String key : request.keySet()) {
            if (!ALLOWED_FIELDS.contains(key)) return key;
        }
        return null;
    }

    private static String requiredString(Map<String, Object> request, String key) {
        String value = optionalString(request, key);
        return value == null || value.isBlank() ? null : value;
    }

    private static String optionalString(Map<String, Object> request, String key) {
        Object value = request.get(key);
        if (!(value instanceof String text)) return null;
        String trimmed = text.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static int optionalInteger(Map<String, Object> request, String key, int fallback) {
        Object value = request.get(key);
        return value instanceof Number number ? number.intValue() : fallback;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> optionalMap(Object value) {
        return value instanceof Map<?, ?> ? (Map<String, Object>) value : null;
    }

    private static List<Map<String, Object>> messages(Object value) {
        List<Map<String, Object>> messages = optionalMessages(value);
        return messages == null || messages.isEmpty() ? null : messages;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> optionalMessages(Object value) {
        if (value == null) return null;
        if (!(value instanceof List<?> items)) return null;
        for (Object item : items) {
            if (!(item instanceof Map<?, ?>)) return null;
        }
        return (List<Map<String, Object>>) value;
    }

    private static ResponseEntity<Map<String, Object>> error(HttpStatus status, String code, String message) {
        return error(status, code, message, null);
    }

    private static ResponseEntity<Map<String, Object>> error(
            HttpStatus status,
            String code,
            String message,
            Map<String, Object> details) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("severity", "error");
        error.put("category", "ai-direct-turn");
        error.put("code", code);
        error.put("retryPolicy", "fix-request");
        error.put("message", message);
        if (details != null && !details.isEmpty()) error.put("details", details);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", error);
        return ResponseEntity.status(status).body(body);
    }
}
