package com.spark.ai.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.model.AiChatRequest;
import com.spark.ai.model.AiResponse;
import com.spark.ai.service.AiPageService;
import com.spark.ai.service.AiStreamService;
import com.spark.ai.service.ComponentMetadataService;
import com.spark.ai.service.PageConfigService;
import com.spark.ai.service.SseService;
import com.spark.ai.service.TenantService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.file.NoSuchFileException;
import java.util.Map;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Controller 层集成测试 — MockMvc + 模拟 Service。
 */
@WebMvcTest({ AiChatController.class, PageConfigController.class, AppConfigController.class })
@AutoConfigureMockMvc(addFilters = false)
class ControllersTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @MockBean
    AiPageService aiPageService;

    @MockBean
    AiStreamService aiStreamService;

    @MockBean
    ComponentMetadataService componentMetadataService;

    @MockBean
    PageConfigService pageConfigService;

    @MockBean
    SseService sseService;

    @MockBean
    TenantService tenantService;

    // ── AiChatController ──────────────────────────────────────────────────

    @Test
    void postAiChat_returnsAiResponse() throws Exception {
        AiResponse mockResp = new AiResponse(
                Map.of("rule.json", "[{\"type\":\"div\"}]"),
                "生成完成",
                false
        );
        when(aiPageService.processRequest(any(AiChatRequest.class))).thenReturn(mockResp);

        String body = """
                {"action":"generate","pageId":"test","prompt":"hello","sessionId":"s1"}
                """;

        mockMvc.perform(post("/api/ai/chat")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.files['rule.json']").value("[{\"type\":\"div\"}]"))
                .andExpect(jsonPath("$.explanation").value("生成完成"))
                .andExpect(jsonPath("$.needsIteration").value(false));
    }

    // ── PageConfigController: GET ──────────────────────────────────────────

    @Test
    void getFile_returnsContentAndTimestamp() throws Exception {
        when(pageConfigService.readFile("t1", "p1", "my-page", "rule.json", null))
                .thenReturn(Map.of("content", "[]", "timestamp", "2024-01-01T00:00:00Z"));

        mockMvc.perform(get("/api/tenants/t1/projects/p1/pages-config/my-page/rule.json"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").value("[]"))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    void getFile_returns404WhenNotFound() throws Exception {
        when(pageConfigService.readFile("t1", "p1", "missing", "rule.json", null))
                .thenThrow(new NoSuchFileException("not found"));

        mockMvc.perform(get("/api/tenants/t1/projects/p1/pages-config/missing/rule.json"))
                .andExpect(status().isNotFound());
    }

    @Test
    void getFile_returns400OnInvalidPageId() throws Exception {
        when(pageConfigService.readFile(eq("t1"), eq("p1"), eq(".."), anyString(), any()))
                .thenThrow(new IllegalArgumentException("无效的 pageId: .."));

        mockMvc.perform(get("/api/tenants/t1/projects/p1/pages-config/../rule.json"))
                .andExpect(status().isBadRequest());
    }

    // ── PageConfigController: PUT ─────────────────────────────────────────

    @Test
    void putFile_writesAndReturnsOk() throws Exception {
        when(pageConfigService.writeFile("t1", "p1", "pg", "rule.json", "[{\"type\":\"h1\"}]"))
                .thenReturn(Map.of("ok", true, "timestamp", "2024-01-01T00:00:00Z"));

        mockMvc.perform(put("/api/tenants/t1/projects/p1/pages-config/pg/rule.json")
                        .contentType(MediaType.TEXT_PLAIN)
                        .content("[{\"type\":\"h1\"}]"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true));
    }

    // ── PageConfigController: POST batch ──────────────────────────────────

    @Test
    void batch_writesMultipleFiles() throws Exception {
        when(pageConfigService.writeBatch(eq("t1"), eq("p1"), eq("new-pg"), any()))
                .thenReturn(Map.of("ok", true, "pageId", "new-pg",
                        "written", java.util.List.of("rule.json", "pagedata.json")));

        String filesJson = """
                {"rule.json":"[]","pagedata.json":"{}"}
                """;

        mockMvc.perform(post("/api/tenants/t1/projects/p1/pages-config/new-pg/__batch")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(filesJson))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.pageId").value("new-pg"));
    }

    // ── PageConfigController: SSE ─────────────────────────────────────────

    @Test
    void sseEvents_returnsEventStream() throws Exception {
        when(sseService.subscribe()).thenReturn(
                new org.springframework.web.servlet.mvc.method.annotation.SseEmitter(0L));

        mockMvc.perform(get("/api/events")
                        .accept(MediaType.TEXT_EVENT_STREAM))
                .andExpect(status().isOk());
    }
}
