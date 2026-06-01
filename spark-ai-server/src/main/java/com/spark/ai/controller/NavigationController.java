package com.spark.ai.controller;

import com.spark.ai.dto.NavigationNodeAddRequest;
import com.spark.ai.dto.NavigationNodeEditPatchDto;
import com.spark.ai.dto.NavigationNodeMoveRequest;
import com.spark.ai.service.ProjectNavigationTreeService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * 导航配置管理 REST 控制器 — 按 (tenantId, projectId) 隔离。
 */
@RestController
@RequestMapping("/api/tenants/{tenantId}/projects/{projectId}/navigation")
public class NavigationController {

    private final ProjectNavigationTreeService navigationTreeService;

    public NavigationController(ProjectNavigationTreeService navigationTreeService) {
        this.navigationTreeService = navigationTreeService;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 整树读取
    // ─────────────────────────────────────────────────────────────────────────

    @GetMapping
    public ResponseEntity<?> getNavConfig(@PathVariable String tenantId,
                                           @PathVariable String projectId,
                                           @RequestParam(name = "raw", defaultValue = "false") boolean raw,
                                           @RequestParam(name = "treeMode", required = false) String treeMode) {
        try {
            validateTreeMode(treeMode);
            if (raw) {
                return ResponseEntity.ok(navigationTreeService.listRawFlatRows(tenantId, projectId));
            }
            Map<String, Object> config = navigationTreeService.getNavConfig(tenantId, projectId);
            if (config == null) {
                return ResponseEntity.ok(Map.of(
                        "childPlacement", "header",
                        "children", List.of()
                ));
            }
            return ResponseEntity.ok(config);
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "读取导航配置失败: " + e.getMessage()));
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 节点级 CRUD
    // ─────────────────────────────────────────────────────────────────────────

    @GetMapping("/nodes")
    public ResponseEntity<?> listNodes(@PathVariable String tenantId,
                                        @PathVariable String projectId,
                                        @RequestParam(name = "parentId", required = false) String parentId,
                                        @RequestParam(name = "limit", required = false) Integer limit,
                                        @RequestParam(name = "rootId", required = false) String rootId,
                                        @RequestParam(name = "depthLimit", required = false) Integer depthLimit,
                                        @RequestParam(name = "treeMode", required = false) String treeMode) {
        try {
            validateTreeMode(treeMode);
            String normalizedTreeMode = normalizeTreeMode(treeMode);
            List<Map<String, Object>> nodes;
            if (parentId != null && !parentId.isBlank()) {
                nodes = navigationTreeService.listNodeChildren(tenantId, projectId, parentId, limit);
            } else if ("nested".equals(normalizedTreeMode)) {
                nodes = navigationTreeService.listNestedNodes(tenantId, projectId, rootId, limit, depthLimit);
            } else {
                nodes = navigationTreeService.listNodes(tenantId, projectId);
            }
            return ResponseEntity.ok(nodes);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "获取节点列表失败: " + e.getMessage()));
        }
    }

    @GetMapping("/nodes/path/{id}")
    public ResponseEntity<?> getNodePath(@PathVariable String tenantId,
                                         @PathVariable String projectId,
                                         @PathVariable String id,
                                         @RequestParam(name = "treeMode", required = false) String treeMode) {
        try {
            validateTreeMode(treeMode);
            return ResponseEntity.ok(navigationTreeService.getNodePath(tenantId, projectId, id));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "获取节点路径失败: " + e.getMessage()));
        }
    }

    @PostMapping("/nodes/subtree")
    public ResponseEntity<?> getNodeSubtree(@PathVariable String tenantId,
                                            @PathVariable String projectId,
                                            @RequestBody(required = false) Map<String, Object> body,
                                            @RequestParam(name = "treeMode", required = false) String treeMode) {
        try {
            validateTreeMode(treeMode);
            String fromId = body != null ? String.valueOf(body.getOrDefault("fromId", "")).trim() : "";
            String toId = body != null ? String.valueOf(body.getOrDefault("toId", "")).trim() : "";
            boolean includeTargetChildren = body == null || !body.containsKey("includeTargetChildren")
                    || Boolean.TRUE.equals(body.get("includeTargetChildren"));
            if (toId.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "缺少 toId 字段"));
            }
            return ResponseEntity.ok(navigationTreeService.getNodeSubtree(tenantId, projectId, fromId, toId, includeTargetChildren));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "获取节点子树失败: " + e.getMessage()));
        }
    }

    @GetMapping("/nodes/search")
    public ResponseEntity<?> searchNodes(@PathVariable String tenantId,
                                         @PathVariable String projectId,
                                         @RequestParam(name = "keyword") String keyword,
                                         @RequestParam(name = "limit", required = false) Integer limit,
                                         @RequestParam(name = "treeMode", required = false) String treeMode) {
        try {
            validateTreeMode(treeMode);
            if ("nested".equals(normalizeTreeMode(treeMode))) {
                return ResponseEntity.ok(navigationTreeService.searchNestedNodes(tenantId, projectId, keyword, limit));
            }
            return ResponseEntity.ok(navigationTreeService.searchFlatNodes(tenantId, projectId, keyword, limit));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "搜索节点失败: " + e.getMessage()));
        }
    }

    @GetMapping("/raw")
    public ResponseEntity<?> listRawRows(@PathVariable String tenantId,
                                         @PathVariable String projectId) {
        List<Map<String, Object>> rows = navigationTreeService.listRawFlatRows(tenantId, projectId);
        return ResponseEntity.ok(rows);
    }

    @PostMapping("/nodes")
    public ResponseEntity<?> addNode(@PathVariable String tenantId,
                                      @PathVariable String projectId,
                                      @RequestBody NavigationNodeAddRequest body) {
        try {
            if (body == null || body.node() == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "缺少 node 字段"));
            }
            int index = body.index() != null ? body.index() : -1;
            Map<String, Object> created = navigationTreeService.addNode(
                    tenantId, projectId, body.parentId(), body.node().toMap(), index);
            return ResponseEntity.ok(Map.of("success", true, "node", created));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "新增节点失败: " + e.getMessage()));
        }
    }

    @PutMapping("/nodes/{id}")
    public ResponseEntity<?> updateNode(@PathVariable String tenantId,
                                         @PathVariable String projectId,
                                         @PathVariable String id,
                                         @RequestBody NavigationNodeEditPatchDto patch) {
        try {
            Map<String, Object> updated = navigationTreeService.updateNode(
                    tenantId, projectId, id, patch != null ? patch.toMap() : Map.of());
            return ResponseEntity.ok(Map.of("success", true, "node", updated));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "更新节点失败: " + e.getMessage()));
        }
    }

    @DeleteMapping("/nodes/{id}")
    public ResponseEntity<?> deleteNode(@PathVariable String tenantId,
                                         @PathVariable String projectId,
                                         @PathVariable String id) {
        try {
                Map<String, Object> deleted = navigationTreeService.deleteNode(
                    tenantId, projectId, id);
            return ResponseEntity.ok(Map.of("success", true, "deleted", deleted));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "删除节点失败: " + e.getMessage()));
        }
    }

    @PutMapping("/nodes/{id}/move")
    public ResponseEntity<?> moveNode(@PathVariable String tenantId,
                                       @PathVariable String projectId,
                                       @PathVariable String id,
                                       @RequestBody NavigationNodeMoveRequest body) {
        try {
            int index = body != null && body.index() != null ? body.index() : -1;
            Map<String, Object> moved = navigationTreeService.moveNode(
                    tenantId, projectId, id, body != null ? body.newParentId() : null, index);
            return ResponseEntity.ok(Map.of("success", true, "node", moved));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "移动节点失败: " + e.getMessage()));
        }
    }

    @PostMapping("/link-probe")
    public ResponseEntity<?> probeLink(@PathVariable String tenantId,
                                        @PathVariable String projectId,
                                        @RequestBody Map<String, Object> body) {
        try {
            String url = body != null ? String.valueOf(body.getOrDefault("url", "")).trim() : "";
            if (url.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "缺少 url 字段"));
            }
            Map<String, Object> result = navigationTreeService.probeLinkEmbeddable(url);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "检测链接失败: " + e.getMessage()));
        }
    }

    private void validateTreeMode(String treeMode) {
        if (treeMode == null || treeMode.isBlank()) {
            return;
        }
        if (!"flat".equals(treeMode) && !"nested".equals(treeMode)) {
            throw new IllegalArgumentException("非法 treeMode: " + treeMode);
        }
    }

    private String normalizeTreeMode(String treeMode) {
        return treeMode == null || treeMode.isBlank() ? "flat" : treeMode;
    }
}

