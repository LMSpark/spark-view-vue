package com.spark.ai.entity;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * 导航配置实体 — 替代 data/navigation.json 文件。
 * 存储完整的导航树 JSON（单行记录，configKey = "default"）。
 */
@Entity
@Table(name = "navigation_config")
public class NavigationConfigEntity {

    /** 配置键（默认 "default"，预留多租户扩展） */
    @Id
    @Column(name = "config_key", length = 64)
    private String configKey;

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

    public String getConfigKey() { return configKey; }
    public void setConfigKey(String configKey) { this.configKey = configKey; }

    public String getConfigJson() { return configJson; }
    public void setConfigJson(String configJson) { this.configJson = configJson; }

    public Instant getUpdatedAt() { return updatedAt; }
}
