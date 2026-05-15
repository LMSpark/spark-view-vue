package com.spark.ai.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "ai_session")
public class AiSessionEntity {

    @Id
    @Column(name = "session_id", length = 128)
    private String sessionId;

    @Column(name = "tenant_id", length = 64)
    private String tenantId;

    @Column(name = "project_id", length = 64)
    private String projectId;

    @Column(length = 128)
    private String username;

    @Lob
    @Column(name = "system_prompt", columnDefinition = "LONGTEXT")
    private String systemPrompt;

    @Column(length = 64)
    private String mode;

    @Column(length = 64)
    private String state;

    @Lob
    @Column(name = "scope_json", columnDefinition = "LONGTEXT")
    private String scopeJson;

    @Lob
    @Column(name = "tools_json", columnDefinition = "LONGTEXT")
    private String toolsJson;

    @Column(name = "window_size")
    private int windowSize;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "last_active_at")
    private Instant lastActiveAt;

    @Column(name = "expires_at")
    private Instant expiresAt;

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }

    public String getProjectId() { return projectId; }
    public void setProjectId(String projectId) { this.projectId = projectId; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getSystemPrompt() { return systemPrompt; }
    public void setSystemPrompt(String systemPrompt) { this.systemPrompt = systemPrompt; }

    public String getMode() { return mode; }
    public void setMode(String mode) { this.mode = mode; }

    public String getState() { return state; }
    public void setState(String state) { this.state = state; }

    public String getScopeJson() { return scopeJson; }
    public void setScopeJson(String scopeJson) { this.scopeJson = scopeJson; }

    public String getToolsJson() { return toolsJson; }
    public void setToolsJson(String toolsJson) { this.toolsJson = toolsJson; }

    public int getWindowSize() { return windowSize; }
    public void setWindowSize(int windowSize) { this.windowSize = windowSize; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }

    public Instant getLastActiveAt() { return lastActiveAt; }
    public void setLastActiveAt(Instant lastActiveAt) { this.lastActiveAt = lastActiveAt; }

    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }
}
