package com.spark.ai.entity;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * 页面配置文件实体 — 按 (tenantId, projectId, pageId) 隔离。
 * 存储 rule.json / pagedata.json / script.js / style.css 的文件内容。
 */
@Entity
@Table(name = "page_file", uniqueConstraints = {
    @UniqueConstraint(name = "uk_file_scope", columnNames = {"tenant_id", "project_id", "page_id", "filename"})
})
public class PageFileEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "tenant_id", nullable = false, length = 64)
    private String tenantId;

    @Column(name = "project_id", nullable = false, length = 64)
    private String projectId;

    /** 关联的页面 ID */
    @Column(name = "page_id", nullable = false, length = 128)
    private String pageId;

    /** 文件名（rule.json / pagedata.json / script.js / style.css） */
    @Column(nullable = false, length = 64)
    private String filename;

    /** 文件内容（CLOB 存储大文本） */
    @Lob
    @Column(columnDefinition = "CLOB")
    private String content;

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
    public void setId(Long id) { this.id = id; }

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }

    public String getProjectId() { return projectId; }
    public void setProjectId(String projectId) { this.projectId = projectId; }

    public String getPageId() { return pageId; }
    public void setPageId(String pageId) { this.pageId = pageId; }

    public String getFilename() { return filename; }
    public void setFilename(String filename) { this.filename = filename; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public Instant getUpdatedAt() { return updatedAt; }
}
