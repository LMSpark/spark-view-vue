package com.spark.ai.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.entity.ProjectEntity;
import com.spark.ai.repository.ProjectRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
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

    private final ProjectRepository projectRepo;
    private final NavigationService navigationService;
    private final ObjectMapper objectMapper;

    public ProjectService(ProjectRepository projectRepo, NavigationService navigationService, ObjectMapper objectMapper) {
        this.projectRepo = projectRepo;
        this.navigationService = navigationService;
        this.objectMapper = objectMapper;
    }

    /**
     * 获取租户下所有项目（homepage 排首位）。
     */
    public List<Map<String, Object>> listProjects(String tenantId) {
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

        ProjectEntity entity = new ProjectEntity();
        entity.setTenantId(tenantId);
        entity.setProjectId(projectId);
        entity.setName(name != null && !name.isBlank() ? name : projectId);
        entity.setProjectType(APP_PROJECT_TYPE);
        entity.setIcon(icon != null ? icon : "📦");
        entity.setDescription(description != null ? description : "");
        entity.setSortOrder(100);
        projectRepo.save(entity);

        // 从 classpath 模板初始化应用默认导航
        initAppNavigation(tenantId, projectId);

        log.info("[Project] 创建项目: tenant={}, project={}", tenantId, projectId);
        return toMap(entity);
    }

    /**
     * 更新项目属性（不允许修改 projectType）。
     */
    @Transactional
    public Map<String, Object> updateProject(String tenantId, String projectId,
                                              Map<String, Object> patch) {
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
        if (projectRepo.existsByTenantIdAndProjectId(tenantId, HOMEPAGE_PROJECT_ID)) {
            return;
        }

        ProjectEntity homepage = new ProjectEntity();
        homepage.setTenantId(tenantId);
        homepage.setProjectId(HOMEPAGE_PROJECT_ID);
        homepage.setName("企业管理平台");
        homepage.setProjectType(HOMEPAGE_PROJECT_TYPE);
        homepage.setIcon("🏗️");
        homepage.setDescription("企业级开发管理平台 — 创建和管理业务应用");
        homepage.setSortOrder(0);
        projectRepo.save(homepage);
        log.info("[Project] 自动创建企业管理平台: tenant={}", tenantId);
    }

    /**
     * 从 classpath 模板初始化应用默认导航（工作台 + 系统设置）。
     */
    private void initAppNavigation(String tenantId, String projectId) {
        try {
            ClassPathResource resource = new ClassPathResource("navigation-app-default.json");
            try (InputStream stream = resource.getInputStream()) {
                String json = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
                Map<String, Object> navRoot = objectMapper.readValue(json,
                        new TypeReference<Map<String, Object>>() {});
                navigationService.saveNavConfig(tenantId, projectId, navRoot);
                log.info("[Project] 已初始化应用导航: tenant={}, project={}", tenantId, projectId);
            }
        } catch (IOException e) {
            log.warn("[Project] 应用导航模板初始化失败（不影响项目创建）: tenant={}, project={}", tenantId, projectId, e);
        }
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
