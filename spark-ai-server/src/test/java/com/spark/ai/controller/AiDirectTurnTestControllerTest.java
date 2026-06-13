package com.spark.ai.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.service.AiSessionService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AiDirectTurnTestController.class)
@AutoConfigureMockMvc(addFilters = false)
class AiDirectTurnTestControllerTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @MockBean
    AiSessionService sessionService;

    @Test
    void directTurnCreatesSessionAndReturnsToolCallsWithoutSse() throws Exception {
        when(sessionService.createSession(
                anyString(),
                anyList(),
                anyInt(),
                any(),
                eq("function"),
                any(),
                anyBoolean(),
                any()))
                .thenReturn("session-1");
        when(sessionService.executeTurn(eq("session-1"), any(), anyList()))
                .thenReturn(new AiSessionService.TurnResult(
                        "",
                        null,
                        List.of(Map.of(
                                "id", "call_1",
                                "type", "function",
                                "function", Map.of(
                                        "name", "model_script",
                                        "arguments", "{\"script\":\"return this.child.readLabel({ prefix: \\\"created\\\" })\"}"))),
                        "READY",
                        "VERIFY->DONE",
                        null,
                        null,
                        null));

        Map<String, Object> request = Map.of(
                "systemPrompt", "ClassModel prompt",
                "messages", List.of(Map.of("role", "user", "content", "Use the guide.")),
                "tools", List.of(Map.of(
                        "type", "function",
                        "function", Map.of(
                                "name", "model_script",
                                "description", "Execute model script.",
                                "parameters", Map.of(
                                        "type", "object",
                                        "properties", Map.of("script", Map.of("type", "string")),
                                        "required", List.of("script"))))),
                "scope", Map.of(
                        "moduleId", "runtimeParent",
                        "moduleInstanceId", "runtime-parent-1",
                        "instanceId", "runtime-parent-1"));

        mockMvc.perform(post("/api/ai/test/direct-turn")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.sessionId").value("session-1"))
                .andExpect(jsonPath("$.data.toolCalls[0].function.name").value("model_script"))
                .andExpect(jsonPath("$.data.state").value("READY"));
    }

    @Test
    void directTurnRequiresMessagesOrTurnMessages() throws Exception {
        mockMvc.perform(post("/api/ai/test/direct-turn")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "systemPrompt", "ClassModel prompt"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("MISSING_REQUIRED_FIELD"));
    }
}
