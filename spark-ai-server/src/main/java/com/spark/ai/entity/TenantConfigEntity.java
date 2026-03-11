package com.spark.ai.entity;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * 租户配置实体 — 替代 AppConfigController 中的 ConcurrentHashMap 内存存储。
 * 存储租户的完整配置 JSON。
 */
@Entity
@Table(name = "tenant_config")
public class TenantConfigEntity {

    /** 租户 ID */
    @Id
    @Column(name = "tenant_id", length = 64)
    private String tenantId;

    /** 租户配置完整 JSON（包含 tenant / config / pageConfig / logger 等） */
    @Lob
    @Column(name = "config_json", columnDefinition = "CLOB")
    private String configJson;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = Instant.now();
    }

    // ── Getters & Setters ──

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }

    public String getConfigJson() { return configJson; }
    public void setConfigJson(String configJson) { this.configJson = configJson; }

    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
