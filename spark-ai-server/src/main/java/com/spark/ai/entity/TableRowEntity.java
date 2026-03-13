package com.spark.ai.entity;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * 通用数据行实体 — 按 (tenantId, projectId, tableName) 隔离。
 */
@Entity
@Table(name = "table_data", uniqueConstraints = {
    @UniqueConstraint(name = "uk_row_scope", columnNames = {"tenant_id", "project_id", "table_name", "row_id"})
})
public class TableRowEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "tenant_id", nullable = false, length = 64)
    private String tenantId;

    @Column(name = "project_id", nullable = false, length = 64)
    private String projectId;

    /** 逻辑表名 */
    @Column(name = "table_name", nullable = false, length = 128)
    private String tableName;

    /** 业务行 ID */
    @Column(name = "row_id", nullable = false, length = 128)
    private String rowId;

    /** 行数据 JSON */
    @Lob
    @Column(name = "data_json", columnDefinition = "CLOB")
    private String dataJson;

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

    public String getTableName() { return tableName; }
    public void setTableName(String tableName) { this.tableName = tableName; }

    public String getRowId() { return rowId; }
    public void setRowId(String rowId) { this.rowId = rowId; }

    public String getDataJson() { return dataJson; }
    public void setDataJson(String dataJson) { this.dataJson = dataJson; }

    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
