package com.spark.ai.api;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.http.server.ServletServerHttpResponse;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ApiEnvelopeAdviceTest {

    private final ApiEnvelopeAdvice advice = new ApiEnvelopeAdvice();

    @Test
    void wrapsApiJsonResponsesInV4Envelope() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/demo");
        request.addHeader(ApiResponseFactory.REQUEST_ID_HEADER, "request-1");
        request.setAttribute("tenantId", "tenant-1");
        request.setAttribute("projectId", "project-1");
        request.setAttribute("username", "admin");
        MockHttpServletResponse response = new MockHttpServletResponse();
        response.setStatus(200);

        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request, response));
        Object result;
        try {
            result = advice.beforeBodyWrite(
                    Map.of("value", 42),
                    null,
                    MediaType.APPLICATION_JSON,
                    null,
                    new ServletServerHttpRequest(request),
                    new ServletServerHttpResponse(response));
        } finally {
            RequestContextHolder.resetRequestAttributes();
        }

        assertThat(result).isInstanceOf(ApiEnvelope.class);
        ApiEnvelope<?> envelope = (ApiEnvelope<?>) result;
        assertThat(envelope.protocolVersion()).isEqualTo(4);
        assertThat(envelope.ok()).isTrue();
        assertThat(envelope.context())
                .containsEntry("requestId", "request-1")
                .containsEntry("tenantId", "tenant-1")
                .containsEntry("projectId", "project-1")
                .containsEntry("username", "admin");
        assertThat(envelope.event())
                .containsEntry("transport", "http")
                .containsEntry("name", "response")
                .containsEntry("terminal", true);
    }

    @Test
    void skipsTextEventStreamResponses() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/events");
        MockHttpServletResponse response = new MockHttpServletResponse();
        Map<String, Object> body = Map.of("value", 42);

        Object result = advice.beforeBodyWrite(
                body,
                null,
                MediaType.TEXT_EVENT_STREAM,
                null,
                new ServletServerHttpRequest(request),
                new ServletServerHttpResponse(response));

        assertThat(result).isSameAs(body);
    }
}
