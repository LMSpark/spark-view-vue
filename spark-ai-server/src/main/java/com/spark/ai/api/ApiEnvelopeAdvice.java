package com.spark.ai.api;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.http.server.ServletServerHttpResponse;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

/**
 * Wraps JSON REST controller responses in the standard API envelope.
 */
@ControllerAdvice
public class ApiEnvelopeAdvice implements ResponseBodyAdvice<Object> {

    @Override
    public boolean supports(MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
        return true;
    }

    @Override
    public Object beforeBodyWrite(
            Object body,
            MethodParameter returnType,
            MediaType selectedContentType,
            Class<? extends HttpMessageConverter<?>> selectedConverterType,
            ServerHttpRequest request,
            ServerHttpResponse response) {
        if (body instanceof ApiEnvelope<?>) {
            return body;
        }
        if (!(request instanceof ServletServerHttpRequest servletRequest)) {
            return body;
        }

        HttpServletRequest httpRequest = servletRequest.getServletRequest();
        String path = httpRequest.getRequestURI();
        if (shouldSkip(path, selectedContentType)) {
            return body;
        }

        String requestId = ApiResponseFactory.requestId(httpRequest);
        response.getHeaders().set(ApiResponseFactory.REQUEST_ID_HEADER, requestId);

        HttpStatusCode status = response instanceof ServletServerHttpResponse servletResponse
                ? servletResponse.getServletResponse().getStatus() >= 400
                    ? HttpStatusCode.valueOf(servletResponse.getServletResponse().getStatus())
                    : HttpStatusCode.valueOf(servletResponse.getServletResponse().getStatus())
                : HttpStatusCode.valueOf(200);

        if (status.isError()) {
            return ApiResponseFactory.errorFromBody(status, body, requestId);
        }
        return ApiResponseFactory.ok(body, requestId);
    }

    private boolean shouldSkip(String path, MediaType mediaType) {
        if (path == null || !path.startsWith("/api/")) {
            return true;
        }
        if (path.startsWith("/api/openapi") || path.startsWith("/api/swagger") || path.equals("/api/events")) {
            return true;
        }
        if (mediaType != null) {
            if (MediaType.TEXT_EVENT_STREAM.includes(mediaType) || MediaType.TEXT_HTML.includes(mediaType)) {
                return true;
            }
        }
        return false;
    }
}
