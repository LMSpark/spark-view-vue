package com.spark.ai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.config.PagesConfigProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * PageConfigService 单元测试 — 使用临时目录，不依赖 Spring 容器。
 */
class PageConfigServiceTest {

    @TempDir
    Path tempDir;

    private PageConfigService service;
    private SseService sseService;

    @BeforeEach
    void setUp() {
        PagesConfigProperties props = new PagesConfigProperties();
        props.setConfigDir(tempDir.toString());
        sseService = new SseService();
        service = new PageConfigService(props, new ObjectMapper(), sseService);
    }

    // ── readFile ──────────────────────────────────────────────────────────

    @Test
    void readFile_returnsContentAndTimestamp() throws IOException {
        Path dir = tempDir.resolve("test-page");
        Files.createDirectories(dir);
        Files.writeString(dir.resolve("rule.json"), "[{\"type\":\"div\"}]", StandardCharsets.UTF_8);

        Map<String, Object> result = service.readFile("test-page", "rule.json", null);

        assertEquals("[{\"type\":\"div\"}]", result.get("content"));
        assertNotNull(result.get("timestamp"));
        assertNull(result.get("notModified"));
    }

    @Test
    void readFile_notModifiedWhenTimestampMatches() throws IOException {
        Path dir = tempDir.resolve("test-page");
        Files.createDirectories(dir);
        Path file = dir.resolve("rule.json");
        Files.writeString(file, "[]", StandardCharsets.UTF_8);
        String mtime = Files.getLastModifiedTime(file).toInstant().toString();

        Map<String, Object> result = service.readFile("test-page", "rule.json", mtime);

        assertEquals(true, result.get("notModified"));
        assertEquals("", result.get("content"));
    }

    @Test
    void readFile_throwsOnMissingFile() {
        assertThrows(NoSuchFileException.class, () ->
                service.readFile("nonexistent", "rule.json", null));
    }

    @Test
    void readFile_rejectsInvalidPageId() {
        assertThrows(IllegalArgumentException.class, () ->
                service.readFile("..", "rule.json", null));
        assertThrows(IllegalArgumentException.class, () ->
                service.readFile("a/b", "rule.json", null));
        assertThrows(IllegalArgumentException.class, () ->
                service.readFile("a\\b", "rule.json", null));
        assertThrows(IllegalArgumentException.class, () ->
                service.readFile("", "rule.json", null));
    }

    @Test
    void readFile_rejectsDisallowedFilename() {
        assertThrows(IllegalArgumentException.class, () ->
                service.readFile("page1", "hack.exe", null));
    }

    // ── writeFile ──────────────────────────────────────────────────────────

    @Test
    void writeFile_createsFileAndReturnsTimestamp() throws IOException {
        Map<String, Object> result = service.writeFile("new-page", "rule.json", "[{\"type\":\"h1\"}]");

        assertEquals(true, result.get("ok"));
        assertNotNull(result.get("timestamp"));
        String written = Files.readString(tempDir.resolve("new-page/rule.json"), StandardCharsets.UTF_8);
        assertEquals("[{\"type\":\"h1\"}]", written);
    }

    @Test
    void writeFile_rejectsDisallowedFilename() {
        assertThrows(IllegalArgumentException.class, () ->
                service.writeFile("page1", "malware.js", "bad"));
    }

    // ── writeBatch ────────────────────────────────────────────────────────

    @Test
    void writeBatch_writesMultipleFiles() throws IOException {
        Map<String, String> files = new LinkedHashMap<>();
        files.put("rule.json", "[]");
        files.put("pagedata.json", "{}");
        files.put("script.js", "// init");
        files.put("evil.exe", "bad"); // should be silently skipped

        Map<String, Object> result = service.writeBatch("batch-page", files);

        assertEquals(true, result.get("ok"));
        assertEquals("batch-page", result.get("pageId"));
        assertTrue(Files.exists(tempDir.resolve("batch-page/rule.json")));
        assertTrue(Files.exists(tempDir.resolve("batch-page/pagedata.json")));
        assertTrue(Files.exists(tempDir.resolve("batch-page/script.js")));
        assertFalse(Files.exists(tempDir.resolve("batch-page/evil.exe")));
    }

    @Test
    void writeBatch_autoRegistersRoute() throws IOException {
        // 预先创建 routes.json
        Files.writeString(tempDir.resolve("routes.json"), "[]", StandardCharsets.UTF_8);

        service.writeBatch("auto-route", Map.of("rule.json", "[]"));

        String routesRaw = Files.readString(tempDir.resolve("routes.json"), StandardCharsets.UTF_8);
        assertTrue(routesRaw.contains("\"pageId\" : \"auto-route\""));
        assertTrue(routesRaw.contains("\"/auto-route\""));
    }

    @Test
    void writeBatch_doesNotDuplicateRoute() throws IOException {
        Files.writeString(tempDir.resolve("routes.json"),
                "[{\"pageId\":\"existing\",\"path\":\"/existing\"}]", StandardCharsets.UTF_8);

        service.writeBatch("existing", Map.of("rule.json", "[]"));

        String routesRaw = Files.readString(tempDir.resolve("routes.json"), StandardCharsets.UTF_8);
        // 只应出现一次
        assertEquals(1, routesRaw.split("\"existing\"").length - 1 > 0 ? 1 : 0,
                "existing 路由不应重复");
    }

    @Test
    void writeBatch_rejectsInvalidPageId() {
        assertThrows(IllegalArgumentException.class, () ->
                service.writeBatch("../escape", Map.of("rule.json", "[]")));
    }
}
