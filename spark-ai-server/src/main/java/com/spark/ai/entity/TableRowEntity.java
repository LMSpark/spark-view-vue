package com.spark.ai.entity;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * 通用数据行实体 — 为任意逻辑表提供行级持久化。
 *
 * <p>一条记录对应某逻辑表（tableName）中的一行（rowId），
 * 行的完整字段以 JSON 字符串（dataJson）存储。
 *
 * <p>表名：{@code table_data}
 */
@Entity
@Table(name = "table_data", uniqueConstraints = {
    @UniqueConstraint(name = "uk_table_row", columnNames = {"table_name", "row_id"})
})
public class TableRowEntity {

    /** 自增主键（内部使用） */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 逻辑表名（如 "Users"、"Orders"） */
    @Column(name = "table_name", nullable = false, length = 128)
    private String tableName;

    /** 业务行 ID（字符串，由调用方提供或自动生成 UUID） */
    @Column(name = "row_id", nullable = false, length = 128)
    private String rowId;

    /** 行数据（JSON 对象，不含 id 字段） */
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

    public String getTableName() { return tableName; }
    public void setTableName(String tableName) { this.tableName = tableName; }

    public String getRowId() { return rowId; }
    public void setRowId(String rowId) { this.rowId = rowId; }

    public String getDataJson() { return dataJson; }
    public void setDataJson(String dataJson) { this.dataJson = dataJson; }

    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
