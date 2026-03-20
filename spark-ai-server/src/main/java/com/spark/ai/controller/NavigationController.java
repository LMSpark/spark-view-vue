package com.spark.ai.controller;

import com.spark.ai.service.NavigationService;
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

    private final NavigationService navigationService;

    public NavigationController(NavigationService navigationService) {
        this.navigationService = navigationService;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 整树读写
    // ─────────────────────────────────────────────────────────────────────────

    @GetMapping
    public ResponseEntity<?> getNavConfig(@PathVariable String tenantId,
                                           @PathVariable String projectId,
                                           @RequestParam(name = "raw", defaultValue = "false") boolean raw) {
        try {
            if (raw) {
                return ResponseEntity.ok(navigationService.listRawFlatRows(tenantId, projectId));
            }
            Map<String, Object> config = navigationService.getNavConfig(tenantId, projectId);
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

    @PutMapping
    public ResponseEntity<?> saveNavConfig(@PathVariable String tenantId,
                                            @PathVariable String projectId,
                                            @RequestBody Map<String, Object> navRoot) {
        try {
            if (navRoot == null || !navRoot.containsKey("children")) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "缺少 children 字段"));
            }
            navigationService.saveNavConfig(tenantId, projectId, navRoot);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "保存导航配置失败: " + e.getMessage()));
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 节点级 CRUD
    // ─────────────────────────────────────────────────────────────────────────

    @GetMapping("/nodes")
    public ResponseEntity<?> listNodes(@PathVariable String tenantId,
                                        @PathVariable String projectId) {
        try {
            List<Map<String, Object>> nodes = navigationService.listNodes(tenantId, projectId);
            return ResponseEntity.ok(nodes);
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "获取节点列表失败: " + e.getMessage()));
        }
    }

    @GetMapping("/raw")
    public ResponseEntity<?> listRawRows(@PathVariable String tenantId,
                                         @PathVariable String projectId) {
        List<Map<String, Object>> rows = navigationService.listRawFlatRows(tenantId, projectId);
        return ResponseEntity.ok(rows);
    }

    @PostMapping("/nodes")
    public ResponseEntity<?> addNode(@PathVariable String tenantId,
                                      @PathVariable String projectId,
                                      @RequestBody Map<String, Object> body) {
        try {
            String parentId = (String) body.get("parentId");
            int index = body.containsKey("index")
                    ? ((Number) body.get("index")).intValue() : -1;
            @SuppressWarnings("unchecked")
            Map<String, Object> node = (Map<String, Object>) body.get("node");
            if (node == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "缺少 node 字段"));
            }
            Map<String, Object> created = navigationService.addNode(
                    tenantId, projectId, parentId, node, index);
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
                                         @RequestBody Map<String, Object> patch) {
        try {
            Map<String, Object> updated = navigationService.updateNode(
                    tenantId, projectId, id, patch);
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
            Map<String, Object> deleted = navigationService.deleteNode(
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
                                       @RequestBody Map<String, Object> body) {
        try {
            String newParentId = (String) body.get("newParentId");
            int index = body.containsKey("index")
                    ? ((Number) body.get("index")).intValue() : -1;
            Map<String, Object> moved = navigationService.moveNode(
                    tenantId, projectId, id, newParentId, index);
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
            Map<String, Object> result = navigationService.probeLinkEmbeddable(url);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "检测链接失败: " + e.getMessage()));
        }
    }
}

