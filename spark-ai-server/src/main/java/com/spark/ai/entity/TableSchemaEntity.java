package com.spark.ai.entity;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * 通用逻辑表 Schema（表结构定义）实体。
 *
 * <p>存储逻辑表的元数据：标题、描述、列定义（JSON 数组）等。
 * 列定义以 JSON 数组存储，格式示例：
 * <pre>
 * [
 *   { "name": "id",    "type": "string",  "label": "ID",   "required": true },
 *   { "name": "name",  "type": "string",  "label": "姓名", "searchable": true },
 *   { "name": "age",   "type": "number",  "label": "年龄" },
 *   { "name": "role",  "type": "enum",    "label": "角色",
 *     "options": [{"value":"admin","label":"管理员"},{"value":"user","label":"用户"}] }
 * ]
 * </pre>
 *
 * <p>表名：{@code table_schema}
 */
@Entity
@Table(name = "table_schema")
public class TableSchemaEntity {

    /** 逻辑表名（唯一键，如 "Users"、"Orders"） */
    @Id
    @Column(name = "table_name", length = 128)
    private String tableName;

    /** 显示标题 */
    @Column(length = 256)
    private String label;

    /** 表说明 */
    @Column(length = 1024)
    private String description;

    /**
     * 列定义 JSON 数组（CLOB）。
     * 每个元素为 ColumnDef 对象：
     * name, type, label, required, defaultValue, hidden, sortable, searchable, options
     */
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
