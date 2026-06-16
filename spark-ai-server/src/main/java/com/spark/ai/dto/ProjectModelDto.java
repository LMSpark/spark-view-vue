package com.spark.ai.dto;

import java.util.List;

/**
 * Project model DTO shared with the frontend project-model contract.
 *
 * <p>The DTO carries project/navigation and page projections. ORM entities map
 * this model to DB tables and file/page-config storage.
 */
public record ProjectModelDto(
        String projectId,
        ProjectInfoDto project,
        NavigationRootDto navigation,
        List<ProjectPageNodeSummaryDto> pages
) {
    public record ProjectInfoDto(
            String tenantId,
            String projectId,
            String name,
            String projectType,
            String icon,
            String description,
            String planningAttachmentRef,
            String homeNodeId,
            Integer order,
            String createdAt,
            String updatedAt
    ) {}

    public record NavigationRootDto(
            String title,
            String childPlacement,
            List<NavigationNodeDto> children
    ) {}

    public record NavigationNodeDto(
            String id,
            String title,
            String icon,
            String nodeKind,
            Boolean dividerAfter,
            String description,
            String path,
            String linkTarget,
            String childPlacement,
            Integer order,
            Boolean hidden,
            Boolean disabled,
            String refId,
            String permissionMode,
            Object context,
            List<NavigationNodeDto> children,
            String version,
            String refPath,
            String refProjectId,
            Boolean refBroken
    ) {}

    public record ProjectDescriptionContextDto(
            String nodeId,
            String title,
            String nodeKind,
            String description
    ) {}

    public record ProjectPageNodeSummaryDto(
            String pageId,
            String path,
            String title,
            String nodeId,
            String nodeKind,
            String description,
            List<ProjectDescriptionContextDto> descriptionContext,
            String effectiveDescription,
            String icon
    ) {}
}
