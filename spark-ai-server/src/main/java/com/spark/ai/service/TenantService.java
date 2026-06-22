package com.spark.ai.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.entity.TenantConfigEntity;
import com.spark.ai.repository.TenantConfigRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 租户配置持久化服务 — 结构化列 + 扩展 JSON。
 * 高频字段存储在独立列，API 输入/输出仍为嵌套 Map 保持前端兼容。
 */
@Service
public class TenantService {

    private static final Logger log = LoggerFactory.getLogger(TenantService.class);

    private final TenantConfigRepository tenantRepo;
    private final ObjectMapper objectMapper;

    public TenantService(TenantConfigRepository tenantRepo,
                          ObjectMapper objectMapper) {
        this.tenantRepo = tenantRepo;
        this.objectMapper = objectMapper;
    }

    /**
     * 获取租户配置（从结构化列组装为嵌套 Map，保持 API 兼容）。
     */
    public Map<String, Object> getTenantConfig(String tenantId) throws IOException {
        return tenantRepo.findById(tenantId)
                .filter(entity -> entity.getDeletedAt() == null)
                .map(this::entityToMap)
                .orElse(null);
    }

    public Optional<TenantConfigEntity> findActiveTenant(String tenantId) {
        return tenantRepo.findById(tenantId)
                .filter(entity -> entity.getDeletedAt() == null);
    }

    public boolean isTenantUsable(String tenantId) {
        return findActiveTenant(tenantId)
                .map(entity -> !"DISABLED".equalsIgnoreCase(nullToEmpty(entity.getStatus())))
                .orElse(false);
    }

    /**
     * 创建或更新租户配置（从嵌套 Map 拆解写入结构化列）。
     */
    @Transactional
    public void saveTenantConfig(String tenantId, Map<String, Object> config) throws IOException {
        TenantConfigEntity entity = tenantRepo.findById(tenantId)
                .orElseGet(() -> {
                    TenantConfigEntity e = new TenantConfigEntity();
                    e.setTenantId(tenantId);
                    return e;
        });
        mapToEntity(config, entity);
        if (entity.getStatus() == null || entity.getStatus().isBlank()) {
            entity.setStatus("ACTIVE");
        }
        tenantRepo.save(entity);
        log.info("[Tenant] 租户配置已保存: {}", tenantId);
    }

    /**
     * 软删除租户配置。
     */
    @Transactional
    public boolean deleteTenantConfig(String tenantId) {
        TenantConfigEntity entity = tenantRepo.findById(tenantId).orElse(null);
        if (entity == null || entity.getDeletedAt() != null) {
            return false;
        }
        entity.setDeletedAt(Instant.now());
        entity.setStatus("DISABLED");
        tenantRepo.save(entity);
        log.info("[Tenant] 租户配置已软删除: {}", tenantId);
        return true;
    }

    /**
     * 列出所有租户摘要信息。
     */
    public List<Map<String, Object>> listTenants() {
        List<TenantConfigEntity> entities = tenantRepo.findByDeletedAtIsNull();
        List<Map<String, Object>> result = new ArrayList<>();
        for (TenantConfigEntity entity : entities) {
            result.add(summaryToMap(entity));
        }
        return result;
    }

    public List<Map<String, Object>> listTenantSummaries(boolean includeDeleted) {
        List<TenantConfigEntity> entities = includeDeleted ? tenantRepo.findAll() : tenantRepo.findByDeletedAtIsNull();
        List<Map<String, Object>> result = new ArrayList<>();
        for (TenantConfigEntity entity : entities) {
            result.add(summaryToMap(entity));
        }
        return result;
    }

    public long count() {
        return tenantRepo.count();
    }

    // ── 内部转换：Entity ↔ Map ──────────────────────────────────────────────

    /**
     * 从嵌套 Map 拆解写入 Entity 结构化列。
     * 未被结构化列覆盖的字段保存到 configJson 扩展字段。
     */
    private void mapToEntity(Map<String, Object> config, TenantConfigEntity entity) throws IOException {
        // tenant.*
        Map<String, Object> tenant = asMap(config.get("tenant"));
        if (tenant != null) {
            entity.setTenantName(asString(tenant.get("tenantName")));
            entity.setTenantCode(asString(tenant.get("tenantCode")));
            entity.setLogo(asString(tenant.get("logo")));
            String status = asString(tenant.get("status"));
            if (status != null && !status.isBlank()) {
                entity.setStatus(status.trim().toUpperCase());
            }
            Map<String, Object> theme = asMap(tenant.get("theme"));
            if (theme != null) {
                entity.setPrimaryColor(asString(theme.get("primaryColor")));
                entity.setBorderRadius(asString(theme.get("borderRadius")));
            }
        }

        // config.*
        Map<String, Object> cfg = asMap(config.get("config"));
        if (cfg != null) {
            entity.setLogLevel(asString(cfg.get("logLevel")));
            entity.setApiBaseUrl(asString(cfg.get("apiBaseUrl")));
            Map<String, Object> features = asMap(cfg.get("features"));
            if (features != null) {
                entity.setEnableAi(asBoolean(features.get("enableAI")));
                entity.setEnableExport(asBoolean(features.get("enableExport")));
                entity.setEnableOffline(asBoolean(features.get("enableOffline")));
            }
        }

        // pageConfig.*
        Map<String, Object> pageConfig = asMap(config.get("pageConfig"));
        if (pageConfig != null) {
            entity.setHomePath(asString(pageConfig.get("homePath")));
        }

        // 扩展字段：移除已结构化的顶层 key，剩余存 configJson
        Map<String, Object> extra = new LinkedHashMap<>(config);
        extra.remove("tenant");
        extra.remove("config");
        extra.remove("pageConfig");
        if (!extra.isEmpty()) {
            entity.setConfigJson(objectMapper.writeValueAsString(extra));
        } else {
            entity.setConfigJson(null);
        }
    }

    /**
     * 从 Entity 结构化列组装为嵌套 Map（保持 API 输出格式不变）。
     */
    private Map<String, Object> entityToMap(TenantConfigEntity entity) {
        Map<String, Object> result = new LinkedHashMap<>();

        // tenant
        Map<String, Object> tenant = new LinkedHashMap<>();
        tenant.put("tenantId", entity.getTenantId());
        tenant.put("tenantName", nullToEmpty(entity.getTenantName()));
        tenant.put("tenantCode", nullToEmpty(entity.getTenantCode()));
        tenant.put("status", nullToEmpty(entity.getStatus()));
        tenant.put("deletedAt", entity.getDeletedAt() != null ? entity.getDeletedAt().toString() : null);
        tenant.put("logo", nullToEmpty(entity.getLogo()));
        Map<String, Object> theme = new LinkedHashMap<>();
        theme.put("primaryColor", nullToEmpty(entity.getPrimaryColor()));
        theme.put("borderRadius", nullToEmpty(entity.getBorderRadius()));
        tenant.put("theme", theme);
        result.put("tenant", tenant);

        // config
        Map<String, Object> cfg = new LinkedHashMap<>();
        cfg.put("apiBaseUrl", nullToEmpty(entity.getApiBaseUrl()));
        cfg.put("logLevel", nullToEmpty(entity.getLogLevel()));
        Map<String, Object> features = new LinkedHashMap<>();
        features.put("enableAI", entity.getEnableAi() != null ? entity.getEnableAi() : false);
        features.put("enableExport", entity.getEnableExport() != null ? entity.getEnableExport() : false);
        features.put("enableOffline", entity.getEnableOffline() != null ? entity.getEnableOffline() : false);
        cfg.put("features", features);
        result.put("config", cfg);

        // pageConfig
        Map<String, Object> pageConfig = new LinkedHashMap<>();
        pageConfig.put("homePath", nullToEmpty(entity.getHomePath()));
        result.put("pageConfig", pageConfig);

        // 合并扩展 JSON
        if (entity.getConfigJson() != null && !entity.getConfigJson().isBlank()) {
            try {
                Map<String, Object> extra = objectMapper.readValue(entity.getConfigJson(),
                        new TypeReference<Map<String, Object>>() {});
                result.putAll(extra);
            } catch (IOException e) {
                log.warn("[Tenant] 扩展 JSON 解析失败: tenantId={}", entity.getTenantId(), e);
            }
        }

        return result;
    }

    private Map<String, Object> summaryToMap(TenantConfigEntity entity) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("tenantId", entity.getTenantId());
        result.put("tenantName", nullToEmpty(entity.getTenantName()));
        result.put("tenantCode", nullToEmpty(entity.getTenantCode()));
        result.put("status", nullToEmpty(entity.getStatus()));
        result.put("deletedAt", entity.getDeletedAt() != null ? entity.getDeletedAt().toString() : null);
        result.put("homePath", nullToEmpty(entity.getHomePath()));
        result.put("createdAt", entity.getCreatedAt() != null ? entity.getCreatedAt().toString() : null);
        result.put("updatedAt", entity.getUpdatedAt() != null ? entity.getUpdatedAt().toString() : null);
        return result;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object value) {
        if (value instanceof Map<?, ?>) return (Map<String, Object>) value;
        return null;
    }

    private static String asString(Object value) {
        if (value instanceof String s) return s;
        return null;
    }

    private static Boolean asBoolean(Object value) {
        if (value instanceof Boolean b) return b;
        return null;
    }

    private static String nullToEmpty(String value) {
        return value != null ? value : "";
    }
}
