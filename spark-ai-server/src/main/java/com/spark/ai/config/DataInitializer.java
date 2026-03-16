package com.spark.ai.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.entity.TenantConfigEntity;
import com.spark.ai.repository.TenantConfigRepository;
import com.spark.ai.service.AuthService;
import com.spark.ai.service.ProjectService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

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
    private final ObjectMapper objectMapper;

    private static final String DEFAULT_TENANT = "lmspark";

    public DataInitializer(TenantConfigRepository tenantRepo,
                            ProjectService projectService,
                            AuthService authService,
                            ObjectMapper objectMapper) {
        this.tenantRepo = tenantRepo;
        this.projectService = projectService;
        this.authService = authService;
        this.objectMapper = objectMapper;
    }

    @Override
    @Transactional
    public void run(String... args) throws Exception {
        seedTenants();
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
