package com.spark.ai.api;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ApiResponseFactoryTest {

    @Test
    void okCreatesV4HttpEnvelope() {
        ApiEnvelope<Map<String, Object>> envelope = ApiResponseFactory.ok(Map.of("value", 42), "request-1");

        assertThat(envelope.protocolVersion()).isEqualTo(4);
        assertThat(envelope.ok()).isTrue();
        assertThat(envelope.data()).containsEntry("value", 42);
        assertThat(envelope.error()).isNull();
        assertThat(envelope.context()).containsEntry("requestId", "request-1");
        assertThat(envelope.event())
                .containsEntry("transport", "http")
                .containsEntry("name", "response")
                .containsEntry("terminal", true);
    }

    @Test
    void errorCreatesV4HttpEnvelopeWithUnifiedError() {
        ApiEnvelope<Object> envelope = ApiResponseFactory.error(
                HttpStatus.CONFLICT,
                "SESSION_SCOPE_MISMATCH",
                "scope mismatch",
                "session-scope",
                "recreate-session",
                Map.of("sessionId", "session-1"),
                "request-err");

        assertThat(envelope.protocolVersion()).isEqualTo(4);
        assertThat(envelope.ok()).isFalse();
        assertThat(envelope.data()).isNull();
        assertThat(envelope.context()).containsEntry("requestId", "request-err");
        assertThat(envelope.error()).isNotNull();
        assertThat(envelope.error().code()).isEqualTo("SESSION_SCOPE_MISMATCH");
        assertThat(envelope.error().message()).isEqualTo("scope mismatch");
        assertThat(envelope.error().category()).isEqualTo("session-scope");
        assertThat(envelope.error().severity()).isEqualTo("error");
        assertThat(envelope.error().retryPolicy()).isEqualTo("recreate-session");
        assertThat(envelope.error().details()).containsEntry("sessionId", "session-1");
    }

    @Test
    @SuppressWarnings("unchecked")
    void sseOkCreatesV4EnvelopeWithSessionTurnAndStreamContext() {
        Map<String, Object> context = ApiResponseFactory.aiStreamContext(
                "session-1",
                "turn-1",
                "module::instance::turn-1",
                1,
                0,
                "llm-stream",
                "module::instance::turn-1::llm-stream",
                Map.of("moduleId", "module", "moduleInstanceId", "instance", "instanceId", "instance"));

        ApiEnvelope<Map<String, Object>> envelope = ApiResponseFactory.sseOk(
                "delta",
                Map.of("delta", "hi"),
                "request-sse",
                context,
                false);

        assertThat(envelope.protocolVersion()).isEqualTo(4);
        assertThat(envelope.ok()).isTrue();
        assertThat(envelope.data()).containsEntry("delta", "hi");
        assertThat(envelope.event())
                .containsEntry("transport", "sse")
                .containsEntry("name", "delta")
                .containsEntry("terminal", false);

        Map<String, Object> session = (Map<String, Object>) envelope.context().get("session");
        Map<String, Object> turn = (Map<String, Object>) envelope.context().get("turn");
        Map<String, Object> stream = (Map<String, Object>) envelope.context().get("stream");
        Map<String, Object> scope = (Map<String, Object>) envelope.context().get("scope");

        assertThat(session).containsEntry("sessionId", "session-1");
        assertThat(turn)
                .containsEntry("turnId", "turn-1")
                .containsEntry("turnKey", "module::instance::turn-1")
                .containsEntry("seq", 1)
                .containsEntry("baseRevision", 0);
        assertThat(stream)
                .containsEntry("streamId", "llm-stream")
                .containsEntry("streamKey", "module::instance::turn-1::llm-stream");
        assertThat(scope)
                .containsEntry("moduleId", "module")
                .containsEntry("moduleInstanceId", "instance")
                .containsEntry("instanceId", "instance");
    }
}
