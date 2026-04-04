package com.spark.ai.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.config.PagesConfigProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PageConfigServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @TempDir
    Path tempDir;

    @Test
    void createPage_writesCurrentVersionMeta() throws Exception {
        PageConfigService service = createService();

        Map<String, Object> result = service.createPage("t1", "p1", "demo-page", "演示页面", "Document");
        Path metaPath = tempDir.resolve("t1").resolve("p1").resolve("demo-page").resolve("__page-meta.json");
        Map<String, Object> meta = readMeta(metaPath);

        assertEquals(true, result.get("ok"));
        assertEquals(1, result.get("currentVersion"));
        assertEquals(1, meta.get("currentVersion"));
        assertEquals("demo-page", meta.get("pageId"));
        assertEquals(List.of("pagedata.json", "rule.json", "script.js", "style.css"), meta.get("currentFiles"));
    }

    @Test
    void writeBatch_incrementsCurrentVersionAndExposesItInList() throws Exception {
        PageConfigService service = createService();
        service.createPage("t1", "p1", "demo-page", "演示页面", "Document");

        Map<String, Object> writeResult = service.writeBatch(
                "t1",
                "p1",
                "demo-page",
                Map.of(
                        "rule.json", "[{\"type\":\"div\"}]",
                        "pagedata.json", "{\"version\":2}"
                )
        );
        Map<String, Object> pageFile = service.readFile("t1", "p1", "demo-page", "rule.json", null);
        List<Map<String, Object>> pages = service.listPages("t1", "p1");
        Map<String, Object> listedPage = pages.get(0);
        Path metaPath = tempDir.resolve("t1").resolve("p1").resolve("demo-page").resolve("__page-meta.json");
        Map<String, Object> meta = readMeta(metaPath);

        assertEquals(2, writeResult.get("currentVersion"));
        assertEquals(2, pageFile.get("currentVersion"));
        assertEquals(2, listedPage.get("currentVersion"));
        assertEquals(2, meta.get("currentVersion"));
        assertEquals(List.of("pagedata.json", "rule.json"), meta.get("currentFiles"));
        assertTrue(((Number) meta.get("updatedAt")).longValue() > 0L);
    }

    private PageConfigService createService() {
        PagesConfigProperties properties = new PagesConfigProperties();
        properties.setConfigDir(tempDir.toString());
        return new PageConfigService(objectMapper, new SseService(), properties);
    }

    private Map<String, Object> readMeta(Path metaPath) throws Exception {
        String json = Files.readString(metaPath, StandardCharsets.UTF_8);
        return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {
        });
    }
}