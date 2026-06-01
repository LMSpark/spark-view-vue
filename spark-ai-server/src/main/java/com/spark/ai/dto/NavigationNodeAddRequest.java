package com.spark.ai.dto;

public record NavigationNodeAddRequest(
        String parentId,
        Integer index,
        NavigationNodeEditDto node
) {}
