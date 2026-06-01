package com.spark.ai.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.entity.ProjectEntity;
import com.spark.ai.entity.ProjectMemberEntity;
import com.spark.ai.repository.ProjectMemberRepository;
import com.spark.ai.repository.ProjectRepository;
import com.spark.ai.security.AccessGuardService;
import com.spark.ai.security.AuthenticatedRequestContext;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.InputStream;
import java.util.*;

/**
 * 项目管理服务。
 *
 * <p>每个租户拥有多个项目，首次创建租户时自动生成「企业主页」(homepage)。
 * homepage 项目不可删除。
 */
@Service
public class ProjectService {

    private static final Logger log = LoggerFactory.getLogger(ProjectService.class);
    public static final String HOMEPAGE_PROJECT_ID = "homepage";
    public static final String HOMEPAGE_PROJECT_TYPE = "homepage";
    public static final String APP_PROJECT_TYPE = "app";
    public static final String PLATFORM_TENANT_ID = "platform";
    private static final String TENANT_HOME_NAVIGATION_TEMPLATE = "navigation-tenant-home-default.json";
    private static final String APP_PROJECT_NAVIGATION_TEMPLATE = "navigation-app-default.json";
    private static final String PLATFORM_NAVIGATION_TEMPLATE = "navigation-platform-default.json";
    private static final String PATH_APP_LIST = "/app-list";
    private static final String PATH_DEV = "/dev";
    private static final String PATH_DBMS = "/dbms";
    private static final String PATH_CACHE_MANAGER = "/cache-manager";
    private static final String PATH_PLATFORM_APPS = "/apps";
    private static final String PLATFORM_VUE_CLEANUP_MODULE_ID = "platform-vue-cleanup";
    private static final String PLATFORM_VUE_CLEANUP_MODULE_TITLE = "Vue 清理候选";
    private static final List<VueCleanupCandidate> PLATFORM_VUE_CLEANUP_CANDIDATES = List.of(
            new VueCleanupCandidate("dashboard", "仪表盘候选", "假数据 Vue dashboard，删除前需要替换默认落地页。", "DataBoard", "/dashboard"),
            new VueCleanupCandidate("about", "关于页候选", "旧系统介绍页。", "InfoFilled", "/about"),
            new VueCleanupCandidate("settings", "设置页候选", "localStorage/mock 设置页。", "Setting", "/settings"),
            new VueCleanupCandidate("capability-demo", "能力演示候选", "mock 能力系统演示页。", "SetUp", "/capability-demo"),
            new VueCleanupCandidate("template-dsl", "Template DSL 候选", "占位 system-page 路由。", "SetUp", "/demo/template-dsl"),
            new VueCleanupCandidate("custom-r-table", "r-table Demo 候选", "公开 RendererTable 演示页。", "Grid", "/demo/custom-r-table"),
            new VueCleanupCandidate("r-form-compare", "r-form Demo 候选", "公开 RendererForm 对照演示页。", "Tickets", "/demo/r-form-compare")
    );

    private final ProjectRepository projectRepo;
    private final ProjectMemberRepository memberRepo;
    private final ProjectNavigationTreeService navigationTreeService;
    private final ObjectMapper objectMapper;
    private final AccessGuardService accessGuard;
    private Map<String, Object> tenantHomeNavigationTemplate = Map.of();
    private Map<String, Object> appProjectNavigationTemplate = Map.of();
    private Map<String, Object> platformNavigationTemplate = Map.of();

    public ProjectService(ProjectRepository projectRepo,
                          ProjectMemberRepository memberRepo,
                          ProjectNavigationTreeService navigationTreeService,
                          ObjectMapper objectMapper,
                          AccessGuardService accessGuard) {
        this.projectRepo = projectRepo;
        this.memberRepo = memberRepo;
        this.navigationTreeService = navigationTreeService;
        this.objectMapper = objectMapper;
        this.accessGuard = accessGuard;
    }

    @PostConstruct
    void loadNavigationTemplates() {
        this.tenantHomeNavigationTemplate = loadNavigationTemplate(TENANT_HOME_NAVIGATION_TEMPLATE, "租户主站导航模板");
        this.appProjectNavigationTemplate = loadNavigationTemplate(APP_PROJECT_NAVIGATION_TEMPLATE, "软件项目导航模板");
        this.platformNavigationTemplate = loadNavigationTemplate(PLATFORM_NAVIGATION_TEMPLATE, "平台导航模板");
    }

    private Map<String, Object> loadNavigationTemplate(String resourcePath, String label) {
        try {
            ClassPathResource resource = new ClassPathResource(resourcePath);
            try (InputStream stream = resource.getInputStream()) {
                Map<String, Object> template = objectMapper.readValue(stream,
                        new TypeReference<Map<String, Object>>() {});
                log.info("[Project] {}已加载（启动一次）", label);
                return template;
            }
        } catch (IOException e) {
            log.warn("[Project] {}加载失败，后续初始化将跳过 resource={}", label, resourcePath, e);
            return Map.of();
        }
    }

    /**
     * 获取租户下所有项目（homepage 排首位）。
     */
    public List<Map<String, Object>> listProjects(String tenantId) {
        accessGuard.requireTenantUser(tenantId);
        List<ProjectEntity> projects = projectRepo.findByTenantIdOrderByOrderAscCreatedAtAsc(tenantId);
        List<Map<String, Object>> result = new ArrayList<>();
        for (ProjectEntity p : projects) {
            result.add(toMap(p));
        }
        return result;
    }

    /**
     * 获取单个项目详情。
     */
    public Map<String, Object> getProject(String tenantId, String projectId) {
        accessGuard.requireProjectAccess(tenantId, projectId);
        return projectRepo.findByTenantIdAndProjectId(tenantId, projectId)
                .map(this::toMap)
                .orElse(null);
    }

    /**
     * 创建项目。
     */
    @Transactional
    public Map<String, Object> createProject(String tenantId, String projectId,
                                              String name, String icon, String description) {
        if (projectRepo.existsByTenantIdAndProjectId(tenantId, projectId)) {
            throw new IllegalArgumentException("项目已存在: " + projectId);
        }
        AuthenticatedRequestContext ctx = accessGuard.requireTenantUser(tenantId);

        ProjectEntity entity = new ProjectEntity();
        entity.setTenantId(tenantId);
        entity.setProjectId(projectId);
        entity.setName(name != null && !name.isBlank() ? name : projectId);
        entity.setProjectType(APP_PROJECT_TYPE);
        entity.setIcon(icon != null ? icon : "📦");
        entity.setDescription(description != null ? description : "");
        entity.setOrder(100);
        projectRepo.save(entity);
        if (ctx != null) {
            ensureProjectMember(tenantId, projectId, ctx.username(), ctx.isAdmin() ? "owner" : "member");
        }

        // 从 classpath 模板初始化应用默认导航
        initDefaultNavigation(tenantId, projectId);

        log.info("[Project] 创建项目: tenant={}, project={}", tenantId, projectId);
        return toMap(entity);
    }

    /**
     * 更新项目属性（不允许修改 projectType）。
     */
    @Transactional
    public Map<String, Object> updateProject(String tenantId, String projectId,
                                              Map<String, Object> patch) {
        accessGuard.requireProjectAdmin(tenantId, projectId);
        ProjectEntity entity = projectRepo.findByTenantIdAndProjectId(tenantId, projectId)
                .orElseThrow(() -> new NoSuchElementException("项目不存在: " + projectId));

        if (patch.containsKey("name")) entity.setName((String) patch.get("name"));
        if (patch.containsKey("icon")) entity.setIcon((String) patch.get("icon"));
        if (patch.containsKey("description")) entity.setDescription((String) patch.get("description"));
        if (patch.containsKey("order")) entity.setOrder(((Number) patch.get("order")).intValue());

        projectRepo.save(entity);
        log.info("[Project] 更新项目: tenant={}, project={}", tenantId, projectId);
        return toMap(entity);
    }

    /**
     * 删除项目（homepage 不可删）。
     */
    @Transactional
    public void deleteProject(String tenantId, String projectId) {
        accessGuard.requireProjectAdmin(tenantId, projectId);
        ProjectEntity entity = projectRepo.findByTenantIdAndProjectId(tenantId, projectId)
                .orElseThrow(() -> new NoSuchElementException("项目不存在: " + projectId));

        if (HOMEPAGE_PROJECT_TYPE.equals(entity.getProjectType())) {
            throw new IllegalStateException("企业管理平台不可删除");
        }

        projectRepo.deleteByTenantIdAndProjectId(tenantId, projectId);
        log.info("[Project] 删除项目: tenant={}, project={}", tenantId, projectId);
    }

    /**
     * 确保租户拥有 homepage 项目（幂等）。
     * 由 DataInitializer 或租户创建时调用。
     */
    @Transactional
    public void ensureHomepage(String tenantId) {
        Optional<ProjectEntity> existing = projectRepo.findByTenantIdAndProjectId(tenantId, HOMEPAGE_PROJECT_ID);
        if (existing.isPresent()) {
            ProjectEntity homepage = existing.get();
            applyHomepageDefaults(homepage, tenantId);
            projectRepo.save(homepage);
            ensureDefaultNavigation(tenantId, HOMEPAGE_PROJECT_ID);
            return;
        }

        ProjectEntity homepage = new ProjectEntity();
        homepage.setTenantId(tenantId);
        homepage.setProjectId(HOMEPAGE_PROJECT_ID);
        applyHomepageDefaults(homepage, tenantId);
        projectRepo.save(homepage);
        ensureProjectMember(tenantId, HOMEPAGE_PROJECT_ID, "admin", "owner");
        ensureDefaultNavigation(tenantId, HOMEPAGE_PROJECT_ID);
        log.info("[Project] 自动创建企业管理平台: tenant={}", tenantId);
    }

    public void ensureAllProjectNavigations(String tenantId) {
        List<ProjectEntity> projects = projectRepo.findByTenantIdOrderByOrderAscCreatedAtAsc(tenantId);
        for (ProjectEntity project : projects) {
            ensureDefaultNavigation(project.getTenantId(), project.getProjectId());
        }
    }

    @Transactional
    public void ensureProjectMember(String tenantId, String projectId, String username, String role) {
        if (username == null || username.isBlank()) {
            return;
        }
        if (memberRepo.existsByTenantIdAndProjectIdAndUsername(tenantId, projectId, username)) {
            return;
        }
        ProjectMemberEntity member = new ProjectMemberEntity();
        member.setTenantId(tenantId);
        member.setProjectId(projectId);
        member.setUsername(username);
        member.setRole(role != null && !role.isBlank() ? role : "member");
        memberRepo.save(member);
    }

    /**
     * 确保项目拥有默认导航配置（幂等）。
     * 仅当 NAVIGATION_NODE_FLAT 中无当前项目的数据时才会写入。
     */
    private void ensureDefaultNavigation(String tenantId, String projectId) {
        try {
            Map<String, Object> existing = navigationTreeService.getNavConfig(tenantId, projectId);
            if (existing == null || shouldReplacePlatformNavigation(tenantId, existing)) {
                initDefaultNavigation(tenantId, projectId);
                return;
            }
            if (reconcileNavigationHierarchy(tenantId, projectId, existing)) {
                navigationTreeService.importNavConfig(tenantId, projectId, existing);
            }
        } catch (Exception e) {
            log.warn("[Project] 检查/初始化导航失败: tenant={}, project={}", tenantId, projectId, e);
        }
    }

    /**
     * 从 classpath 模板初始化应用默认导航（工作台 + 系统设置）。
     */
    private void initDefaultNavigation(String tenantId, String projectId) {
        Map<String, Object> template = navigationTemplateFor(tenantId, projectId);
        if (template.isEmpty()) {
            log.warn("[Project] 导航模板为空，跳过导航初始化: tenant={}, project={}", tenantId, projectId);
            return;
        }

        try {
            Map<String, Object> navRoot = instantiateNavigationTemplate(template, tenantId, projectId);
            reconcileNavigationHierarchy(tenantId, projectId, navRoot);
            navigationTreeService.importNavConfig(tenantId, projectId, navRoot);
            log.info("[Project] 已初始化应用导航: tenant={}, project={}", tenantId, projectId);
        } catch (Exception e) {
            log.warn("[Project] 应用导航模板初始化失败（不影响项目创建）: tenant={}, project={}", tenantId, projectId, e);
        }
    }

    private Map<String, Object> navigationTemplateFor(String tenantId, String projectId) {
        if (PLATFORM_TENANT_ID.equals(tenantId) && HOMEPAGE_PROJECT_ID.equals(projectId)) {
            return platformNavigationTemplate;
        }
        if (HOMEPAGE_PROJECT_ID.equals(projectId)) {
            return tenantHomeNavigationTemplate;
        }
        return appProjectNavigationTemplate;
    }

    private Map<String, Object> instantiateNavigationTemplate(Map<String, Object> template, String tenantId, String projectId) {
        Map<String, Object> navRoot = objectMapper.convertValue(template, new TypeReference<Map<String, Object>>() {});
        if (!PLATFORM_TENANT_ID.equals(tenantId)) {
            scopeTemplateNodeIds(navRoot, tenantId, projectId);
        }
        return navRoot;
    }

    @SuppressWarnings("unchecked")
    private void scopeTemplateNodeIds(Map<String, Object> node, String tenantId, String projectId) {
        Object id = node.get("id");
        if (id instanceof String idText && !idText.isBlank()) {
            node.put("id", scopedNodeId(tenantId, projectId, idText));
        }
        Object children = node.get("children");
        if (children instanceof List<?> childList) {
            for (Object child : childList) {
                if (child instanceof Map<?, ?> childMap) {
                    scopeTemplateNodeIds((Map<String, Object>) childMap, tenantId, projectId);
                }
            }
        }
    }

    @SuppressWarnings("unchecked")
    private boolean reconcileNavigationHierarchy(String tenantId, String projectId, Map<String, Object> navRoot) {
        Object childrenValue = navRoot.get("children");
        List<Map<String, Object>> children;
        if (childrenValue instanceof List<?> rawChildren) {
            children = (List<Map<String, Object>>) rawChildren;
        } else {
            children = new ArrayList<>();
            navRoot.put("children", children);
        }

        if (!HOMEPAGE_PROJECT_ID.equals(projectId)) {
            return prunePaths(children, Set.of(PATH_APP_LIST, PATH_DBMS));
        }
        if (PLATFORM_TENANT_ID.equals(tenantId)) {
            boolean changed = rebuildDevelopmentCenter(children, tenantId, projectId, true);
            changed |= rebuildPlatformVueCleanupCandidates(children);
            return changed;
        }

        boolean changed = ensureRootNodeByPath(
                children,
                appListNode(tenantId, projectId),
                "/dashboard");
        changed |= rebuildDevelopmentCenter(children, tenantId, projectId, false);
        return changed;
    }

    @SuppressWarnings("unchecked")
    private boolean prunePaths(List<Map<String, Object>> nodes, Set<String> blockedPaths) {
        boolean changed = false;
        Iterator<Map<String, Object>> iterator = nodes.iterator();
        while (iterator.hasNext()) {
            Map<String, Object> node = iterator.next();
            String path = normalizePath(asString(node.get("path")));
            if (blockedPaths.contains(path)) {
                iterator.remove();
                changed = true;
                continue;
            }
            Object children = node.get("children");
            if (children instanceof List<?> childList) {
                changed |= prunePaths((List<Map<String, Object>>) childList, blockedPaths);
            }
        }
        return changed;
    }

    @SuppressWarnings("unchecked")
    private boolean rebuildDevelopmentCenter(List<Map<String, Object>> children, String tenantId, String projectId, boolean platform) {
        // 清理已废弃的旧模块节点
        boolean changed = removeNodesByIdSuffix(children, Set.of("system-settings", "platform-system"));

        // 查找已有的开发中心节点
        String devCenterIdSuffix = platform ? "platform-dev-center" : "dev-center";
        Map<String, Object> devCenter = findNodeByIdSuffix(children, devCenterIdSuffix);
        Set<String> managedPaths = Set.of(PATH_DEV, PATH_DBMS, PATH_CACHE_MANAGER);

        if (devCenter == null) {
            // 不存在则新建，并把散落在根节点或旧模块中的管理入口收敛进去。
            changed |= removeNodesByPath(children, managedPaths);
            int index = platform ? indexAfterPath(children, PATH_PLATFORM_APPS) : indexAfterPath(children, PATH_APP_LIST);
            insertAt(children, developmentCenterNode(tenantId, projectId, platform), index);
            return true;
        }

        // 已有开发中心，增量补齐缺失的子节点
        Object devChildrenObj = devCenter.get("children");
        List<Map<String, Object>> devChildren;
        if (devChildrenObj instanceof List<?> rawChildren) {
            devChildren = (List<Map<String, Object>>) rawChildren;
        } else {
            devChildren = new ArrayList<>();
            devCenter.put("children", devChildren);
        }

        Map<String, Object> templateCenter = developmentCenterNode(tenantId, projectId, platform);
        List<Map<String, Object>> templateChildren = (List<Map<String, Object>>) templateCenter.get("children");

        changed |= removeNodesByPathOutsideSubtree(children, managedPaths, devCenter);

        for (Map<String, Object> templateChild : templateChildren) {
            String templatePath = normalizePath(asString(templateChild.get("path")));
            if (!containsNodeByPath(devChildren, templatePath)) {
                devChildren.add(templateChild);
                changed = true;
            }
        }

        changed |= removeDuplicateChildPaths(devChildren, managedPaths);
        return changed;
    }

    private boolean ensureRootNodeByPath(List<Map<String, Object>> children,
                                         Map<String, Object> template,
                                         String afterPath) {
        String path = normalizePath(asString(template.get("path")));
        int existingIndex = indexOfDirectPath(children, path);
        if (existingIndex >= 0) {
            Map<String, Object> existing = children.get(existingIndex);
            boolean changed = false;
            Map<String, Object> retained = existing;
            if (!nodeHasTemplateId(existing, template)) {
                children.set(existingIndex, template);
                retained = template;
                moveRootNodeAfterPath(children, retained, afterPath);
                changed = true;
            }
            changed |= removeNodesByPathExcept(children, Set.of(path), retained);
            return changed;
        }

        removeNodesByPath(children, Set.of(path));
        insertAt(children, template, indexAfterPath(children, afterPath));
        return true;
    }

    private boolean nodeHasTemplateId(Map<String, Object> node, Map<String, Object> template) {
        String nodeId = asString(node.get("id"));
        String templateId = asString(template.get("id"));
        return !templateId.isBlank() && templateId.equals(nodeId);
    }

    private int indexOfDirectPath(List<Map<String, Object>> nodes, String path) {
        String normalizedPath = normalizePath(path);
        for (int i = 0; i < nodes.size(); i++) {
            if (normalizedPath.equals(normalizePath(asString(nodes.get(i).get("path"))))) {
                return i;
            }
        }
        return -1;
    }

    private boolean moveRootNodeAfterPath(List<Map<String, Object>> children,
                                          Map<String, Object> node,
                                          String afterPath) {
        int currentIndex = children.indexOf(node);
        if (currentIndex < 0) {
            return false;
        }
        children.remove(currentIndex);
        int targetIndex = indexAfterPath(children, afterPath);
        insertAt(children, node, targetIndex);
        return currentIndex != children.indexOf(node);
    }

    private void insertAt(List<Map<String, Object>> children, Map<String, Object> node, int index) {
        if (index < 0 || index > children.size()) {
            children.add(node);
            return;
        }
        children.add(index, node);
    }

    private int indexAfterPath(List<Map<String, Object>> nodes, String path) {
        String normalizedPath = normalizePath(path);
        for (int i = 0; i < nodes.size(); i++) {
            if (normalizedPath.equals(normalizePath(asString(nodes.get(i).get("path"))))) {
                return i + 1;
            }
        }
        return nodes.size();
    }

    @SuppressWarnings("unchecked")
    private boolean removeNodesByPath(List<Map<String, Object>> nodes, Set<String> paths) {
        Set<String> normalizedPaths = normalizePaths(paths);
        boolean changed = false;
        Iterator<Map<String, Object>> iterator = nodes.iterator();
        while (iterator.hasNext()) {
            Map<String, Object> node = iterator.next();
            if (normalizedPaths.contains(normalizePath(asString(node.get("path"))))) {
                iterator.remove();
                changed = true;
                continue;
            }
            Object children = node.get("children");
            if (children instanceof List<?> childList) {
                changed |= removeNodesByPath((List<Map<String, Object>>) childList, paths);
            }
        }
        return changed;
    }

    private boolean removeNodesByPathOutsideSubtree(List<Map<String, Object>> nodes,
                                                    Set<String> paths,
                                                    Map<String, Object> retainedSubtreeRoot) {
        return removeNodesByPathExcept(nodes, paths, retainedSubtreeRoot);
    }

    @SuppressWarnings("unchecked")
    private boolean removeNodesByPathExcept(List<Map<String, Object>> nodes,
                                            Set<String> paths,
                                            Map<String, Object> retainedSubtreeRoot) {
        Set<String> normalizedPaths = normalizePaths(paths);
        boolean changed = false;
        Iterator<Map<String, Object>> iterator = nodes.iterator();
        while (iterator.hasNext()) {
            Map<String, Object> node = iterator.next();
            if (node == retainedSubtreeRoot) {
                continue;
            }
            if (normalizedPaths.contains(normalizePath(asString(node.get("path"))))) {
                iterator.remove();
                changed = true;
                continue;
            }
            Object children = node.get("children");
            if (children instanceof List<?> childList) {
                changed |= removeNodesByPathExcept((List<Map<String, Object>>) childList, paths, retainedSubtreeRoot);
            }
        }
        return changed;
    }

    private boolean removeDuplicateChildPaths(List<Map<String, Object>> nodes, Set<String> paths) {
        Set<String> normalizedPaths = normalizePaths(paths);
        Set<String> seen = new HashSet<>();
        boolean changed = false;
        Iterator<Map<String, Object>> iterator = nodes.iterator();
        while (iterator.hasNext()) {
            Map<String, Object> node = iterator.next();
            String path = normalizePath(asString(node.get("path")));
            if (normalizedPaths.contains(path) && !seen.add(path)) {
                iterator.remove();
                changed = true;
            }
        }
        return changed;
    }

    private Set<String> normalizePaths(Set<String> paths) {
        Set<String> normalizedPaths = new HashSet<>();
        for (String path : paths) {
            normalizedPaths.add(normalizePath(path));
        }
        return normalizedPaths;
    }

    @SuppressWarnings("unchecked")
    private boolean removeNodesByIdSuffix(List<Map<String, Object>> nodes, Set<String> idSuffixes) {
        boolean changed = false;
        Iterator<Map<String, Object>> iterator = nodes.iterator();
        while (iterator.hasNext()) {
            Map<String, Object> node = iterator.next();
            String id = asString(node.get("id"));
            if (matchesAnyIdSuffix(id, idSuffixes)) {
                iterator.remove();
                changed = true;
                continue;
            }
            Object children = node.get("children");
            if (children instanceof List<?> childList) {
                changed |= removeNodesByIdSuffix((List<Map<String, Object>>) childList, idSuffixes);
            }
        }
        return changed;
    }

    private boolean matchesAnyIdSuffix(String id, Set<String> idSuffixes) {
        for (String suffix : idSuffixes) {
            if (suffix.equals(id) || id.endsWith("-" + suffix)) {
                return true;
            }
        }
        return false;
    }

    private boolean rebuildPlatformVueCleanupCandidates(List<Map<String, Object>> children) {
        Map<String, Object> desired = platformVueCleanupModule();
        Map<String, Object> existing = findTopLevelPlatformVueCleanupModule(children);
        if (existing != null
                && managedNodeEquals(existing, desired)
                && !hasPlatformVueCleanupNodeOutside(children, existing)) {
            return false;
        }

        removePlatformVueCleanupNodes(children);
        int index = indexAfterPath(children, PATH_PLATFORM_APPS);
        Map<String, Object> developmentCenter = findNodeByIdSuffix(children, "platform-dev-center");
        if (developmentCenter != null) {
            int devCenterIndex = children.indexOf(developmentCenter);
            if (devCenterIndex >= 0) {
                index = devCenterIndex + 1;
            }
        }
        insertAt(children, desired, index);
        return true;
    }

    private Map<String, Object> findTopLevelPlatformVueCleanupModule(List<Map<String, Object>> children) {
        for (Map<String, Object> node : children) {
            String id = asString(node.get("id"));
            String title = asString(node.get("title"));
            if (PLATFORM_VUE_CLEANUP_MODULE_ID.equals(id) || PLATFORM_VUE_CLEANUP_MODULE_TITLE.equals(title)) {
                return node;
            }
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private boolean removePlatformVueCleanupNodes(List<Map<String, Object>> nodes) {
        boolean changed = false;
        Iterator<Map<String, Object>> iterator = nodes.iterator();
        while (iterator.hasNext()) {
            Map<String, Object> node = iterator.next();
            String id = asString(node.get("id"));
            String title = asString(node.get("title"));
            if (isPlatformVueCleanupNode(id, title)) {
                iterator.remove();
                changed = true;
                continue;
            }
            Object children = node.get("children");
            if (children instanceof List<?> childList) {
                changed |= removePlatformVueCleanupNodes((List<Map<String, Object>>) childList);
            }
        }
        return changed;
    }

    private boolean isPlatformVueCleanupNode(String id, String title) {
        return PLATFORM_VUE_CLEANUP_MODULE_TITLE.equals(title)
                || PLATFORM_VUE_CLEANUP_MODULE_ID.equals(id)
                || id.startsWith(PLATFORM_VUE_CLEANUP_MODULE_ID + "-");
    }

    @SuppressWarnings("unchecked")
    private boolean hasPlatformVueCleanupNodeOutside(List<Map<String, Object>> nodes,
                                                     Map<String, Object> retainedSubtreeRoot) {
        for (Map<String, Object> node : nodes) {
            if (node == retainedSubtreeRoot) {
                continue;
            }
            String id = asString(node.get("id"));
            String title = asString(node.get("title"));
            if (isPlatformVueCleanupNode(id, title)) {
                return true;
            }
            Object children = node.get("children");
            if (children instanceof List<?> childList
                    && hasPlatformVueCleanupNodeOutside((List<Map<String, Object>>) childList, retainedSubtreeRoot)) {
                return true;
            }
        }
        return false;
    }

    private boolean managedNodeEquals(Map<String, Object> actual, Map<String, Object> expected) {
        for (String key : List.of("id", "nodeKind", "title", "description", "icon", "path", "childPlacement", "linkTarget", "refId")) {
            if (!asString(actual.get(key)).equals(asString(expected.get(key)))) {
                return false;
            }
        }
        for (String key : List.of("dividerAfter", "hidden", "disabled")) {
            if (Boolean.TRUE.equals(actual.get(key)) != Boolean.TRUE.equals(expected.get(key))) {
                return false;
            }
        }

        List<Map<String, Object>> actualChildren = childNodes(actual);
        List<Map<String, Object>> expectedChildren = childNodes(expected);
        if (actualChildren.size() != expectedChildren.size()) {
            return false;
        }
        for (int i = 0; i < actualChildren.size(); i++) {
            if (!managedNodeEquals(actualChildren.get(i), expectedChildren.get(i))) {
                return false;
            }
        }
        return true;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> childNodes(Map<String, Object> node) {
        Object children = node.get("children");
        if (children instanceof List<?> childList) {
            return (List<Map<String, Object>>) childList;
        }
        return List.of();
    }

    @SuppressWarnings("unchecked")
    private boolean containsNodeByPath(List<Map<String, Object>> nodes, String path) {
        String normalizedPath = normalizePath(path);
        for (Map<String, Object> node : nodes) {
            if (normalizedPath.equals(normalizePath(asString(node.get("path"))))) {
                return true;
            }
        }
        return false;
    }

    @SuppressWarnings("unchecked")
    private boolean containsNode(List<Map<String, Object>> nodes, String id, String path) {
        String normalizedPath = normalizePath(path);
        for (Map<String, Object> node : nodes) {
            String nodeId = asString(node.get("id"));
            if (!id.isBlank() && (id.equals(nodeId) || nodeId.endsWith("-" + id))) {
                return true;
            }
            if (!normalizedPath.isBlank() && normalizedPath.equals(normalizePath(asString(node.get("path"))))) {
                return true;
            }
            Object children = node.get("children");
            if (children instanceof List<?> childList && containsNode((List<Map<String, Object>>) childList, id, path)) {
                return true;
            }
        }
        return false;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> findNodeByIdSuffix(List<Map<String, Object>> nodes, String idSuffix) {
        for (Map<String, Object> node : nodes) {
            String id = asString(node.get("id"));
            if (idSuffix.equals(id) || id.endsWith("-" + idSuffix)) {
                return node;
            }
            Object children = node.get("children");
            if (children instanceof List<?> childList) {
                Map<String, Object> found = findNodeByIdSuffix((List<Map<String, Object>>) childList, idSuffix);
                if (found != null) return found;
            }
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> findNodeByPath(List<Map<String, Object>> nodes, String path) {
        String normalizedPath = normalizePath(path);
        for (Map<String, Object> node : nodes) {
            if (normalizedPath.equals(normalizePath(asString(node.get("path"))))) {
                return node;
            }
            Object children = node.get("children");
            if (children instanceof List<?> childList) {
                Map<String, Object> found = findNodeByPath((List<Map<String, Object>>) childList, path);
                if (found != null) return found;
            }
        }
        return null;
    }

    private Map<String, Object> appListNode(String tenantId, String projectId) {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("id", scopedNodeId(tenantId, projectId, "app-list"));
        node.put("nodeKind", "system-page");
        node.put("title", "应用管理");
        node.put("description", "创建和进入租户下的软件项目");
        node.put("icon", "Grid");
        node.put("path", PATH_APP_LIST);
        return node;
    }

    private Map<String, Object> dbmsNode(String tenantId, String projectId) {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("id", scopedNodeId(tenantId, projectId, "dbms"));
        node.put("nodeKind", "system-page");
        node.put("title", "数据库管理");
        node.put("description", "服务器、数据库和模型管理");
        node.put("icon", "DataBase");
        node.put("path", PATH_DBMS);
        return node;
    }

    private Map<String, Object> developmentCenterNode(String tenantId, String projectId, boolean platform) {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("id", platform ? "platform-dev-center" : scopedNodeId(tenantId, projectId, "dev-center"));
        node.put("nodeKind", "module");
        node.put("title", "开发中心");
        node.put("description", "开发、数据源和缓存管理");
        node.put("icon", "Tools");
        node.put("childPlacement", "sidebar");
        node.put("children", List.of(
                devWorkbenchNode(tenantId, projectId, platform),
                platform ? platformDbmsNode() : dbmsNode(tenantId, projectId),
                cacheManagerNode(tenantId, projectId, platform)
        ));
        return node;
    }

    private Map<String, Object> devWorkbenchNode(String tenantId, String projectId, boolean platform) {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("id", platform ? "platform-dev" : scopedNodeId(tenantId, projectId, "dev-workbench"));
        node.put("nodeKind", "system-page");
        node.put("title", "开发工作台");
        node.put("icon", "Lightning");
        node.put("path", PATH_DEV);
        return node;
    }

    private Map<String, Object> platformDbmsNode() {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("id", "platform-dbms");
        node.put("nodeKind", "system-page");
        node.put("title", "数据库管理");
        node.put("description", "服务器、数据库和模型管理");
        node.put("icon", "DataBase");
        node.put("path", PATH_DBMS);
        return node;
    }

    private Map<String, Object> cacheManagerNode(String tenantId, String projectId, boolean platform) {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("id", platform ? "platform-cache" : scopedNodeId(tenantId, projectId, "cache-manager"));
        node.put("nodeKind", "system-page");
        node.put("title", "缓存管理");
        node.put("icon", "Coin");
        node.put("path", PATH_CACHE_MANAGER);
        return node;
    }

    private Map<String, Object> platformVueCleanupModule() {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("id", PLATFORM_VUE_CLEANUP_MODULE_ID);
        node.put("nodeKind", "module");
        node.put("title", PLATFORM_VUE_CLEANUP_MODULE_TITLE);
        node.put("description", "仅用于审查待删除的旧 Vue 页面，确认后再从 VUE_PAGE_MAP 移除。");
        node.put("icon", "WarningFilled");
        node.put("childPlacement", "sidebar");
        node.put("children", PLATFORM_VUE_CLEANUP_CANDIDATES.stream()
                .map(this::platformVueCleanupCandidateNode)
                .toList());
        return node;
    }

    private Map<String, Object> platformVueCleanupCandidateNode(VueCleanupCandidate candidate) {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("id", PLATFORM_VUE_CLEANUP_MODULE_ID + "-" + candidate.idSuffix());
        node.put("nodeKind", "system-page");
        node.put("title", candidate.title());
        node.put("description", candidate.description());
        node.put("icon", candidate.icon());
        node.put("path", candidate.path());
        return node;
    }

    private void applyHomepageDefaults(ProjectEntity homepage, String tenantId) {
        homepage.setName(PLATFORM_TENANT_ID.equals(tenantId) ? "平台管理工作台" : "企业管理平台");
        homepage.setProjectType(HOMEPAGE_PROJECT_TYPE);
        homepage.setIcon(PLATFORM_TENANT_ID.equals(tenantId) ? "Monitor" : "OfficeBuilding");
        homepage.setDescription(PLATFORM_TENANT_ID.equals(tenantId)
                ? "平台能力、租户、数据源与运维配置管理"
                : "企业级开发管理平台 — 创建和管理业务应用");
        homepage.setOrder(0);
    }

    private String scopedNodeId(String tenantId, String projectId, String nodeId) {
        if (PLATFORM_TENANT_ID.equals(tenantId)) {
            return nodeId;
        }
        String raw = tenantId + "-" + projectId + "-" + nodeId;
        return raw.replaceAll("[^A-Za-z0-9_-]", "-");
    }

    private String normalizePath(String path) {
        if (path == null || path.isBlank()) return "";
        String trimmed = path.trim();
        if (!trimmed.startsWith("/")) trimmed = "/" + trimmed;
        return "/".equals(trimmed) ? "/" : trimmed.replaceAll("/+$", "");
    }

    private String asString(Object value) {
        return value instanceof String text ? text.trim() : "";
    }

    @SuppressWarnings("unchecked")
    private boolean shouldReplacePlatformNavigation(String tenantId, Map<String, Object> existing) {
        if (!PLATFORM_TENANT_ID.equals(tenantId)) {
            return false;
        }
        Object children = existing.get("children");
        if (!(children instanceof List<?> list)) {
            return true;
        }
        return !containsNodeId((List<Map<String, Object>>) list, "platform-tenants");
    }

    @SuppressWarnings("unchecked")
    private boolean containsNodeId(List<Map<String, Object>> nodes, String nodeId) {
        for (Map<String, Object> node : nodes) {
            if (nodeId.equals(node.get("id"))) {
                return true;
            }
            Object children = node.get("children");
            if (children instanceof List<?> childList && containsNodeId((List<Map<String, Object>>) childList, nodeId)) {
                return true;
            }
        }
        return false;
    }

    private Map<String, Object> toMap(ProjectEntity p) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("tenantId", p.getTenantId());
        m.put("projectId", p.getProjectId());
        m.put("name", p.getName());
        m.put("projectType", p.getProjectType());
        m.put("icon", p.getIcon());
        m.put("description", p.getDescription());
        m.put("order", p.getOrder());
        m.put("createdAt", p.getCreatedAt() != null ? p.getCreatedAt().toString() : null);
        m.put("updatedAt", p.getUpdatedAt() != null ? p.getUpdatedAt().toString() : null);
        return m;
    }

    private record VueCleanupCandidate(String idSuffix, String title, String description, String icon, String path) {}
}
