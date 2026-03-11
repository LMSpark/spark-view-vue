package com.spark.ai.entity;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * 页面配置元数据实体 — 替代 routes.json。
 * 存储每个配置页面的 ID、标题、图标、路由路径等信息。
 */
@Entity
@Table(name = "page_config")
public class PageConfigEntity {

    /** 页面唯一标识（如 "order-list"） */
    @Id
    @Column(name = "page_id", length = 128)
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

    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
