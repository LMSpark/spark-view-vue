package com.spark.ai.controller;

import com.spark.ai.service.NavigationService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * 导航配置管理 REST 控制器。
 *
 * <h3>端点列表</h3>
 * <pre>
 * GET  /api/navigation                    — 获取完整导航配置
 * PUT  /api/navigation                    — 保存导航配置（完整覆盖）
 * GET  /api/navigation/nodes              — 获取扁平化节点列表
 * POST /api/navigation/nodes              — 新增节点
 * PUT  /api/navigation/nodes/{id}         — 更新节点属性
 * DELETE /api/navigation/nodes/{id}       — 删除节点
 * PUT  /api/navigation/nodes/{id}/move    — 移动节点到新位置
 * </pre>
 */
@RestController
@RequestMapping("/api/navigation")
public class NavigationController {

    private final NavigationService navigationService;

    public NavigationController(NavigationService navigationService) {
        this.navigationService = navigationService;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 整树读写（向后兼容）
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/navigation — 获取完整导航配置树。
     */
    @GetMapping
    public ResponseEntity<?> getNavConfig() {
        try {
            Map<String, Object> config = navigationService.getNavConfig();
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

    /**
     * PUT /api/navigation — 保存完整导航配置树（覆盖写入）。
     */
    @PutMapping
    public ResponseEntity<?> saveNavConfig(@RequestBody Map<String, Object> navRoot) {
        try {
            if (navRoot == null || !navRoot.containsKey("children")) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "缺少 children 字段"));
            }
            navigationService.saveNavConfig(navRoot);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "保存导航配置失败: " + e.getMessage()));
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 节点级 CRUD（RESTful）
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/navigation/nodes — 获取扁平化节点列表（含 parentId 字段）。
     */
    @GetMapping("/nodes")
    public ResponseEntity<?> listNodes() {
        try {
            List<Map<String, Object>> nodes = navigationService.listNodes();
            return ResponseEntity.ok(nodes);
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "获取节点列表失败: " + e.getMessage()));
        }
    }

    /**
     * POST /api/navigation/nodes — 新增导航节点。
     *
     * <p>请求体：
     * <pre>
     * {
     *   "parentId": "system",   // 可选，null 或缺省表示插入根级
     *   "index": -1,            // 可选，-1 或缺省表示追加到末尾
     *   "node": { "id": "xx", "title": "新节点", "icon": "📄", "path": "/xx" }
     * }
     * </pre>
     */
    @PostMapping("/nodes")
    public ResponseEntity<?> addNode(@RequestBody Map<String, Object> body) {
        try {
            String parentId = (String) body.get("parentId");
            int index = body.containsKey("index")
                    ? ((Number) body.get("index")).intValue() : -1;
            @SuppressWarnings("unchecked")
            Map<String, Object> node = (Map<String, Object>) body.get("node");
            if (node == null) {
                return ResponseEntity.badRequest().body(Map.of("error", "缺少 node 字段"));
            }
            Map<String, Object> created = navigationService.addNode(parentId, node, index);
            return ResponseEntity.ok(Map.of("success", true, "node", created));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "新增节点失败: " + e.getMessage()));
        }
    }

    /**
     * PUT /api/navigation/nodes/{id} — 更新节点属性（局部合并）。
     *
     * <p>请求体为要更新的键值对，children 字段会被忽略（子树不可通过此接口覆盖）。
     */
    @PutMapping("/nodes/{id}")
    public ResponseEntity<?> updateNode(@PathVariable String id,
                                         @RequestBody Map<String, Object> patch) {
        try {
            Map<String, Object> updated = navigationService.updateNode(id, patch);
            return ResponseEntity.ok(Map.of("success", true, "node", updated));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "更新节点失败: " + e.getMessage()));
        }
    }

    /**
     * DELETE /api/navigation/nodes/{id} — 删除节点（含所有子孙节点）。
     */
    @DeleteMapping("/nodes/{id}")
    public ResponseEntity<?> deleteNode(@PathVariable String id) {
        try {
            Map<String, Object> deleted = navigationService.deleteNode(id);
            return ResponseEntity.ok(Map.of("success", true, "deleted", deleted));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "删除节点失败: " + e.getMessage()));
        }
    }

    /**
     * PUT /api/navigation/nodes/{id}/move — 移动节点到新父节点下的指定位置。
     *
     * <p>请求体：
     * <pre>
     * {
     *   "newParentId": "system",  // null 或缺省表示移动到根级
     *   "index": 0               // 插入位置，-1 或缺省表示追加到末尾
     * }
     * </pre>
     */
    @PutMapping("/nodes/{id}/move")
    public ResponseEntity<?> moveNode(@PathVariable String id,
                                       @RequestBody Map<String, Object> body) {
        try {
            String newParentId = (String) body.get("newParentId");
            int index = body.containsKey("index")
                    ? ((Number) body.get("index")).intValue() : -1;
            Map<String, Object> moved = navigationService.moveNode(id, newParentId, index);
            return ResponseEntity.ok(Map.of("success", true, "node", moved));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "移动节点失败: " + e.getMessage()));
        }
    }
}

