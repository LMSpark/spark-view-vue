package com.spark.ai.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
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
                        .content("legacy-request"))
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
