package com.spark.ai.api;

/**
 * Standard JSON REST envelope.
 */
public record ApiEnvelope<T>(
        boolean ok,
        T data,
        ApiError error,
        String requestId
) {
}
