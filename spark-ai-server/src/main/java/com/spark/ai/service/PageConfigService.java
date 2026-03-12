package com.spark.ai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.entity.PageConfigEntity;
import com.spark.ai.entity.PageFileEntity;
import com.spark.ai.repository.PageConfigRepository;
import com.spark.ai.repository.PageFileRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.file.NoSuchFileException;
import java.util.*;

/**
 * 页面配置文件 CRUD 服务 — H2 数据库版。
 * 替代原有的文件系统存储，保持 REST API 契约不变。
 */
@Service
public class PageConfigService {

    private static final Logger log = LoggerFactory.getLogger(PageConfigService.class);

    /** 只允许读写的文件名白名单 */
    private static final Set<String> ALLOWED_FILES =
            Set.of("rule.json", "pagedata.json", "script.js", "style.css");

    private final PageConfigRepository pageRepo;
    private final PageFileRepository fileRepo;
    private final ObjectMapper objectMapper;
    private final SseService sseService;

    public PageConfigService(PageConfigRepository pageRepo,
                              PageFileRepository fileRepo,
                              ObjectMapper objectMapper,
                              SseService sseService) {
        this.pageRepo = pageRepo;
        this.fileRepo = fileRepo;
        this.objectMapper = objectMapper;
        this.sseService = sseService;
        log.info("[PageConfig] 使用 H2 嵌入式数据库存储");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 读取
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 读取页面配置文件。
     * 保持 FileLoader 时间戳协议兼容（timestamp 基于 updatedAt）。
     */
    public Map<String, Object> readFile(String pageId, String filename,
                                         String clientTimestamp) throws IOException {
        validatePageId(pageId);
        validateFilename(filename);

        PageFileEntity file = fileRepo.findByPageIdAndFilename(pageId, filename)
                .orElseThrow(() -> new NoSuchFileException(pageId + "/" + filename));

        String serverTimestamp = file.getUpdatedAt().toString();

        if (clientTimestamp != null && clientTimestamp.equals(serverTimestamp)) {
            return Map.of("notModified", true, "timestamp", serverTimestamp, "content", "");
        }
        return Map.of("content", file.getContent() != null ? file.getContent() : "",
                       "timestamp", serverTimestamp);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 写入（单文件）
    // ─────────────────────────────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> writeFile(String pageId, String filename,
                                          String content) throws IOException {
        validatePageId(pageId);
        validateFilename(filename);

        // 确保页面元数据存在
        ensurePageConfig(pageId);

        PageFileEntity file = fileRepo.findByPageIdAndFilename(pageId, filename)
                .orElseGet(() -> {
                    PageFileEntity f = new PageFileEntity();
                    f.setPageId(pageId);
                    f.setFilename(filename);
                    return f;
                });
        file.setContent(content);
        file = fileRepo.save(file);

        sseService.broadcast(pageId, filename);
        log.info("[PageConfig] 写入文件: {}/{}", pageId, filename);
        return Map.of("ok", true, "timestamp", file.getUpdatedAt().toString());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 批量写入
    // ─────────────────────────────────────────────────────────────────────────

    @Transactional
    public Map<String, Object> writeBatch(String pageId,
                                           Map<String, String> files) throws IOException {
        validatePageId(pageId);

        // 确保页面元数据存在（自动注册路由）
        ensurePageConfig(pageId);

        List<String> written = new ArrayList<>();
        for (Map.Entry<String, String> entry : files.entrySet()) {
            String filename = entry.getKey();
            String content = entry.getValue();
            if (!ALLOWED_FILES.contains(filename) || content == null) continue;

            PageFileEntity file = fileRepo.findByPageIdAndFilename(pageId, filename)
                    .orElseGet(() -> {
                        PageFileEntity f = new PageFileEntity();
                        f.setPageId(pageId);
                        f.setFilename(filename);
                        return f;
                    });
            file.setContent(content);
            fileRepo.save(file);
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
    public Map<String, Object> readRootFile(String filename,
                                             String clientTimestamp) throws IOException {
        if (!"routes.json".equals(filename)) {
            throw new IllegalArgumentException("不允许读取根级文件: " + filename);
        }

        String content = generateRoutesJson();
        // 使用内容哈希作为 timestamp（无文件系统 mtime）
        String timestamp = String.valueOf(content.hashCode());

        if (clientTimestamp != null && clientTimestamp.equals(timestamp)) {
            return Map.of("notModified", true, "timestamp", timestamp, "content", "");
        }
        return Map.of("content", content, "timestamp", timestamp);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 页面列表
    // ─────────────────────────────────────────────────────────────────────────

    public List<Map<String, Object>> listPages() {
        List<PageConfigEntity> pages = pageRepo.findAllByOrderByCreatedAtAsc();
        List<Map<String, Object>> result = new ArrayList<>();

        for (PageConfigEntity page : pages) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("pageId", page.getPageId());
            item.put("path", page.getPath());
            item.put("title", page.getTitle() != null ? page.getTitle() : page.getPageId());
            item.put("icon", page.getIcon() != null ? page.getIcon() : "📄");

            List<PageFileEntity> files = fileRepo.findByPageId(page.getPageId());
            List<String> existingFiles = files.stream().map(PageFileEntity::getFilename).toList();
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
    public Map<String, Object> createPage(String pageId, String title,
                                           String icon) {
        validatePageId(pageId);

        if (pageRepo.existsById(pageId)) {
            throw new IllegalArgumentException("页面已存在: " + pageId);
        }

        // 创建页面元数据
        PageConfigEntity page = new PageConfigEntity();
        page.setPageId(pageId);
        page.setTitle(title != null && !title.isBlank() ? title : pageId);
        page.setIcon(icon != null && !icon.isBlank() ? icon : "📄");
        page.setPath("/" + pageId);
        page.setRouteName(pageId);
        pageRepo.save(page);

        // 生成脚手架文件
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

        List<String> written = new ArrayList<>();
        for (Map.Entry<String, String> entry : scaffold.entrySet()) {
            PageFileEntity file = new PageFileEntity();
            file.setPageId(pageId);
            file.setFilename(entry.getKey());
            file.setContent(entry.getValue());
            fileRepo.save(file);
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
    public Map<String, Object> deletePage(String pageId) {
        validatePageId(pageId);

        List<PageFileEntity> files = fileRepo.findByPageId(pageId);
        List<String> deleted = files.stream().map(PageFileEntity::getFilename).toList();

        fileRepo.deleteByPageId(pageId);
        pageRepo.deleteById(pageId);

        sseService.broadcast(pageId, "__deleted");
        log.info("[PageConfig] 删除页面: pageId={}, files={}", pageId, deleted);
        return Map.of("ok", true, "pageId", pageId, "deleted", deleted);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 辅助方法
    // ─────────────────────────────────────────────────────────────────────────

    /** 确保 pageId 对应的 PageConfigEntity 存在（writeBatch 场景下自动创建） */
    private void ensurePageConfig(String pageId) {
        if (!pageRepo.existsById(pageId)) {
            PageConfigEntity page = new PageConfigEntity();
            page.setPageId(pageId);
            page.setTitle(pageId);
            page.setIcon("🤖");
            page.setPath("/" + pageId);
            page.setRouteName(pageId);
            pageRepo.save(page);
            log.info("[PageConfig] 自动注册页面: {}", pageId);
        }
    }

    /** 从 page_config 表动态生成 routes.json 内容 */
    private String generateRoutesJson() throws IOException {
        List<PageConfigEntity> pages = pageRepo.findAllByOrderByCreatedAtAsc();
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
    public Map<String, Object> syncStaticRoutes(List<Map<String, String>> routes) {
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

            Optional<PageConfigEntity> existing = pageRepo.findById(pageId);
            if (existing.isPresent()) {
                PageConfigEntity page = existing.get();
                page.setTitle(title);
                page.setIcon(icon);
                page.setPath(path);
                page.setRouteName(name);
                page.setPageType("vue-component");
                pageRepo.save(page);
                updated++;
            } else {
                PageConfigEntity page = new PageConfigEntity();
                page.setPageId(pageId);
                page.setTitle(title);
                page.setIcon(icon);
                page.setPath(path);
                page.setRouteName(name);
                page.setPageType("vue-component");
                pageRepo.save(page);
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
