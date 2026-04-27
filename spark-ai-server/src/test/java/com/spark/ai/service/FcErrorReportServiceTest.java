package com.spark.ai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FcErrorReportServiceTest {

    @TempDir
    Path tempDir;

    private FcErrorReportService createService() {
        return new FcErrorReportService(new ObjectMapper(), tempDir.resolve("pages-config").toString());
    }

    @Test
    void recordsErrorReportToJsonlAndRecentBuffer() throws Exception {
        FcErrorReportService service = createService();

        Map<String, Object> report = service.record(Map.of(
                "source", "test",
                "fcCall", Map.of(
                        "toolName", "catalog.query",
                        "status", "error",
                        "error", "INVALID_CATEGORY"
                )
        ), "tenant-a", "project-a", "JUnit");

        assertNotNull(report.get("reportId"));
        assertEquals("tenant-a", report.get("tenantId"));
        assertEquals(1, service.listRecent(10).size());
        assertTrue(Files.exists(service.getReportFile()));
        assertTrue(Files.readString(service.getReportFile()).contains("INVALID_CATEGORY"));
    }

    @Test
    void rejectsNonErrorFcCallReports() {
        FcErrorReportService service = createService();

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () -> service.record(Map.of(
                "source", "test",
                "fcCall", Map.of(
                        "toolName", "catalog.query",
                        "status", "success",
                        "result", Map.of("count", 1)
                )
        ), null, null, null));

        assertEquals("FC_ERROR_REPORT_REQUIRES_ERROR_STATUS", error.getMessage());
    }

    @Test
    void clearsRecentBufferAndJsonlFile() throws Exception {
        FcErrorReportService service = createService();
        service.record(Map.of(
                "source", "test",
                "fcCall", Map.of(
                        "toolName", "catalog.query",
                        "status", "error",
                        "error", "boom"
                )
        ), null, null, null);

        int cleared = service.clear();

        assertEquals(1, cleared);
        assertEquals(0, service.listRecent(10).size());
        assertEquals("", Files.readString(service.getReportFile()));
    }
}