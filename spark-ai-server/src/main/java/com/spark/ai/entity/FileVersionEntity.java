package com.spark.ai.entity;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * 文件级版本元数据 — 每个页面配置文件独立版本链。
 *
 * <p>文件内容存储在磁盘（{pageId}/{version}__{filename}），此表只管元数据。
 * 当前工作文件（v0）直接以原名存储（{pageId}/{filename}），不入 DB。
 */
@Entity
@Table(name = "file_version", uniqueConstraints = {
    @UniqueConstraint(name = "uk_file_version",
        columnNames = {"tenant_id", "project_id", "page_id", "filename", "version"})
})
public class FileVersionEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "tenant_id", nullable = false, length = 64)
    private String tenantId;

    @Column(name = "project_id", nullable = false, length = 64)
    private String projectId;

    /** 导航节点 ID */
    @Column(name = "page_id", nullable = false, length = 128)
    private String pageId;

    /** 文件名：rule.json / pagedata.json / script.js / style.css */
    @Column(nullable = false, length = 64)
    private String filename;

    /** 版本号（从 1 开始递增，每个文件独立编号） */
    @Column(nullable = false)
    private int version;

    /** 是否为当前版本 */
    @Column(name = "is_current", nullable = false)
    private boolean isCurrent;

    /** 最后修改人（用户ID或用户名） */
    @Column(name = "modified_by", length = 128)
    private String modifiedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        this.createdAt = Instant.now();
    }

    // ── Getters / Setters ──

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

    public int getVersion() { return version; }
    public void setVersion(int version) { this.version = version; }

    public boolean isCurrent() { return isCurrent; }
    public void setCurrent(boolean current) { isCurrent = current; }

    public String getModifiedBy() { return modifiedBy; }
    public void setModifiedBy(String modifiedBy) { this.modifiedBy = modifiedBy; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
