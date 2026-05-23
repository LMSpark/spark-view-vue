package com.spark.ai.api;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.Map;

/**
 * Standard v4 error payload for JSON REST APIs and SSE data payloads.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiError(
        String code,
        String message,
        String category,
        String severity,
        String retryPolicy,
        Map<String, Object> details
) {
    public ApiError(String code, String message, String category) {
        this(code, message, category, null);
    }

    public ApiError(String code, String message, String category, Map<String, Object> details) {
        this(code, message, category, "error", null, details);
    }
}
