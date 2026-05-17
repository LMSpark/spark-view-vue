package com.spark.ai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.entity.ProjectEntity;
import com.spark.ai.repository.ProjectMemberRepository;
import com.spark.ai.repository.ProjectRepository;
import com.spark.ai.security.AccessGuardService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProjectServiceNavigationSeedTest {

    @Mock
    private ProjectRepository projectRepo;

    @Mock
    private ProjectMemberRepository memberRepo;

    @Mock
    private AccessGuardService accessGuard;

    private ProjectNavigationTreeService navigationTreeService;
    private ProjectService projectService;

    @BeforeEach
    void setUp() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource();
        dataSource.setDriverClassName("org.h2.Driver");
        dataSource.setUrl("jdbc:h2:mem:project-service-navigation-" + System.nanoTime() + ";MODE=LEGACY;DB_CLOSE_DELAY=-1");
        dataSource.setUsername("sa");
        dataSource.setPassword("");

        navigationTreeService = new ProjectNavigationTreeService(new ObjectMapper(), new JdbcTemplate(dataSource));
        navigationTreeService.ensureSchema();
        projectService = new ProjectService(projectRepo, memberRepo, navigationTreeService, new ObjectMapper(), accessGuard);
        projectService.loadNavigationTemplates();
    }

    @Test
    void ordinaryHomepageNavigationContainsTenantManagementEntries() throws Exception {
        when(projectRepo.findByTenantIdAndProjectId("lmspark", ProjectService.HOMEPAGE_PROJECT_ID))
                .thenReturn(Optional.empty());

        projectService.ensureHomepage("lmspark");

        Map<String, Object> nav = navigationTreeService.getNavConfig("lmspark", ProjectService.HOMEPAGE_PROJECT_ID);
        assertTrue(containsPath(nav, "/app-list"));
        assertTrue(containsPath(nav, "/dbms"));
        assertEquals(1, countPath(nav, "/app-list"));
        assertEquals(1, countPath(nav, "/dbms"));
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
    }

    @Test
    void existingAppProjectNavigationPrunesMisplacedTenantEntriesOnly() throws Exception {
        navigationTreeService.saveNavConfig("lmspark", "engineering-pm", navRoot(
                node("home", "工作台", "/dashboard"),
                node("back-to-homepage", "返回应用工场", "/app-list"),
                node("dbms", "数据库管理", "/dbms"),
                node("custom", "自定义页面", "/custom-page")
        ));
        when(projectRepo.findByTenantIdOrderBySortOrderAscCreatedAtAsc("lmspark"))
                .thenReturn(List.of(project("lmspark", "engineering-pm", ProjectService.APP_PROJECT_TYPE)));

        projectService.ensureAllProjectNavigations("lmspark");

        Map<String, Object> nav = navigationTreeService.getNavConfig("lmspark", "engineering-pm");
        assertFalse(containsPath(nav, "/app-list"));
        assertFalse(containsPath(nav, "/dbms"));
        assertTrue(containsPath(nav, "/custom-page"));
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
        assertEquals(0, platform.getSortOrder());

        ProjectEntity ordinary = project("lmspark", ProjectService.HOMEPAGE_PROJECT_ID, "legacy");
        when(projectRepo.findByTenantIdAndProjectId("lmspark", ProjectService.HOMEPAGE_PROJECT_ID))
                .thenReturn(Optional.of(ordinary));

        projectService.ensureHomepage("lmspark");

        assertEquals("企业管理平台", ordinary.getName());
        assertEquals(ProjectService.HOMEPAGE_PROJECT_TYPE, ordinary.getProjectType());
        assertEquals("OfficeBuilding", ordinary.getIcon());
        assertEquals(0, ordinary.getSortOrder());
    }

    @Test
    void ensureHomepageIsNavigationIdempotent() throws Exception {
        ProjectEntity homepage = project("lmspark", ProjectService.HOMEPAGE_PROJECT_ID, ProjectService.HOMEPAGE_PROJECT_TYPE);
        when(projectRepo.findByTenantIdAndProjectId("lmspark", ProjectService.HOMEPAGE_PROJECT_ID))
                .thenReturn(Optional.empty())
                .thenReturn(Optional.of(homepage));

        projectService.ensureHomepage("lmspark");
        projectService.ensureHomepage("lmspark");

        Map<String, Object> nav = navigationTreeService.getNavConfig("lmspark", ProjectService.HOMEPAGE_PROJECT_ID);
        assertEquals(1, countPath(nav, "/app-list"));
        assertEquals(1, countPath(nav, "/dbms"));
    }

    private static ProjectEntity project(String tenantId, String projectId, String projectType) {
        ProjectEntity project = new ProjectEntity();
        project.setTenantId(tenantId);
        project.setProjectId(projectId);
        project.setName(projectId);
        project.setProjectType(projectType);
        project.setIcon("Box");
        project.setDescription("");
        project.setSortOrder(100);
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
}
