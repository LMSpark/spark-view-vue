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
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
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
    private final Path seedRoot;
    private final ObjectMapper objectMapper;
    private final SseService sseService;

    public PageConfigService(PagesConfigProperties props,
                              ObjectMapper objectMapper,
                              SseService sseService) {
        this.configRoot = Paths.get(props.getConfigDir()).toAbsolutePath().normalize();
        this.seedRoot = Paths.get(props.getSeedDir()).toAbsolutePath().normalize();
        this.objectMapper = objectMapper;
        this.sseService = sseService;
        log.info("[PageConfig] 配置目录: {}", this.configRoot);
        log.info("[PageConfig] 种子目录: {}", this.seedRoot);
    }

    /**
     * 首次启动种子机制：若 configRoot 下没有 routes.json，从 seedRoot 拷贝初始数据。
     * 生产环境 configDir 由运维预先准备或通过 AI 生成，种子仅开发环境生效。
     */
    @PostConstruct
    void seedIfEmpty() {
        Path routesFile = configRoot.resolve("routes.json");
        if (Files.exists(routesFile)) {
            log.info("[PageConfig] 已有 routes.json，跳过种子");
            return;
        }
        if (!Files.exists(seedRoot)) {
            log.info("[PageConfig] 种子目录不存在: {}，创建空 routes.json", seedRoot);
            try {
                Files.createDirectories(configRoot);
                Files.writeString(routesFile, "[]", StandardCharsets.UTF_8);
            } catch (IOException e) {
                log.warn("[PageConfig] 创建空 routes.json 失败: {}", e.getMessage());
            }
            return;
        }
        log.info("[PageConfig] 首次启动，从种子目录拷贝: {} → {}", seedRoot, configRoot);
        try {
            Files.walkFileTree(seedRoot, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) throws IOException {
                    Path target = configRoot.resolve(seedRoot.relativize(dir));
                    Files.createDirectories(target);
                    return FileVisitResult.CONTINUE;
                }
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                    Path target = configRoot.resolve(seedRoot.relativize(file));
                    Files.copy(file, target, StandardCopyOption.REPLACE_EXISTING);
                    return FileVisitResult.CONTINUE;
                }
            });
            log.info("[PageConfig] 种子数据拷贝完成");
        } catch (IOException e) {
            log.warn("[PageConfig] 种子拷贝失败: {}", e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 读取
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 读取页面配置文件，支持 FileLoader 时间戳协议。
     * 优先走内存缓存；缓存未命中时从磁盘读取并缓存。
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

        CacheEntry cached = fileCache.get(cacheKey);
        if (cached != null) {
            if (clientTimestamp != null && clientTimestamp.equals(cached.timestamp())) {
                return Map.of("notModified", true, "timestamp", cached.timestamp(), "content", "");
            }
            return Map.of("content", cached.content(), "timestamp", cached.timestamp());
        }

        // 缓存未命中：从磁盘读取
        if (!Files.exists(target)) {
            throw new NoSuchFileException(target.toString());
        }
        String mtime = Files.getLastModifiedTime(target).toInstant().toString();
        String content = Files.readString(target, StandardCharsets.UTF_8);
        fileCache.put(cacheKey, new CacheEntry(content, mtime));

        if (clientTimestamp != null && clientTimestamp.equals(mtime)) {
            return Map.of("notModified", true, "timestamp", mtime, "content", "");
        }
        return Map.of("content", content, "timestamp", mtime);
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

        CacheEntry cached = fileCache.get(filename);
        if (cached != null) {
            if (clientTimestamp != null && clientTimestamp.equals(cached.timestamp())) {
                return Map.of("notModified", true, "timestamp", cached.timestamp(), "content", "");
            }
            return Map.of("content", cached.content(), "timestamp", cached.timestamp());
        }

        if (!Files.exists(target)) {
            throw new NoSuchFileException(target.toString());
        }
        String mtime = Files.getLastModifiedTime(target).toInstant().toString();
        String content = Files.readString(target, StandardCharsets.UTF_8);
        fileCache.put(filename, new CacheEntry(content, mtime));

        if (clientTimestamp != null && clientTimestamp.equals(mtime)) {
            return Map.of("notModified", true, "timestamp", mtime, "content", "");
        }
        return Map.of("content", content, "timestamp", mtime);
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
