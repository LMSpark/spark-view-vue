package com.spark.ai.controller;

import com.spark.ai.service.SseService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/ai/host-run")
public class AiHostRunController {

    private final SseService sseService;

    public AiHostRunController(SseService sseService) {
        this.sseService = sseService;
    }

    @PostMapping("/request")
    public ResponseEntity<Map<String, Object>> requestHostRun(
            @RequestBody(required = false) Map<String, Object> body,
            HttpServletRequest servletRequest) {
        if (body == null || body.isEmpty()) {
            return error(HttpStatus.BAD_REQUEST, "MISSING_REQUEST_BODY", "request body is required");
        }

        String alias = requiredString(body, "alias");
        if (alias == null) {
            return error(HttpStatus.BAD_REQUEST, "MISSING_REQUIRED_FIELD", "alias is required");
        }

        Map<String, Object> args = objectMap(body.get("args"));
        if (args == null) {
            return error(HttpStatus.BAD_REQUEST, "INVALID_AI_HOST_RUN_ARGS", "args must be a JSON object");
        }

        String appClientId = optionalString(body, "appClientId");
        if (appClientId == null) {
            appClientId = sseService.currentAppClientId(servletRequest);
        }
        if (appClientId == null || appClientId.isBlank()) {
            return error(HttpStatus.BAD_REQUEST, "MISSING_REQUIRED_FIELD", "appClientId is required");
        }
        if (!sseService.hasActiveConnection(appClientId)) {
            return error(HttpStatus.CONFLICT, "APP_SSE_NOT_CONNECTED", "target APP SSE client is not connected");
        }

        String requestId = optionalString(body, "requestId");
        if (requestId == null) {
            requestId = UUID.randomUUID().toString();
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("requestId", requestId);
        payload.put("alias", alias);
        payload.put("args", args);
        payload.put("timestamp", System.currentTimeMillis());
        Long timeoutMs = optionalPositiveLong(body, "timeoutMs");
        if (timeoutMs != null) {
            payload.put("timeoutMs", timeoutMs);
        }
        putIfText(payload, "reason", body.get("reason"));

        boolean delivered = sseService.emitToAppClient(
                appClientId,
                SseService.EVENT_AI_HOST_RUN_REQUEST,
                payload,
                requestId,
                Map.of("appClientId", appClientId),
                false);
        if (!delivered) {
            return error(HttpStatus.CONFLICT, "AI_HOST_RUN_REQUEST_NOT_DELIVERED", "target APP SSE client did not accept the request");
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("accepted", true);
        response.put("delivered", true);
        response.put("requestId", requestId);
        response.put("eventType", SseService.EVENT_AI_HOST_RUN_REQUEST);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(response);
    }

    @PostMapping("/result")
    public ResponseEntity<Map<String, Object>> reportHostRunResult(
            @RequestBody(required = false) Map<String, Object> body) {
        if (body == null || body.isEmpty()) {
            return error(HttpStatus.BAD_REQUEST, "MISSING_REQUEST_BODY", "request body is required");
        }

        String requestId = requiredString(body, "requestId");
        String alias = requiredString(body, "alias");
        String status = requiredString(body, "status");
        if (requestId == null) {
            return error(HttpStatus.BAD_REQUEST, "MISSING_REQUIRED_FIELD", "requestId is required");
        }
        if (alias == null) {
            return error(HttpStatus.BAD_REQUEST, "MISSING_REQUIRED_FIELD", "alias is required");
        }
        if (status == null) {
            return error(HttpStatus.BAD_REQUEST, "MISSING_REQUIRED_FIELD", "status is required");
        }

        Map<String, Object> payload = new LinkedHashMap<>(body);
        payload.put("requestId", requestId);
        payload.put("alias", alias);
        payload.put("status", status);
        payload.put("serverTimestamp", System.currentTimeMillis());
        sseService.emit(SseService.EVENT_AI_HOST_RUN_RESULT, payload, null, true);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("ok", true);
        response.put("requestId", requestId);
        response.put("eventType", SseService.EVENT_AI_HOST_RUN_RESULT);
        return ResponseEntity.ok(response);
    }

    private static ResponseEntity<Map<String, Object>> error(HttpStatus status, String code, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", false);
        body.put("code", code);
        body.put("message", message);
        return ResponseEntity.status(status).body(body);
    }

    private static String requiredString(Map<String, Object> body, String key) {
        String value = optionalString(body, key);
        return value == null || value.isBlank() ? null : value;
    }

    private static String optionalString(Map<String, Object> body, String key) {
        Object value = body.get(key);
        return value instanceof String text ? text.trim() : null;
    }

    private static Long optionalPositiveLong(Map<String, Object> body, String key) {
        Object value = body.get(key);
        if (value instanceof Number number) {
            long normalized = number.longValue();
            return normalized > 0 ? normalized : null;
        }
        if (value instanceof String text && !text.isBlank()) {
            try {
                long parsed = Long.parseLong(text.trim());
                return parsed > 0 ? parsed : null;
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    private static Map<String, Object> objectMap(Object value) {
        if (!(value instanceof Map<?, ?> raw)) {
            return null;
        }
        Map<String, Object> result = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : raw.entrySet()) {
            Object key = entry.getKey();
            if (!(key instanceof String text) || text.isBlank()) {
                return null;
            }
            result.put(text, entry.getValue());
        }
        return result;
    }

    private static void putIfText(Map<String, Object> payload, String key, Object value) {
        if (value instanceof String text && !text.isBlank()) {
            payload.put(key, text.trim());
        }
    }
}
