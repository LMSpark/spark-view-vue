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
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 租户配置持久化服务 — H2 数据库版。
 * 替代 AppConfigController 中的 ConcurrentHashMap 内存存储。
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
        log.info("[Tenant] 使用 H2 嵌入式数据库存储");
    }

    /**
     * 获取租户配置。
     * @return 租户配置 Map，不存在返回 null
     */
    public Map<String, Object> getTenantConfig(String tenantId) throws IOException {
        return tenantRepo.findById(tenantId)
                .map(entity -> {
                    try {
                        return objectMapper.readValue(entity.getConfigJson(),
                                new TypeReference<Map<String, Object>>() {});
                    } catch (IOException e) {
                        log.error("[Tenant] JSON 解析失败: tenantId={}", tenantId, e);
                        return null;
                    }
                })
                .orElse(null);
    }

    /**
     * 创建或更新租户配置。
     */
    @Transactional
    public void saveTenantConfig(String tenantId, Map<String, Object> config) throws IOException {
        String json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(config);

        TenantConfigEntity entity = tenantRepo.findById(tenantId)
                .orElseGet(() -> {
                    TenantConfigEntity e = new TenantConfigEntity();
                    e.setTenantId(tenantId);
                    return e;
                });
        entity.setConfigJson(json);
        tenantRepo.save(entity);
        log.info("[Tenant] 租户配置已保存: {}", tenantId);
    }

    /**
     * 删除租户配置。
     * @return true 如果删除成功，false 如果不存在
     */
    @Transactional
    public boolean deleteTenantConfig(String tenantId) {
        if (!tenantRepo.existsById(tenantId)) {
            return false;
        }
        tenantRepo.deleteById(tenantId);
        log.info("[Tenant] 租户配置已删除: {}", tenantId);
        return true;
    }

    /**
     * 列出所有租户摘要信息。
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> listTenants() {
        List<TenantConfigEntity> entities = tenantRepo.findAll();
        List<Map<String, Object>> result = new ArrayList<>();

        for (TenantConfigEntity entity : entities) {
            try {
                Map<String, Object> config = objectMapper.readValue(entity.getConfigJson(),
                        new TypeReference<Map<String, Object>>() {});
                Map<String, Object> tenant = (Map<String, Object>) config.get("tenant");
                result.add(Map.of(
                        "tenantId", entity.getTenantId(),
                        "tenantName", tenant != null ? tenant.getOrDefault("tenantName", "") : "",
                        "tenantCode", tenant != null ? tenant.getOrDefault("tenantCode", "") : ""
                ));
            } catch (IOException e) {
                log.error("[Tenant] JSON 解析失败: tenantId={}", entity.getTenantId(), e);
            }
        }
        return result;
    }

    /**
     * 获取已注册租户数量。
     */
    public long count() {
        return tenantRepo.count();
    }
}
