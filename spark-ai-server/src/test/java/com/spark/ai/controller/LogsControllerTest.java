package com.spark.ai.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(LogsController.class)
class LogsControllerTest {

    @Autowired
    MockMvc mockMvc;

    @Test
    void postLogs_acceptsBatchPayload() throws Exception {
        String body = """
                {
                  \"logs\": [
                    {
                      \"level\": \"info\",
                      \"message\": \"startup\",
                      \"timestamp\": 1773135101573,
                      \"pageId\": \"renderer-demo\"
                    }
                  ]
                }
                """;

        mockMvc.perform(post("/api/logs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.received").value(1));
    }
}