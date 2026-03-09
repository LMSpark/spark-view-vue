package com.spark.ai.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.config.PagesConfigProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 页面配置文件 CRUD 服务。
 * 对接前端 FileLoader 的时间戳缓存协议，同时与 Vite 插件行为完全一致：
 *   GET → { content, timestamp } 或 { notModified: true, timestamp, content: '' }
 *   PUT / batch → 写文件 + 广播 SSE 变更
 */
@Service
public class PageConfigService {

    private static final Logger log = LoggerFactory.getLogger(PageConfigService.class);

    /** 只允许读写的文件名白名单 */
    private static final Set<String> ALLOWED_FILES =
            Set.of("rule.json", "pagedata.json", "script.js", "style.css");

    /** 文件内容缓存条目：content + 文件系统 mtime（ISO 时间戳） */
    private record CacheEntry(String content, String timestamp) {}

    /**
     * 内存缓存：key = 相对路径（如 "home/rule.json" 或 "routes.json"），value = 内容+时间戳。
     * 写入/批量写入时自动失效，避免每次 GET 都命中文件系统。
     */
    private final ConcurrentHashMap<String, CacheEntry> fileCache = new ConcurrentHashMap<>();

    private final Path configRoot;
    private final ObjectMapper objectMapper;
    private final SseService sseService;

    public PageConfigService(PagesConfigProperties props,
                              ObjectMapper objectMapper,
                              SseService sseService) {
        this.configRoot = Paths.get(props.getConfigDir()).toAbsolutePath().normalize();
        this.objectMapper = objectMapper;
        this.sseService = sseService;
        log.info("[PageConfig] 配置目录: {}", this.configRoot);
    }

    /**
     * 启动检查：确认 configRoot 存在且包含 routes.json。
     * 页面配置直接在 data/pages-config/ 目录中维护（git 跟踪），无需种子机制。
     */
    @PostConstruct
    void checkConfigDir() {
        if (!Files.isDirectory(configRoot)) {
            log.warn("[PageConfig] 配置目录不存在: {}，请确认 data/pages-config/ 已就绪", configRoot);
            return;
        }
        Path routesFile = configRoot.resolve("routes.json");
        if (!Files.exists(routesFile)) {
            log.warn("[PageConfig] routes.json 不存在: {}，页面路由将为空", routesFile);
        } else {
            log.info("[PageConfig] 配置目录就绪: {}", configRoot);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 读取
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 读取页面配置文件，支持 FileLoader 时间戳协议。
     * 优先走内存缓存；缓存未命中或磁盘 mtime 变化时从磁盘重读。
     *
     * @param clientTimestamp 客户端持有的上次修改时间（可为 null）
     * @return { content, timestamp } 或 { notModified: true, timestamp, content: '' }
     * @throws NoSuchFileException 文件不存在（上游转 404）
     */
    public Map<String, Object> readFile(String pageId, String filename,
                                         String clientTimestamp) throws IOException {
        validatePageId(pageId);
        validateFilename(filename);
        Path target = resolveAndCheck(pageId, filename);
        String cacheKey = pageId + "/" + filename;

        // 读取磁盘 mtime（用于缓存校验 + 客户端 notModified 判断）
        if (!Files.exists(target)) {
            fileCache.remove(cacheKey);
            throw new NoSuchFileException(target.toString());
        }
        String diskMtime = Files.getLastModifiedTime(target).toInstant().toString();

        CacheEntry cached = fileCache.get(cacheKey);
        if (cached != null && cached.timestamp().equals(diskMtime)) {
            // 缓存有效：磁盘 mtime 未变
            if (clientTimestamp != null && clientTimestamp.equals(cached.timestamp())) {
                return Map.of("notModified", true, "timestamp", cached.timestamp(), "content", "");
            }
            return Map.of("content", cached.content(), "timestamp", cached.timestamp());
        }

        // 缓存未命中或 mtime 已变：从磁盘重读
        String content = Files.readString(target, StandardCharsets.UTF_8);
        fileCache.put(cacheKey, new CacheEntry(content, diskMtime));

        if (clientTimestamp != null && clientTimestamp.equals(diskMtime)) {
            return Map.of("notModified", true, "timestamp", diskMtime, "content", "");
        }
        return Map.of("content", content, "timestamp", diskMtime);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 写入（单文件）
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 写入单个配置文件，更新缓存，广播 SSE 变更通知。
     */
    public Map<String, Object> writeFile(String pageId, String filename,
                                          String content) throws IOException {
        validatePageId(pageId);
        validateFilename(filename);
        Path dir = configRoot.resolve(pageId);
        Files.createDirectories(dir);
        Path target = resolveAndCheck(pageId, filename);
        Files.writeString(target, content, StandardCharsets.UTF_8);
        String mtime = Files.getLastModifiedTime(target).toInstant().toString();

        // 写入后直接更新缓存（避免下次读还走磁盘）
        fileCache.put(pageId + "/" + filename, new CacheEntry(content, mtime));

        sseService.broadcast(pageId, filename);
        log.info("[PageConfig] 写入文件: {}/{}", pageId, filename);
        return Map.of("ok", true, "timestamp", mtime);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 批量写入
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 批量写入最多 4 个配置文件，自动注册路由，广播 SSE 变更。
     * 写入后直接更新缓存，无需等下次读取时再走磁盘。
     */
    public Map<String, Object> writeBatch(String pageId,
                                           Map<String, String> files) throws IOException {
        validatePageId(pageId);
        Path dir = configRoot.resolve(pageId);
        Files.createDirectories(dir);

        List<String> written = new ArrayList<>();
        for (Map.Entry<String, String> entry : files.entrySet()) {
            String filename = entry.getKey();
            String content = entry.getValue();
            if (!ALLOWED_FILES.contains(filename) || content == null) continue;
            Path target = dir.resolve(filename).normalize();
            ensureInRoot(target);
            Files.writeString(target, content, StandardCharsets.UTF_8);
            String mtime = Files.getLastModifiedTime(target).toInstant().toString();
            fileCache.put(pageId + "/" + filename, new CacheEntry(content, mtime));
            written.add(filename);
        }

        autoRegisterRoute(pageId);
        sseService.broadcast(pageId, "__batch");
        log.info("[PageConfig] 批量写入: pageId={}, files={}", pageId, written);
        return Map.of("ok", true, "pageId", pageId, "written", written);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 路由自动注册（routes.json）
    // ─────────────────────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private void autoRegisterRoute(String pageId) {
        Path routesFile = configRoot.resolve("routes.json");
        try {
            if (!Files.exists(routesFile)) return;
            String raw = Files.readString(routesFile, StandardCharsets.UTF_8);
            List<Map<String, Object>> routes = objectMapper.readValue(raw,
                    new TypeReference<List<Map<String, Object>>>() {});
            boolean exists = routes.stream().anyMatch(r -> pageId.equals(r.get("pageId")));
            if (!exists) {
                Map<String, Object> newRoute = new LinkedHashMap<>();
                newRoute.put("path", "/" + pageId);
                newRoute.put("name", pageId);
                newRoute.put("pageId", pageId);
                newRoute.put("meta", Map.of("title", pageId, "icon", "🤖"));
                routes.add(newRoute);
                String newContent = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(routes);
                Files.writeString(routesFile, newContent, StandardCharsets.UTF_8);
                // routes.json 变更 → 失效缓存
                String mtime = Files.getLastModifiedTime(routesFile).toInstant().toString();
                fileCache.put("routes.json", new CacheEntry(newContent, mtime));
                log.info("[PageConfig] 已自动注册路由: /{}", pageId);
            }
        } catch (Exception e) {
            log.warn("[PageConfig] routes.json 更新失败（不阻断主流程）: {}", e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 根级文件读取（routes.json）
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 读取根级配置文件（如 routes.json），支持缓存 + FileLoader 时间戳协议。
     */
    public Map<String, Object> readRootFile(String filename,
                                             String clientTimestamp) throws IOException {
        if (!"routes.json".equals(filename)) {
            throw new IllegalArgumentException("不允许读取根级文件: " + filename);
        }
        Path target = configRoot.resolve(filename).normalize();
        ensureInRoot(target);

        if (!Files.exists(target)) {
            fileCache.remove(filename);
            throw new NoSuchFileException(target.toString());
        }
        String diskMtime = Files.getLastModifiedTime(target).toInstant().toString();

        CacheEntry cached = fileCache.get(filename);
        if (cached != null && cached.timestamp().equals(diskMtime)) {
            if (clientTimestamp != null && clientTimestamp.equals(cached.timestamp())) {
                return Map.of("notModified", true, "timestamp", cached.timestamp(), "content", "");
            }
            return Map.of("content", cached.content(), "timestamp", cached.timestamp());
        }

        String content = Files.readString(target, StandardCharsets.UTF_8);
        fileCache.put(filename, new CacheEntry(content, diskMtime));

        if (clientTimestamp != null && clientTimestamp.equals(diskMtime)) {
            return Map.of("notModified", true, "timestamp", diskMtime, "content", "");
        }
        return Map.of("content", content, "timestamp", diskMtime);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 页面列表
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 列出所有配置页面。
     * 扫描 routes.json 获取路由信息，同时检查磁盘目录确认文件完整性。
     *
     * @return 页面列表，每项包含 pageId、path、title、icon、files（实际存在的文件列表）
     */
    public List<Map<String, Object>> listPages() throws IOException {
        Path routesFile = configRoot.resolve("routes.json");
        if (!Files.exists(routesFile)) {
            return List.of();
        }
        String raw = Files.readString(routesFile, StandardCharsets.UTF_8);
        List<Map<String, Object>> routes = objectMapper.readValue(raw,
                new TypeReference<List<Map<String, Object>>>() {});

        List<Map<String, Object>> pages = new ArrayList<>();
        for (Map<String, Object> route : routes) {
            String pageId = (String) route.get("pageId");
            if (pageId == null) continue;

            Map<String, Object> page = new LinkedHashMap<>();
            page.put("pageId", pageId);
            page.put("path", route.get("path"));

            @SuppressWarnings("unchecked")
            Map<String, Object> meta = (Map<String, Object>) route.getOrDefault("meta", Map.of());
            page.put("title", meta.getOrDefault("title", pageId));
            page.put("icon", meta.getOrDefault("icon", "📄"));

            // 检查磁盘文件
            Path pageDir = configRoot.resolve(pageId);
            List<String> existingFiles = new ArrayList<>();
            if (Files.isDirectory(pageDir)) {
                for (String fname : ALLOWED_FILES) {
                    if (Files.exists(pageDir.resolve(fname))) {
                        existingFiles.add(fname);
                    }
                }
            }
            page.put("files", existingFiles);
            page.put("hasDir", Files.isDirectory(pageDir));
            pages.add(page);
        }
        return pages;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 创建页面
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 创建空配置页面：生成目录 + 脚手架文件 + 注册路由。
     */
    public Map<String, Object> createPage(String pageId, String title,
                                           String icon) throws IOException {
        validatePageId(pageId);
        Path pageDir = configRoot.resolve(pageId);

        // 检查是否已存在
        Path routesFile = configRoot.resolve("routes.json");
        if (Files.exists(routesFile)) {
            String raw = Files.readString(routesFile, StandardCharsets.UTF_8);
            List<Map<String, Object>> routes = objectMapper.readValue(raw,
                    new TypeReference<List<Map<String, Object>>>() {});
            boolean exists = routes.stream().anyMatch(r -> pageId.equals(r.get("pageId")));
            if (exists) {
                throw new IllegalArgumentException("页面已存在: " + pageId);
            }
        }

        Files.createDirectories(pageDir);

        // 生成脚手架文件
        String ruleJson = "[\n  {\n    \"type\": \"div\",\n    \"children\": [\n      {\n        \"type\": \"h2\",\n        \"children\": [\"" + title + "\"]\n      },\n      {\n        \"type\": \"p\",\n        \"children\": [\"页面配置就绪，请编辑 rule.json 设计页面布局。\"]\n      }\n    ]\n  }\n]";
        String pageDataJson = "{}";
        String scriptJs = "// " + title + " 页面脚本\nfunction __init__() {\n  console.log('" + pageId + " 页面已加载')\n}\n";
        String styleCss = "/* " + title + " 页面样式 */\n";

        Map<String, String> files = Map.of(
                "rule.json", ruleJson,
                "pagedata.json", pageDataJson,
                "script.js", scriptJs,
                "style.css", styleCss
        );

        List<String> written = new ArrayList<>();
        for (Map.Entry<String, String> entry : files.entrySet()) {
            Path target = pageDir.resolve(entry.getKey());
            Files.writeString(target, entry.getValue(), StandardCharsets.UTF_8);
            String mtime = Files.getLastModifiedTime(target).toInstant().toString();
            fileCache.put(pageId + "/" + entry.getKey(), new CacheEntry(entry.getValue(), mtime));
            written.add(entry.getKey());
        }

        // 注册路由
        autoRegisterRouteWithMeta(pageId, title, icon);

        sseService.broadcast(pageId, "__batch");
        log.info("[PageConfig] 创建页面: pageId={}, title={}", pageId, title);
        return Map.of("ok", true, "pageId", pageId, "written", written);
    }

    /**
     * 注册路由并设置 title/icon 元数据。
     */
    private void autoRegisterRouteWithMeta(String pageId, String title, String icon) {
        Path routesFile = configRoot.resolve("routes.json");
        try {
            List<Map<String, Object>> routes;
            if (Files.exists(routesFile)) {
                String raw = Files.readString(routesFile, StandardCharsets.UTF_8);
                routes = objectMapper.readValue(raw, new TypeReference<>() {});
            } else {
                routes = new ArrayList<>();
            }

            boolean exists = routes.stream().anyMatch(r -> pageId.equals(r.get("pageId")));
            if (!exists) {
                Map<String, Object> newRoute = new LinkedHashMap<>();
                newRoute.put("path", "/" + pageId);
                newRoute.put("name", pageId);
                newRoute.put("pageId", pageId);
                newRoute.put("meta", Map.of(
                        "title", (title != null && !title.isBlank()) ? title : pageId,
                        "icon", (icon != null && !icon.isBlank()) ? icon : "📄"
                ));
                routes.add(newRoute);
                String newContent = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(routes);
                Files.writeString(routesFile, newContent, StandardCharsets.UTF_8);
                String mtime = Files.getLastModifiedTime(routesFile).toInstant().toString();
                fileCache.put("routes.json", new CacheEntry(newContent, mtime));
                log.info("[PageConfig] 已注册路由: /{}", pageId);
            }
        } catch (Exception e) {
            log.warn("[PageConfig] routes.json 更新失败: {}", e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 删除页面
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 删除配置页面：移除目录 + 从 routes.json 注销路由 + 清除缓存。
     */
    public Map<String, Object> deletePage(String pageId) throws IOException {
        validatePageId(pageId);
        Path pageDir = configRoot.resolve(pageId);
        ensureInRoot(pageDir);

        // 删除目录及其文件
        List<String> deleted = new ArrayList<>();
        if (Files.isDirectory(pageDir)) {
            try (var entries = Files.list(pageDir)) {
                for (Path file : entries.toList()) {
                    Files.deleteIfExists(file);
                    deleted.add(file.getFileName().toString());
                    fileCache.remove(pageId + "/" + file.getFileName().toString());
                }
            }
            Files.deleteIfExists(pageDir);
        }

        // 从 routes.json 移除
        unregisterRoute(pageId);

        sseService.broadcast(pageId, "__deleted");
        log.info("[PageConfig] 删除页面: pageId={}, files={}", pageId, deleted);
        return Map.of("ok", true, "pageId", pageId, "deleted", deleted);
    }

    /**
     * 从 routes.json 中移除指定 pageId 的路由。
     */
    private void unregisterRoute(String pageId) {
        Path routesFile = configRoot.resolve("routes.json");
        try {
            if (!Files.exists(routesFile)) return;
            String raw = Files.readString(routesFile, StandardCharsets.UTF_8);
            List<Map<String, Object>> routes = objectMapper.readValue(raw,
                    new TypeReference<List<Map<String, Object>>>() {});
            boolean removed = routes.removeIf(r -> pageId.equals(r.get("pageId")));
            if (removed) {
                String newContent = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(routes);
                Files.writeString(routesFile, newContent, StandardCharsets.UTF_8);
                String mtime = Files.getLastModifiedTime(routesFile).toInstant().toString();
                fileCache.put("routes.json", new CacheEntry(newContent, mtime));
                log.info("[PageConfig] 已注销路由: /{}", pageId);
            }
        } catch (Exception e) {
            log.warn("[PageConfig] routes.json 更新失败: {}", e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 安全校验
    // ─────────────────────────────────────────────────────────────────────────

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

    private Path resolveAndCheck(String pageId, String filename) {
        Path target = configRoot.resolve(pageId).resolve(filename).normalize();
        ensureInRoot(target);
        return target;
    }

    private void ensureInRoot(Path target) {
        if (!target.startsWith(configRoot)) {
            throw new SecurityException("路径越界: " + target);
        }
    }
}
