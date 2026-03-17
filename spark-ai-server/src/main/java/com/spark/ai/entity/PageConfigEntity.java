package com.spark.ai.entity;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * 页面配置元数据实体 — 按 (tenantId, projectId) 隔离。
 * 存储每个配置页面的 ID、标题、图标、路由路径等信息。
 */
@Entity
@Table(name = "page_config", uniqueConstraints = {
    @UniqueConstraint(name = "uk_page_tenant_project", columnNames = {"tenant_id", "project_id", "page_id"})
})
public class PageConfigEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "tenant_id", nullable = false, length = 64)
    private String tenantId;

    @Column(name = "project_id", nullable = false, length = 64)
    private String projectId;

    /** 页面唯一标识（如 "order-list"，在项目内唯一） */
    @Column(name = "page_id", nullable = false, length = 128)
    private String pageId;

    /** 页面标题 */
    @Column(length = 256)
    private String title;

    /** 页面图标（emoji 或 icon class） */
    @Column(length = 64)
    private String icon;

    /** 路由路径（如 "/order-list"） */
    @Column(length = 256)
    private String path;

    /** 路由 name */
    @Column(length = 128)
    private String routeName;

    /** 页面类型：config（配置驱动）或 system-page（静态 Vue 组件） */
    @Column(name = "page_type", length = 32)
    private String pageType = "config";

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

    public String getPageId() { return pageId; }
    public void setPageId(String pageId) { this.pageId = pageId; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getIcon() { return icon; }
    public void setIcon(String icon) { this.icon = icon; }

    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }

    public String getRouteName() { return routeName; }
    public void setRouteName(String routeName) { this.routeName = routeName; }

    public String getPageType() { return pageType; }
    public void setPageType(String pageType) { this.pageType = pageType; }

    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
