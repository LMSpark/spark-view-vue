package com.spark.ai.controller;

import com.spark.ai.service.AiSessionService;
import com.spark.ai.service.AiSessionService.PostedTurnStartResult;
import com.spark.ai.service.AiSessionService.PostedTurnStatus;
import com.spark.ai.service.SseService;
import jakarta.servlet.http.HttpServletRequest;
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

@RestController
@RequestMapping("/api/ai")
public class AiTurnController {

    private static final Set<String> ALLOWED_FIELDS = Set.of(
            "sessionId",
            "turnId",
            "messages",
            "systemPrompt",
            "windowSize");

    private final AiSessionService sessionService;
    private final SseService sseService;

    public AiTurnController(AiSessionService sessionService, SseService sseService) {
        this.sessionService = sessionService;
        this.sseService = sseService;
    }

    @PostMapping("/turns")
    public ResponseEntity<Map<String, Object>> executeTurn(
            @RequestBody(required = false) Map<String, Object> request,
            HttpServletRequest servletRequest) {
        if (request == null || request.isEmpty()) {
            return error(HttpStatus.BAD_REQUEST, "MISSING_REQUEST_BODY", "请求体不能为空");
        }
        String invalidField = firstInvalidField(request);
        if (invalidField != null) {
            return error(
                    HttpStatus.BAD_REQUEST,
                    "INVALID_AI_TURN_FIELD",
                    "AI turn body 不允许字段: " + invalidField);
        }

        String sessionId = requiredString(request, "sessionId");
        String turnId = requiredString(request, "turnId");
        List<Map<String, Object>> messages = messages(request.get("messages"));
        if (sessionId == null) {
            return error(HttpStatus.BAD_REQUEST, "MISSING_REQUIRED_FIELD", "sessionId 不能为空");
        }
        if (turnId == null) {
            return error(HttpStatus.BAD_REQUEST, "MISSING_REQUIRED_FIELD", "turnId 不能为空");
        }
        if (messages == null) {
            return error(HttpStatus.BAD_REQUEST, "MISSING_REQUIRED_FIELD", "messages 不能为空");
        }

        String appClientId = sseService.currentAppClientId(servletRequest);
        if (!sseService.hasActiveConnection(appClientId)) {
            return error(HttpStatus.CONFLICT, "APP_SSE_NOT_CONNECTED", "当前浏览器 APP SSE 未连接");
        }

        PostedTurnStartResult result = sessionService.executePostedTurn(
                appClientId,
                sessionId,
                turnId,
                messages,
                optionalString(request, "systemPrompt"),
                optionalInteger(request, "windowSize"));

        if (result.getStatus() != PostedTurnStatus.ACCEPTED) {
            return switch (result.getStatus()) {
                case SESSION_NOT_FOUND -> error(HttpStatus.NOT_FOUND, "SESSION_NOT_FOUND", result.getMessage());
                case MISSING_SYSTEM_PROMPT -> error(HttpStatus.BAD_REQUEST, "MISSING_REQUIRED_FIELD", result.getMessage());
                case TURN_ID_REUSED -> error(HttpStatus.CONFLICT, "TURN_ID_REUSED", result.getMessage());
                default -> error(HttpStatus.INTERNAL_SERVER_ERROR, "AI_TURN_START_FAILED", "AI turn 启动失败");
            };
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("accepted", true);
        body.put("started", result.isStarted());
        body.put("sessionId", sessionId);
        body.put("turnId", turnId);
        return ResponseEntity.accepted().body(body);
    }

    private static String firstInvalidField(Map<String, Object> request) {
        for (String key : request.keySet()) {
            if (!ALLOWED_FIELDS.contains(key)) {
                return key;
            }
        }
        return null;
    }

    private static String requiredString(Map<String, Object> request, String key) {
        String value = optionalString(request, key);
        return value == null || value.isBlank() ? null : value;
    }

    private static String optionalString(Map<String, Object> request, String key) {
        Object value = request.get(key);
        return value instanceof String text ? text : null;
    }

    private static Integer optionalInteger(Map<String, Object> request, String key) {
        Object value = request.get(key);
        return value instanceof Number number ? number.intValue() : null;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> messages(Object value) {
        if (!(value instanceof List<?> items)) {
            return null;
        }
        for (Object item : items) {
            if (!(item instanceof Map<?, ?>)) {
                return null;
            }
        }
        return (List<Map<String, Object>>) value;
    }

    private static ResponseEntity<Map<String, Object>> error(HttpStatus status, String code, String message) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("severity", "error");
        error.put("category", "ai-turn");
        error.put("code", code);
        error.put("retryPolicy", retryPolicy(code));
        error.put("message", message);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", error);
        return ResponseEntity.status(status).body(body);
    }

    private static String retryPolicy(String code) {
        return switch (code) {
            case "APP_SSE_NOT_CONNECTED" -> "reconnect-sse";
            case "SESSION_NOT_FOUND" -> "recreate-session";
            case "TURN_ID_REUSED" -> "new-turn-id";
            default -> "fix-request";
        };
    }
}
