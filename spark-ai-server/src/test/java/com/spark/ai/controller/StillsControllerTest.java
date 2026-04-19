package com.spark.ai.controller;

import com.spark.ai.stills.StillsAssistantService;
import com.spark.ai.stills.StillsOrchestrator;
import com.spark.ai.stills.StillsSessionService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(StillsController.class)
@AutoConfigureMockMvc(addFilters = false)
class StillsControllerTest {

    @Autowired
    MockMvc mockMvc;

    @MockBean
    StillsAssistantService assistantService;

    @MockBean
    StillsOrchestrator orchestrator;

    @MockBean
    StillsSessionService stillsSessionService;

    @Test
    void chatEndpoint_returnsGone() throws Exception {
        mockMvc.perform(post("/api/stills/chat")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"hello\"}"))
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.error").value("LEGACY_PROTOCOL_REMOVED"));
    }

    @Test
    void executeEndpoint_returnsGone() throws Exception {
        mockMvc.perform(post("/api/stills/execute")
                        .contentType(MediaType.TEXT_PLAIN)
                        .content("@@request:x#1\n{}\n@@end"))
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.error").value("LEGACY_PROTOCOL_REMOVED"));
    }

    @Test
    void sessionEndpoint_returnsGone() throws Exception {
        mockMvc.perform(post("/api/stills/session")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.error").value("LEGACY_PROTOCOL_REMOVED"));
    }
}
