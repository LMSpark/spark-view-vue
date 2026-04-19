package com.spark.ai.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.stills.StillsSessionService;
import com.spark.ai.stills.StillsSessionService.TurnResult;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AiSessionController.class)
@AutoConfigureMockMvc(addFilters = false)
class AiSessionControllerTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @MockBean
    StillsSessionService sessionService;

    @Test
    void createSession_requiresProtocolV3() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "systemPrompt", "sys",
                "userPrompt", "user",
                "windowSize", 30
        ));

        mockMvc.perform(post("/api/ai/sessions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("INVALID_PROTOCOL_VERSION"))
                .andExpect(jsonPath("$.error.category").value("request-validation"))
                .andExpect(jsonPath("$.error.message").value("仅支持 protocolVersion=3"))
                .andExpect(jsonPath("$.protocolVersion").value(3));

        verify(sessionService, never()).createSession(anyString(), anyString(), anyInt(), anyList(), anyString());
    }

    @Test
    void createSession_acceptsProtocolV3() throws Exception {
        when(sessionService.createSession(anyString(), anyString(), anyInt(), anyList(), anyString()))
                .thenReturn("sid-1");

        String body = objectMapper.writeValueAsString(Map.of(
                "protocolVersion", 3,
                "systemPrompt", "sys",
                "userPrompt", "user",
                "windowSize", 30,
                "mode", "stills",
                "tools", List.of()
        ));

        mockMvc.perform(post("/api/ai/sessions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sessionId").value("sid-1"))
                .andExpect(jsonPath("$.protocolVersion").value(3));
    }

    @Test
    void executeTurn_requiresProtocolV3() throws Exception {
        mockMvc.perform(post("/api/ai/sessions/sid-1/turn")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("INVALID_PROTOCOL_VERSION"))
                .andExpect(jsonPath("$.error.category").value("request-validation"))
                .andExpect(jsonPath("$.error.message").value("仅支持 protocolVersion=3"))
                .andExpect(jsonPath("$.protocolVersion").value(3));

        verify(sessionService, never()).executeTurn(anyString());
    }

    @Test
    void append_requiresProtocolV3() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "messages", List.of(Map.of("role", "tool", "content", "{}"))
        ));

        mockMvc.perform(post("/api/ai/sessions/sid-1/append")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("INVALID_PROTOCOL_VERSION"))
                .andExpect(jsonPath("$.error.category").value("request-validation"))
                .andExpect(jsonPath("$.error.message").value("仅支持 protocolVersion=3"))
                .andExpect(jsonPath("$.protocolVersion").value(3));

        verify(sessionService, never()).appendMessage(eq("sid-1"), anyString(), anyString(), anyString(), anyList());
    }

    @Test
    void executeTurn_withProtocolV3_returnsPayload() throws Exception {
        when(sessionService.executeTurn("sid-2"))
                .thenReturn(new TurnResult("ok", null, null));

        String body = objectMapper.writeValueAsString(Map.of("protocolVersion", 3));

        mockMvc.perform(post("/api/ai/sessions/sid-2/turn")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.text").value("ok"))
                .andExpect(jsonPath("$.protocolVersion").value(3));
    }

        @Test
        void executeTurn_llmCallFailed_returnsErrorEnvelope() throws Exception {
                when(sessionService.executeTurn("sid-3"))
                                .thenReturn(TurnResult.error("FAILED", "CALL->FAILED", "LLM_CALL_FAILED", null));

                String body = objectMapper.writeValueAsString(Map.of("protocolVersion", 3));

                mockMvc.perform(post("/api/ai/sessions/sid-3/turn")
                                                .contentType(MediaType.APPLICATION_JSON)
                                                .content(body))
                                .andExpect(status().isBadGateway())
                                .andExpect(jsonPath("$.error.code").value("LLM_CALL_FAILED"))
                                .andExpect(jsonPath("$.error.retryPolicy").value("safe-retry"))
                                .andExpect(jsonPath("$.state").value("FAILED"));
        }

                    @Test
                    void executeTurn_success_includesRuntimeMeta() throws Exception {
                        Map<String, Object> runtime = Map.of(
                                "round", 1,
                                "scheduling", Map.of(
                                        "strategy", "conflict-aware",
                                        "collisionScope", "domain+entity",
                                        "classificationStrategy", "action-rule-object+runtime-fallback",
                                        "ruleMatchStrategy", "exact-first-prefix-second-fallback",
                                        "dominantRuleSource", "exact"
                                ),
                                "idempotency", List.of(Map.of("toolCallId", "call_1", "replayed", false, "ruleSource", "exact"))
                        );
                        when(sessionService.executeTurn("sid-4"))
                                .thenReturn(new TurnResult("ok", null, null, "READY", "VERIFY->DONE", null, null, runtime));

                        String body = objectMapper.writeValueAsString(Map.of("protocolVersion", 3));

                        mockMvc.perform(post("/api/ai/sessions/sid-4/turn")
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(body))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.runtime.round").value(1))
                                .andExpect(jsonPath("$.runtime.scheduling.strategy").value("conflict-aware"))
                                .andExpect(jsonPath("$.runtime.scheduling.collisionScope").value("domain+entity"))
                                .andExpect(jsonPath("$.runtime.scheduling.classificationStrategy").value("action-rule-object+runtime-fallback"))
                                .andExpect(jsonPath("$.runtime.scheduling.ruleMatchStrategy").value("exact-first-prefix-second-fallback"))
                                .andExpect(jsonPath("$.runtime.scheduling.dominantRuleSource").value("exact"))
                                .andExpect(jsonPath("$.runtime.idempotency[0].ruleSource").value("exact"))
                                .andExpect(jsonPath("$.runtime.idempotency[0].toolCallId").value("call_1"));
                    }

                    @Test
                    void executeTurn_idempotencyReplayBlocked_returnsConflictEnvelope() throws Exception {
                        Map<String, Object> runtime = Map.of(
                                "guard", Map.of(
                                        "blocked", true,
                                        "reasonCode", "IDEMPOTENCY_REPLAY_BLOCKED",
                                        "details", List.of(Map.of("toolCallId", "call_dup"))
                                )
                        );
                        when(sessionService.executeTurn("sid-5"))
                                .thenReturn(TurnResult.error(
                                        "FAILED",
                                        "CALL->FAILED",
                                        "IDEMPOTENCY_REPLAY_BLOCKED",
                                        null,
                                        runtime));

                        String body = objectMapper.writeValueAsString(Map.of("protocolVersion", 3));

                        mockMvc.perform(post("/api/ai/sessions/sid-5/turn")
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(body))
                                .andExpect(status().isConflict())
                                .andExpect(jsonPath("$.error.category").value("idempotency"))
                                .andExpect(jsonPath("$.error.retryPolicy").value("regenerate-plan"))
                                .andExpect(jsonPath("$.runtime.guard.reasonCode").value("IDEMPOTENCY_REPLAY_BLOCKED"));
                    }

                    @Test
                    void executeTurn_parallelWriteBlocked_returnsParallelismEnvelope() throws Exception {
                        Map<String, Object> runtime = Map.of(
                                "guard", Map.of(
                                        "blocked", true,
                                        "reasonCode", "PARALLEL_WRITE_NOT_ALLOWED_STAGE1",
                                        "details", List.of(Map.of("groupIndex", 0, "parallelWidth", 2))
                                ),
                                "scheduling", Map.of("decision", "block")
                        );
                        when(sessionService.executeTurn("sid-6"))
                                .thenReturn(TurnResult.error(
                                        "FAILED",
                                        "CALL->FAILED",
                                        "PARALLEL_WRITE_NOT_ALLOWED_STAGE1",
                                        null,
                                        runtime));

                        String body = objectMapper.writeValueAsString(Map.of("protocolVersion", 3));

                        mockMvc.perform(post("/api/ai/sessions/sid-6/turn")
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(body))
                                .andExpect(status().isConflict())
                                .andExpect(jsonPath("$.error.category").value("parallelism"))
                                .andExpect(jsonPath("$.error.retryPolicy").value("serialize-or-split"))
                                .andExpect(jsonPath("$.runtime.scheduling.decision").value("block"));
                    }

                                        @Test
                                        void executeTurn_sessionNotFound_returnsSessionEnvelope() throws Exception {
                                                when(sessionService.executeTurn("sid-missing")).thenReturn(null);

                                                String body = objectMapper.writeValueAsString(Map.of("protocolVersion", 3));

                                                mockMvc.perform(post("/api/ai/sessions/sid-missing/turn")
                                                                                .contentType(MediaType.APPLICATION_JSON)
                                                                                .content(body))
                                                                .andExpect(status().isNotFound())
                                                                .andExpect(jsonPath("$.error.code").value("SESSION_NOT_FOUND"))
                                                                .andExpect(jsonPath("$.error.category").value("session"))
                                                                .andExpect(jsonPath("$.error.retryPolicy").value("recreate-session"))
                                                                .andExpect(jsonPath("$.sessionId").value("sid-missing"))
                                                                .andExpect(jsonPath("$.protocolVersion").value(3));
                                        }
}
