package com.spark.ai.entity;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * 导航配置实体 — 按 (tenantId, projectId) 隔离的导航树。
 * 每个项目拥有独立的导航配置。
 */
@Entity
@Table(name = "navigation_config", uniqueConstraints = {
    @UniqueConstraint(name = "uk_nav_tenant_project", columnNames = {"tenant_id", "project_id"})
})
public class NavigationConfigEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "tenant_id", nullable = false, length = 64)
    private String tenantId;

    @Column(name = "project_id", nullable = false, length = 64)
    private String projectId;

    /** 导航树完整 JSON */
    @Lob
    @Column(name = "config_json", columnDefinition = "CLOB")
    private String configJson;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void onCreate() {
        this.updatedAt = Instant.now();
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = Instant.now();
    }

    // ── Getters & Setters ──

    public Long getId() { return id; }

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }

    public String getProjectId() { return projectId; }
    public void setProjectId(String projectId) { this.projectId = projectId; }

    public String getConfigJson() { return configJson; }
    public void setConfigJson(String configJson) { this.configJson = configJson; }

    public Instant getUpdatedAt() { return updatedAt; }
}
