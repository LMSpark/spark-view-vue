package com.spark.ai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.entity.PageConfigEntity;
import com.spark.ai.entity.PageFileEntity;
import com.spark.ai.repository.PageConfigRepository;
import com.spark.ai.repository.PageFileRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import java.io.IOException;
import java.nio.file.NoSuchFileException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * PageConfigService 单元测试 — 使用 H2 内嵌数据库。
 */
@DataJpaTest
class PageConfigServiceTest {

    @Autowired
    PageConfigRepository pageRepo;

    @Autowired
    PageFileRepository fileRepo;

    private PageConfigService service;
    private SseService sseService;

    private static final String T = "test-tenant";
    private static final String P = "test-project";

    @BeforeEach
    void setUp() {
        sseService = new SseService();
        service = new PageConfigService(pageRepo, fileRepo, new ObjectMapper(), sseService);
    }

    // ── readFile ──────────────────────────────────────────────────────────

    @Test
    void readFile_returnsContentAndTimestamp() throws IOException {
        seedPage(T, P, "test-page");
        seedFile(T, P, "test-page", "rule.json", "[{\"type\":\"div\"}]");

        Map<String, Object> result = service.readFile(T, P, "test-page", "rule.json", null);

        assertEquals("[{\"type\":\"div\"}]", result.get("content"));
        assertNotNull(result.get("timestamp"));
        assertNull(result.get("notModified"));
    }

    @Test
    void readFile_notModifiedWhenTimestampMatches() throws IOException {
        seedPage(T, P, "test-page");
        seedFile(T, P, "test-page", "rule.json", "[]");

        Map<String, Object> first = service.readFile(T, P, "test-page", "rule.json", null);
        String timestamp = (String) first.get("timestamp");

        Map<String, Object> result = service.readFile(T, P, "test-page", "rule.json", timestamp);

        assertEquals(true, result.get("notModified"));
        assertEquals("", result.get("content"));
    }

    @Test
    void readFile_throwsOnMissingFile() {
        assertThrows(NoSuchFileException.class, () ->
                service.readFile(T, P, "nonexistent", "rule.json", null));
    }

    @Test
    void readFile_rejectsInvalidPageId() {
        assertThrows(IllegalArgumentException.class, () ->
                service.readFile(T, P, "..", "rule.json", null));
        assertThrows(IllegalArgumentException.class, () ->
                service.readFile(T, P, "a/b", "rule.json", null));
        assertThrows(IllegalArgumentException.class, () ->
                service.readFile(T, P, "a\\b", "rule.json", null));
        assertThrows(IllegalArgumentException.class, () ->
                service.readFile(T, P, "", "rule.json", null));
    }

    @Test
    void readFile_rejectsDisallowedFilename() {
        assertThrows(IllegalArgumentException.class, () ->
                service.readFile(T, P, "page1", "hack.exe", null));
    }

    // ── writeFile ──────────────────────────────────────────────────────────

    @Test
    void writeFile_createsFileAndReturnsTimestamp() throws IOException {
        Map<String, Object> result = service.writeFile(T, P, "new-page", "rule.json", "[{\"type\":\"h1\"}]");

        assertEquals(true, result.get("ok"));
        assertNotNull(result.get("timestamp"));

        Map<String, Object> read = service.readFile(T, P, "new-page", "rule.json", null);
        assertEquals("[{\"type\":\"h1\"}]", read.get("content"));
    }

    @Test
    void writeFile_rejectsDisallowedFilename() {
        assertThrows(IllegalArgumentException.class, () ->
                service.writeFile(T, P, "page1", "malware.js", "bad"));
    }

    // ── writeBatch ────────────────────────────────────────────────────────

    @Test
    void writeBatch_writesMultipleFiles() throws IOException {
        Map<String, String> files = new LinkedHashMap<>();
        files.put("rule.json", "[]");
        files.put("pagedata.json", "{}");
        files.put("script.js", "// init");
        files.put("evil.exe", "bad");

        Map<String, Object> result = service.writeBatch(T, P, "batch-page", files);

        assertEquals(true, result.get("ok"));
        assertEquals("batch-page", result.get("pageId"));

        @SuppressWarnings("unchecked")
        List<String> written = (List<String>) result.get("written");
        assertTrue(written.contains("rule.json"));
        assertTrue(written.contains("pagedata.json"));
        assertTrue(written.contains("script.js"));
        assertFalse(written.contains("evil.exe"));
    }

    @Test
    void writeBatch_autoRegistersPageConfig() throws IOException {
        service.writeBatch(T, P, "auto-route", Map.of("rule.json", "[]"));

        assertTrue(pageRepo.existsByTenantIdAndProjectIdAndPageId(T, P, "auto-route"));

        Map<String, Object> routes = service.readRootFile(T, P, "routes.json", null);
        String content = (String) routes.get("content");
        assertTrue(content.contains("auto-route"));
    }

    @Test
    void writeBatch_rejectsInvalidPageId() {
        assertThrows(IllegalArgumentException.class, () ->
                service.writeBatch(T, P, "../escape", Map.of("rule.json", "[]")));
    }

    // ── Helper ────────────────────────────────────────────────────────────

    private void seedPage(String tenantId, String projectId, String pageId) {
        PageConfigEntity page = new PageConfigEntity();
        page.setTenantId(tenantId);
        page.setProjectId(projectId);
        page.setPageId(pageId);
        page.setTitle(pageId);
        page.setIcon("📄");
        page.setPath("/" + pageId);
        page.setRouteName(pageId);
        pageRepo.save(page);
    }

    private void seedFile(String tenantId, String projectId, String pageId,
                           String filename, String content) {
        PageFileEntity file = new PageFileEntity();
        file.setTenantId(tenantId);
        file.setProjectId(projectId);
        file.setPageId(pageId);
        file.setFilename(filename);
        file.setContent(content);
        fileRepo.save(file);
    }
}
