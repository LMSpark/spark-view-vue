package com.spark.ai.entity;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * 导航节点扁平行实体。
 *
 * <p>NODE_ID 是前端 NavNode.id 的唯一来源；order 投影到 SORT_ORDER，是 AI 与拖拽共用的顺序语义。
 */
@Entity
@Table(name = "NAVIGATION_NODE_FLAT", indexes = {
    @Index(name = "IDX_NAV_TENANT_PROJECT", columnList = "TENANT_ID, PROJECT_ID")
})
public class NavigationNodeFlatEntity {

    @Id
    @Column(name = "NODE_ID", nullable = false, length = 255)
    private String nodeId;

    @Column(name = "PARENT_ID", length = 255)
    private String parentId;

    @Column(name = "TENANT_ID", nullable = false, length = 255)
    private String tenantId;

    @Column(name = "PROJECT_ID", nullable = false, length = 255)
    private String projectId;

    @Column(name = "TITLE", length = 500)
    private String title;

    @Column(name = "DESCRIPTION", length = 2000)
    private String description;

    @Column(name = "NODE_KIND", length = 50)
    private String nodeKind;

    @Column(name = "PATH", length = 500)
    private String path;

    @Column(name = "ICON", length = 255)
    private String icon;

    @Column(name = "DIVIDER_AFTER")
    private Boolean dividerAfter = false;

    @Column(name = "CHILD_PLACEMENT", length = 50)
    private String childPlacement;

    @Column(name = "LINK_TARGET", length = 50)
    private String linkTarget;

    @Column(name = "HIDDEN")
    private Boolean hidden = false;

    @Column(name = "DISABLED")
    private Boolean disabled = false;

    @Column(name = "SORT_ORDER")
    private Integer order = 0;

    @Column(name = "UPDATED_AT")
    private Instant updatedAt;

    @Column(name = "REF_ID", length = 255)
    private String refId;

    @Lob
    @Column(name = "CONTEXT")
    private String context;

    @Column(name = "PERMISSIONS", length = 2000)
    private String permissions;

    @PrePersist
    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public String getNodeId() { return nodeId; }
    public void setNodeId(String nodeId) { this.nodeId = nodeId; }
    public String getParentId() { return parentId; }
    public void setParentId(String parentId) { this.parentId = parentId; }
    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }
    public String getProjectId() { return projectId; }
    public void setProjectId(String projectId) { this.projectId = projectId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getNodeKind() { return nodeKind; }
    public void setNodeKind(String nodeKind) { this.nodeKind = nodeKind; }
    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }
    public String getIcon() { return icon; }
    public void setIcon(String icon) { this.icon = icon; }
    public Boolean getDividerAfter() { return dividerAfter; }
    public void setDividerAfter(Boolean dividerAfter) { this.dividerAfter = dividerAfter; }
    public String getChildPlacement() { return childPlacement; }
    public void setChildPlacement(String childPlacement) { this.childPlacement = childPlacement; }
    public String getLinkTarget() { return linkTarget; }
    public void setLinkTarget(String linkTarget) { this.linkTarget = linkTarget; }
    public Boolean getHidden() { return hidden; }
    public void setHidden(Boolean hidden) { this.hidden = hidden; }
    public Boolean getDisabled() { return disabled; }
    public void setDisabled(Boolean disabled) { this.disabled = disabled; }
    public Integer getOrder() { return order; }
    public void setOrder(Integer order) { this.order = order; }
    public Instant getUpdatedAt() { return updatedAt; }
    public String getRefId() { return refId; }
    public void setRefId(String refId) { this.refId = refId; }
    public String getContext() { return context; }
    public void setContext(String context) { this.context = context; }
    public String getPermissions() { return permissions; }
    public void setPermissions(String permissions) { this.permissions = permissions; }
}
