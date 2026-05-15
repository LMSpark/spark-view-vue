package com.spark.ai.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.config.PagesConfigProperties;
import com.spark.ai.entity.FileVersionEntity;
import com.spark.ai.repository.FileVersionRepository;
import com.spark.ai.security.AccessGuardService;
import com.spark.ai.storage.FilePageConfigStorage;
import com.spark.ai.storage.PageConfigStorage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.file.*;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;
import java.util.regex.Pattern;

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
    private static final Pattern SAFE_SCOPE_ID = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,127}");

    private final ObjectMapper objectMapper;
    private final SseService sseService;
    private final FileVersionRepository fileVersionRepository;
    private final PageConfigStorage storage;
    private final AccessGuardService accessGuard;

    @Autowired
    public PageConfigService(ObjectMapper objectMapper,
                             SseService sseService,
                             FileVersionRepository fileVersionRepository,
                             PageConfigStorage storage,
                             AccessGuardService accessGuard) {
        this.objectMapper = objectMapper;
        this.sseService = sseService;
        this.fileVersionRepository = fileVersionRepository;
        this.storage = storage;
        this.accessGuard = accessGuard;
    }

    public PageConfigService(ObjectMapper objectMapper,
                             SseService sseService,
                             FileVersionRepository fileVersionRepository,
                             PagesConfigProperties pagesProps) {
        this(objectMapper, sseService, fileVersionRepository,
                new FilePageConfigStorage(Path.of(pagesProps.getConfigDir())), null);
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
        return createFileVersionWithAudit(tenantId, projectId, pageId, filename,
                VersionAuditInput.from(Map.of("modifiedBy", modifiedBy != null ? modifiedBy : "")));
    }

    @Transactional
    public Map<String, Object> createFileVersionWithAudit(String tenantId, String projectId,
                                                          String pageId, String filename,
                                                          VersionAuditInput audit) throws IOException {
        guardProject(tenantId, projectId);
        validatePageId(pageId);
        validateFilename(filename);

        if (!storage.pageFileExists(tenantId, projectId, pageId, filename)) {
            throw new NoSuchFileException(pageId + "/" + filename);
        }

        String content = storage.readPageFile(tenantId, projectId, pageId, filename);

        int nextVersion = fileVersionRepository.findMaxVersion(tenantId, projectId, pageId, filename) + 1;

        String snapshotFilename = versionFilename(nextVersion, filename);
        storage.writePageFile(tenantId, projectId, pageId, snapshotFilename, content);

        // DB: 清除旧 is_current，插入新记录
        fileVersionRepository.clearCurrentFlag(tenantId, projectId, pageId, filename);

        FileVersionEntity entity = new FileVersionEntity();
        entity.setTenantId(tenantId);
        entity.setProjectId(projectId);
        entity.setPageId(pageId);
        entity.setFilename(filename);
        entity.setVersion(nextVersion);
        entity.setCurrent(true);
        entity.setModifiedBy(audit.modifiedBy());
        entity.setSource(audit.source());
        entity.setCommitMessage(audit.commitMessage());
        entity.setApprovalStatus(audit.approvalStatus());
        entity.setAiSessionId(audit.aiSessionId());
        entity.setAiTurnId(audit.aiTurnId());
        entity.setRequestId(audit.requestId());
        entity.setContentHash(sha256(content));
        entity.setStorageRef(storage.type() + ":" + tenantId + "/" + projectId + "/" + pageId + "/" + snapshotFilename);
        fileVersionRepository.save(entity);

        log.info("[PageConfig] 创建文件版本: {}/{} v{}", pageId, filename, nextVersion);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("pageId", pageId);
        result.put("filename", filename);
        result.put("version", nextVersion);
        result.put("createdAt", entity.getCreatedAt().toEpochMilli());
        result.put("modifiedBy", entity.getModifiedBy());
        result.put("source", entity.getSource());
        result.put("commitMessage", entity.getCommitMessage());
        result.put("approvalStatus", entity.getApprovalStatus());
        result.put("aiSessionId", entity.getAiSessionId());
        result.put("aiTurnId", entity.getAiTurnId());
        result.put("requestId", entity.getRequestId());
        result.put("contentHash", entity.getContentHash());
        result.put("storageRef", entity.getStorageRef());
        return result;
    }

    /**
     * 查询某文件的全部版本列表（按版本号倒序）。
     */
    public List<Map<String, Object>> listFileVersions(String tenantId, String projectId,
                                                       String pageId, String filename) {
        guardProject(tenantId, projectId);
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
            item.put("source", e.getSource());
            item.put("commitMessage", e.getCommitMessage());
            item.put("approvalStatus", e.getApprovalStatus());
            item.put("aiSessionId", e.getAiSessionId());
            item.put("aiTurnId", e.getAiTurnId());
            item.put("requestId", e.getRequestId());
            item.put("contentHash", e.getContentHash());
            item.put("storageRef", e.getStorageRef());
            result.add(item);
        }
        return result;
    }

    /**
     * 查询某页面全部文件的版本列表（按文件名+版本号排序）。
     */
    public List<Map<String, Object>> listPageFileVersions(String tenantId, String projectId,
                                                           String pageId) {
        guardProject(tenantId, projectId);
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
            item.put("source", e.getSource());
            item.put("commitMessage", e.getCommitMessage());
            item.put("approvalStatus", e.getApprovalStatus());
            item.put("aiSessionId", e.getAiSessionId());
            item.put("aiTurnId", e.getAiTurnId());
            item.put("requestId", e.getRequestId());
            item.put("contentHash", e.getContentHash());
            item.put("storageRef", e.getStorageRef());
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
        guardProject(tenantId, projectId);
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

        String snapshotFilename = versionFilename(version, filename);
        if (!storage.pageFileExists(tenantId, projectId, pageId, snapshotFilename)) {
            throw new NoSuchFileException(pageId + "/" + version + "__" + filename);
        }

        String content = storage.readPageFile(tenantId, projectId, pageId, snapshotFilename);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("pageId", pageId);
        payload.put("filename", filename);
        payload.put("version", version);
        payload.put("createdAt", entity.getCreatedAt().toEpochMilli());
        payload.put("isCurrent", entity.isCurrent());
        payload.put("modifiedBy", entity.getModifiedBy());
        payload.put("source", entity.getSource());
        payload.put("commitMessage", entity.getCommitMessage());
        payload.put("approvalStatus", entity.getApprovalStatus());
        payload.put("aiSessionId", entity.getAiSessionId());
        payload.put("aiTurnId", entity.getAiTurnId());
        payload.put("requestId", entity.getRequestId());
        payload.put("contentHash", entity.getContentHash());
        payload.put("storageRef", entity.getStorageRef());
        payload.put("content", content);
        return payload;
    }

    /**
     * 恢复指定版本：读取版本快照内容 → 覆盖工作文件。
     */
    public Map<String, Object> restoreFileVersion(String tenantId, String projectId,
                                                    String pageId, String filename,
                                                    int version) throws IOException {
        guardProject(tenantId, projectId);
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

        String snapshotFilename = versionFilename(version, filename);
        if (!storage.pageFileExists(tenantId, projectId, pageId, snapshotFilename)) {
            throw new NoSuchFileException(pageId + "/" + version + "__" + filename);
        }

        String content = storage.readPageFile(tenantId, projectId, pageId, snapshotFilename);
        storage.writePageFile(tenantId, projectId, pageId, filename, content);

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
        guardProject(tenantId, projectId);
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
        storage.deletePageFile(tenantId, projectId, pageId, versionFilename(version, filename));

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
        guardProject(tenantId, projectId);
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

            storage.deletePageFile(tenantId, projectId, pageId, versionFilename(e.getVersion(), filename));
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
        guardProject(tenantId, projectId);
        validatePageId(pageId);
        validateFilename(filename);

        if (!storage.pageFileExists(tenantId, projectId, pageId, filename)) {
            throw new NoSuchFileException(pageId + "/" + filename);
        }

        String serverTimestamp = String.valueOf(storage.pageFileTimestamp(tenantId, projectId, pageId, filename));

        if (clientTimestamp != null && clientTimestamp.equals(serverTimestamp)) {
            return Map.of(
                    "notModified", true,
                    "timestamp", serverTimestamp,
                    "content", ""
            );
        }
        String content = storage.readPageFile(tenantId, projectId, pageId, filename);
        return Map.of("content", content, "timestamp", serverTimestamp);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 写入（单文件） — 只写磁盘，不自动升版
    // ─────────────────────────────────────────────────────────────────────────

    public Map<String, Object> writeFile(String tenantId, String projectId,
                                          String pageId, String filename,
                                          String content) throws IOException {
        guardProject(tenantId, projectId);
        validatePageId(pageId);
        validateFilename(filename);

        // 内容变更检测 — 相同内容跳过写入
        if (storage.pageFileExists(tenantId, projectId, pageId, filename)) {
            String existing = storage.readPageFile(tenantId, projectId, pageId, filename);
            if (existing.equals(content)) {
                String timestamp = String.valueOf(storage.pageFileTimestamp(tenantId, projectId, pageId, filename));
                return Map.of("ok", true, "timestamp", timestamp, "unchanged", true);
            }
        }

        storage.writePageFile(tenantId, projectId, pageId, filename, content);

        String timestamp = String.valueOf(storage.pageFileTimestamp(tenantId, projectId, pageId, filename));
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
        guardProject(tenantId, projectId);
        if (!"routes.json".equals(filename)) {
            throw new IllegalArgumentException("不允许读取根级文件: " + filename);
        }

        if (storage.rootFileExists(tenantId, projectId, filename)) {
            String timestamp = String.valueOf(storage.rootFileTimestamp(tenantId, projectId, filename));
            if (clientTimestamp != null && clientTimestamp.equals(timestamp)) {
                return Map.of(
                        "notModified", true,
                        "timestamp", timestamp,
                        "content", ""
                );
            }
            return Map.of(
                    "content", storage.readRootFile(tenantId, projectId, filename),
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
        guardProject(tenantId, projectId);
        List<Map<String, Object>> results = new ArrayList<>();
        List<String> pageIds = scanPageIds(tenantId, projectId);

        for (String pageId : pageIds) {
            Map<String, Object> report = new LinkedHashMap<>();
            report.put("pageId", pageId);
            List<String> issues = new ArrayList<>();

            // 检查工作文件存在
            List<String> existingFiles = new ArrayList<>();
            for (String fname : ALLOWED_FILES) {
                try {
                if (storage.pageFileExists(tenantId, projectId, pageId, fname)) {
                    existingFiles.add(fname);
                }
                } catch (IOException e) {
                    issues.add("读取文件状态失败: " + fname + " " + e.getMessage());
                }
            }
            report.put("files", existingFiles);

            // 检查 DB 版本记录 vs 磁盘快照
            List<FileVersionEntity> dbVersions = fileVersionRepository
                    .findByTenantIdAndProjectIdAndPageIdOrderByFilenameAscVersionDesc(
                            tenantId, projectId, pageId);
            report.put("versionCount", dbVersions.size());

            for (FileVersionEntity e : dbVersions) {
                try {
                if (!storage.pageFileExists(tenantId, projectId, pageId, versionFilename(e.getVersion(), e.getFilename()))) {
                    issues.add("DB 有版本记录但磁盘快照缺失: " + e.getFilename() + " v" + e.getVersion());
                }
                } catch (IOException error) {
                    issues.add("检查版本快照失败: " + e.getFilename() + " v" + e.getVersion());
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
        guardProject(tenantId, projectId);
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
            List<String> existingFiles = new ArrayList<>();
            for (String fname : ALLOWED_FILES) {
                try {
                    if (storage.pageFileExists(tenantId, projectId, pageId, fname)) {
                        existingFiles.add(fname);
                    }
                } catch (IOException ignored) {
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
            item.put("hasDir", !existingFiles.isEmpty());
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
        guardProject(tenantId, projectId);
        validatePageId(pageId);

        if (!storage.listPageFiles(tenantId, projectId, pageId).isEmpty()) {
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

        List<String> written = new ArrayList<>();
        for (Map.Entry<String, String> entry : scaffold.entrySet()) {
            storage.writePageFile(tenantId, projectId, pageId, entry.getKey(), entry.getValue());
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
        guardProject(tenantId, projectId);
        validatePageId(pageId);

        // 删除 DB 中该页面的全部版本记录
        fileVersionRepository.deleteByTenantIdAndProjectIdAndPageId(tenantId, projectId, pageId);

        List<String> deleted = storage.deletePage(tenantId, projectId, pageId);

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
        try {
            return storage.listPageIds(tenantId, projectId);
        } catch (IOException e) {
            log.warn("[PageConfig] 扫描页面目录失败 tenant={} project={}: {}",
                    tenantId, projectId, e.getMessage());
            return List.of();
        }
    }

    private Map<String, Map<String, Object>> loadRouteMetaByPageId(String tenantId, String projectId) {
        try {
        if (!storage.rootFileExists(tenantId, projectId, "routes.json")) {
            return Map.of();
        }

            String content = storage.readRootFile(tenantId, projectId, "routes.json");
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

    private void validateScopeId(String label, String value) {
        if (value == null || value.isBlank()
                || value.contains("..") || value.contains("/") || value.contains("\\")
                || !SAFE_SCOPE_ID.matcher(value).matches()) {
            throw new IllegalArgumentException("无效的 " + label + ": " + value);
        }
    }

    private void validateFilename(String filename) {
        if (!ALLOWED_FILES.contains(filename)) {
            throw new IllegalArgumentException(
                    "不允许写入文件 \"" + filename + "\"（只允许: " + ALLOWED_FILES + "）");
        }
    }

    private void guardProject(String tenantId, String projectId) {
        validateScopeId("tenantId", tenantId);
        validateScopeId("projectId", projectId);
        if (accessGuard != null) {
            accessGuard.requireProjectAccess(tenantId, projectId);
        }
    }

    private String versionFilename(int version, String filename) {
        return version + "__" + filename;
    }

    private String sha256(String content) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(content.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                builder.append(String.format("%02x", b));
            }
            return builder.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    public record VersionAuditInput(
            String modifiedBy,
            String source,
            String commitMessage,
            String approvalStatus,
            String aiSessionId,
            String aiTurnId,
            String requestId
    ) {
        public static VersionAuditInput from(Map<String, ?> body) {
            Map<String, ?> safe = body != null ? body : Map.of();
            return new VersionAuditInput(
                    stringValue(safe.get("modifiedBy")),
                    stringValue(safe.containsKey("source") ? safe.get("source") : "manual"),
                    stringValue(safe.get("commitMessage")),
                    stringValue(safe.containsKey("approvalStatus") ? safe.get("approvalStatus") : "draft"),
                    stringValue(safe.get("aiSessionId")),
                    stringValue(safe.get("aiTurnId")),
                    stringValue(safe.get("requestId"))
            );
        }

        private static String stringValue(Object value) {
            if (value instanceof String text && !text.isBlank()) {
                return text.trim();
            }
            return null;
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
          guardProject(tenantId, projectId);
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
            String json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(normalized);
            storage.writeRootFile(tenantId, projectId, "routes.json", json);

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
