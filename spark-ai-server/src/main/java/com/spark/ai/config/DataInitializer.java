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
    }

    // ── 种子租户数据 ──────────────────────────────────────────────────────────

    private void seedTenants() {
        if (tenantRepo.count() > 0) {
            log.info("[DataInit] 租户数据已存在，跳过种子");
            return;
        }

        TenantConfigEntity entity = new TenantConfigEntity();
        entity.setTenantId(DEFAULT_TENANT);
        entity.setTenantName("领码SPARK");
        entity.setTenantCode("LMSPARK");
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

        log.info("[DataInit] 种子租户数据已写入: 领码SPARK ({})", DEFAULT_TENANT);
    }
}
