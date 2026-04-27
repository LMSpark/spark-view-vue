package com.spark.ai.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static java.nio.file.StandardOpenOption.APPEND;
import static java.nio.file.StandardOpenOption.CREATE;
import static java.nio.file.StandardOpenOption.TRUNCATE_EXISTING;

@Service
public class FcErrorReportService {

    private static final int MAX_RECENT_REPORTS = 200;

    private final ObjectMapper objectMapper;
    private final Path reportFile;
    private final Deque<Map<String, Object>> recentReports = new ArrayDeque<>();

    public FcErrorReportService(
            ObjectMapper objectMapper,
            @Value("${spark.pages.config-dir:./data/pages-config}") String pagesConfigDir) {
        this.objectMapper = objectMapper;
        this.reportFile = resolveReportFile(pagesConfigDir);
    }

    public synchronized Map<String, Object> record(
            Map<String, Object> body,
            String tenantHeader,
            String projectHeader,
            String userAgent) {
        validateReport(body);

        long serverTimestamp = System.currentTimeMillis();
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("reportId", UUID.randomUUID().toString());
        report.put("serverTimestamp", serverTimestamp);
        report.put("receivedAt", Instant.ofEpochMilli(serverTimestamp).toString());
        putIfText(report, "tenantId", tenantHeader);
        putIfText(report, "projectId", projectHeader);
        putIfText(report, "userAgent", userAgent);
        report.put("payload", new LinkedHashMap<>(body));

        appendToFile(report);
        recentReports.addLast(report);
        while (recentReports.size() > MAX_RECENT_REPORTS) {
            recentReports.removeFirst();
        }

        return report;
    }

    public synchronized List<Map<String, Object>> listRecent(int limit) {
        int safeLimit = Math.max(1, Math.min(limit, MAX_RECENT_REPORTS));
        List<Map<String, Object>> reports = new ArrayList<>(recentReports);
        Collections.reverse(reports);
        if (reports.size() <= safeLimit) {
            return reports;
        }
        return new ArrayList<>(reports.subList(0, safeLimit));
    }

    public synchronized int clear() {
        int count = recentReports.size();
        recentReports.clear();
        try {
            Files.createDirectories(reportFile.getParent());
            Files.writeString(reportFile, "", CREATE, TRUNCATE_EXISTING);
        } catch (IOException e) {
            throw new IllegalStateException("FC_ERROR_REPORT_CLEAR_FAILED: " + e.getMessage(), e);
        }
        return count;
    }

    public Path getReportFile() {
        return reportFile;
    }

    private static Path resolveReportFile(String pagesConfigDir) {
        Path configDir = Paths.get(pagesConfigDir).toAbsolutePath().normalize();
        Path dataDir = configDir.getParent() != null ? configDir.getParent() : configDir;
        return dataDir.resolve("diagnostics").resolve("fc-error-reports.jsonl");
    }

    private void validateReport(Map<String, Object> body) {
        if (body == null || body.isEmpty()) {
            throw new IllegalArgumentException("FC_ERROR_REPORT_EMPTY");
        }

        Object fcCallValue = body.get("fcCall");
        if (!(fcCallValue instanceof Map<?, ?> fcCall)) {
            throw new IllegalArgumentException("FC_ERROR_REPORT_MISSING_FC_CALL");
        }

        Object toolNameValue = fcCall.get("toolName");
        if (!(toolNameValue instanceof String toolName) || toolName.isBlank()) {
            throw new IllegalArgumentException("FC_ERROR_REPORT_MISSING_TOOL_NAME");
        }

        Object statusValue = fcCall.get("status");
        if (!"error".equals(statusValue)) {
            throw new IllegalArgumentException("FC_ERROR_REPORT_REQUIRES_ERROR_STATUS");
        }

        Object errorValue = fcCall.get("error");
        boolean hasErrorText = errorValue instanceof String errorText && !errorText.isBlank();
        if (!hasErrorText && !fcCall.containsKey("result")) {
            throw new IllegalArgumentException("FC_ERROR_REPORT_MISSING_ERROR_DETAIL");
        }
    }

    private void appendToFile(Map<String, Object> report) {
        try {
            Files.createDirectories(reportFile.getParent());
            Files.writeString(reportFile, toJsonLine(report), CREATE, APPEND);
        } catch (IOException e) {
            throw new IllegalStateException("FC_ERROR_REPORT_WRITE_FAILED: " + e.getMessage(), e);
        }
    }

    private String toJsonLine(Map<String, Object> report) throws JsonProcessingException {
        return objectMapper.writeValueAsString(report) + System.lineSeparator();
    }

    private static void putIfText(Map<String, Object> target, String key, String value) {
        if (value != null && !value.isBlank()) {
            target.put(key, value);
        }
    }
}