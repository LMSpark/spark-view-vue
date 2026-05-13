package com.spark.ai.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.service.AiSessionService;
import com.spark.ai.service.AiSessionService.AppendMessageResult;
import com.spark.ai.service.AiSessionService.TurnResult;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

import static org.mockito.ArgumentMatchers.*;
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
    AiSessionService sessionService;

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

                verify(sessionService, never()).createSession(anyString(), anyString(), anyInt(), anyList(), anyString(), nullable(Map.class), anyBoolean());
                verify(sessionService, never()).createSession(anyString(), anyList(), anyInt(), anyList(), anyString(), nullable(Map.class), anyBoolean());
    }

    @Test
    void createSession_acceptsProtocolV3() throws Exception {
                when(sessionService.createSession(anyString(), anyString(), anyInt(), nullable(List.class), anyString(), nullable(Map.class), anyBoolean(), nullable(String.class)))
                .thenReturn("sid-1");

        String body = objectMapper.writeValueAsString(Map.of(
                "protocolVersion", 3,
                "systemPrompt", "sys",
                "userPrompt", "user",
                "windowSize", 30,
                "mode", "function",
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
    void createSession_acceptsProtocolV3MessagesAndReuseFlag() throws Exception {
        when(sessionService.createSession(anyString(), anyList(), anyInt(), nullable(List.class), anyString(), nullable(Map.class), eq(false), nullable(String.class)))
                .thenReturn("sid-msg");

        String body = objectMapper.writeValueAsString(Map.of(
                "protocolVersion", 3,
                "systemPrompt", "sys",
                "messages", List.of(Map.of("role", "user", "content", "我要请假")),
                "windowSize", 30,
                "mode", "function",
                "tools", List.of(),
                "reuseScopeSession", false
        ));

        mockMvc.perform(post("/api/ai/sessions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sessionId").value("sid-msg"))
                .andExpect(jsonPath("$.protocolVersion").value(3));

        verify(sessionService).createSession(anyString(), anyList(), anyInt(), nullable(List.class), anyString(), nullable(Map.class), eq(false), nullable(String.class));
    }

    @Test
    void createSession_forwardsScope() throws Exception {
        when(sessionService.createSession(anyString(), anyString(), anyInt(), nullable(List.class), anyString(), anyMap(), anyBoolean(), nullable(String.class)))
                .thenReturn("sid-scoped");

        String body = objectMapper.writeValueAsString(Map.of(
                "protocolVersion", 3,
                "systemPrompt", "sys",
                "userPrompt", "user",
                "scope", Map.of(
                        "moduleId", "pageDesign",
                        "moduleInstanceId", "page-a",
                        "instanceId", "page-a",
                        "runtimeInstanceId", "page-a"
                )
        ));

        mockMvc.perform(post("/api/ai/sessions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sessionId").value("sid-scoped"))
                .andExpect(jsonPath("$.scope.moduleId").value("pageDesign"))
                .andExpect(jsonPath("$.scope.moduleInstanceId").value("page-a"));
    }

    @Test
    void createSession_acceptsFrontendSessionIdWithoutInitialMessages() throws Exception {
        when(sessionService.createSession(anyString(), nullable(String.class), anyInt(), nullable(List.class), anyString(), anyMap(), eq(false), eq("manualLeave:draft-1")))
                .thenReturn("manualLeave:draft-1");

        String body = objectMapper.writeValueAsString(Map.of(
                "protocolVersion", 3,
                "sessionId", "manualLeave:draft-1",
                "systemPrompt", "sys",
                "messages", List.of(),
                "tools", List.of(),
                "mode", "function",
                "reuseScopeSession", false,
                "scope", Map.of(
                        "moduleId", "manualLeave",
                        "moduleInstanceId", "draft-1",
                        "instanceId", "manualLeave:draft-1",
                        "runtimeInstanceId", "manualLeave:draft-1"
                )
        ));

        mockMvc.perform(post("/api/ai/sessions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sessionId").value("manualLeave:draft-1"))
                .andExpect(jsonPath("$.protocolVersion").value(3));
    }

    @Test
    void executeTurnStream_forwardsScopeTurnAndStreamKey() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "protocolVersion", 3,
                "scope", Map.of(
                        "moduleId", "manualLeave",
                        "moduleInstanceId", "leave-1"
                ),
                "turn", Map.of(
                        "turnId", "turn-1",
                        "streamKey", "sk-1"
                ),
                "messages", List.of(Map.of("role", "user", "content", "leave request"))
        ));

        mockMvc.perform(post("/api/ai/sessions/sid-stream/turn/stream")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk());

        verify(sessionService).executeTurnStream(
                eq("sid-stream"),
                any(),
                anyMap(),
                eq("turn-1"),
                eq("sk-1"),
                argThat(messages -> messages != null
                        && messages.size() == 1
                        && "leave request".equals(messages.get(0).get("content"))),
                nullable(String.class),
                eq(30),
                nullable(List.class),
                eq("function"));
    }

    @Test
    void executeTurnStream_parallelTurnRequestsForwardIndependentTurnIds() throws Exception {
        String bodyA = streamTurnBody("turn-a", "parallel A");
        String bodyB = streamTurnBody("turn-b", "parallel B");

        CompletableFuture<Void> requestA = CompletableFuture.runAsync(() ->
                performStreamTurn("sid-parallel", bodyA));
        CompletableFuture<Void> requestB = CompletableFuture.runAsync(() ->
                performStreamTurn("sid-parallel", bodyB));

        CompletableFuture.allOf(requestA, requestB).join();

        verify(sessionService).executeTurnStream(
                eq("sid-parallel"),
                any(),
                anyMap(),
                eq("turn-a"),
                isNull(),
                argThat(messages -> messages != null
                        && messages.size() == 1
                        && "parallel A".equals(messages.get(0).get("content"))),
                nullable(String.class),
                eq(30),
                nullable(List.class),
                eq("function"));
        verify(sessionService).executeTurnStream(
                eq("sid-parallel"),
                any(),
                anyMap(),
                eq("turn-b"),
                isNull(),
                argThat(messages -> messages != null
                        && messages.size() == 1
                        && "parallel B".equals(messages.get(0).get("content"))),
                nullable(String.class),
                eq(30),
                nullable(List.class),
                eq("function"));
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

        verify(sessionService, never()).executeTurn(anyString(), nullable(Map.class), nullable(List.class));
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

        verify(sessionService, never()).appendMessage(eq("sid-1"), anyString(), anyString(), anyString(), nullable(List.class), nullable(Map.class));
    }

    @Test
    void append_scopeMismatchReturnsConflict() throws Exception {
        when(sessionService.appendMessage(eq("sid-1"), anyString(), anyString(), nullable(String.class), nullable(List.class), anyMap()))
                .thenReturn(AppendMessageResult.SCOPE_MISMATCH);

        String body = objectMapper.writeValueAsString(Map.of(
                "protocolVersion", 3,
                "scope", Map.of("moduleId", "pageDesign", "moduleInstanceId", "page-b"),
                "messages", List.of(Map.of("role", "user", "content", "next"))
        ));

        mockMvc.perform(post("/api/ai/sessions/sid-1/append")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("SESSION_SCOPE_MISMATCH"))
                .andExpect(jsonPath("$.error.category").value("session-scope"));
    }

    @Test
    void appendTurnMessages_returnsSessionAndTurnId() throws Exception {
        when(sessionService.appendMessage(eq("sid-1"), anyString(), anyString(), nullable(String.class), nullable(List.class), anyMap()))
                .thenReturn(AppendMessageResult.OK);

        String body = objectMapper.writeValueAsString(Map.of(
                "protocolVersion", 3,
                "scope", Map.of("moduleId", "manualLeave", "moduleInstanceId", "draft-1"),
                "turn", Map.of("turnId", "turn-append-1"),
                "messages", List.of(Map.of("role", "assistant", "content", "done"))
        ));

        mockMvc.perform(post("/api/ai/sessions/sid-1/turn/append")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.sessionId").value("sid-1"))
                .andExpect(jsonPath("$.turnId").value("turn-append-1"))
                .andExpect(jsonPath("$.protocolVersion").value(3));
    }

    @Test
    void executeTurn_withProtocolV3_returnsPayload() throws Exception {
        when(sessionService.executeTurn(eq("sid-2"), nullable(Map.class), nullable(List.class)))
                .thenReturn(new TurnResult("ok", null, null));

        String body = objectMapper.writeValueAsString(Map.of("protocolVersion", 3));

        mockMvc.perform(post("/api/ai/sessions/sid-2/turn")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.text").value("ok"))
                .andExpect(jsonPath("$.sessionId").value("sid-2"))
                .andExpect(jsonPath("$.protocolVersion").value(3));
    }

    @Test
    void executeTurn_scopeMismatchReturnsConflict() throws Exception {
        when(sessionService.executeTurn(eq("sid-scope"), anyMap(), nullable(List.class)))
                .thenReturn(TurnResult.error("READY", null, "SESSION_SCOPE_MISMATCH", Map.of(
                        "reasonCode", "SESSION_SCOPE_MISMATCH"
                )));

        String body = objectMapper.writeValueAsString(Map.of(
                "protocolVersion", 3,
                "scope", Map.of("moduleId", "pageDesign", "moduleInstanceId", "page-b")
        ));

        mockMvc.perform(post("/api/ai/sessions/sid-scope/turn")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("SESSION_SCOPE_MISMATCH"))
                .andExpect(jsonPath("$.error.category").value("session-scope"))
                .andExpect(jsonPath("$.handoff.reasonCode").value("SESSION_SCOPE_MISMATCH"));
    }

        @Test
        void executeTurn_llmCallFailed_returnsErrorEnvelope() throws Exception {
                when(sessionService.executeTurn(eq("sid-3"), nullable(Map.class), nullable(List.class)))
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
                        when(sessionService.executeTurn(eq("sid-4"), nullable(Map.class), nullable(List.class)))
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
                        when(sessionService.executeTurn(eq("sid-5"), nullable(Map.class), nullable(List.class)))
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
                                .andExpect(jsonPath("$.error.message").value("AI 生成了重复的工具调用，已阻止执行，请重新生成计划"))
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
                        when(sessionService.executeTurn(eq("sid-6"), nullable(Map.class), nullable(List.class)))
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
                                .andExpect(jsonPath("$.error.message").value("AI 本轮包含并行写入计划，请改为串行或拆分执行"))
                                .andExpect(jsonPath("$.error.retryPolicy").value("serialize-or-split"))
                                .andExpect(jsonPath("$.runtime.scheduling.decision").value("block"));
                    }

                                        @Test
                                        void executeTurn_sessionNotFound_returnsSessionEnvelope() throws Exception {
                                                when(sessionService.executeTurn(eq("sid-missing"), nullable(Map.class), nullable(List.class))).thenReturn(null);

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

    private String streamTurnBody(String turnId, String content) throws Exception {
        return objectMapper.writeValueAsString(Map.of(
                "protocolVersion", 3,
                "scope", Map.of(
                        "moduleId", "manualLeave",
                        "moduleInstanceId", "leave-1"
                ),
                "turn", Map.of(
                        "turnId", turnId
                ),
                "messages", List.of(Map.of("role", "user", "content", content))
        ));
    }

    private void performStreamTurn(String sessionId, String body) {
        try {
            mockMvc.perform(post("/api/ai/sessions/" + sessionId + "/turn/stream")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().isOk());
        } catch (Exception error) {
            throw new RuntimeException(error);
        }
    }
}
