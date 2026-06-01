package com.spark.ai.dto;

public record NavigationNodeMoveRequest(
        String newParentId,
        Integer index
) {}
