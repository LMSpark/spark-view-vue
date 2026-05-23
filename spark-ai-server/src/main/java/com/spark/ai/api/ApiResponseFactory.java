package com.spark.ai.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Creates and writes standard API envelopes.
 */
public final class ApiResponseFactory {

    public static final int PROTOCOL_VERSION = 4;
    public static final String REQUEST_ID_ATTRIBUTE = "requestId";
    public static final String REQUEST_ID_HEADER = "X-Request-Id";

    private ApiResponseFactory() {
    }

    public static <T> ApiEnvelope<T> ok(T data, String requestId) {
        String normalizedRequestId = normalizeRequestId(requestId);
        return new ApiEnvelope<>(
                PROTOCOL_VERSION,
                true,
                data,
                null,
                context(normalizedRequestId),
                event("http", "response", true, null));
    }

    public static <T> ApiEnvelope<T> sseOk(
            String eventName,
            T data,
            String requestId,
            Map<String, Object> context,
            boolean terminal) {
        String normalizedRequestId = normalizeRequestId(requestId);
        return new ApiEnvelope<>(
                PROTOCOL_VERSION,
                true,
                data,
                null,
                context(normalizedRequestId, context),
                event("sse", normalizeEventName(eventName), terminal, null));
    }

    public static ApiEnvelope<Object> error(HttpStatusCode status, String code, String message, String requestId) {
        return error(status, code, message, null, requestId);
    }

    public static ApiEnvelope<Object> error(
            HttpStatusCode status,
            String code,
            String message,
            Map<String, Object> details,
            String requestId) {
        return error(status, code, message, null, details, requestId);
    }

    public static ApiEnvelope<Object> error(
            HttpStatusCode status,
            String code,
            String message,
            String category,
            Map<String, Object> details,
            String requestId) {
        return error(status, code, message, category, null, details, requestId);
    }

    public static ApiEnvelope<Object> error(
            HttpStatusCode status,
            String code,
            String message,
            String category,
            String retryPolicy,
            Map<String, Object> details,
            String requestId) {
        HttpStatus httpStatus = HttpStatus.resolve(status.value());
        String resolvedCategory = category != null && !category.isBlank()
                ? category
                : httpStatus != null ? httpStatus.series().name().toLowerCase() : "error";
        String normalizedRequestId = normalizeRequestId(requestId);
        return new ApiEnvelope<>(
                PROTOCOL_VERSION,
                false,
                null,
                new ApiError(
                        normalizeCode(code, status),
                        normalizeMessage(message, status),
                        resolvedCategory,
                        "error",
                        blankToNull(retryPolicy),
                        details),
                context(normalizedRequestId),
                event("http", "response", true, null));
    }

    public static ApiEnvelope<Object> sseError(
            String eventName,
            HttpStatusCode status,
            String code,
            String message,
            String category,
            String retryPolicy,
            Map<String, Object> details,
            String requestId,
            Map<String, Object> context) {
        HttpStatus httpStatus = HttpStatus.resolve(status.value());
        String resolvedCategory = category != null && !category.isBlank()
                ? category
                : httpStatus != null ? httpStatus.series().name().toLowerCase() : "error";
        String normalizedRequestId = normalizeRequestId(requestId);
        return new ApiEnvelope<>(
                PROTOCOL_VERSION,
                false,
                null,
                new ApiError(
                        normalizeCode(code, status),
                        normalizeMessage(message, status),
                        resolvedCategory,
                        "error",
                        blankToNull(retryPolicy),
                        details),
                context(normalizedRequestId, context),
                event("sse", normalizeEventName(eventName), true, null));
    }

    public static String currentRequestId() {
        RequestAttributes attrs = RequestContextHolder.getRequestAttributes();
        if (attrs instanceof ServletRequestAttributes servletAttrs) {
            return requestId(servletAttrs.getRequest());
        }
        return UUID.randomUUID().toString();
    }

    public static String requestId(HttpServletRequest request) {
        Object existing = request.getAttribute(REQUEST_ID_ATTRIBUTE);
        if (existing instanceof String text && !text.isBlank()) {
            return text;
        }
        String header = request.getHeader(REQUEST_ID_HEADER);
        if (header != null && !header.isBlank()) {
            String trimmed = header.trim();
            request.setAttribute(REQUEST_ID_ATTRIBUTE, trimmed);
            return trimmed;
        }
        String generated = UUID.randomUUID().toString();
        request.setAttribute(REQUEST_ID_ATTRIBUTE, generated);
        return generated;
    }

    public static void writeJsonError(
            HttpServletRequest request,
            HttpServletResponse response,
            ObjectMapper objectMapper,
            HttpStatus status,
            String code,
            String message) throws IOException {
        String requestId = requestId(request);
        response.setStatus(status.value());
        response.setHeader(REQUEST_ID_HEADER, requestId);
        response.setContentType("application/json;charset=UTF-8");
        objectMapper.writeValue(response.getWriter(), error(status, code, message, requestId));
    }

    @SuppressWarnings("unchecked")
    public static ApiEnvelope<Object> errorFromBody(HttpStatusCode status, Object body, String requestId) {
        if (body instanceof ApiEnvelope<?> envelope) {
            return (ApiEnvelope<Object>) envelope;
        }

        Map<String, Object> details = null;
        String code = null;
        String message = null;
        String category = null;
        String retryPolicy = null;

        if (body instanceof Map<?, ?> raw) {
            details = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : raw.entrySet()) {
                details.put(String.valueOf(entry.getKey()), entry.getValue());
            }
            Object error = raw.get("error");
            if (error instanceof Map<?, ?> errorMap) {
                Object nestedCode = errorMap.get("code");
                Object nestedMessage = errorMap.get("message");
                Object nestedCategory = errorMap.get("category");
                Object nestedRetryPolicy = errorMap.get("retryPolicy");
                if (nestedCode instanceof String text && !text.isBlank()) code = text;
                if (nestedMessage instanceof String text && !text.isBlank()) message = text;
                if (nestedCategory instanceof String text && !text.isBlank()) category = text;
                if (nestedRetryPolicy instanceof String text && !text.isBlank()) retryPolicy = text;
            } else if (error instanceof String text && !text.isBlank()) {
                code = text;
                message = text;
            }
            Object msg = raw.get("message");
            if (message == null && msg instanceof String text && !text.isBlank()) {
                message = text;
            }
        }

        return error(status, code, message, category, retryPolicy, details, requestId);
    }

    public static Map<String, Object> context(String requestId) {
        return context(requestId, null);
    }

    public static Map<String, Object> context(String requestId, Map<String, Object> extra) {
        Map<String, Object> result = currentRequestContext(normalizeRequestId(requestId));
        mergeNested(result, extra);
        return result;
    }

    public static Map<String, Object> aiStreamContext(
            String sessionId,
            String turnId,
            String turnKey,
            Integer seq,
            Integer baseRevision,
            String streamId,
            String streamKey,
            Map<String, Object> scope) {
        Map<String, Object> result = new LinkedHashMap<>();
        putNestedText(result, "session", "sessionId", sessionId);
        putNestedText(result, "turn", "turnId", turnId);
        putNestedText(result, "turn", "turnKey", turnKey);
        putNestedNumber(result, "turn", "seq", seq);
        putNestedNumber(result, "turn", "baseRevision", baseRevision);
        putNestedText(result, "stream", "streamId", streamId);
        putNestedText(result, "stream", "streamKey", streamKey);

        Map<String, Object> wireScope = wireScope(scope);
        if (!wireScope.isEmpty()) {
            result.put("scope", wireScope);
        }
        return result;
    }

    /**
     * Project Host keeps businessRegistrationId/businessInstanceId internally;
     * the wire envelope always exposes moduleId/moduleInstanceId under context.scope.
     */
    public static Map<String, Object> wireScope(Map<String, Object> scope) {
        Map<String, Object> result = new LinkedHashMap<>();
        if (scope == null || scope.isEmpty()) {
            return result;
        }
        putText(result, "moduleId", firstText(scope.get("moduleId"), scope.get("businessRegistrationId")));
        putText(result, "moduleInstanceId", firstText(scope.get("moduleInstanceId"), scope.get("businessInstanceId")));
        putText(result, "instanceId", scope.get("instanceId"));
        putText(result, "runtimeInstanceId", scope.get("runtimeInstanceId"));
        return result;
    }

    private static String normalizeRequestId(String requestId) {
        return requestId != null && !requestId.isBlank() ? requestId : UUID.randomUUID().toString();
    }

    private static String normalizeCode(String code, HttpStatusCode status) {
        if (code != null && !code.isBlank()) {
            return code;
        }
        HttpStatus httpStatus = HttpStatus.resolve(status.value());
        return httpStatus != null ? httpStatus.name() : "HTTP_" + status.value();
    }

    private static String normalizeMessage(String message, HttpStatusCode status) {
        if (message != null && !message.isBlank()) {
            return message;
        }
        HttpStatus httpStatus = HttpStatus.resolve(status.value());
        return httpStatus != null ? httpStatus.getReasonPhrase() : "HTTP " + status.value();
    }

    private static Map<String, Object> currentRequestContext(String requestId) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("requestId", requestId);
        RequestAttributes attrs = RequestContextHolder.getRequestAttributes();
        if (attrs instanceof ServletRequestAttributes servletAttrs) {
            HttpServletRequest request = servletAttrs.getRequest();
            putText(result, "tenantId", firstText(request.getAttribute("tenantId"), request.getHeader("X-Tenant-Id")));
            putText(result, "projectId", firstText(request.getAttribute("projectId"), request.getHeader("X-Project-Id")));
            putText(result, "username", request.getAttribute("username"));
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    private static void mergeNested(Map<String, Object> target, Map<String, Object> source) {
        if (source == null || source.isEmpty()) {
            return;
        }
        for (Map.Entry<String, Object> entry : source.entrySet()) {
            Object existing = target.get(entry.getKey());
            Object value = entry.getValue();
            if (existing instanceof Map<?, ?> existingMap && value instanceof Map<?, ?> valueMap) {
                Map<String, Object> merged = new LinkedHashMap<>((Map<String, Object>) existingMap);
                Map<String, Object> normalizedValue = new LinkedHashMap<>();
                for (Map.Entry<?, ?> nested : valueMap.entrySet()) {
                    normalizedValue.put(String.valueOf(nested.getKey()), nested.getValue());
                }
                mergeNested(merged, normalizedValue);
                target.put(entry.getKey(), merged);
            } else if (value != null) {
                target.put(entry.getKey(), value);
            }
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> nestedMap(Map<String, Object> root, String key) {
        Object existing = root.get(key);
        if (existing instanceof Map<?, ?> map) {
            return (Map<String, Object>) map;
        }
        Map<String, Object> created = new LinkedHashMap<>();
        root.put(key, created);
        return created;
    }

    private static void putNestedText(Map<String, Object> root, String group, String key, Object value) {
        putText(nestedMap(root, group), key, value);
        if (nestedMap(root, group).isEmpty()) {
            root.remove(group);
        }
    }

    private static void putNestedNumber(Map<String, Object> root, String group, String key, Number value) {
        if (value != null) {
            nestedMap(root, group).put(key, value);
        }
    }

    private static void putText(Map<String, Object> target, String key, Object value) {
        if (value instanceof String text && !text.isBlank()) {
            target.put(key, text.trim());
        }
    }

    private static Object firstText(Object first, Object fallback) {
        if (first instanceof String text && !text.isBlank()) {
            return text;
        }
        return fallback;
    }

    private static String blankToNull(String value) {
        return value != null && !value.isBlank() ? value : null;
    }

    private static String normalizeEventName(String eventName) {
        return eventName != null && !eventName.isBlank() ? eventName : "message";
    }

    private static Map<String, Object> event(String transport, String name, boolean terminal, Integer sequence) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("transport", transport);
        result.put("name", name);
        result.put("terminal", terminal);
        if (sequence != null) {
            result.put("sequence", sequence);
        }
        return result;
    }
}
