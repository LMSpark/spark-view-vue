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

    public static final String REQUEST_ID_ATTRIBUTE = "requestId";
    public static final String REQUEST_ID_HEADER = "X-Request-Id";

    private ApiResponseFactory() {
    }

    public static <T> ApiEnvelope<T> ok(T data, String requestId) {
        return new ApiEnvelope<>(true, data, null, normalizeRequestId(requestId));
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
        HttpStatus httpStatus = HttpStatus.resolve(status.value());
        String resolvedCategory = category != null && !category.isBlank()
                ? category
                : httpStatus != null ? httpStatus.series().name().toLowerCase() : "error";
        return new ApiEnvelope<>(false, null,
                new ApiError(normalizeCode(code, status), normalizeMessage(message, status), resolvedCategory, details),
                normalizeRequestId(requestId));
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
                if (nestedCode instanceof String text && !text.isBlank()) code = text;
                if (nestedMessage instanceof String text && !text.isBlank()) message = text;
                if (nestedCategory instanceof String text && !text.isBlank()) category = text;
            } else if (error instanceof String text && !text.isBlank()) {
                code = text;
                message = text;
            }
            Object msg = raw.get("message");
            if (message == null && msg instanceof String text && !text.isBlank()) {
                message = text;
            }
        }

        return error(status, code, message, category, details, requestId);
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
}
