package com.spark.ai.entity;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * 通用逻辑表 Schema — 按 (tenantId, projectId) 隔离。
 */
@Entity
@Table(name = "table_schema", uniqueConstraints = {
    @UniqueConstraint(name = "uk_schema_scope", columnNames = {"tenant_id", "project_id", "table_name"})
})
public class TableSchemaEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "tenant_id", nullable = false, length = 64)
    private String tenantId;

    @Column(name = "project_id", nullable = false, length = 64)
    private String projectId;

    /** 逻辑表名（在项目内唯一） */
    @Column(name = "table_name", nullable = false, length = 128)
    private String tableName;

    /** 显示标题 */
    @Column(length = 256)
    private String label;

    /** 表说明 */
    @Column(length = 1024)
    private String description;

    /** 列定义 JSON 数组（CLOB） */
    @Lob
    @Column(name = "columns_json", columnDefinition = "CLOB")
    private String columnsJson;

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

    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getColumnsJson() { return columnsJson; }
    public void setColumnsJson(String columnsJson) { this.columnsJson = columnsJson; }

    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
