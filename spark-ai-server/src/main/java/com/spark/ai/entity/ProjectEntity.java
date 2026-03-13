package com.spark.ai.entity;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * 项目实体 — 多租户项目管理。
 *
 * <p>每个租户拥有多个项目，包括一个自动创建的「企业主页」(type=homepage) 和 N 个应用项目 (type=app)。
 * 所有业务数据（导航、页面配置、数据表）均按 (tenantId, projectId) 隔离。
 */
@Entity
@Table(name = "project", uniqueConstraints = {
    @UniqueConstraint(name = "uk_tenant_project", columnNames = {"tenant_id", "project_id"})
})
public class ProjectEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 所属租户 */
    @Column(name = "tenant_id", nullable = false, length = 64)
    private String tenantId;

    /** 项目标识（如 "homepage", "crm", "erp"） */
    @Column(name = "project_id", nullable = false, length = 64)
    private String projectId;

    /** 项目显示名 */
    @Column(nullable = false, length = 256)
    private String name;

    /** 项目类型：homepage（企业主页，自动创建不可删）| app（普通应用） */
    @Column(name = "project_type", nullable = false, length = 16)
    private String projectType;

    @Column(length = 64)
    private String icon;

    @Column(length = 1024)
    private String description;

    /** 排序权重（homepage 固定 0） */
    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

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

    public Long getId() { return id; }

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }

    public String getProjectId() { return projectId; }
    public void setProjectId(String projectId) { this.projectId = projectId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getProjectType() { return projectType; }
    public void setProjectType(String projectType) { this.projectType = projectType; }

    public String getIcon() { return icon; }
    public void setIcon(String icon) { this.icon = icon; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }

    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
