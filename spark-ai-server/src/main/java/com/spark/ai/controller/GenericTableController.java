package com.spark.ai.controller;

import com.spark.ai.service.GenericTableService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * 通用数据表 RESTful API 控制器。
 *
 * <h3>端点列表</h3>
 * <pre>
 * GET    /api/data                       — 列出所有逻辑表（含行数）
 * GET    /api/data/{tableName}           — 分页查询行（支持搜索、排序）
 * POST   /api/data/{tableName}           — 创建行
 * GET    /api/data/{tableName}/{id}      — 读取单行
 * PUT    /api/data/{tableName}/{id}      — 全量替换行（PUT 语义）
 * PATCH  /api/data/{tableName}/{id}      — 局部更新行（PATCH 语义，字段合并）
 * DELETE /api/data/{tableName}/{id}      — 删除单行
 * DELETE /api/data/{tableName}           — 清空整张表
 * POST   /api/data/{tableName}/__batch   — 批量 upsert（有则更新，无则插入）
 * </pre>
 *
 * <h3>SPARK DataTable 接入示例（pagedata.json）</h3>
 * <pre>
 * "api": {
 *   "list":   { "url": "/api/data/Users",     "method": "GET"    },
 *   "create": { "url": "/api/data/Users",     "method": "POST"   },
 *   "update": { "url": "/api/data/Users/:id", "method": "PUT"    },
 *   "delete": { "url": "/api/data/Users/:id", "method": "DELETE" }
 * }
 * </pre>
 *
 * <h3>分页查询参数</h3>
 * <pre>
 *   page      — 页码（1-based，默认 1）
 *   pageSize  — 每页行数（默认 20，最大 500）
 *   q         — 关键词搜索（全文匹配 dataJson）
 *   sort      — 排序字段（createdAt / updatedAt，默认 createdAt）
 *   order     — 排序方向（asc / desc，默认 desc）
 * </pre>
 */
@RestController
@RequestMapping("/api/data")
public class GenericTableController {

    private final GenericTableService tableService;

    public GenericTableController(GenericTableService tableService) {
        this.tableService = tableService;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 表列表
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/data — 列出所有逻辑表名及行数。
     */
    @GetMapping
    public ResponseEntity<?> listTables() {
        List<Map<String, Object>> tables = tableService.listTables();
        return ResponseEntity.ok(Map.of("tables", tables, "total", tables.size()));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 行列表
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/data/{tableName} — 分页查询行。
     */
    @GetMapping("/{tableName}")
    public ResponseEntity<?> listRows(
            @PathVariable String tableName,
            @RequestParam(defaultValue = "1")   int page,
            @RequestParam(defaultValue = "20")  int pageSize,
            @RequestParam(required = false)     String q,
            @RequestParam(defaultValue = "createdAt") String sort,
            @RequestParam(defaultValue = "desc") String order) {
        try {
            Map<String, Object> result = tableService.listRows(
                    tableName, page, pageSize, sort, order, q);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "查询失败: " + e.getMessage()));
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 单行读取
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/data/{tableName}/{id} — 读取单行。
     */
    @GetMapping("/{tableName}/{id}")
    public ResponseEntity<?> getRow(@PathVariable String tableName,
                                     @PathVariable String id) {
        try {
            Map<String, Object> row = tableService.getRow(tableName, id);
            return ResponseEntity.ok(row);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "读取失败: " + e.getMessage()));
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 创建
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * POST /api/data/{tableName} — 创建行（body 含 id 则使用，否则自动生成 UUID）。
     */
    @PostMapping("/{tableName}")
    public ResponseEntity<?> createRow(@PathVariable String tableName,
                                        @RequestBody Map<String, Object> body) {
        try {
            Map<String, Object> created = tableService.createRow(tableName, body);
            return ResponseEntity.status(201).body(created);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "创建失败: " + e.getMessage()));
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 全量替换（PUT）
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * PUT /api/data/{tableName}/{id} — 全量替换行数据。
     */
    @PutMapping("/{tableName}/{id}")
    public ResponseEntity<?> replaceRow(@PathVariable String tableName,
                                         @PathVariable String id,
                                         @RequestBody Map<String, Object> body) {
        try {
            Map<String, Object> updated = tableService.replaceRow(tableName, id, body);
            return ResponseEntity.ok(updated);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "替换失败: " + e.getMessage()));
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 局部更新（PATCH）
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * PATCH /api/data/{tableName}/{id} — 局部更新行（与原字段合并）。
     */
    @PatchMapping("/{tableName}/{id}")
    public ResponseEntity<?> patchRow(@PathVariable String tableName,
                                       @PathVariable String id,
                                       @RequestBody Map<String, Object> patch) {
        try {
            Map<String, Object> updated = tableService.patchRow(tableName, id, patch);
            return ResponseEntity.ok(updated);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "更新失败: " + e.getMessage()));
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 删除
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * DELETE /api/data/{tableName}/{id} — 删除单行。
     */
    @DeleteMapping("/{tableName}/{id}")
    public ResponseEntity<?> deleteRow(@PathVariable String tableName,
                                        @PathVariable String id) {
        try {
            tableService.deleteRow(tableName, id);
            return ResponseEntity.ok(Map.of("success", true, "id", id));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * DELETE /api/data/{tableName} — 清空整张逻辑表（删除所有行）。
     */
    @DeleteMapping("/{tableName}")
    public ResponseEntity<?> truncateTable(@PathVariable String tableName) {
        try {
            long deleted = tableService.truncateTable(tableName);
            return ResponseEntity.ok(Map.of("success", true, "deleted", deleted));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 批量操作
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * POST /api/data/{tableName}/__batch — 批量 upsert。
     *
     * <p>请求体：{@code { "rows": [ {...}, {...} ] }}，每行需含 "id" 字段。
     */
    @PostMapping("/{tableName}/__batch")
    public ResponseEntity<?> batchUpsert(@PathVariable String tableName,
                                          @RequestBody Map<String, Object> body) {
        try {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> rows = (List<Map<String, Object>>) body.get("rows");
            if (rows == null || rows.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "缺少 rows 字段或为空"));
            }
            int upserted = tableService.batchUpsert(tableName, rows);
            return ResponseEntity.ok(Map.of("success", true, "upserted", upserted));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "批量操作失败: " + e.getMessage()));
        }
    }
}
