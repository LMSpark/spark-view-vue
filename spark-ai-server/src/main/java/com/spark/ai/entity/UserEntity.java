package com.spark.ai.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;

/**
 * 用户实体 — 多租户用户管理。
 *
 * <p>每个用户归属一个租户，通过 (tenant_id, username) 唯一标识。
 * 密码存储为 BCrypt 哈希。
 */
@Entity
@Table(name = "app_user", uniqueConstraints = {
    @UniqueConstraint(name = "uk_tenant_username", columnNames = {"tenant_id", "username"})
})
public class UserEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 所属租户 */
    @Column(name = "tenant_id", nullable = false, length = 64)
    private String tenantId;

    /** 用户名（租户内唯一） */
    @Column(nullable = false, length = 128)
    private String username;

    /** 显示名 */
    @Column(name = "display_name", length = 128)
    private String displayName;

    /** BCrypt 密码哈希 */
    @Column(name = "password_hash", nullable = false, length = 256)
    private String passwordHash;

    /** 邮箱 */
    @Column(length = 256)
    private String email;

    /** 头像 URL */
    @Column(length = 512)
    private String avatar;

    /** 角色列表（逗号分隔，如 "admin,editor"） */
    @Column(nullable = false, length = 512)
    private String roles = "user";

    /** 是否启用 */
    @Column(nullable = false)
    private boolean enabled = true;

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

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }

    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getAvatar() { return avatar; }
    public void setAvatar(String avatar) { this.avatar = avatar; }

    public String getRoles() { return roles; }
    public void setRoles(String roles) { this.roles = roles; }

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }

    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
