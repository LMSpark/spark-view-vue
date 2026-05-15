package com.spark.ai.api;

import java.util.Map;

/**
 * Standard error payload for JSON REST APIs.
 */
public record ApiError(
        String code,
        String message,
        String category,
        Map<String, Object> details
) {
    public ApiError(String code, String message, String category) {
        this(code, message, category, null);
    }
}
