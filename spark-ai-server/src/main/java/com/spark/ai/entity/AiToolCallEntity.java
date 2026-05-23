package com.spark.ai.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "ai_tool_call")
public class AiToolCallEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "session_id", nullable = false, length = 128)
    private String sessionId;

    @Column(name = "tenant_id", nullable = false, length = 64)
    private String tenantId;

    @Column(name = "project_id", nullable = false, length = 64)
    private String projectId;

    @Column(name = "turn_id", length = 128)
    private String turnId;

    @Column(name = "call_id", length = 255)
    private String callId;

    @Column(length = 255)
    private String name;

    @Lob
    @Column(name = "arguments_json", columnDefinition = "LONGTEXT")
    private String argumentsJson;

    @Column(length = 64)
    private String status;

    @Lob
    @Column(name = "runtime_meta_json", columnDefinition = "LONGTEXT")
    private String runtimeMetaJson;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }

    public String getProjectId() { return projectId; }
    public void setProjectId(String projectId) { this.projectId = projectId; }

    public String getTurnId() { return turnId; }
    public void setTurnId(String turnId) { this.turnId = turnId; }

    public String getCallId() { return callId; }
    public void setCallId(String callId) { this.callId = callId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getArgumentsJson() { return argumentsJson; }
    public void setArgumentsJson(String argumentsJson) { this.argumentsJson = argumentsJson; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getRuntimeMetaJson() { return runtimeMetaJson; }
    public void setRuntimeMetaJson(String runtimeMetaJson) { this.runtimeMetaJson = runtimeMetaJson; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
