package com.spark.ai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.config.PagesConfigProperties;
import com.spark.ai.entity.PageConfigEntity;
import com.spark.ai.repository.PageConfigRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

/**
 * 页面配置文件 CRUD 服务 — 按 (tenantId, projectId) 隔离。
 *
 * <p>页面元数据（title/icon/path/routeName）存储在数据库 page_config 表。
 * <p>页面配置文件（rule.json / pagedata.json / script.js / style.css）存储在文件系统：
 * <pre>
 *   {configDir}/{tenantId}/{projectId}/{pageId}/{filename}
 * </pre>
 */
@Service
public class PageConfigService {

    private static final Logger log = LoggerFactory.getLogger(PageConfigService.class);

    /** 只允许读写的文件名白名单 */
    private static final Set<String> ALLOWED_FILES =
            Set.of("rule.json", "pagedata.json", "script.js", "style.css");

    private final PageConfigRepository pageRepo;
    private final ObjectMapper objectMapper;
    private final SseService sseService;
    private final Path configRoot;

    public PageConfigService(PageConfigRepository pageRepo,
                              ObjectMapper objectMapper,
                              SseService sseService,
                              PagesConfigProperties pagesProps) {
        this.pageRepo = pageRepo;
        this.objectMapper = objectMapper;
        this.sseService = sseService;
        this.configRoot = Path.of(pagesProps.getConfigDir());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 文件系统路径
    // ─────────────────────────────────────────────────────────────────────────

    /** 返回页面目录路径：{configRoot}/{tenantId}/{projectId}/{pageId} */
    private Path pageDir(String tenantId, String projectId, String pageId) {
        return configRoot.resolve(tenantId).resolve(projectId).resolve(pageId);
    }

    /** 返回文件路径：{configRoot}/{tenantId}/{projectId}/{pageId}/{filename} */
    private Path filePath(String tenantId, String projectId, String pageId, String filename) {
        return pageDir(tenantId, projectId, pageId).resolve(filename);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 读取
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 读取页面配置文件。
     * 保持 FileLoader 时间戳协议兼容（timestamp 基于文件 lastModified）。
     */
    public Map<String, Object> readFile(String tenantId, String projectId,
                                         String pageId, String filename,
                                         String clientTimestamp) throws IOException {
        validatePageId(pageId);
        validateFilename(filename);

        Path fp = filePath(tenantId, projectId, pageId, filename);
        if (!Files.isRegularFile(fp)) {
            throw new NoSuchFileException(pageId + "/" + filename);
        }

        String serverTimestamp = String.valueOf(Files.getLastModifiedTime(fp).toMillis());

        if (clientTimestamp != null && clientTimestamp.equals(serverTimestamp)) {
            return Map.of("notModified", true, "timestamp", serverTimestamp, "content", "");
        }
        String content = Files.readString(fp, StandardCharsets.UTF_8);
        return Map.of("content", content, "timestamp", serverTimestamp);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 写入（单文件）
    // ─────────────────────────────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> writeFile(String tenantId, String projectId,
                                          String pageId, String filename,
                                          String content) throws IOException {
        validatePageId(pageId);
        validateFilename(filename);

        ensurePageConfig(tenantId, projectId, pageId);

        Path fp = filePath(tenantId, projectId, pageId, filename);
        Files.createDirectories(fp.getParent());
        Files.writeString(fp, content, StandardCharsets.UTF_8);

        String timestamp = String.valueOf(Files.getLastModifiedTime(fp).toMillis());
        sseService.broadcast(pageId, filename);
        log.info("[PageConfig] 写入文件: {}/{}", pageId, filename);
        return Map.of("ok", true, "timestamp", timestamp);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 批量写入
    // ─────────────────────────────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> writeBatch(String tenantId, String projectId,
                                           String pageId,
                                           Map<String, String> files) throws IOException {
        validatePageId(pageId);

        ensurePageConfig(tenantId, projectId, pageId);

        Path dir = pageDir(tenantId, projectId, pageId);
        Files.createDirectories(dir);

        List<String> written = new ArrayList<>();
        for (Map.Entry<String, String> entry : files.entrySet()) {
            String filename = entry.getKey();
            String content = entry.getValue();
            if (!ALLOWED_FILES.contains(filename) || content == null) continue;

            Files.writeString(dir.resolve(filename), content, StandardCharsets.UTF_8);
            written.add(filename);
        }

        sseService.broadcast(pageId, "__batch");
        log.info("[PageConfig] 批量写入: pageId={}, files={}", pageId, written);
        return Map.of("ok", true, "pageId", pageId, "written", written);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 根级文件读取（routes.json — 从数据库动态生成）
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 读取根级配置文件（routes.json — 从 page_config 表动态生成）。
     * 保持与 FileLoader 时间戳协议的兼容。
     */
    public Map<String, Object> readRootFile(String tenantId, String projectId,
                                             String filename,
                                             String clientTimestamp) throws IOException {
        if (!"routes.json".equals(filename)) {
            throw new IllegalArgumentException("不允许读取根级文件: " + filename);
        }

        String content = generateRoutesJson(tenantId, projectId);
        String timestamp = String.valueOf(content.hashCode());

        if (clientTimestamp != null && clientTimestamp.equals(timestamp)) {
            return Map.of("notModified", true, "timestamp", timestamp, "content", "");
        }
        return Map.of("content", content, "timestamp", timestamp);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 页面列表
    // ─────────────────────────────────────────────────────────────────────────

    public List<Map<String, Object>> listPages(String tenantId, String projectId) {
        List<PageConfigEntity> pages = pageRepo.findByTenantIdAndProjectIdOrderByCreatedAtAsc(
                tenantId, projectId);
        List<Map<String, Object>> result = new ArrayList<>();

        for (PageConfigEntity page : pages) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("pageId", page.getPageId());
            item.put("path", page.getPath());
            item.put("title", page.getTitle() != null ? page.getTitle() : page.getPageId());
            item.put("icon", page.getIcon() != null ? page.getIcon() : "📄");

            // 从文件系统扫描已有文件
            Path dir = pageDir(tenantId, projectId, page.getPageId());
            List<String> existingFiles = new ArrayList<>();
            if (Files.isDirectory(dir)) {
                for (String fname : ALLOWED_FILES) {
                    if (Files.isRegularFile(dir.resolve(fname))) {
                        existingFiles.add(fname);
                    }
                }
            }
            item.put("pageType", page.getPageType() != null ? page.getPageType() : "config");
            item.put("files", existingFiles);
            item.put("hasDir", !existingFiles.isEmpty());
            result.add(item);
        }
        return result;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 创建页面
    // ─────────────────────────────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> createPage(String tenantId, String projectId,
                                           String pageId, String title,
                                           String icon) throws IOException {
        validatePageId(pageId);

        if (pageRepo.existsByTenantIdAndProjectIdAndPageId(tenantId, projectId, pageId)) {
            throw new IllegalArgumentException("页面已存在: " + pageId);
        }

        PageConfigEntity page = new PageConfigEntity();
        page.setTenantId(tenantId);
        page.setProjectId(projectId);
        page.setPageId(pageId);
        page.setTitle(title != null && !title.isBlank() ? title : pageId);
        page.setIcon(icon != null && !icon.isBlank() ? icon : "📄");
        page.setPath("/" + pageId);
        page.setRouteName(pageId);
        pageRepo.save(page);

        // 生成脚手架文件到文件系统
        String safeTitle = escapeJson(title != null ? title : pageId);
        String ruleJson = "[\n  {\n    \"type\": \"div\",\n    \"children\": [\n      {\n        \"type\": \"h2\",\n        \"children\": [\"" + safeTitle + "\"]\n      },\n      {\n        \"type\": \"p\",\n        \"children\": [\"页面配置就绪，请编辑 rule.json 设计页面布局。\"]\n      }\n    ]\n  }\n]";
        String pageDataJson = "{}";
        String scriptJs = "// " + (title != null ? title : pageId) + " 页面脚本\nfunction __init__() {\n  console.log('" + pageId + " 页面已加载')\n}\n";
        String styleCss = "/* " + (title != null ? title : pageId) + " 页面样式 */\n";

        Map<String, String> scaffold = Map.of(
                "rule.json", ruleJson,
                "pagedata.json", pageDataJson,
                "script.js", scriptJs,
                "style.css", styleCss
        );

        Path dir = pageDir(tenantId, projectId, pageId);
        Files.createDirectories(dir);

        List<String> written = new ArrayList<>();
        for (Map.Entry<String, String> entry : scaffold.entrySet()) {
            Files.writeString(dir.resolve(entry.getKey()), entry.getValue(), StandardCharsets.UTF_8);
            written.add(entry.getKey());
        }

        sseService.broadcast(pageId, "__batch");
        log.info("[PageConfig] 创建页面: pageId={}, title={}", pageId, title);
        return Map.of("ok", true, "pageId", pageId, "written", written);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 删除页面
    // ─────────────────────────────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> deletePage(String tenantId, String projectId,
                                           String pageId) throws IOException {
        validatePageId(pageId);

        // 删除文件系统上的页面目录
        Path dir = pageDir(tenantId, projectId, pageId);
        List<String> deleted = new ArrayList<>();
        if (Files.isDirectory(dir)) {
            try (DirectoryStream<Path> stream = Files.newDirectoryStream(dir)) {
                for (Path f : stream) {
                    deleted.add(f.getFileName().toString());
                    Files.deleteIfExists(f);
                }
            }
            Files.deleteIfExists(dir);
        }

        // 删除数据库元数据
        pageRepo.deleteByTenantIdAndProjectIdAndPageId(tenantId, projectId, pageId);

        sseService.broadcast(pageId, "__deleted");
        log.info("[PageConfig] 删除页面: pageId={}, files={}", pageId, deleted);
        return Map.of("ok", true, "pageId", pageId, "deleted", deleted);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 辅助方法
    // ─────────────────────────────────────────────────────────────────────────

    private void ensurePageConfig(String tenantId, String projectId, String pageId) {
        if (!pageRepo.existsByTenantIdAndProjectIdAndPageId(tenantId, projectId, pageId)) {
            PageConfigEntity page = new PageConfigEntity();
            page.setTenantId(tenantId);
            page.setProjectId(projectId);
            page.setPageId(pageId);
            page.setTitle(pageId);
            page.setIcon("🤖");
            page.setPath("/" + pageId);
            page.setRouteName(pageId);
            pageRepo.save(page);
            log.info("[PageConfig] 自动注册页面: {}", pageId);
        }
    }

    private String generateRoutesJson(String tenantId, String projectId) throws IOException {
        List<PageConfigEntity> pages = pageRepo.findByTenantIdAndProjectIdOrderByCreatedAtAsc(
                tenantId, projectId);
        List<Map<String, Object>> routes = new ArrayList<>();
        for (PageConfigEntity p : pages) {
            Map<String, Object> route = new LinkedHashMap<>();
            route.put("path", p.getPath() != null ? p.getPath() : "/" + p.getPageId());
            route.put("name", p.getRouteName() != null ? p.getRouteName() : p.getPageId());
            route.put("pageId", p.getPageId());
            String pageType = p.getPageType() != null ? p.getPageType() : "config";
            Map<String, Object> meta = new LinkedHashMap<>();
            meta.put("title", p.getTitle() != null ? p.getTitle() : p.getPageId());
            meta.put("icon", p.getIcon() != null ? p.getIcon() : "📄");
            meta.put("pageType", pageType);
            route.put("meta", meta);
            routes.add(route);
        }
        return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(routes);
    }

    private void validatePageId(String pageId) {
        if (pageId == null || pageId.isBlank()
                || pageId.contains("..") || pageId.contains("/") || pageId.contains("\\")) {
            throw new IllegalArgumentException("无效的 pageId: " + pageId);
        }
    }

    private void validateFilename(String filename) {
        if (!ALLOWED_FILES.contains(filename)) {
            throw new IllegalArgumentException(
                    "不允许写入文件 \"" + filename + "\"（只允许: " + ALLOWED_FILES + "）");
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 静态路由同步
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 批量同步静态 Vue 组件路由到数据库（幂等）。
     * 前端启动时调用，将 vue-component 类型的路由元数据写入 page_config 表，
     * 使后端成为路由信息的单一来源。
     *
     * @param routes 路由列表，每项需包含 path, name, pageId, title, icon
     * @return 同步结果统计
     */
    @Transactional
    public Map<String, Object> syncStaticRoutes(String tenantId, String projectId,
                                                 List<Map<String, String>> routes) {
        int created = 0;
        int updated = 0;
        List<String> synced = new ArrayList<>();

        for (Map<String, String> r : routes) {
            String pageId = r.get("pageId");
            if (pageId == null || pageId.isBlank()) continue;
            validatePageId(pageId);

            String path = r.getOrDefault("path", "/" + pageId);
            String name = r.getOrDefault("name", pageId);
            String title = r.getOrDefault("title", pageId);
            String icon = r.getOrDefault("icon", "📄");

            Optional<PageConfigEntity> existing = pageRepo.findByTenantIdAndProjectIdAndPageId(
                    tenantId, projectId, pageId);
            if (existing.isPresent()) {
                PageConfigEntity p = existing.get();
                p.setTitle(title);
                p.setIcon(icon);
                p.setPath(path);
                p.setRouteName(name);
                p.setPageType("vue-component");
                pageRepo.save(p);
                updated++;
            } else {
                PageConfigEntity p = new PageConfigEntity();
                p.setTenantId(tenantId);
                p.setProjectId(projectId);
                p.setPageId(pageId);
                p.setTitle(title);
                p.setIcon(icon);
                p.setPath(path);
                p.setRouteName(name);
                p.setPageType("vue-component");
                pageRepo.save(p);
                created++;
            }
            synced.add(pageId);
        }

        log.info("[PageConfig] 静态路由同步完成: created={}, updated={}, total={}",
                created, updated, synced.size());
        return Map.of("ok", true, "created", created, "updated", updated, "synced", synced);
    }

    /** 简单 JSON 字符串转义（用于脚手架模板） */
    private static String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
