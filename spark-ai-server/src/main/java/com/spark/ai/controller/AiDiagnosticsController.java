package com.spark.ai.controller;

import com.spark.ai.service.FcErrorReportService;
import com.spark.ai.service.SseService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/ai/debug")
public class AiDiagnosticsController {

    private final FcErrorReportService fcErrorReportService;
    private final SseService sseService;

    public AiDiagnosticsController(FcErrorReportService fcErrorReportService, SseService sseService) {
        this.fcErrorReportService = fcErrorReportService;
        this.sseService = sseService;
    }

    @PostMapping("/fc-error-report")
    public ResponseEntity<Map<String, Object>> reportFcError(
            @RequestBody(required = false) Map<String, Object> body,
            @RequestHeader(value = "X-Tenant-Id", required = false) String tenantId,
            @RequestHeader(value = "X-Project-Id", required = false) String projectId,
            HttpServletRequest request) {
        Map<String, Object> report;
        try {
            report = fcErrorReportService.record(
                    body,
                    tenantId,
                    projectId,
                    request.getHeader("User-Agent"));
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage(), ex);
        }

        sseService.emit(SseService.EVENT_DEBUG_FC_ERROR_REPORT, report);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("ok", true);
        response.put("eventType", SseService.EVENT_DEBUG_FC_ERROR_REPORT);
        response.put("reportId", report.get("reportId"));
        response.put("serverTimestamp", report.get("serverTimestamp"));
        return ResponseEntity.ok(response);
    }

    @GetMapping("/fc-error-reports")
    public ResponseEntity<Map<String, Object>> listFcErrorReports(
            @RequestParam(value = "limit", defaultValue = "100") int limit) {
        List<Map<String, Object>> reports = fcErrorReportService.listRecent(limit);
        return ResponseEntity.ok(Map.of(
                "ok", true,
                "count", reports.size(),
                "reports", reports
        ));
    }

    @DeleteMapping("/fc-error-reports")
    public ResponseEntity<Map<String, Object>> clearFcErrorReports() {
        int cleared = fcErrorReportService.clear();
        return ResponseEntity.ok(Map.of(
                "ok", true,
                "cleared", cleared
        ));
    }
}