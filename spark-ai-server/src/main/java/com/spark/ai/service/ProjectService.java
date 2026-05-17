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
    private static final String PATH_DBMS = "/dbms";

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
        List<ProjectEntity> projects = projectRepo.findByTenantIdOrderBySortOrderAscCreatedAtAsc(tenantId);
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
        entity.setSortOrder(100);
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
        if (patch.containsKey("sortOrder")) entity.setSortOrder(((Number) patch.get("sortOrder")).intValue());

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
        List<ProjectEntity> projects = projectRepo.findByTenantIdOrderBySortOrderAscCreatedAtAsc(tenantId);
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
                navigationTreeService.saveNavConfig(tenantId, projectId, existing);
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
            navigationTreeService.saveNavConfig(tenantId, projectId, navRoot);
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
            return ensureRootNode(children, platformDbmsNode());
        }

        boolean changed = ensureRootNode(children, appListNode(tenantId, projectId));
        changed |= ensureDbmsNode(children, tenantId, projectId);
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

    private boolean ensureRootNode(List<Map<String, Object>> children, Map<String, Object> node) {
        if (containsNode(children, asString(node.get("id")), asString(node.get("path")))) {
            return false;
        }
        children.add(node);
        return true;
    }

    @SuppressWarnings("unchecked")
    private boolean ensureDbmsNode(List<Map<String, Object>> children, String tenantId, String projectId) {
        if (containsNode(children, "dbms", PATH_DBMS)) {
            return false;
        }
        Map<String, Object> dbmsNode = dbmsNode(tenantId, projectId);
        Map<String, Object> systemSettings = findNodeByIdSuffix(children, "system-settings");
        if (systemSettings == null) {
            children.add(dbmsNode);
            return true;
        }
        Object childValue = systemSettings.get("children");
        List<Map<String, Object>> settingsChildren;
        if (childValue instanceof List<?> rawChildren) {
            settingsChildren = (List<Map<String, Object>>) rawChildren;
        } else {
            settingsChildren = new ArrayList<>();
            systemSettings.put("children", settingsChildren);
        }
        if (containsNode(settingsChildren, "dbms", PATH_DBMS)) {
            return false;
        }
        settingsChildren.add(dbmsNode);
        return true;
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
        node.put("description", "租户级服务器、数据库和模型管理");
        node.put("icon", "DataBase");
        node.put("path", PATH_DBMS);
        return node;
    }

    private Map<String, Object> platformDbmsNode() {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("id", "platform-dbms");
        node.put("nodeKind", "system-page");
        node.put("title", "DBMS");
        node.put("description", "平台级服务器、数据库和模型管理");
        node.put("icon", "DataBase");
        node.put("path", PATH_DBMS);
        return node;
    }

    private void applyHomepageDefaults(ProjectEntity homepage, String tenantId) {
        homepage.setName(PLATFORM_TENANT_ID.equals(tenantId) ? "平台管理工作台" : "企业管理平台");
        homepage.setProjectType(HOMEPAGE_PROJECT_TYPE);
        homepage.setIcon(PLATFORM_TENANT_ID.equals(tenantId) ? "Monitor" : "OfficeBuilding");
        homepage.setDescription(PLATFORM_TENANT_ID.equals(tenantId)
                ? "平台能力、租户、数据源与运维配置管理"
                : "企业级开发管理平台 — 创建和管理业务应用");
        homepage.setSortOrder(0);
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
        m.put("sortOrder", p.getSortOrder());
        m.put("createdAt", p.getCreatedAt() != null ? p.getCreatedAt().toString() : null);
        m.put("updatedAt", p.getUpdatedAt() != null ? p.getUpdatedAt().toString() : null);
        return m;
    }
}
