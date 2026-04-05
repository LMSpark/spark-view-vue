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

    @Test
    void syncStaticRoutes_incrementsProjectRootVersionAndReadRootExposesIt() throws Exception {
        PageConfigService service = createService();

        Map<String, Object> syncResult = service.syncStaticRoutes(
                "t1",
                "p1",
                List.of(Map.of(
                        "pageId", "system-dashboard",
                        "path", "/system-dashboard",
                        "name", "system-dashboard",
                        "title", "系统首页",
                        "icon", "Monitor"
                ))
        );

        Map<String, Object> rootFile = service.readRootFile("t1", "p1", "routes.json", null);
        Path metaPath = tempDir.resolve("t1").resolve("p1").resolve("__project-meta.json");
        Map<String, Object> meta = readMeta(metaPath);

        assertEquals(true, syncResult.get("ok"));
        assertEquals(1, syncResult.get("currentVersion"));
        assertEquals(1, rootFile.get("currentVersion"));
        assertEquals(1, meta.get("currentVersion"));
        assertEquals("p1", meta.get("projectId"));
        assertEquals(List.of("routes.json"), meta.get("currentFiles"));
        assertTrue(((Number) meta.get("updatedAt")).longValue() > 0L);
        assertTrue(String.valueOf(rootFile.get("content")).contains("system-dashboard"));
    }

    @Test
    void listPageVersions_andReadVersionFile_exposeVersionHistory() throws Exception {
        PageConfigService service = createService();
        service.createPage("t1", "p1", "demo-page", "演示页面", "Document");
        service.writeFile("t1", "p1", "demo-page", "script.js", "console.log('v2')\n");

        List<Map<String, Object>> versions = service.listPageVersions("t1", "p1", "demo-page");
        Map<String, Object> version2Script = service.readPageVersionFile("t1", "p1", "demo-page", 2, "script.js");
        Map<String, Object> version1Script = service.readPageVersionFile("t1", "p1", "demo-page", 1, "script.js");

        assertEquals(2, versions.size());
        assertEquals(2, versions.get(0).get("version"));
        assertEquals(true, versions.get(0).get("current"));
        assertEquals(List.of("script.js"), versions.get(0).get("changedFiles"));
        assertEquals(2, version2Script.get("version"));
        assertEquals("console.log('v2')\n", version2Script.get("content"));
        assertTrue(String.valueOf(version1Script.get("content")).contains("页面已加载"));
    }

    @Test
    void restorePageVersion_setsVersionAsCurrentByCreatingNewVersion() throws Exception {
        PageConfigService service = createService();
        service.createPage("t1", "p1", "demo-page", "演示页面", "Document");
        service.writeFile("t1", "p1", "demo-page", "script.js", "console.log('v2')\n");

        Map<String, Object> restoreResult = service.restorePageVersion("t1", "p1", "demo-page", 1);
        Map<String, Object> currentScript = service.readFile("t1", "p1", "demo-page", "script.js", null);
        List<Map<String, Object>> versions = service.listPageVersions("t1", "p1", "demo-page");
        Map<String, Object> restoredVersion = versions.get(0);
        Map<String, Object> restoredSnapshot = service.readPageVersionFile("t1", "p1", "demo-page", 3, "script.js");

        assertEquals(true, restoreResult.get("ok"));
        assertEquals(1, restoreResult.get("restoredFromVersion"));
        assertEquals(3, restoreResult.get("currentVersion"));
        assertTrue(String.valueOf(currentScript.get("content")).contains("页面已加载"));
        assertEquals(3, restoredVersion.get("version"));
        assertEquals(true, restoredVersion.get("current"));
        assertEquals(1, restoredVersion.get("restoredFromVersion"));
        assertTrue(String.valueOf(restoredSnapshot.get("content")).contains("页面已加载"));
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