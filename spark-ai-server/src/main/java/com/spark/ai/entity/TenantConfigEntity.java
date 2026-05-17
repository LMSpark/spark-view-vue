package com.spark.ai.entity;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * 租户配置实体 — 高频字段结构化存储，扩展配置保留 JSON。
 */
@Entity
@Table(name = "tenant_config")
public class TenantConfigEntity {

    @Id
    @Column(name = "tenant_id", length = 64)
    private String tenantId;

    // ── 租户基本信息 ──

    @Column(name = "tenant_name", length = 128)
    private String tenantName;

    @Column(name = "tenant_code", length = 64)
    private String tenantCode;

    @Column(name = "status", length = 32, nullable = false)
    private String status = "ACTIVE";

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Column(name = "logo", length = 512)
    private String logo;

    // ── 主题 ──

    @Column(name = "primary_color", length = 32)
    private String primaryColor;

    @Column(name = "border_radius", length = 32)
    private String borderRadius;

    // ── 页面配置 ──

    @Column(name = "home_path", length = 256)
    private String homePath;

    // ── 运行配置 ──

    @Column(name = "log_level", length = 16)
    private String logLevel;

    @Column(name = "api_base_url", length = 256)
    private String apiBaseUrl;

    // ── 功能开关 ──

    @Column(name = "enable_ai")
    private Boolean enableAi;

    @Column(name = "enable_export")
    private Boolean enableExport;

    @Column(name = "enable_offline")
    private Boolean enableOffline;

    // ── 扩展配置（低频 / 未来新增字段暂存） ──

    @Lob
    @Column(name = "config_json", columnDefinition = "LONGTEXT")
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

    public String getTenantName() { return tenantName; }
    public void setTenantName(String tenantName) { this.tenantName = tenantName; }

    public String getTenantCode() { return tenantCode; }
    public void setTenantCode(String tenantCode) { this.tenantCode = tenantCode; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Instant getDeletedAt() { return deletedAt; }
    public void setDeletedAt(Instant deletedAt) { this.deletedAt = deletedAt; }

    public String getLogo() { return logo; }
    public void setLogo(String logo) { this.logo = logo; }

    public String getPrimaryColor() { return primaryColor; }
    public void setPrimaryColor(String primaryColor) { this.primaryColor = primaryColor; }

    public String getBorderRadius() { return borderRadius; }
    public void setBorderRadius(String borderRadius) { this.borderRadius = borderRadius; }

    public String getHomePath() { return homePath; }
    public void setHomePath(String homePath) { this.homePath = homePath; }

    public String getLogLevel() { return logLevel; }
    public void setLogLevel(String logLevel) { this.logLevel = logLevel; }

    public String getApiBaseUrl() { return apiBaseUrl; }
    public void setApiBaseUrl(String apiBaseUrl) { this.apiBaseUrl = apiBaseUrl; }

    public Boolean getEnableAi() { return enableAi; }
    public void setEnableAi(Boolean enableAi) { this.enableAi = enableAi; }

    public Boolean getEnableExport() { return enableExport; }
    public void setEnableExport(Boolean enableExport) { this.enableExport = enableExport; }

    public Boolean getEnableOffline() { return enableOffline; }
    public void setEnableOffline(Boolean enableOffline) { this.enableOffline = enableOffline; }

    public String getConfigJson() { return configJson; }
    public void setConfigJson(String configJson) { this.configJson = configJson; }

    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
