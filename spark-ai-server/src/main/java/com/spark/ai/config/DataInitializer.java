package com.spark.ai.config;

import com.spark.ai.entity.TenantConfigEntity;
import com.spark.ai.repository.TenantConfigRepository;
import com.spark.ai.service.AuthService;
import com.spark.ai.service.ProjectService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 应用启动时数据初始化：
 * 1. 种子租户数据（仅当 tenant_config 表为空时）
 *
 * <p>⚠️ 说明：历史数据迁移逻辑已移除。
 * 页面/导航等迁移统一由前端调用 API 显式触发，不再在后端启动阶段隐式执行。
 */
@Component
public class DataInitializer implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DataInitializer.class);

    private final TenantConfigRepository tenantRepo;
    private final ProjectService projectService;
    private final AuthService authService;

    private static final String DEFAULT_TENANT = "lmspark";
    private static final String PLATFORM_TENANT = ProjectService.PLATFORM_TENANT_ID;

    public DataInitializer(TenantConfigRepository tenantRepo,
                            ProjectService projectService,
                            AuthService authService) {
        this.tenantRepo = tenantRepo;
        this.projectService = projectService;
        this.authService = authService;
    }

    @Override
    @Transactional
    public void run(String... args) throws Exception {
        seedTenants();
        ensureAllProjectsHaveNavigation();
    }

    /**
     * 确保所有已有活跃租户的主站和项目导航符合当前层级规则。
     */
    private void ensureAllProjectsHaveNavigation() {
        var tenants = tenantRepo.findByDeletedAtIsNull();
        for (var tenant : tenants) {
            projectService.ensureHomepage(tenant.getTenantId());
            projectService.ensureAllProjectNavigations(tenant.getTenantId());
        }
    }

    // ── 种子租户数据 ──────────────────────────────────────────────────────────

    private void seedTenants() {
        ensurePlatformTenant();
        ensureDefaultTenant();
    }

    private void ensureDefaultTenant() {
        TenantConfigEntity entity = tenantRepo.findById(DEFAULT_TENANT)
                .orElseGet(() -> {
                    TenantConfigEntity created = new TenantConfigEntity();
                    created.setTenantId(DEFAULT_TENANT);
                    return created;
                });
        entity.setTenantName("领码SPARK");
        entity.setTenantCode("LMSPARK");
        entity.setStatus("ACTIVE");
        entity.setDeletedAt(null);
        entity.setLogo("");
        entity.setPrimaryColor("#409eff");
        entity.setBorderRadius("4px");
        entity.setHomePath("/");
        entity.setApiBaseUrl("/api");
        entity.setLogLevel("debug");
        entity.setEnableAi(true);
        entity.setEnableExport(true);
        entity.setEnableOffline(false);
        tenantRepo.save(entity);

        projectService.ensureHomepage(DEFAULT_TENANT);
        authService.ensureAdminUser(DEFAULT_TENANT, "admin", "admin123");

        log.info("[DataInit] 默认业务租户已就绪: 领码SPARK ({})", DEFAULT_TENANT);
    }

    private void ensurePlatformTenant() {
        TenantConfigEntity entity = tenantRepo.findById(PLATFORM_TENANT)
                .orElseGet(() -> {
                    TenantConfigEntity created = new TenantConfigEntity();
                    created.setTenantId(PLATFORM_TENANT);
                    return created;
                });
        entity.setTenantName("SPARK 平台");
        entity.setTenantCode("PLATFORM");
        entity.setStatus("ACTIVE");
        entity.setDeletedAt(null);
        entity.setLogo("");
        entity.setPrimaryColor("#409eff");
        entity.setBorderRadius("4px");
        entity.setHomePath("/platform/dashboard");
        entity.setApiBaseUrl("/api");
        entity.setLogLevel("info");
        entity.setEnableAi(true);
        entity.setEnableExport(true);
        entity.setEnableOffline(false);
        tenantRepo.save(entity);

        projectService.ensureHomepage(PLATFORM_TENANT);
        authService.ensurePlatformAdminUser(PLATFORM_TENANT, "admin", "admin123");

        log.info("[DataInit] 平台租户已就绪: {}", PLATFORM_TENANT);
    }
}
