package com.spark.ai.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.config.PagesConfigProperties;
import com.spark.ai.entity.FileVersionEntity;
import com.spark.ai.repository.FileVersionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.UncheckedIOException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Stream;

/**
 * 页面配置文件 CRUD 服务 — 按 (tenantId, projectId) 隔离。
 *
 * <h3>文件级版本管理</h3>
 * <p>每个配置文件（rule.json / pagedata.json / script.js / style.css）拥有独立版本链。
 * 版本元数据存储在 H2 数据库（file_version 表），文件内容存储在磁盘。
 *
 * <h3>磁盘命名约定</h3>
 * <ul>
 *   <li>v0（工作文件）：{pageId}/{filename}（裸文件名）</li>
 *   <li>v1+（版本快照）：{pageId}/{version}__{filename}</li>
 * </ul>
 *
 * <h3>writeFile 行为</h3>
 * <p>writeFile 只写入磁盘当前工作文件（裸文件名），不自动升版。
 * 升版通过 createFileVersion() 显式触发。
 */
@Service
public class PageConfigService {

    private static final Logger log = LoggerFactory.getLogger(PageConfigService.class);

    /** 只允许读写的文件名白名单 */
    static final Set<String> ALLOWED_FILES =
            Set.of("rule.json", "pagedata.json", "script.js", "style.css");

    private final ObjectMapper objectMapper;
    private final SseService sseService;
    private final FileVersionRepository fileVersionRepository;
    private final Path configRoot;

    public PageConfigService(ObjectMapper objectMapper,
                             SseService sseService,
                             FileVersionRepository fileVersionRepository,
                             PagesConfigProperties pagesProps) {
        this.objectMapper = objectMapper;
        this.sseService = sseService;
        this.fileVersionRepository = fileVersionRepository;
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

    /** 返回工作文件路径（裸文件名）：{pageId}/{filename} */
    private Path filePath(String tenantId, String projectId, String pageId, String filename) {
        return pageDir(tenantId, projectId, pageId).resolve(filename);
    }

    /** 返回版本快照路径：{pageId}/{version}__{filename} */
    private Path versionFilePath(String tenantId, String projectId, String pageId,
                                  int version, String filename) {
        return pageDir(tenantId, projectId, pageId).resolve(version + "__" + filename);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 文件级版本管理（DB 驱动）
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 创建文件版本快照 — 将当前工作文件内容保存为新版本。
     * <ol>
     *   <li>读取当前工作文件内容（裸文件名）</li>
     *   <li>DB 分配版本号 = maxVersion + 1</li>
     *   <li>写入版本快照到磁盘：{version}__{filename}</li>
     *   <li>DB 清除旧 is_current，插入新记录 is_current=true</li>
     * </ol>
     */
    @Transactional
    public Map<String, Object> createFileVersion(String tenantId, String projectId,
                                                  String pageId, String filename,
                                                  String modifiedBy) throws IOException {
        validatePageId(pageId);
        validateFilename(filename);

        Path workingFile = filePath(tenantId, projectId, pageId, filename);
        if (!Files.isRegularFile(workingFile)) {
            throw new NoSuchFileException(pageId + "/" + filename);
        }

        String content = Files.readString(workingFile, StandardCharsets.UTF_8);

        int nextVersion = fileVersionRepository.findMaxVersion(tenantId, projectId, pageId, filename) + 1;

        // 写入版本快照到磁盘
        Path snapshotPath = versionFilePath(tenantId, projectId, pageId, nextVersion, filename);
        Files.writeString(snapshotPath, content, StandardCharsets.UTF_8);

        // DB: 清除旧 is_current，插入新记录
        fileVersionRepository.clearCurrentFlag(tenantId, projectId, pageId, filename);

        FileVersionEntity entity = new FileVersionEntity();
        entity.setTenantId(tenantId);
        entity.setProjectId(projectId);
        entity.setPageId(pageId);
        entity.setFilename(filename);
        entity.setVersion(nextVersion);
        entity.setCurrent(true);
        entity.setModifiedBy(modifiedBy);
        fileVersionRepository.save(entity);

        log.info("[PageConfig] 创建文件版本: {}/{} v{}", pageId, filename, nextVersion);
        return Map.of("ok", true, "pageId", pageId, "filename", filename,
                "version", nextVersion, "createdAt", entity.getCreatedAt().toEpochMilli());
    }

    /**
     * 查询某文件的全部版本列表（按版本号倒序）。
     */
    public List<Map<String, Object>> listFileVersions(String tenantId, String projectId,
                                                       String pageId, String filename) {
        validatePageId(pageId);
        validateFilename(filename);

        List<FileVersionEntity> entities = fileVersionRepository
                .findByTenantIdAndProjectIdAndPageIdAndFilenameOrderByVersionDesc(
                        tenantId, projectId, pageId, filename);

        List<Map<String, Object>> result = new ArrayList<>();
        for (FileVersionEntity e : entities) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("version", e.getVersion());
            item.put("createdAt", e.getCreatedAt().toEpochMilli());
            item.put("isCurrent", e.isCurrent());
            item.put("modifiedBy", e.getModifiedBy());
            result.add(item);
        }
        return result;
    }

    /**
     * 查询某页面全部文件的版本列表（按文件名+版本号排序）。
     */
    public List<Map<String, Object>> listPageFileVersions(String tenantId, String projectId,
                                                           String pageId) {
        validatePageId(pageId);

        List<FileVersionEntity> entities = fileVersionRepository
                .findByTenantIdAndProjectIdAndPageIdOrderByFilenameAscVersionDesc(
                        tenantId, projectId, pageId);

        List<Map<String, Object>> result = new ArrayList<>();
        for (FileVersionEntity e : entities) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("filename", e.getFilename());
            item.put("version", e.getVersion());
            item.put("createdAt", e.getCreatedAt().toEpochMilli());
            item.put("isCurrent", e.isCurrent());
            item.put("modifiedBy", e.getModifiedBy());
            result.add(item);
        }
        return result;
    }

    /**
     * 读取指定版本的文件内容。
     */
    public Map<String, Object> readFileVersionContent(String tenantId, String projectId,
                                                       String pageId, String filename,
                                                       int version) throws IOException {
        validatePageId(pageId);
        validateFilename(filename);
        if (version <= 0) {
            throw new IllegalArgumentException("无效的版本号: " + version);
        }

        // 验证版本存在于 DB
        FileVersionEntity entity = fileVersionRepository
                .findByTenantIdAndProjectIdAndPageIdAndFilenameAndVersion(
                        tenantId, projectId, pageId, filename, version)
                .orElseThrow(() -> new NoSuchFileException(
                        pageId + "/" + version + "__" + filename + "（版本不存在）"));

        Path snapshotPath = versionFilePath(tenantId, projectId, pageId, version, filename);
        if (!Files.isRegularFile(snapshotPath)) {
            throw new NoSuchFileException(pageId + "/" + version + "__" + filename);
        }

        String content = Files.readString(snapshotPath, StandardCharsets.UTF_8);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("pageId", pageId);
        payload.put("filename", filename);
        payload.put("version", version);
        payload.put("createdAt", entity.getCreatedAt().toEpochMilli());
        payload.put("isCurrent", entity.isCurrent());
        payload.put("modifiedBy", entity.getModifiedBy());
        payload.put("content", content);
        return payload;
    }

    /**
     * 恢复指定版本：读取版本快照内容 → 覆盖工作文件。
     */
    public Map<String, Object> restoreFileVersion(String tenantId, String projectId,
                                                    String pageId, String filename,
                                                    int version) throws IOException {
        validatePageId(pageId);
        validateFilename(filename);
        if (version <= 0) {
            throw new IllegalArgumentException("无效的版本号: " + version);
        }

        // 验证版本存在
        fileVersionRepository.findByTenantIdAndProjectIdAndPageIdAndFilenameAndVersion(
                tenantId, projectId, pageId, filename, version)
                .orElseThrow(() -> new NoSuchFileException(
                        pageId + "/" + version + "__" + filename + "（版本不存在）"));

        Path snapshotPath = versionFilePath(tenantId, projectId, pageId, version, filename);
        if (!Files.isRegularFile(snapshotPath)) {
            throw new NoSuchFileException(pageId + "/" + version + "__" + filename);
        }

        String content = Files.readString(snapshotPath, StandardCharsets.UTF_8);
        Path workingFile = filePath(tenantId, projectId, pageId, filename);
        Files.createDirectories(workingFile.getParent());
        Files.writeString(workingFile, content, StandardCharsets.UTF_8);

        sseService.broadcast(pageId, filename);
        log.info("[PageConfig] 恢复文件版本: {}/{} → v{}", pageId, filename, version);
        return Map.of("ok", true, "pageId", pageId, "filename", filename,
                "restoredVersion", version);
    }

    /**
     * 删除指定版本（DB 记录 + 磁盘快照）。不允许删除当前版本。
     */
    @Transactional
    public void deleteFileVersion(String tenantId, String projectId,
                                   String pageId, String filename,
                                   int version) throws IOException {
        validatePageId(pageId);
        validateFilename(filename);
        if (version <= 0) {
            throw new IllegalArgumentException("无效的版本号: " + version);
        }

        FileVersionEntity entity = fileVersionRepository
                .findByTenantIdAndProjectIdAndPageIdAndFilenameAndVersion(
                        tenantId, projectId, pageId, filename, version)
                .orElseThrow(() -> new NoSuchFileException(
                        pageId + "/" + version + "__" + filename + "（版本不存在）"));

        if (entity.isCurrent()) {
            throw new IllegalArgumentException("不能删除当前版本: " + filename + " v" + version);
        }

        // 删除磁盘快照
        Path snapshotPath = versionFilePath(tenantId, projectId, pageId, version, filename);
        Files.deleteIfExists(snapshotPath);

        // 删除 DB 记录
        fileVersionRepository.deleteByTenantIdAndProjectIdAndPageIdAndFilenameAndVersion(
                tenantId, projectId, pageId, filename, version);

        log.info("[PageConfig] 删除文件版本: {}/{} v{}", pageId, filename, version);
    }

    /**
     * 修剪某文件的旧版本，保留最近 keepCount 个。当前版本始终保留。
     *
     * @return 实际删除的版本数
     */
    @Transactional
    public int pruneFileVersions(String tenantId, String projectId,
                                  String pageId, String filename,
                                  int keepCount) throws IOException {
        validatePageId(pageId);
        validateFilename(filename);
        if (keepCount < 1) {
            throw new IllegalArgumentException("keepCount 必须 >= 1，传入: " + keepCount);
        }

        List<FileVersionEntity> versions = fileVersionRepository
                .findByTenantIdAndProjectIdAndPageIdAndFilenameOrderByVersionDesc(
                        tenantId, projectId, pageId, filename);

        int deleted = 0;
        for (int i = keepCount; i < versions.size(); i++) {
            FileVersionEntity e = versions.get(i);
            if (e.isCurrent()) continue; // 当前版本始终保留

            Path snapshotPath = versionFilePath(tenantId, projectId, pageId, e.getVersion(), filename);
            Files.deleteIfExists(snapshotPath);
            fileVersionRepository.deleteByTenantIdAndProjectIdAndPageIdAndFilenameAndVersion(
                    tenantId, projectId, pageId, filename, e.getVersion());
            deleted++;
        }

        log.info("[PageConfig] 修剪文件版本: {}/{}, keepCount={}, deleted={}",
                pageId, filename, keepCount, deleted);
        return deleted;
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
            return Map.of(
                    "notModified", true,
                    "timestamp", serverTimestamp,
                    "content", ""
            );
        }
        String content = Files.readString(fp, StandardCharsets.UTF_8);
        return Map.of("content", content, "timestamp", serverTimestamp);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 写入（单文件） — 只写磁盘，不自动升版
    // ─────────────────────────────────────────────────────────────────────────

    public Map<String, Object> writeFile(String tenantId, String projectId,
                                          String pageId, String filename,
                                          String content) throws IOException {
        validatePageId(pageId);
        validateFilename(filename);

        Path fp = filePath(tenantId, projectId, pageId, filename);
        Files.createDirectories(fp.getParent());

        // 内容变更检测 — 相同内容跳过写入
        if (Files.isRegularFile(fp)) {
            String existing = Files.readString(fp, StandardCharsets.UTF_8);
            if (existing.equals(content)) {
                String timestamp = String.valueOf(Files.getLastModifiedTime(fp).toMillis());
                return Map.of("ok", true, "timestamp", timestamp, "unchanged", true);
            }
        }

        Files.writeString(fp, content, StandardCharsets.UTF_8);

        String timestamp = String.valueOf(Files.getLastModifiedTime(fp).toMillis());
        sseService.broadcast(pageId, filename);
        log.info("[PageConfig] 写入文件: {}/{}", pageId, filename);
        return Map.of("ok", true, "timestamp", timestamp);
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

        Path routes = routesFile(tenantId, projectId);

        if (Files.isRegularFile(routes)) {
            String timestamp = String.valueOf(Files.getLastModifiedTime(routes).toMillis());
            if (clientTimestamp != null && clientTimestamp.equals(timestamp)) {
                return Map.of(
                        "notModified", true,
                        "timestamp", timestamp,
                        "content", ""
                );
            }
            return Map.of(
                    "content", Files.readString(routes, StandardCharsets.UTF_8),
                    "timestamp", timestamp
            );
        }

        String content = generateRoutesJson(tenantId, projectId);
        String timestamp = String.valueOf(content.hashCode());

        if (clientTimestamp != null && clientTimestamp.equals(timestamp)) {
            return Map.of(
                    "notModified", true,
                    "timestamp", timestamp,
                    "content", ""
            );
        }
        return Map.of(
                "content", content,
                "timestamp", timestamp
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 数据健康检查
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 检查指定项目下所有页面的版本数据健康状况。
     * 检测以下问题：
     * - DB 中有版本记录但磁盘快照文件缺失
     * - 磁盘有版本快照但 DB 无对应记录
     * - is_current 标记不一致
     *
     * @return 按 pageId 分组的诊断结果列表
     */
    public List<Map<String, Object>> checkPagesHealth(String tenantId, String projectId) {
        List<Map<String, Object>> results = new ArrayList<>();
        List<String> pageIds = scanPageIds(tenantId, projectId);

        for (String pageId : pageIds) {
            Map<String, Object> report = new LinkedHashMap<>();
            report.put("pageId", pageId);
            List<String> issues = new ArrayList<>();

            // 检查工作文件存在
            Path dir = pageDir(tenantId, projectId, pageId);
            List<String> existingFiles = new ArrayList<>();
            for (String fname : ALLOWED_FILES) {
                if (Files.isRegularFile(dir.resolve(fname))) {
                    existingFiles.add(fname);
                }
            }
            report.put("files", existingFiles);

            // 检查 DB 版本记录 vs 磁盘快照
            List<FileVersionEntity> dbVersions = fileVersionRepository
                    .findByTenantIdAndProjectIdAndPageIdOrderByFilenameAscVersionDesc(
                            tenantId, projectId, pageId);
            report.put("versionCount", dbVersions.size());

            for (FileVersionEntity e : dbVersions) {
                Path snapshotPath = versionFilePath(tenantId, projectId, pageId,
                        e.getVersion(), e.getFilename());
                if (!Files.isRegularFile(snapshotPath)) {
                    issues.add("DB 有版本记录但磁盘快照缺失: " + e.getFilename() + " v" + e.getVersion());
                }
            }

            report.put("healthy", issues.isEmpty());
            report.put("issues", issues);
            results.add(report);
        }

        return results;
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

            // 从 DB 查询版本统计
            List<FileVersionEntity> currentVersions = fileVersionRepository
                    .findByTenantIdAndProjectIdAndPageIdAndIsCurrentTrue(
                            tenantId, projectId, pageId);
            Map<String, Integer> versionMap = new LinkedHashMap<>();
            for (FileVersionEntity e : currentVersions) {
                versionMap.put(e.getFilename(), e.getVersion());
            }
            item.put("currentVersions", versionMap);
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

        sseService.broadcast(pageId, "__created");
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

        // 删除 DB 中该页面的全部版本记录
        fileVersionRepository.deleteByTenantIdAndProjectIdAndPageId(tenantId, projectId, pageId);

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

            log.info("[PageConfig] 静态路由同步完成: created={}, updated={}, total={}",
                    created, updated, synced.size());
            return Map.of(
                    "ok", true,
                    "created", created,
                    "updated", updated,
                    "synced", synced
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

    /** 简单 JSON 字符串转义（用于脚手架模板） */
    private static String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
