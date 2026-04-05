package com.spark.ai.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.config.PagesConfigProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.UncheckedIOException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Stream;

/**
 * 页面配置文件 CRUD 服务 — 按 (tenantId, projectId) 隔离。
 *
 * <p>页面配置文件（rule.json / pagedata.json / script.js / style.css）存储在文件系统：
 * <pre>
 *   {configDir}/{tenantId}/{projectId}/{pageId}/{filename}
 * </pre>
 * <p>根级路由文件 routes.json 存储在：
 * <pre>
 *   {configDir}/{tenantId}/{projectId}/routes.json
 * </pre>
 */
@Service
public class PageConfigService {

    private static final Logger log = LoggerFactory.getLogger(PageConfigService.class);

    /** 只允许读写的文件名白名单 */
    private static final Set<String> ALLOWED_FILES =
            Set.of("rule.json", "pagedata.json", "script.js", "style.css");

    /** 页面级内部元数据文件，用于在文件系统中标记当前版。 */
    private static final String PAGE_META_FILE = "__page-meta.json";

    /** 项目根级元数据文件，用于 routes.json 等根文件的版本管理。 */
    private static final String PROJECT_META_FILE = "__project-meta.json";

    /** 页面级版本目录。 */
    private static final String PAGE_VERSIONS_DIR = "__versions";

    private final ObjectMapper objectMapper;
    private final SseService sseService;
    private final Path configRoot;

    public PageConfigService(ObjectMapper objectMapper,
                             SseService sseService,
                             PagesConfigProperties pagesProps) {
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

    /** 返回项目根目录：{configRoot}/{tenantId}/{projectId} */
    private Path projectDir(String tenantId, String projectId) {
        return configRoot.resolve(tenantId).resolve(projectId);
    }

    /** 返回 routes.json 路径：{configRoot}/{tenantId}/{projectId}/routes.json */
    private Path routesFile(String tenantId, String projectId) {
        return projectDir(tenantId, projectId).resolve("routes.json");
    }

    /** 返回项目根级元数据文件路径：{configRoot}/{tenantId}/{projectId}/__project-meta.json */
    private Path projectMetaFile(String tenantId, String projectId) {
        return projectDir(tenantId, projectId).resolve(PROJECT_META_FILE);
    }

    /** 返回文件路径：{configRoot}/{tenantId}/{projectId}/{pageId}/{filename} */
    private Path filePath(String tenantId, String projectId, String pageId, String filename) {
        return pageDir(tenantId, projectId, pageId).resolve(filename);
    }

    /** 返回页面元数据文件路径：{configRoot}/{tenantId}/{projectId}/{pageId}/__page-meta.json */
    private Path pageMetaFile(String tenantId, String projectId, String pageId) {
        return pageDir(tenantId, projectId, pageId).resolve(PAGE_META_FILE);
    }

    /** 返回页面版本目录：{configRoot}/{tenantId}/{projectId}/{pageId}/__versions */
    private Path pageVersionsDir(String tenantId, String projectId, String pageId) {
        return pageDir(tenantId, projectId, pageId).resolve(PAGE_VERSIONS_DIR);
    }

    /** 返回页面版本文件：{configRoot}/{tenantId}/{projectId}/{pageId}/__versions/{version}.json */
    private Path pageVersionFile(String tenantId, String projectId, String pageId, int version) {
        return pageVersionsDir(tenantId, projectId, pageId).resolve(version + ".json");
    }

    private record PageMeta(int currentVersion, long updatedAt, List<String> currentFiles) {
    }

    private record ProjectMeta(int currentVersion, long updatedAt, List<String> currentFiles) {
    }

    private record PageVersionRecord(
        int version,
        long updatedAt,
        List<String> changedFiles,
        Integer restoredFromVersion,
        Map<String, String> files
    ) {
    }

    private PageMeta defaultPageMeta() {
        return new PageMeta(0, 0L, List.of());
    }

    private ProjectMeta defaultProjectMeta() {
        return new ProjectMeta(0, 0L, List.of());
    }

    private PageMeta readPageMeta(String tenantId, String projectId, String pageId) throws IOException {
        Path metaPath = pageMetaFile(tenantId, projectId, pageId);
        if (!Files.isRegularFile(metaPath)) {
            return defaultPageMeta();
        }

        try {
            Map<String, Object> raw = objectMapper.readValue(
                    Files.readString(metaPath, StandardCharsets.UTF_8),
                    new TypeReference<Map<String, Object>>() {
                    }
            );
            int currentVersion = asInt(raw.get("currentVersion"), 0);
            long updatedAt = asLong(raw.get("updatedAt"), 0L);
            List<String> currentFiles = normalizeCurrentFiles(raw.get("currentFiles"));
            return new PageMeta(currentVersion, updatedAt, currentFiles);
        } catch (Exception e) {
            throw new IOException("页面元数据损坏: " + pageId + "/" + PAGE_META_FILE, e);
        }
    }

    private ProjectMeta readProjectMeta(String tenantId, String projectId) throws IOException {
        Path metaPath = projectMetaFile(tenantId, projectId);
        if (!Files.isRegularFile(metaPath)) {
            return defaultProjectMeta();
        }

        try {
            Map<String, Object> raw = objectMapper.readValue(
                    Files.readString(metaPath, StandardCharsets.UTF_8),
                    new TypeReference<Map<String, Object>>() {
                    }
            );
            int currentVersion = asInt(raw.get("currentVersion"), 0);
            long updatedAt = asLong(raw.get("updatedAt"), 0L);
            List<String> currentFiles = normalizeRootCurrentFiles(raw.get("currentFiles"));
            return new ProjectMeta(currentVersion, updatedAt, currentFiles);
        } catch (Exception e) {
            throw new IOException("项目根元数据损坏: " + tenantId + "/" + projectId + "/" + PROJECT_META_FILE, e);
        }
    }

    private void writePageMeta(String tenantId, String projectId, String pageId, PageMeta meta) throws IOException {
        Path metaPath = pageMetaFile(tenantId, projectId, pageId);
        Files.createDirectories(metaPath.getParent());

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("schemaVersion", 1);
        payload.put("pageId", pageId);
        payload.put("currentVersion", meta.currentVersion());
        payload.put("updatedAt", meta.updatedAt());
        payload.put("currentFiles", meta.currentFiles());

        String json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(payload);
        Files.writeString(metaPath, json, StandardCharsets.UTF_8);
    }

    private void writeProjectMeta(String tenantId, String projectId, ProjectMeta meta) throws IOException {
        Path metaPath = projectMetaFile(tenantId, projectId);
        Files.createDirectories(metaPath.getParent());

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("schemaVersion", 1);
        payload.put("projectId", projectId);
        payload.put("currentVersion", meta.currentVersion());
        payload.put("updatedAt", meta.updatedAt());
        payload.put("currentFiles", meta.currentFiles());

        String json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(payload);
        Files.writeString(metaPath, json, StandardCharsets.UTF_8);
    }

    private PageMeta nextPageMeta(PageMeta current, Collection<String> writtenFiles) {
        List<String> currentFiles = new ArrayList<>(writtenFiles);
        Collections.sort(currentFiles);
        return new PageMeta(current.currentVersion() + 1, System.currentTimeMillis(), currentFiles);
    }

    private ProjectMeta nextProjectMeta(ProjectMeta current, Collection<String> writtenFiles) {
        List<String> currentFiles = new ArrayList<>(writtenFiles);
        currentFiles.sort(String::compareTo);
        return new ProjectMeta(current.currentVersion() + 1, System.currentTimeMillis(), currentFiles);
    }

    private void writePageVersionRecord(
            String tenantId,
            String projectId,
            String pageId,
            PageVersionRecord versionRecord
    ) throws IOException {
        Path versionPath = pageVersionFile(tenantId, projectId, pageId, versionRecord.version());
        Files.createDirectories(versionPath.getParent());

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("schemaVersion", 1);
        payload.put("pageId", pageId);
        payload.put("version", versionRecord.version());
        payload.put("updatedAt", versionRecord.updatedAt());
        payload.put("changedFiles", versionRecord.changedFiles());
        if (versionRecord.restoredFromVersion() != null) {
            payload.put("restoredFromVersion", versionRecord.restoredFromVersion());
        }
        payload.put("files", versionRecord.files());

        String json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(payload);
        Files.writeString(versionPath, json, StandardCharsets.UTF_8);
    }

    private PageVersionRecord readPageVersionRecord(
            String tenantId,
            String projectId,
            String pageId,
            int version
    ) throws IOException {
        Path versionPath = pageVersionFile(tenantId, projectId, pageId, version);
        if (!Files.isRegularFile(versionPath)) {
            throw new NoSuchFileException(pageId + "/" + PAGE_VERSIONS_DIR + "/" + version + ".json");
        }

        try {
            Map<String, Object> raw = objectMapper.readValue(
                    Files.readString(versionPath, StandardCharsets.UTF_8),
                    new TypeReference<Map<String, Object>>() {
                    }
            );
            int snapshotVersion = asInt(raw.get("version"), version);
            long updatedAt = asLong(raw.get("updatedAt"), 0L);
            List<String> changedFiles = normalizeCurrentFiles(raw.get("changedFiles"));
            Integer restoredFromVersion = asNullableInt(raw.get("restoredFromVersion"));
            Map<String, String> files = normalizeSnapshotFiles(raw.get("files"));
            return new PageVersionRecord(snapshotVersion, updatedAt, changedFiles, restoredFromVersion, files);
        } catch (Exception e) {
            throw new IOException("页面版本文件损坏: " + pageId + "/" + PAGE_VERSIONS_DIR + "/" + version + ".json", e);
        }
    }

    private Map<String, String> normalizeSnapshotFiles(Object value) {
        if (!(value instanceof Map<?, ?> rawMap)) {
            return Map.of();
        }

        List<String> filenames = new ArrayList<>(ALLOWED_FILES);
        filenames.sort(String::compareTo);

        Map<String, String> result = new LinkedHashMap<>();
        for (String filename : filenames) {
            Object content = rawMap.get(filename);
            if (content instanceof String text) {
                result.put(filename, text);
            }
        }
        return result;
    }

    private Map<String, String> readCurrentPageFiles(String tenantId, String projectId, String pageId) throws IOException {
        List<String> filenames = new ArrayList<>(ALLOWED_FILES);
        filenames.sort(String::compareTo);

        Map<String, String> result = new LinkedHashMap<>();
        for (String filename : filenames) {
            Path fp = filePath(tenantId, projectId, pageId, filename);
            if (Files.isRegularFile(fp)) {
                result.put(filename, Files.readString(fp, StandardCharsets.UTF_8));
            }
        }
        return result;
    }

    private void archivePageVersion(
            String tenantId,
            String projectId,
            String pageId,
            PageMeta meta,
            Collection<String> changedFiles,
            Integer restoredFromVersion
    ) throws IOException {
        Map<String, String> currentFiles = readCurrentPageFiles(tenantId, projectId, pageId);
            writePageVersionRecord(
                tenantId,
                projectId,
                pageId,
                new PageVersionRecord(
                        meta.currentVersion(),
                        meta.updatedAt(),
                        normalizeCurrentFiles(changedFiles),
                        restoredFromVersion,
                        currentFiles
                )
        );
    }

    private int parseVersionFileName(String filename) {
        if (filename == null || !filename.endsWith(".json")) {
            return -1;
        }

        String numericPart = filename.substring(0, filename.length() - 5);
        try {
            return Integer.parseInt(numericPart);
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    private List<String> normalizeCurrentFiles(Object value) {
        if (!(value instanceof Collection<?> collection)) {
            return List.of();
        }
        List<String> result = new ArrayList<>();
        for (Object item : collection) {
            if (!(item instanceof String filename)) {
                continue;
            }
            if (!ALLOWED_FILES.contains(filename)) {
                continue;
            }
            result.add(filename);
        }
        result.sort(String::compareTo);
        return result;
    }

    private List<String> normalizeRootCurrentFiles(Object value) {
        if (!(value instanceof Collection<?> collection)) {
            return List.of();
        }
        List<String> result = new ArrayList<>();
        for (Object item : collection) {
            if (!(item instanceof String filename)) {
                continue;
            }
            if (!"routes.json".equals(filename)) {
                continue;
            }
            result.add(filename);
        }
        result.sort(String::compareTo);
        return result;
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
            int currentVersion = readPageMeta(tenantId, projectId, pageId).currentVersion();
            return Map.of(
                    "notModified", true,
                    "timestamp", serverTimestamp,
                    "content", "",
                    "currentVersion", currentVersion
            );
        }
        String content = Files.readString(fp, StandardCharsets.UTF_8);
        int currentVersion = readPageMeta(tenantId, projectId, pageId).currentVersion();
        return Map.of("content", content, "timestamp", serverTimestamp, "currentVersion", currentVersion);
    }

    public List<Map<String, Object>> listPageVersions(String tenantId, String projectId, String pageId) throws IOException {
        validatePageId(pageId);

        Path versionsDir = pageVersionsDir(tenantId, projectId, pageId);
        if (!Files.isDirectory(versionsDir)) {
            return List.of();
        }

        int currentVersion = readPageMeta(tenantId, projectId, pageId).currentVersion();
        List<Map<String, Object>> result = new ArrayList<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(versionsDir, "*.json")) {
            for (Path child : stream) {
                int version = parseVersionFileName(child.getFileName().toString());
                if (version <= 0) {
                    continue;
                }
                PageVersionRecord versionRecord = readPageVersionRecord(tenantId, projectId, pageId, version);
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("version", versionRecord.version());
                item.put("updatedAt", versionRecord.updatedAt());
                item.put("changedFiles", versionRecord.changedFiles());
                item.put("current", versionRecord.version() == currentVersion);
                if (versionRecord.restoredFromVersion() != null) {
                    item.put("restoredFromVersion", versionRecord.restoredFromVersion());
                }
                result.add(item);
            }
        }

        result.sort((left, right) -> Integer.compare(
                asInt(right.get("version"), 0),
                asInt(left.get("version"), 0)
        ));
        return result;
    }

    public Map<String, Object> readPageVersionFile(
            String tenantId,
            String projectId,
            String pageId,
            int version,
            String filename
    ) throws IOException {
        validatePageId(pageId);
        validateFilename(filename);
        if (version <= 0) {
            throw new IllegalArgumentException("无效的版本号: " + version);
        }

        PageVersionRecord versionRecord = readPageVersionRecord(tenantId, projectId, pageId, version);
        String content = versionRecord.files().get(filename);
        if (content == null) {
            throw new NoSuchFileException(pageId + "/" + PAGE_VERSIONS_DIR + "/" + version + "/" + filename);
        }

        int currentVersion = readPageMeta(tenantId, projectId, pageId).currentVersion();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("pageId", pageId);
        payload.put("filename", filename);
        payload.put("version", versionRecord.version());
        payload.put("updatedAt", versionRecord.updatedAt());
        payload.put("content", content);
        payload.put("changedFiles", versionRecord.changedFiles());
        payload.put("currentVersion", currentVersion);
        payload.put("current", versionRecord.version() == currentVersion);
        if (versionRecord.restoredFromVersion() != null) {
            payload.put("restoredFromVersion", versionRecord.restoredFromVersion());
        }
        return payload;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 写入（单文件）
    // ─────────────────────────────────────────────────────────────────────────

    public Map<String, Object> writeFile(String tenantId, String projectId,
                                          String pageId, String filename,
                                          String content) throws IOException {
        validatePageId(pageId);
        validateFilename(filename);

        Path fp = filePath(tenantId, projectId, pageId, filename);
        Files.createDirectories(fp.getParent());
        Files.writeString(fp, content, StandardCharsets.UTF_8);

        PageMeta currentMeta = readPageMeta(tenantId, projectId, pageId);
        PageMeta nextMeta = nextPageMeta(currentMeta, List.of(filename));
        writePageMeta(tenantId, projectId, pageId, nextMeta);
        archivePageVersion(tenantId, projectId, pageId, nextMeta, List.of(filename), null);

        String timestamp = String.valueOf(Files.getLastModifiedTime(fp).toMillis());
        sseService.broadcast(pageId, filename);
        log.info("[PageConfig] 写入文件: {}/{}", pageId, filename);
        return Map.of("ok", true, "timestamp", timestamp, "currentVersion", nextMeta.currentVersion());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 批量写入
    // ─────────────────────────────────────────────────────────────────────────

    public Map<String, Object> writeBatch(String tenantId, String projectId,
                                           String pageId,
                                           Map<String, String> files) throws IOException {
        validatePageId(pageId);

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

        PageMeta currentMeta = readPageMeta(tenantId, projectId, pageId);
        PageMeta nextMeta = written.isEmpty()
                ? currentMeta
                : nextPageMeta(currentMeta, written);
        if (!written.isEmpty()) {
            writePageMeta(tenantId, projectId, pageId, nextMeta);
            archivePageVersion(tenantId, projectId, pageId, nextMeta, written, null);
        }

        sseService.broadcast(pageId, "__batch");
        log.info("[PageConfig] 批量写入: pageId={}, files={}", pageId, written);
        return Map.of(
                "ok", true,
                "pageId", pageId,
                "written", written,
                "currentVersion", nextMeta.currentVersion()
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 根级文件读取（routes.json — 文件系统）
    // ─────────────────────────────────────────────────────────────────────────

    /**
        * 读取根级配置文件（routes.json）。
     * 保持与 FileLoader 时间戳协议的兼容。
     */
    public Map<String, Object> readRootFile(String tenantId, String projectId,
                                             String filename,
                                             String clientTimestamp) throws IOException {
        if (!"routes.json".equals(filename)) {
            throw new IllegalArgumentException("不允许读取根级文件: " + filename);
        }

        int currentVersion = readProjectMeta(tenantId, projectId).currentVersion();

        Path routes = routesFile(tenantId, projectId);

        if (Files.isRegularFile(routes)) {
            String timestamp = String.valueOf(Files.getLastModifiedTime(routes).toMillis());
            if (clientTimestamp != null && clientTimestamp.equals(timestamp)) {
                return Map.of(
                        "notModified", true,
                        "timestamp", timestamp,
                        "content", "",
                        "currentVersion", currentVersion
                );
            }
            return Map.of(
                    "content", Files.readString(routes, StandardCharsets.UTF_8),
                    "timestamp", timestamp,
                    "currentVersion", currentVersion
            );
        }

        String content = generateRoutesJson(tenantId, projectId);
        String timestamp = String.valueOf(content.hashCode());

        if (clientTimestamp != null && clientTimestamp.equals(timestamp)) {
            return Map.of(
                    "notModified", true,
                    "timestamp", timestamp,
                    "content", "",
                    "currentVersion", currentVersion
            );
        }
        return Map.of(
                "content", content,
                "timestamp", timestamp,
                "currentVersion", currentVersion
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 页面列表
    // ─────────────────────────────────────────────────────────────────────────

    public List<Map<String, Object>> listPages(String tenantId, String projectId) {
        List<Map<String, Object>> result = new ArrayList<>();
        Map<String, Map<String, Object>> routes = loadRouteMetaByPageId(tenantId, projectId);
        Set<String> pageIds = new LinkedHashSet<>();
        pageIds.addAll(scanPageIds(tenantId, projectId));
        pageIds.addAll(routes.keySet());

        for (String pageId : pageIds) {
            Map<String, Object> routeMeta = routes.getOrDefault(pageId, Map.of());
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("pageId", pageId);
            item.put("path", routeMeta.getOrDefault("path", "/" + pageId));
            item.put("title", routeMeta.getOrDefault("title", pageId));
            item.put("icon", routeMeta.getOrDefault("icon", "Document"));

            // 从文件系统扫描已有文件
            Path dir = pageDir(tenantId, projectId, pageId);
            List<String> existingFiles = new ArrayList<>();
            if (Files.isDirectory(dir)) {
                for (String fname : ALLOWED_FILES) {
                    if (Files.isRegularFile(dir.resolve(fname))) {
                        existingFiles.add(fname);
                    }
                }
            }
            try {
                PageMeta meta = readPageMeta(tenantId, projectId, pageId);
                item.put("currentVersion", meta.currentVersion());
                item.put("updatedAt", meta.updatedAt());
            } catch (IOException e) {
                log.warn("[PageConfig] 读取页面元数据失败 tenant={} project={} pageId={}: {}",
                        tenantId, projectId, pageId, e.getMessage());
                item.put("currentVersion", 0);
                item.put("updatedAt", 0L);
            }
            item.put("pageType", routeMeta.getOrDefault("pageType", "config"));
            item.put("files", existingFiles);
            item.put("hasDir", Files.isDirectory(dir));
            result.add(item);
        }
        return result;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 创建页面
    // ─────────────────────────────────────────────────────────────────────────

    public Map<String, Object> createPage(String tenantId, String projectId,
                                           String pageId, String title,
                                           String icon) throws IOException {
        validatePageId(pageId);

        Path dir = pageDir(tenantId, projectId, pageId);
        if (Files.exists(dir)) {
            throw new IllegalArgumentException("页面已存在: " + pageId);
        }

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

        Files.createDirectories(dir);

        List<String> written = new ArrayList<>();
        for (Map.Entry<String, String> entry : scaffold.entrySet()) {
            Files.writeString(dir.resolve(entry.getKey()), entry.getValue(), StandardCharsets.UTF_8);
            written.add(entry.getKey());
        }

        PageMeta meta = nextPageMeta(defaultPageMeta(), written);
        writePageMeta(tenantId, projectId, pageId, meta);
        archivePageVersion(tenantId, projectId, pageId, meta, written, null);

        sseService.broadcast(pageId, "__batch");
        log.info("[PageConfig] 创建页面: pageId={}, title={}", pageId, title);
        return Map.of("ok", true, "pageId", pageId, "written", written, "currentVersion", meta.currentVersion());
    }

    public Map<String, Object> restorePageVersion(
            String tenantId,
            String projectId,
            String pageId,
            int version
    ) throws IOException {
        validatePageId(pageId);
        if (version <= 0) {
            throw new IllegalArgumentException("无效的版本号: " + version);
        }

        PageVersionRecord versionRecord = readPageVersionRecord(tenantId, projectId, pageId, version);
        Path dir = pageDir(tenantId, projectId, pageId);
        Files.createDirectories(dir);

        List<String> filenames = new ArrayList<>(ALLOWED_FILES);
        filenames.sort(String::compareTo);
        for (String filename : filenames) {
            Path target = dir.resolve(filename);
            String content = versionRecord.files().get(filename);
            if (content == null) {
                Files.deleteIfExists(target);
                continue;
            }
            Files.writeString(target, content, StandardCharsets.UTF_8);
        }

        PageMeta currentMeta = readPageMeta(tenantId, projectId, pageId);
    PageMeta nextMeta = nextPageMeta(currentMeta, versionRecord.files().keySet());
        writePageMeta(tenantId, projectId, pageId, nextMeta);
    archivePageVersion(tenantId, projectId, pageId, nextMeta, versionRecord.files().keySet(), version);

        sseService.broadcast(pageId, "__batch");
        log.info("[PageConfig] 恢复页面版本: pageId={}, fromVersion={}, currentVersion={}",
                pageId, version, nextMeta.currentVersion());

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("ok", true);
        payload.put("pageId", pageId);
        payload.put("restoredFromVersion", version);
        payload.put("currentVersion", nextMeta.currentVersion());
        payload.put("written", normalizeCurrentFiles(versionRecord.files().keySet()));
        payload.put("updatedAt", nextMeta.updatedAt());
        return payload;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 删除页面
    // ─────────────────────────────────────────────────────────────────────────

    public Map<String, Object> deletePage(String tenantId, String projectId,
                                           String pageId) throws IOException {
        validatePageId(pageId);

        // 删除文件系统上的页面目录
        Path dir = pageDir(tenantId, projectId, pageId);
        List<String> deleted = new ArrayList<>();
        if (Files.isDirectory(dir)) {
            try (Stream<Path> walk = Files.walk(dir)) {
                walk.sorted(Comparator.reverseOrder()).forEach(path -> {
                    if (!path.equals(dir)) {
                        deleted.add(dir.relativize(path).toString().replace('\\', '/'));
                    }
                    try {
                        Files.deleteIfExists(path);
                    } catch (IOException e) {
                        throw new UncheckedIOException(e);
                    }
                });
            } catch (UncheckedIOException e) {
                throw e.getCause();
            }
        }

        sseService.broadcast(pageId, "__deleted");
        log.info("[PageConfig] 删除页面: pageId={}, files={}", pageId, deleted);
        return Map.of("ok", true, "pageId", pageId, "deleted", deleted);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 辅助方法
    // ─────────────────────────────────────────────────────────────────────────

    private String generateRoutesJson(String tenantId, String projectId) throws IOException {
        List<Map<String, Object>> routes = new ArrayList<>();
        for (String pageId : scanPageIds(tenantId, projectId)) {
            Map<String, Object> route = new LinkedHashMap<>();
            route.put("path", "/" + pageId);
            route.put("name", pageId);
            route.put("pageId", pageId);
            Map<String, Object> meta = new LinkedHashMap<>();
            meta.put("title", pageId);
            meta.put("icon", "Document");
            meta.put("pageType", "config");
            route.put("meta", meta);
            routes.add(route);
        }
        return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(routes);
    }

    private List<String> scanPageIds(String tenantId, String projectId) {
        Path project = projectDir(tenantId, projectId);
        if (!Files.isDirectory(project)) {
            return List.of();
        }
        List<String> pageIds = new ArrayList<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(project)) {
            for (Path child : stream) {
                if (Files.isDirectory(child)) {
                    pageIds.add(child.getFileName().toString());
                }
            }
        } catch (IOException e) {
            log.warn("[PageConfig] 扫描页面目录失败 tenant={} project={}: {}",
                    tenantId, projectId, e.getMessage());
        }
        pageIds.sort(String::compareTo);
        return pageIds;
    }

    private Map<String, Map<String, Object>> loadRouteMetaByPageId(String tenantId, String projectId) {
        Path routes = routesFile(tenantId, projectId);
        if (!Files.isRegularFile(routes)) {
            return Map.of();
        }

        try {
            String content = Files.readString(routes, StandardCharsets.UTF_8);
            List<Map<String, Object>> routeList = objectMapper.readValue(
                    content,
                    new TypeReference<List<Map<String, Object>>>() {
                    }
            );
            Map<String, Map<String, Object>> result = new LinkedHashMap<>();
            for (Map<String, Object> route : routeList) {
                String pageId = asTrimmedString(route.get("pageId"));
                if (pageId.isBlank()) {
                    continue;
                }
                Map<String, Object> meta = route.get("meta") instanceof Map<?, ?>
                        ? (Map<String, Object>) route.get("meta")
                        : Map.of();

                Map<String, Object> merged = new LinkedHashMap<>();
                merged.put("path", route.getOrDefault("path", "/" + pageId));
                merged.put("title", meta.getOrDefault("title", pageId));
                merged.put("icon", meta.getOrDefault("icon", "Document"));
                merged.put("pageType", meta.getOrDefault("pageType", "config"));
                result.put(pageId, merged);
            }
            return result;
        } catch (Exception e) {
            log.warn("[PageConfig] 解析 routes.json 失败 tenant={} project={}: {}",
                    tenantId, projectId, e.getMessage());
            return Map.of();
        }
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
      * 批量同步静态 Vue 组件路由到 routes.json（幂等）。
     *
     * @param routes 路由列表，每项需包含 path, name, pageId, title, icon
     * @return 同步结果统计
     */
    public Map<String, Object> syncStaticRoutes(String tenantId, String projectId,
                                                 List<Map<String, String>> routes) {
          Path routesPath = routesFile(tenantId, projectId);
        int created = 0;
        int updated = 0;
        List<String> synced = new ArrayList<>();
          Map<String, Map<String, Object>> existing = loadRouteMetaByPageId(tenantId, projectId);
          List<Map<String, Object>> normalized = new ArrayList<>();

        for (Map<String, String> r : routes) {
            String pageId = r.get("pageId");
            if (pageId == null || pageId.isBlank()) continue;
            validatePageId(pageId);

            String path = r.getOrDefault("path", "/" + pageId);
            String name = r.getOrDefault("name", pageId);
            String title = r.getOrDefault("title", pageId);
            String icon = r.getOrDefault("icon", "📄");

            Map<String, Object> old = existing.get(pageId);
            if (old == null) {
                created++;
            } else {
                boolean changed = !Objects.equals(old.get("path"), path)
                        || !Objects.equals(old.get("title"), title)
                        || !Objects.equals(old.get("icon"), icon)
                        || !Objects.equals(old.get("pageType"), "system-page");
                if (changed) {
                    updated++;
                }
            }

            Map<String, Object> route = new LinkedHashMap<>();
            route.put("path", path);
            route.put("name", name);
            route.put("pageId", pageId);

            Map<String, Object> meta = new LinkedHashMap<>();
            meta.put("title", title);
            meta.put("icon", icon);
            meta.put("pageType", "system-page");
            route.put("meta", meta);

            normalized.add(route);
            synced.add(pageId);
        }

        try {
            Files.createDirectories(routesPath.getParent());
            String json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(normalized);
            Files.writeString(routesPath, json, StandardCharsets.UTF_8);

            ProjectMeta currentMeta = readProjectMeta(tenantId, projectId);
            ProjectMeta nextMeta = nextProjectMeta(currentMeta, List.of("routes.json"));
            writeProjectMeta(tenantId, projectId, nextMeta);

            log.info("[PageConfig] 静态路由同步完成: created={}, updated={}, total={}, currentVersion={}",
                    created, updated, synced.size(), nextMeta.currentVersion());
            return Map.of(
                    "ok", true,
                    "created", created,
                    "updated", updated,
                    "synced", synced,
                    "currentVersion", nextMeta.currentVersion()
            );
        } catch (IOException e) {
            throw new IllegalArgumentException("写入 routes.json 失败: " + e.getMessage(), e);
        }
    }

    private String asTrimmedString(Object value) {
        if (!(value instanceof String str)) {
            return "";
        }
        return str.trim();
    }

    private int asInt(Object value, int fallback) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value instanceof String text) {
            try {
                return Integer.parseInt(text.trim());
            } catch (NumberFormatException ignored) {
                return fallback;
            }
        }
        return fallback;
    }

    private Integer asNullableInt(Object value) {
        if (value == null) {
            return null;
        }
        int parsed = asInt(value, Integer.MIN_VALUE);
        return parsed == Integer.MIN_VALUE ? null : parsed;
    }

    private long asLong(Object value, long fallback) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value instanceof String text) {
            try {
                return Long.parseLong(text.trim());
            } catch (NumberFormatException ignored) {
                return fallback;
            }
        }
        return fallback;
    }

    /** 简单 JSON 字符串转义（用于脚手架模板） */
    private static String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
