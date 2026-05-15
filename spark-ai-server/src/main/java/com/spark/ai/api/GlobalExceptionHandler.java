package com.spark.ai.api;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.NoSuchFileException;
import java.util.NoSuchElementException;

/**
 * Converts uncaught REST exceptions to the standard API envelope.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler({IllegalArgumentException.class})
    public ResponseEntity<ApiEnvelope<Object>> badRequest(IllegalArgumentException error, HttpServletRequest request) {
        return error(HttpStatus.BAD_REQUEST, "BAD_REQUEST", error.getMessage(), request);
    }

    @ExceptionHandler({SecurityException.class})
    public ResponseEntity<ApiEnvelope<Object>> forbidden(SecurityException error, HttpServletRequest request) {
        return error(HttpStatus.FORBIDDEN, "FORBIDDEN", error.getMessage(), request);
    }

    @ExceptionHandler({NoSuchElementException.class, NoSuchFileException.class})
    public ResponseEntity<ApiEnvelope<Object>> notFound(Exception error, HttpServletRequest request) {
        return error(HttpStatus.NOT_FOUND, "NOT_FOUND", error.getMessage(), request);
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ApiEnvelope<Object>> responseStatus(ResponseStatusException error, HttpServletRequest request) {
        return ResponseEntity.status(error.getStatusCode())
                .body(ApiResponseFactory.error(error.getStatusCode(), error.getReason(), error.getMessage(),
                        ApiResponseFactory.requestId(request)));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiEnvelope<Object>> internal(Exception error, HttpServletRequest request) {
        return error(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", error.getMessage(), request);
    }

    private ResponseEntity<ApiEnvelope<Object>> error(
            HttpStatus status,
            String code,
            String message,
            HttpServletRequest request) {
        return ResponseEntity.status(status)
                .body(ApiResponseFactory.error(status, code, message, ApiResponseFactory.requestId(request)));
    }
}
