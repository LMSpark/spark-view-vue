package com.spark.ai.api;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.Map;

/**
 * Standard v4 envelope for JSON REST responses and SSE data payloads.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiEnvelope<T>(
        int protocolVersion,
        boolean ok,
        T data,
        ApiError error,
        Map<String, Object> context,
        Map<String, Object> event
) {
}
