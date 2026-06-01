package com.spark.ai.dto;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Navigation node update DTO shared with the frontend NavigationNodeEditPatchDto.
 *
 * <p>id is deliberately absent: NODE_ID is read-only and comes from the path.
 */
public record NavigationNodeEditPatchDto(
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
        Object context
) {
    public Map<String, Object> toMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        putIfPresent(map, "title", title);
        putIfPresent(map, "icon", icon);
        putIfPresent(map, "nodeKind", nodeKind);
        putIfPresent(map, "dividerAfter", dividerAfter);
        putIfPresent(map, "description", description);
        putIfPresent(map, "path", path);
        putIfPresent(map, "linkTarget", linkTarget);
        putIfPresent(map, "childPlacement", childPlacement);
        putIfPresent(map, "order", order);
        putIfPresent(map, "hidden", hidden);
        putIfPresent(map, "disabled", disabled);
        putIfPresent(map, "refId", refId);
        putIfPresent(map, "permissionMode", permissionMode);
        putIfPresent(map, "context", context);
        return map;
    }

    private static void putIfPresent(Map<String, Object> map, String key, Object value) {
        if (value != null) {
            map.put(key, value);
        }
    }
}
