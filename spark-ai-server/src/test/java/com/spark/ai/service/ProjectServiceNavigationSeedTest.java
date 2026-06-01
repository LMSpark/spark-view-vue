package com.spark.ai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.entity.ProjectEntity;
import com.spark.ai.repository.NavigationNodeFlatRepository;
import com.spark.ai.repository.ProjectMemberRepository;
import com.spark.ai.repository.ProjectRepository;
import com.spark.ai.security.AccessGuardService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.mock.mockito.MockBean;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

@DataJpaTest(properties = {
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.flyway.enabled=false"
})
class ProjectServiceNavigationSeedTest {
    private static final List<String> EXPECTED_PLATFORM_VUE_CLEANUP_PATHS = List.of(
            "/dashboard",
            "/about",
            "/settings",
            "/capability-demo",
            "/demo/template-dsl",
            "/demo/custom-r-table",
            "/demo/r-form-compare"
    );

    @MockBean
    private ProjectRepository projectRepo;

    @MockBean
    private ProjectMemberRepository memberRepo;

    @MockBean
    private AccessGuardService accessGuard;

    @Autowired
    private NavigationNodeFlatRepository navigationNodeRepository;

    private ProjectNavigationTreeService navigationTreeService;
    private ProjectService projectService;

    @BeforeEach
    void setUp() {
        navigationTreeService = new ProjectNavigationTreeService(new ObjectMapper(), accessGuard, navigationNodeRepository);
        projectService = new ProjectService(projectRepo, memberRepo, navigationTreeService, new ObjectMapper(), accessGuard);
        projectService.loadNavigationTemplates();
    }

    @Test
    void ordinaryHomepageNavigationContainsTenantManagementEntries() throws Exception {
        when(projectRepo.findByTenantIdAndProjectId("lmspark", ProjectService.HOMEPAGE_PROJECT_ID))
                .thenReturn(Optional.empty());

        projectService.ensureHomepage("lmspark");

        Map<String, Object> nav = navigationTreeService.getNavConfig("lmspark", ProjectService.HOMEPAGE_PROJECT_ID);
        assertTrue(containsPath(nav, "/home"));
        assertFalse(containsPath(nav, "/dashboard"));
        assertTrue(containsPath(nav, "/app-list"));
        assertTrue(containsPath(nav, "/dev"));
        assertTrue(containsPath(nav, "/dbms"));
        assertTrue(containsPath(nav, "/cache-manager"));
        assertEquals(1, countPath(nav, "/app-list"));
        assertEquals(1, countPath(nav, "/dev"));
        assertEquals(1, countPath(nav, "/dbms"));
        assertEquals(1, countPath(nav, "/cache-manager"));
        assertEquals("开发中心", parentTitleForPath(nav, "/dbms"));
        assertEquals(0, countModuleByTitle(nav, "Vue 清理候选"));
    }

    @Test
    void appProjectNavigationDoesNotContainTenantManagementEntries() throws Exception {
        when(projectRepo.existsByTenantIdAndProjectId("lmspark", "engineering-pm")).thenReturn(false);

        projectService.createProject("lmspark", "engineering-pm", "工程管理", "Box", "项目管理应用");

        Map<String, Object> nav = navigationTreeService.getNavConfig("lmspark", "engineering-pm");
        assertFalse(containsPath(nav, "/app-list"));
        assertFalse(containsPath(nav, "/dbms"));
        assertTrue(containsPath(nav, "/dashboard"));
        assertTrue(containsPath(nav, "/dev"));
        assertEquals(0, countModuleByTitle(nav, "Vue 清理候选"));
    }

    @Test
    void existingAppProjectNavigationPrunesMisplacedTenantEntriesOnly() throws Exception {
        navigationTreeService.importNavConfig("lmspark", "engineering-pm", navRoot(
                node("home", "工作台", "/dashboard"),
                node("back-to-homepage", "返回应用工场", "/app-list"),
                node("dbms", "数据库管理", "/dbms"),
                node("custom", "自定义页面", "/custom-page")
        ));
        when(projectRepo.findByTenantIdOrderByOrderAscCreatedAtAsc("lmspark"))
                .thenReturn(List.of(project("lmspark", "engineering-pm", ProjectService.APP_PROJECT_TYPE)));

        projectService.ensureAllProjectNavigations("lmspark");

        Map<String, Object> nav = navigationTreeService.getNavConfig("lmspark", "engineering-pm");
        assertFalse(containsPath(nav, "/app-list"));
        assertFalse(containsPath(nav, "/dbms"));
        assertTrue(containsPath(nav, "/custom-page"));
    }

    @Test
        void existingHomepageNavigationRebuildsDevelopmentCenter() throws Exception {
        navigationTreeService.importNavConfig("lmspark", ProjectService.HOMEPAGE_PROJECT_ID, navRoot(
                node("home", "工作台", "/dashboard"),
            node("back-to-homepage", "返回应用工场", "/app-list"),
            node("dbms", "DBMS", "/dbms"),
            module("system-settings", "系统设置",
                node("legacy-dev", "开发系统", "/dev"),
                node("legacy-cache", "缓存", "/cache-manager"))
        ));
        when(projectRepo.findByTenantIdOrderByOrderAscCreatedAtAsc("lmspark"))
                .thenReturn(List.of(project("lmspark", ProjectService.HOMEPAGE_PROJECT_ID, ProjectService.HOMEPAGE_PROJECT_TYPE)));

        projectService.ensureAllProjectNavigations("lmspark");

        Map<String, Object> nav = navigationTreeService.getNavConfig("lmspark", ProjectService.HOMEPAGE_PROJECT_ID);
        assertEquals("应用管理", titleForPath(nav, "/app-list"));
        assertEquals("开发中心", parentTitleForPath(nav, "/dbms"));
        assertEquals("数据库管理", titleForPath(nav, "/dbms"));
        assertEquals(1, countPath(nav, "/dev"));
        assertEquals(1, countPath(nav, "/dbms"));
        assertEquals(1, countPath(nav, "/cache-manager"));
        }

        @Test
    void existingPlatformHomepageRemovesTopLevelDbmsAndRebuildsDevelopmentCenter() throws Exception {
        navigationTreeService.importNavConfig(ProjectService.PLATFORM_TENANT_ID, ProjectService.HOMEPAGE_PROJECT_ID, navRoot(
            node("platform-dashboard", "平台首页", "/dashboard"),
            node("platform-tenants", "租户管理", "/tenants"),
            node("platform-apps", "应用管理", "/apps"),
            node("platform-dbms", "DBMS", "/dbms"),
            module("platform-system", "平台工具",
                node("platform-dev", "开发系统", "/dev"),
                node("platform-cache", "缓存管理", "/cache-manager"))
        ));
        when(projectRepo.findByTenantIdOrderByOrderAscCreatedAtAsc(ProjectService.PLATFORM_TENANT_ID))
            .thenReturn(List.of(project(ProjectService.PLATFORM_TENANT_ID, ProjectService.HOMEPAGE_PROJECT_ID, ProjectService.HOMEPAGE_PROJECT_TYPE)));

        projectService.ensureAllProjectNavigations(ProjectService.PLATFORM_TENANT_ID);

        Map<String, Object> nav = navigationTreeService.getNavConfig(ProjectService.PLATFORM_TENANT_ID, ProjectService.HOMEPAGE_PROJECT_ID);
        assertEquals(1, countPath(nav, "/dbms"));
        assertEquals("开发中心", parentTitleForPath(nav, "/dbms"));
        assertEquals("数据库管理", titleForPath(nav, "/dbms"));
    }

    @Test
    void platformHomepageStagesVueCleanupCandidates() throws Exception {
        when(projectRepo.findByTenantIdAndProjectId(ProjectService.PLATFORM_TENANT_ID, ProjectService.HOMEPAGE_PROJECT_ID))
                .thenReturn(Optional.empty());

        projectService.ensureHomepage(ProjectService.PLATFORM_TENANT_ID);

        Map<String, Object> nav = navigationTreeService.getNavConfig(ProjectService.PLATFORM_TENANT_ID, ProjectService.HOMEPAGE_PROJECT_ID);
        Map<String, Object> cleanupModule = findModuleByTitle(nav, "Vue 清理候选");
        assertNotNull(cleanupModule);
        assertEquals(1, countModuleByTitle(nav, "Vue 清理候选"));
        assertEquals("platform-vue-cleanup", cleanupModule.get("id"));
        assertEquals("module", cleanupModule.get("nodeKind"));
        assertEquals(EXPECTED_PLATFORM_VUE_CLEANUP_PATHS, childPaths(cleanupModule));
        assertAllCleanupChildrenAreSystemPages(cleanupModule);
    }

    @Test
    void existingPlatformHomepageRebuildsSingleVueCleanupCandidateModule() throws Exception {
        navigationTreeService.importNavConfig(ProjectService.PLATFORM_TENANT_ID, ProjectService.HOMEPAGE_PROJECT_ID, navRoot(
            node("platform-dashboard", "平台首页", "/dashboard"),
            node("platform-tenants", "租户管理", "/tenants"),
            node("platform-apps", "应用管理", "/apps"),
            module("platform-vue-cleanup-old", "Vue 清理候选",
                node("platform-vue-cleanup-old-settings", "旧设置候选", "/settings")),
            module("legacy-review", "旧 Vue 审核",
                node("platform-vue-cleanup-about", "旧关于候选", "/about")),
            module("platform-dev-center", "开发中心",
                node("platform-dev", "开发系统", "/dev"))
        ));
        when(projectRepo.findByTenantIdOrderByOrderAscCreatedAtAsc(ProjectService.PLATFORM_TENANT_ID))
            .thenReturn(List.of(project(ProjectService.PLATFORM_TENANT_ID, ProjectService.HOMEPAGE_PROJECT_ID, ProjectService.HOMEPAGE_PROJECT_TYPE)));

        projectService.ensureAllProjectNavigations(ProjectService.PLATFORM_TENANT_ID);

        Map<String, Object> nav = navigationTreeService.getNavConfig(ProjectService.PLATFORM_TENANT_ID, ProjectService.HOMEPAGE_PROJECT_ID);
        Map<String, Object> cleanupModule = findModuleByTitle(nav, "Vue 清理候选");
        assertNotNull(cleanupModule);
        assertEquals(1, countModuleByTitle(nav, "Vue 清理候选"));
        assertEquals(EXPECTED_PLATFORM_VUE_CLEANUP_PATHS, childPaths(cleanupModule));
        assertAllCleanupChildrenAreSystemPages(cleanupModule);
        assertEquals("开发中心", parentTitleForPath(nav, "/dev"));
    }

    @Test
    void ensureHomepageRepairsProjectSeedFields() {
        ProjectEntity platform = project(ProjectService.PLATFORM_TENANT_ID, ProjectService.HOMEPAGE_PROJECT_ID, "legacy");
        when(projectRepo.findByTenantIdAndProjectId(ProjectService.PLATFORM_TENANT_ID, ProjectService.HOMEPAGE_PROJECT_ID))
                .thenReturn(Optional.of(platform));

        projectService.ensureHomepage(ProjectService.PLATFORM_TENANT_ID);

        assertEquals("平台管理工作台", platform.getName());
        assertEquals(ProjectService.HOMEPAGE_PROJECT_TYPE, platform.getProjectType());
        assertEquals("Monitor", platform.getIcon());
        assertEquals(0, platform.getOrder());

        ProjectEntity ordinary = project("lmspark", ProjectService.HOMEPAGE_PROJECT_ID, "legacy");
        when(projectRepo.findByTenantIdAndProjectId("lmspark", ProjectService.HOMEPAGE_PROJECT_ID))
                .thenReturn(Optional.of(ordinary));

        projectService.ensureHomepage("lmspark");

        assertEquals("企业管理平台", ordinary.getName());
        assertEquals(ProjectService.HOMEPAGE_PROJECT_TYPE, ordinary.getProjectType());
        assertEquals("OfficeBuilding", ordinary.getIcon());
        assertEquals(0, ordinary.getOrder());
    }

    @Test
    void ensureHomepageIsNavigationIdempotent() throws Exception {
        ProjectEntity homepage = project("lmspark", ProjectService.HOMEPAGE_PROJECT_ID, ProjectService.HOMEPAGE_PROJECT_TYPE);
        when(projectRepo.findByTenantIdAndProjectId("lmspark", ProjectService.HOMEPAGE_PROJECT_ID))
                .thenReturn(Optional.empty())
                .thenReturn(Optional.of(homepage));

        projectService.ensureHomepage("lmspark");
        List<Map<String, Object>> before = navigationTreeService.listRawFlatRows(
                "lmspark", ProjectService.HOMEPAGE_PROJECT_ID);
        projectService.ensureHomepage("lmspark");
        List<Map<String, Object>> after = navigationTreeService.listRawFlatRows(
                "lmspark", ProjectService.HOMEPAGE_PROJECT_ID);

        Map<String, Object> nav = navigationTreeService.getNavConfig("lmspark", ProjectService.HOMEPAGE_PROJECT_ID);
        assertEquals(before, after);
        assertEquals(1, countPath(nav, "/app-list"));
        assertEquals(1, countPath(nav, "/dev"));
        assertEquals(1, countPath(nav, "/dbms"));
        assertEquals(1, countPath(nav, "/cache-manager"));
    }

    @Test
    void ensurePlatformHomepageIsNavigationIdempotent() throws Exception {
        ProjectEntity homepage = project(ProjectService.PLATFORM_TENANT_ID, ProjectService.HOMEPAGE_PROJECT_ID, ProjectService.HOMEPAGE_PROJECT_TYPE);
        when(projectRepo.findByTenantIdAndProjectId(ProjectService.PLATFORM_TENANT_ID, ProjectService.HOMEPAGE_PROJECT_ID))
                .thenReturn(Optional.empty())
                .thenReturn(Optional.of(homepage));

        projectService.ensureHomepage(ProjectService.PLATFORM_TENANT_ID);
        List<Map<String, Object>> before = navigationTreeService.listRawFlatRows(
                ProjectService.PLATFORM_TENANT_ID, ProjectService.HOMEPAGE_PROJECT_ID);
        projectService.ensureHomepage(ProjectService.PLATFORM_TENANT_ID);
        List<Map<String, Object>> after = navigationTreeService.listRawFlatRows(
                ProjectService.PLATFORM_TENANT_ID, ProjectService.HOMEPAGE_PROJECT_ID);

        assertEquals(before, after);
    }

    private static ProjectEntity project(String tenantId, String projectId, String projectType) {
        ProjectEntity project = new ProjectEntity();
        project.setTenantId(tenantId);
        project.setProjectId(projectId);
        project.setName(projectId);
        project.setProjectType(projectType);
        project.setIcon("Box");
        project.setDescription("");
        project.setOrder(100);
        return project;
    }

    private static Map<String, Object> navRoot(Map<String, Object>... children) {
        Map<String, Object> root = new java.util.LinkedHashMap<>();
        root.put("childPlacement", "header");
        root.put("children", new ArrayList<>(List.of(children)));
        return root;
    }

    private static Map<String, Object> node(String id, String title, String path) {
        Map<String, Object> node = new java.util.LinkedHashMap<>();
        node.put("id", id);
        node.put("nodeKind", "system-page");
        node.put("title", title);
        node.put("path", path);
        return node;
    }

    private static Map<String, Object> module(String id, String title, Map<String, Object>... children) {
        Map<String, Object> node = new java.util.LinkedHashMap<>();
        node.put("id", id);
        node.put("nodeKind", "module");
        node.put("title", title);
        node.put("childPlacement", "sidebar");
        node.put("children", new ArrayList<>(List.of(children)));
        return node;
    }

    @SuppressWarnings("unchecked")
    private static void assertAllCleanupChildrenAreSystemPages(Map<String, Object> module) {
        Object children = module.get("children");
        assertTrue(children instanceof List<?>);
        for (Map<String, Object> child : (List<Map<String, Object>>) children) {
            assertTrue(String.valueOf(child.get("id")).startsWith("platform-vue-cleanup-"));
            assertEquals("system-page", child.get("nodeKind"));
        }
    }

    @SuppressWarnings("unchecked")
    private static boolean containsPath(Map<String, Object> root, String path) {
        return countPath(root, path) > 0;
    }

    @SuppressWarnings("unchecked")
    private static int countPath(Map<String, Object> root, String path) {
        Object children = root.get("children");
        if (!(children instanceof List<?> childList)) return 0;
        return countPathInNodes((List<Map<String, Object>>) childList, path);
    }

    @SuppressWarnings("unchecked")
    private static String titleForPath(Map<String, Object> root, String path) {
        Object children = root.get("children");
        if (!(children instanceof List<?> childList)) return "";
        return titleForPathInNodes((List<Map<String, Object>>) childList, path);
    }

    @SuppressWarnings("unchecked")
    private static String parentTitleForPath(Map<String, Object> root, String path) {
        Object children = root.get("children");
        if (!(children instanceof List<?> childList)) return "";
        return parentTitleForPathInNodes((List<Map<String, Object>>) childList, path, "");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> findModuleByTitle(Map<String, Object> root, String title) {
        Object children = root.get("children");
        if (!(children instanceof List<?> childList)) return null;
        return findModuleByTitleInNodes((List<Map<String, Object>>) childList, title);
    }

    @SuppressWarnings("unchecked")
    private static int countModuleByTitle(Map<String, Object> root, String title) {
        Object children = root.get("children");
        if (!(children instanceof List<?> childList)) return 0;
        return countModuleByTitleInNodes((List<Map<String, Object>>) childList, title);
    }

    @SuppressWarnings("unchecked")
    private static List<String> childPaths(Map<String, Object> node) {
        Object children = node.get("children");
        if (!(children instanceof List<?> childList)) return List.of();
        List<String> paths = new ArrayList<>();
        for (Map<String, Object> child : (List<Map<String, Object>>) childList) {
            paths.add(String.valueOf(child.get("path")));
        }
        return paths;
    }

    @SuppressWarnings("unchecked")
    private static boolean childHidden(Map<String, Object> node, String path) {
        Object children = node.get("children");
        if (!(children instanceof List<?> childList)) return false;
        for (Map<String, Object> child : (List<Map<String, Object>>) childList) {
            if (path.equals(child.get("path"))) {
                return Boolean.TRUE.equals(child.get("hidden"));
            }
        }
        return false;
    }

    @SuppressWarnings("unchecked")
    private static int countPathInNodes(List<Map<String, Object>> nodes, String path) {
        int count = 0;
        for (Map<String, Object> node : nodes) {
            if (path.equals(node.get("path"))) count++;
            Object children = node.get("children");
            if (children instanceof List<?> childList) {
                count += countPathInNodes((List<Map<String, Object>>) childList, path);
            }
        }
        return count;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> findModuleByTitleInNodes(List<Map<String, Object>> nodes, String title) {
        for (Map<String, Object> node : nodes) {
            if ("module".equals(node.get("nodeKind")) && title.equals(node.get("title"))) return node;
            Object children = node.get("children");
            if (children instanceof List<?> childList) {
                Map<String, Object> found = findModuleByTitleInNodes((List<Map<String, Object>>) childList, title);
                if (found != null) return found;
            }
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private static int countModuleByTitleInNodes(List<Map<String, Object>> nodes, String title) {
        int count = 0;
        for (Map<String, Object> node : nodes) {
            if ("module".equals(node.get("nodeKind")) && title.equals(node.get("title"))) count++;
            Object children = node.get("children");
            if (children instanceof List<?> childList) {
                count += countModuleByTitleInNodes((List<Map<String, Object>>) childList, title);
            }
        }
        return count;
    }

    @SuppressWarnings("unchecked")
    private static String titleForPathInNodes(List<Map<String, Object>> nodes, String path) {
        for (Map<String, Object> node : nodes) {
            if (path.equals(node.get("path"))) return String.valueOf(node.get("title"));
            Object children = node.get("children");
            if (children instanceof List<?> childList) {
                String title = titleForPathInNodes((List<Map<String, Object>>) childList, path);
                if (!title.isBlank()) return title;
            }
        }
        return "";
    }

    @SuppressWarnings("unchecked")
    private static String parentTitleForPathInNodes(List<Map<String, Object>> nodes, String path, String parentTitle) {
        for (Map<String, Object> node : nodes) {
            if (path.equals(node.get("path"))) return parentTitle;
            Object children = node.get("children");
            if (children instanceof List<?> childList) {
                String title = parentTitleForPathInNodes((List<Map<String, Object>>) childList, path, String.valueOf(node.get("title")));
                if (!title.isBlank()) return title;
            }
        }
        return "";
    }
}
