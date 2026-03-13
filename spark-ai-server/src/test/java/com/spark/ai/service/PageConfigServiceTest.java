package com.spark.ai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.config.PagesConfigProperties;
import com.spark.ai.entity.PageConfigEntity;
import com.spark.ai.repository.PageConfigRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * PageConfigService 单元测试 — 文件系统存储 + H2 内嵌数据库（页面元数据）。
 */
@DataJpaTest
class PageConfigServiceTest {

    @Autowired
    PageConfigRepository pageRepo;

    @TempDir
    Path tempDir;

    private PageConfigService service;
    private SseService sseService;

    private static final String T = "test-tenant";
    private static final String P = "test-project";

    @BeforeEach
    void setUp() {
        sseService = new SseService();
        PagesConfigProperties props = new PagesConfigProperties();
        props.setConfigDir(tempDir.toString());
        service = new PageConfigService(pageRepo, new ObjectMapper(), sseService, props);
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

        // 验证文件系统上真实写入
        Path fp = tempDir.resolve(T).resolve(P).resolve("new-page").resolve("rule.json");
        assertTrue(Files.isRegularFile(fp));
        assertEquals("[{\"type\":\"h1\"}]", Files.readString(fp));

        // 通过 service 读回
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

        // 验证文件系统
        Path dir = tempDir.resolve(T).resolve(P).resolve("batch-page");
        assertTrue(Files.isRegularFile(dir.resolve("rule.json")));
        assertFalse(Files.exists(dir.resolve("evil.exe")));
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

    /** 在临时文件系统目录中写入测试文件 */
    private void seedFile(String tenantId, String projectId, String pageId,
                           String filename, String content) throws IOException {
        Path dir = tempDir.resolve(tenantId).resolve(projectId).resolve(pageId);
        Files.createDirectories(dir);
        Files.writeString(dir.resolve(filename), content, StandardCharsets.UTF_8);
    }
}
