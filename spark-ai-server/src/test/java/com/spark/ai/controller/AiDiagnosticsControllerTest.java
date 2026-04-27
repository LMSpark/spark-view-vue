package com.spark.ai.controller;

import com.spark.ai.service.FcErrorReportService;
import com.spark.ai.service.SseService;
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
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AiDiagnosticsController.class)
@AutoConfigureMockMvc(addFilters = false)
class AiDiagnosticsControllerTest {

    @Autowired
    MockMvc mockMvc;

    @MockBean
    FcErrorReportService fcErrorReportService;

    @MockBean
    SseService sseService;

    @Test
    void reportFcErrorStoresAndBroadcastsDiagnosticEvent() throws Exception {
        Map<String, Object> report = Map.of(
                "reportId", "report-1",
                "serverTimestamp", 1777250000000L,
                "payload", Map.of("source", "test")
        );
        when(fcErrorReportService.record(any(), eq("tenant-a"), eq("project-a"), eq("JUnit")))
                .thenReturn(report);

        mockMvc.perform(post("/api/ai/debug/fc-error-report")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-Tenant-Id", "tenant-a")
                        .header("X-Project-Id", "project-a")
                        .header("User-Agent", "JUnit")
                        .content("{\"source\":\"test\",\"fcCall\":{\"toolName\":\"catalog.query\",\"status\":\"error\",\"error\":\"boom\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.eventType").value(SseService.EVENT_DEBUG_FC_ERROR_REPORT))
                .andExpect(jsonPath("$.reportId").value("report-1"));

        verify(sseService).emit(SseService.EVENT_DEBUG_FC_ERROR_REPORT, report);
    }

    @Test
    void listFcErrorReportsReturnsRecentReports() throws Exception {
        when(fcErrorReportService.listRecent(5)).thenReturn(List.of(Map.of("reportId", "report-1")));

        mockMvc.perform(get("/api/ai/debug/fc-error-reports").param("limit", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.count").value(1))
                .andExpect(jsonPath("$.reports[0].reportId").value("report-1"));
    }

    @Test
    void clearFcErrorReportsReturnsClearedCount() throws Exception {
        when(fcErrorReportService.clear()).thenReturn(2);

        mockMvc.perform(delete("/api/ai/debug/fc-error-reports"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.cleared").value(2));
    }
}