package com.spark.ai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.config.PagesConfigProperties;
import com.spark.ai.repository.FileVersionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest
class PageConfigServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired
    FileVersionRepository fileVersionRepository;

    @TempDir
    Path tempDir;

    PageConfigService service;

    @BeforeEach
    void setUp() {
        service = createService();
    }

    // ── 基础 CRUD ──

    @Test
    void createPage_generatesScaffoldFiles() throws Exception {
        Map<String, Object> result = service.createPage("t1", "p1", "demo-page", "演示页面", "Document");
        assertEquals(true, result.get("ok"));
        assertEquals("demo-page", result.get("pageId"));

        // 4 个脚手架文件应存在
        Path pageDir = tempDir.resolve("t1/p1/demo-page");
        assertTrue(Files.exists(pageDir.resolve("rule.json")));
        assertTrue(Files.exists(pageDir.resolve("pagedata.json")));
        assertTrue(Files.exists(pageDir.resolve("script.js")));
        assertTrue(Files.exists(pageDir.resolve("style.css")));
    }

    @Test
    void writeFile_onlyWritesToDisk_noAutoVersioning() throws Exception {
        service.createPage("t1", "p1", "demo-page", "演示页面", "Document");

        Map<String, Object> result = service.writeFile(
                "t1", "p1", "demo-page", "script.js", "console.log('hello')");

        assertEquals(true, result.get("ok"));
        // 不产生版本记录
        List<Map<String, Object>> versions = service.listFileVersions(
                "t1", "p1", "demo-page", "script.js");
        assertTrue(versions.isEmpty());

        // 磁盘内容已更新
        Map<String, Object> readResult = service.readFile(
                "t1", "p1", "demo-page", "script.js", null);
        assertEquals("console.log('hello')", readResult.get("content"));
    }

    @Test
    void readFile_returnsContentAndTimestamp() throws Exception {
        service.createPage("t1", "p1", "demo-page", "演示页面", "Document");

        Map<String, Object> result = service.readFile(
                "t1", "p1", "demo-page", "rule.json", null);

        assertNotNull(result.get("content"));
        assertNotNull(result.get("timestamp"));
    }

    // ── 文件级版本管理 ──

    @Test
    void createFileVersion_snapshotsCurrentFile() throws Exception {
        service.createPage("t1", "p1", "demo-page", "演示页面", "Document");
        service.writeFile("t1", "p1", "demo-page", "script.js", "// version 1 content");

        Map<String, Object> result = service.createFileVersion(
                "t1", "p1", "demo-page", "script.js", "test-user");

        assertEquals(true, result.get("ok"));
        assertEquals(1, result.get("version"));
        assertEquals("script.js", result.get("filename"));

        // 版本文件存在于磁盘：1__script.js
        Path versionFile = tempDir.resolve("t1/p1/demo-page/1__script.js");
        assertTrue(Files.exists(versionFile));
        assertEquals("// version 1 content", Files.readString(versionFile));

        // DB 记录
        List<Map<String, Object>> versions = service.listFileVersions(
                "t1", "p1", "demo-page", "script.js");
        assertEquals(1, versions.size());
        assertEquals(1, versions.get(0).get("version"));
        assertEquals(true, versions.get(0).get("isCurrent"));
    }

    @Test
    void createFileVersion_incrementsVersion() throws Exception {
        service.createPage("t1", "p1", "demo-page", "演示页面", "Document");

        service.writeFile("t1", "p1", "demo-page", "script.js", "v1");
        service.createFileVersion("t1", "p1", "demo-page", "script.js", null);

        service.writeFile("t1", "p1", "demo-page", "script.js", "v2");
        Map<String, Object> result = service.createFileVersion(
                "t1", "p1", "demo-page", "script.js", null);

        assertEquals(2, result.get("version"));

        // isCurrent 只有最新版
        List<Map<String, Object>> versions = service.listFileVersions(
                "t1", "p1", "demo-page", "script.js");
        assertEquals(2, versions.size());
        assertEquals(2, versions.get(0).get("version"));
        assertEquals(true, versions.get(0).get("isCurrent"));
        assertEquals(1, versions.get(1).get("version"));
        assertEquals(false, versions.get(1).get("isCurrent"));
    }

    @Test
    void readFileVersionContent_returnsVersionSnapshot() throws Exception {
        service.createPage("t1", "p1", "demo-page", "演示页面", "Document");
        service.writeFile("t1", "p1", "demo-page", "script.js", "original");
        service.createFileVersion("t1", "p1", "demo-page", "script.js", null);
        service.writeFile("t1", "p1", "demo-page", "script.js", "modified");

        // 工作文件已修改
        Map<String, Object> current = service.readFile("t1", "p1", "demo-page", "script.js", null);
        assertEquals("modified", current.get("content"));

        // v1 快照仍是 original
        Map<String, Object> v1 = service.readFileVersionContent(
                "t1", "p1", "demo-page", "script.js", 1);
        assertEquals("original", v1.get("content"));
        assertEquals(1, v1.get("version"));
    }

    @Test
    void restoreFileVersion_overwritesWorkingFile() throws Exception {
        service.createPage("t1", "p1", "demo-page", "演示页面", "Document");
        service.writeFile("t1", "p1", "demo-page", "script.js", "v1-content");
        service.createFileVersion("t1", "p1", "demo-page", "script.js", null);
        service.writeFile("t1", "p1", "demo-page", "script.js", "v2-content");
        service.createFileVersion("t1", "p1", "demo-page", "script.js", null);

        // 当前工作文件是 v2-content
        Map<String, Object> before = service.readFile("t1", "p1", "demo-page", "script.js", null);
        assertEquals("v2-content", before.get("content"));

        // 恢复 v1
        Map<String, Object> result = service.restoreFileVersion(
                "t1", "p1", "demo-page", "script.js", 1);
        assertEquals(true, result.get("ok"));
        assertEquals(1, result.get("restoredVersion"));

        // 工作文件内容已恢复
        Map<String, Object> after = service.readFile("t1", "p1", "demo-page", "script.js", null);
        assertEquals("v1-content", after.get("content"));
    }

    @Test
    void deleteFileVersion_removesRecordAndDiskFile() throws Exception {
        service.createPage("t1", "p1", "demo-page", "演示页面", "Document");
        service.writeFile("t1", "p1", "demo-page", "script.js", "v1");
        service.createFileVersion("t1", "p1", "demo-page", "script.js", null);
        service.writeFile("t1", "p1", "demo-page", "script.js", "v2");
        service.createFileVersion("t1", "p1", "demo-page", "script.js", null);

        // 删除 v1
        service.deleteFileVersion("t1", "p1", "demo-page", "script.js", 1);

        List<Map<String, Object>> remaining = service.listFileVersions(
                "t1", "p1", "demo-page", "script.js");
        assertEquals(1, remaining.size());
        assertEquals(2, remaining.get(0).get("version"));

        // 磁盘文件已删除
        assertFalse(Files.exists(tempDir.resolve("t1/p1/demo-page/1__script.js")));
        assertTrue(Files.exists(tempDir.resolve("t1/p1/demo-page/2__script.js")));
    }

    @Test
    void deleteFileVersion_rejectsCurrentVersion() throws Exception {
        service.createPage("t1", "p1", "demo-page", "演示页面", "Document");
        service.writeFile("t1", "p1", "demo-page", "script.js", "v1");
        service.createFileVersion("t1", "p1", "demo-page", "script.js", null);

        assertThrows(IllegalArgumentException.class,
                () -> service.deleteFileVersion("t1", "p1", "demo-page", "script.js", 1));
    }

    @Test
    void pruneFileVersions_keepsLatestN() throws Exception {
        service.createPage("t1", "p1", "demo-page", "演示页面", "Document");
        for (int i = 1; i <= 5; i++) {
            service.writeFile("t1", "p1", "demo-page", "script.js", "v" + i);
            service.createFileVersion("t1", "p1", "demo-page", "script.js", null);
        }

        assertEquals(5, service.listFileVersions("t1", "p1", "demo-page", "script.js").size());

        int deleted = service.pruneFileVersions("t1", "p1", "demo-page", "script.js", 2);
        assertEquals(3, deleted);

        List<Map<String, Object>> remaining = service.listFileVersions(
                "t1", "p1", "demo-page", "script.js");
        assertEquals(2, remaining.size());
        assertEquals(5, remaining.get(0).get("version"));
        assertEquals(4, remaining.get(1).get("version"));
    }

    @Test
    void listPageFileVersions_returnsAllFilesVersions() throws Exception {
        service.createPage("t1", "p1", "demo-page", "演示页面", "Document");

        service.writeFile("t1", "p1", "demo-page", "script.js", "js-v1");
        service.createFileVersion("t1", "p1", "demo-page", "script.js", null);

        service.writeFile("t1", "p1", "demo-page", "rule.json", "[{\"type\":\"div\"}]");
        service.createFileVersion("t1", "p1", "demo-page", "rule.json", null);

        List<Map<String, Object>> allVersions = service.listPageFileVersions(
                "t1", "p1", "demo-page");
        assertEquals(2, allVersions.size());
    }

    // ── 路由同步 ──

    @Test
    void syncStaticRoutes_generatesRoutesJson() throws Exception {
        Map<String, Object> syncResult = service.syncStaticRoutes(
                "t1", "p1",
                List.of(Map.of(
                        "pageId", "system-dashboard",
                        "path", "/system-dashboard",
                        "name", "system-dashboard",
                        "title", "系统首页",
                        "icon", "Monitor"
                )));

        assertEquals(true, syncResult.get("ok"));

        Map<String, Object> routesFile = service.readRootFile("t1", "p1", "routes.json", null);
        assertTrue(String.valueOf(routesFile.get("content")).contains("system-dashboard"));
    }

    // ── 健康检查 ──

    @Test
    void checkPagesHealth_reportsStatus() throws Exception {
        service.createPage("t1", "p1", "demo-page", "演示页面", "Document");

        List<Map<String, Object>> health = service.checkPagesHealth("t1", "p1");
        assertEquals(1, health.size());
        assertEquals("demo-page", health.get(0).get("pageId"));
    }

    // ── 删除页面 ──

    @Test
    void deletePage_removesFilesAndDbRecords() throws Exception {
        service.createPage("t1", "p1", "demo-page", "演示页面", "Document");
        service.writeFile("t1", "p1", "demo-page", "script.js", "v1");
        service.createFileVersion("t1", "p1", "demo-page", "script.js", null);

        Map<String, Object> result = service.deletePage("t1", "p1", "demo-page");
        assertEquals(true, result.get("ok"));

        // 目录已删除
        assertFalse(Files.exists(tempDir.resolve("t1/p1/demo-page")));

        // DB 版本记录已清除
        List<Map<String, Object>> versions = service.listFileVersions(
                "t1", "p1", "demo-page", "script.js");
        assertTrue(versions.isEmpty());
    }

    private PageConfigService createService() {
        PagesConfigProperties properties = new PagesConfigProperties();
        properties.setConfigDir(tempDir.toString());
        return new PageConfigService(objectMapper, new SseService(), fileVersionRepository, properties);
    }
}