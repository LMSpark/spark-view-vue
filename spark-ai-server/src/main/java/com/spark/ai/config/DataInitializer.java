package com.spark.ai.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.entity.NavigationConfigEntity;
import com.spark.ai.entity.PageConfigEntity;
import com.spark.ai.entity.TenantConfigEntity;
import com.spark.ai.repository.NavigationConfigRepository;
import com.spark.ai.repository.PageConfigRepository;
import com.spark.ai.repository.TenantConfigRepository;
import com.spark.ai.service.AuthService;
import com.spark.ai.service.ProjectService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * 应用启动时数据初始化：
 * 1. 种子租户数据（仅当 tenant_config 表为空时）
 * 2. 迁移现有文件系统页面配置：从扁平 {configDir}/{pageId}/ 目录
 *    重组为 {configDir}/{tenantId}/{projectId}/{pageId}/ 结构，并注册页面元数据到数据库
 * 3. 初始化默认导航配置（仅当 navigation_config 表为空时，从 classpath 读取默认值）
 */
@Component
public class DataInitializer implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DataInitializer.class);

    private static final Set<String> PAGE_FILE_NAMES =
            Set.of("rule.json", "pagedata.json", "script.js", "style.css");

    private final TenantConfigRepository tenantRepo;
    private final PageConfigRepository pageRepo;
    private final NavigationConfigRepository navRepo;
    private final ProjectService projectService;
    private final AuthService authService;
    private final PagesConfigProperties pagesProps;
    private final ObjectMapper objectMapper;

    private static final String DEFAULT_TENANT = "lmspark";
    private static final String HOMEPAGE_PROJECT = "homepage";

    public DataInitializer(TenantConfigRepository tenantRepo,
                            PageConfigRepository pageRepo,
                            NavigationConfigRepository navRepo,
                            ProjectService projectService,
                            AuthService authService,
                            PagesConfigProperties pagesProps,
                            ObjectMapper objectMapper) {
        this.tenantRepo = tenantRepo;
        this.pageRepo = pageRepo;
        this.navRepo = navRepo;
        this.projectService = projectService;
        this.authService = authService;
        this.pagesProps = pagesProps;
        this.objectMapper = objectMapper;
    }

    @Override
    @Transactional
    public void run(String... args) throws Exception {
        seedTenants();
        migratePageConfigs();
        migrateNavigation();
        patchNavigationIfMissing();
    }

    // ── 种子租户数据 ──────────────────────────────────────────────────────────

    private void seedTenants() throws IOException {
        if (tenantRepo.count() > 0) {
            log.info("[DataInit] 租户数据已存在，跳过种子");
            return;
        }

        saveTenant(DEFAULT_TENANT, Map.of(
                "tenant", mapOf(
                        "tenantId", DEFAULT_TENANT,
                        "tenantName", "领码SPARK",
                        "tenantCode", "LMSPARK",
                        "logo", "",
                        "theme", mapOf("primaryColor", "#409eff", "borderRadius", "4px")
                ),
                "config", mapOf(
                        "apiBaseUrl", "/api",
                        "logLevel", "debug",
                        "features", mapOf("enableAI", true, "enableExport", true, "enableOffline", false)
                ),
                "pageConfig", Map.of("homePath", "/")
        ));
        projectService.ensureHomepage(DEFAULT_TENANT);
        authService.ensureAdminUser(DEFAULT_TENANT, "admin", "admin123");

        log.info("[DataInit] 种子租户数据已写入: 领码SPARK ({})", DEFAULT_TENANT);
    }

    private void saveTenant(String tenantId, Map<String, Object> config) throws IOException {
        TenantConfigEntity entity = new TenantConfigEntity();
        entity.setTenantId(tenantId);
        entity.setConfigJson(objectMapper.writeValueAsString(config));
        tenantRepo.save(entity);
    }

    // ── 迁移文件系统页面配置（扁平 → 租户/项目嵌套目录）──────────────────────

    /**
     * 将旧版扁平目录 {configDir}/{pageId}/ 下的页面配置文件迁移到
     * {configDir}/{tenantId}/{projectId}/{pageId}/ 嵌套结构。
     *
     * <p>同时在数据库中注册页面元数据。如果数据库 page_config 表已有数据则跳过。
     * <p>迁移采用 **文件复制** 而非移动，以确保即使中途失败也不丢数据。
     * <p>如果扁平迁移未发现任何页面（文件已在嵌套目录），则扫描嵌套目录注册页面到数据库。
     */
    private void migratePageConfigs() {
        if (pageRepo.count() > 0) {
            log.info("[DataInit] 页面配置已存在于数据库，跳过文件迁移");
            return;
        }

        Path configDir = Path.of(pagesProps.getConfigDir());
        if (!Files.isDirectory(configDir)) {
            log.info("[DataInit] 页面配置目录不存在: {}，跳过迁移", configDir);
            return;
        }

        Path targetBase = configDir.resolve(DEFAULT_TENANT).resolve(HOMEPAGE_PROJECT);
        int pageCount = 0;
        int fileCount = 0;

        // Phase 1: 扁平目录迁移（旧版 {configDir}/{pageId}/ → 嵌套结构）
        try (DirectoryStream<Path> dirs = Files.newDirectoryStream(configDir, Files::isDirectory)) {
            for (Path pageDir : dirs) {
                String dirName = pageDir.getFileName().toString();
                // 跳过已有租户目录（防止重复迁移）和以 . 或 _ 开头的隐藏目录
                if (dirName.startsWith(".") || dirName.startsWith("_")
                        || dirName.equals(DEFAULT_TENANT)) continue;

                // 检查该目录是否包含页面配置文件（排除非页面目录如 README.md 同级文件夹）
                boolean hasPageFile = false;
                for (String fname : PAGE_FILE_NAMES) {
                    if (Files.isRegularFile(pageDir.resolve(fname))) {
                        hasPageFile = true;
                        break;
                    }
                }
                if (!hasPageFile) continue;

                String pageId = dirName;

                // 在数据库注册页面元数据
                registerPage(pageId);
                pageCount++;

                // 复制文件到嵌套目录
                Path targetDir = targetBase.resolve(pageId);
                Files.createDirectories(targetDir);
                for (String filename : PAGE_FILE_NAMES) {
                    Path src = pageDir.resolve(filename);
                    if (Files.isRegularFile(src)) {
                        Files.copy(src, targetDir.resolve(filename),
                                java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                        fileCount++;
                    }
                }
            }
        } catch (IOException e) {
            log.error("[DataInit] 页面配置扁平迁移失败", e);
            return;
        }

        if (pageCount > 0) {
            log.info("[DataInit] 扁平迁移完成: {} pages, {} files → {}", pageCount, fileCount, targetBase);
            return;
        }

        // Phase 2: 文件已在嵌套目录，仅需注册到数据库
        pageCount = registerNestedPages(targetBase);
        if (pageCount > 0) {
            log.info("[DataInit] 从嵌套目录注册 {} 个页面到数据库", pageCount);
        } else {
            log.info("[DataInit] 未发现任何页面配置文件");
        }
    }

    /**
     * 扫描 {tenantId}/{projectId}/ 下的子目录，将包含页面文件的目录注册为页面。
     */
    private int registerNestedPages(Path projectDir) {
        if (!Files.isDirectory(projectDir)) return 0;
        int count = 0;
        try (DirectoryStream<Path> dirs = Files.newDirectoryStream(projectDir, Files::isDirectory)) {
            for (Path pageDir : dirs) {
                String pageId = pageDir.getFileName().toString();
                if (pageId.startsWith(".") || pageId.startsWith("_")) continue;

                boolean hasPageFile = false;
                for (String fname : PAGE_FILE_NAMES) {
                    if (Files.isRegularFile(pageDir.resolve(fname))) {
                        hasPageFile = true;
                        break;
                    }
                }
                if (!hasPageFile) continue;

                registerPage(pageId);
                count++;
            }
        } catch (IOException e) {
            log.error("[DataInit] 扫描嵌套页面目录失败: {}", projectDir, e);
        }
        return count;
    }

    /** 在数据库注册页面元数据 */
    private void registerPage(String pageId) {
        PageConfigEntity page = new PageConfigEntity();
        page.setTenantId(DEFAULT_TENANT);
        page.setProjectId(HOMEPAGE_PROJECT);
        page.setPageId(pageId);
        page.setTitle(pageId);
        page.setIcon("Document");
        page.setPath("/" + pageId);
        page.setRouteName(pageId);
        pageRepo.save(page);
    }

    // ── 初始化默认导航配置（从 classpath 资源）────────────────────────────────

    private void migrateNavigation() {
        if (navRepo.count() > 0) {
            log.info("[DataInit] 导航配置已存在于数据库，跳过初始化");
            return;
        }

        try (var stream = getClass().getResourceAsStream("/navigation-default.json")) {
            if (stream == null) {
                log.warn("[DataInit] classpath 未找到 navigation-default.json，跳过初始化");
                return;
            }
            String json = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
            NavigationConfigEntity entity = new NavigationConfigEntity();
            entity.setTenantId(DEFAULT_TENANT);
            entity.setProjectId(HOMEPAGE_PROJECT);
            entity.setConfigJson(json);
            navRepo.save(entity);
            log.info("[DataInit] 默认导航配置已写入数据库");
        } catch (IOException e) {
            log.error("[DataInit] 默认导航配置初始化失败", e);
        }
    }

    // ── 补丁：已有 DB 中缺失节点时从 classpath 默认值合并 ─────────────────────

    @SuppressWarnings("unchecked")
    private void patchNavigationIfMissing() {
        navRepo.findByTenantIdAndProjectId(DEFAULT_TENANT, HOMEPAGE_PROJECT).ifPresent(entity -> {
            try {
                // 加载 classpath 默认导航
                try (var stream = getClass().getResourceAsStream("/navigation-default.json")) {
                    if (stream == null) return;
                    var defaultNav = objectMapper.readValue(stream,
                            new com.fasterxml.jackson.core.type.TypeReference<java.util.Map<String, Object>>() {});
                    var defaultChildren = (java.util.List<java.util.Map<String, Object>>)
                            defaultNav.get("children");
                    if (defaultChildren == null) return;

                    // 收集默认导航所有节点 id
                    var defaultIds = collectIds(defaultChildren);

                    // 读取 DB 已有导航
                    var existingNav = objectMapper.readValue(entity.getConfigJson(),
                            new com.fasterxml.jackson.core.type.TypeReference<java.util.Map<String, Object>>() {});
                    var existingChildren = (java.util.List<java.util.Map<String, Object>>)
                            existingNav.get("children");
                    if (existingChildren == null) return;

                    var existingIds = collectIds(existingChildren);

                    // 找出缺失的 id
                    defaultIds.removeAll(existingIds);
                    if (defaultIds.isEmpty()) return;

                    // 将默认导航中缺失的节点插入到对应的父节点（或顶层）
                    boolean changed = mergeNodes(existingChildren, defaultChildren, defaultIds);
                    if (!changed) return;

                    String patched = objectMapper.writerWithDefaultPrettyPrinter()
                            .writeValueAsString(existingNav);
                    entity.setConfigJson(patched);
                    navRepo.save(entity);
                    log.info("[DataInit] 导航补丁完成，补入 {} 个缺失节点: {}", defaultIds.size(), defaultIds);
                }
            } catch (Exception e) {
                log.error("[DataInit] 导航补丁失败", e);
            }
        });
    }

    /** 递归收集所有节点 id */
    @SuppressWarnings("unchecked")
    private java.util.Set<String> collectIds(java.util.List<java.util.Map<String, Object>> nodes) {
        java.util.Set<String> ids = new java.util.HashSet<>();
        for (var node : nodes) {
            var id = (String) node.get("id");
            if (id != null) ids.add(id);
            var children = (java.util.List<java.util.Map<String, Object>>) node.get("children");
            if (children != null) ids.addAll(collectIds(children));
        }
        return ids;
    }

    /** 递归将 defaultChildren 中 targetIds 对应的节点合并到 existingChildren 同级父节点 */
    @SuppressWarnings("unchecked")
    private boolean mergeNodes(
            java.util.List<java.util.Map<String, Object>> existingChildren,
            java.util.List<java.util.Map<String, Object>> defaultChildren,
            java.util.Set<String> targetIds) {
        boolean changed = false;
        for (var defNode : defaultChildren) {
            var id = (String) defNode.get("id");
            // 找到该节点在 existingChildren 中的对应
            var existing = existingChildren.stream()
                    .filter(n -> id != null && id.equals(n.get("id")))
                    .findFirst();

            if (existing.isEmpty()) {
                // 该节点缺失，若在 targetIds 中则追加
                if (id != null && targetIds.contains(id)) {
                    existingChildren.add(new java.util.LinkedHashMap<>(defNode));
                    changed = true;
                }
            } else {
                // 节点存在，递归检查其 children
                var defKids = (java.util.List<java.util.Map<String, Object>>) defNode.get("children");
                if (defKids == null) continue;
                var exKids = (java.util.List<java.util.Map<String, Object>>) existing.get().get("children");
                if (exKids == null) {
                    exKids = new java.util.ArrayList<>();
                    existing.get().put("children", exKids);
                }
                if (mergeNodes(exKids, defKids, targetIds)) changed = true;
            }
        }
        return changed;
    }

    /** 创建可变 Map（Map.of 不允许 null 值，且某些嵌套需要 mutable） */
    @SafeVarargs
    private static <V> Map<String, V> mapOf(Object... kv) {
        Map<String, V> map = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            @SuppressWarnings("unchecked")
            V value = (V) kv[i + 1];
            map.put((String) kv[i], value);
        }
        return map;
    }
}
