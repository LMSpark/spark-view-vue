package com.spark.ai.controller;

import com.spark.ai.service.TableDdlService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 物理表 DDL 控制器。
 *
 * <p>端点一览：
 * <pre>
 * GET    /api/tables                              — 列出所有物理表
 * POST   /api/tables                              — 创建物理表（附带列定义）
 * GET    /api/tables/{tableName}                  — 查看表结构（列描述）
 * DELETE /api/tables/{tableName}                  — 删除物理表
 * POST   /api/tables/{tableName}/columns          — 新增列
 * PUT    /api/tables/{tableName}/columns/{col}    — 修改列类型
 * DELETE /api/tables/{tableName}/columns/{col}    — 删除列
 * </pre>
 *
 * <p>建表 request body 示例：
 * <pre>
 * {
 *   "tableName": "Products",
 *   "columns": [
 *     { "name": "name",  "type": "string",  "required": true  },
 *     { "name": "price", "type": "number"                      },
 *     { "name": "stock", "type": "integer"                     },
 *     { "name": "active","type": "boolean"                     }
 *   ]
 * }
 * </pre>
 */
@RestController
@RequestMapping("/api/tables")
public class TableDdlController {

    @Autowired
    private TableDdlService ddlService;

    // ── 列出所有物理表 ────────────────────────────────────────────────────────

    @GetMapping
    public ResponseEntity<Map<String, Object>> listTables() {
        List<Map<String, Object>> tables = ddlService.listPhysicalTables();
        return ResponseEntity.ok(Map.of("tables", tables, "total", tables.size()));
    }

    // ── 创建物理表 ────────────────────────────────────────────────────────────

    @PostMapping
    @SuppressWarnings("unchecked")
    public ResponseEntity<Map<String, Object>> createTable(@RequestBody Map<String, Object> body) {
        String tableName = (String) body.get("tableName");
        if (tableName == null || tableName.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "tableName 不能为空"));
        }
        List<Map<String, Object>> columns = (List<Map<String, Object>>) body.get("columns");
        try {
            ddlService.createTable(tableName, columns);
            List<Map<String, Object>> desc = ddlService.describeTable(tableName);
            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "tableName", tableName,
                    "columns", desc
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    // ── 查看表结构 ────────────────────────────────────────────────────────────

    @GetMapping("/{tableName}")
    public ResponseEntity<Map<String, Object>> describeTable(@PathVariable String tableName) {
        try {
            boolean exists = ddlService.tableExists(tableName);
            if (!exists) {
                return ResponseEntity.status(404).body(Map.of("error", "表不存在: " + tableName));
            }
            List<Map<String, Object>> columns = ddlService.describeTable(tableName);
            return ResponseEntity.ok(Map.of("tableName", tableName, "columns", columns));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ── 删除物理表 ────────────────────────────────────────────────────────────

    @DeleteMapping("/{tableName}")
    public ResponseEntity<Map<String, Object>> dropTable(@PathVariable String tableName) {
        try {
            ddlService.dropTable(tableName);
            return ResponseEntity.ok(Map.of("success", true, "tableName", tableName));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    // ── 列操作 ────────────────────────────────────────────────────────────────

    /** 新增列 — body: { name, type, required? } */
    @PostMapping("/{tableName}/columns")
    public ResponseEntity<Map<String, Object>> addColumn(
            @PathVariable String tableName,
            @RequestBody Map<String, Object> column) {
        if (column.get("name") == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "列名 name 不能为空"));
        }
        try {
            ddlService.addColumn(tableName, column);
            return ResponseEntity.ok(Map.of("success", true,
                    "tableName", tableName,
                    "columnName", column.get("name")));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    /** 修改列类型 — body: { type } */
    @PutMapping("/{tableName}/columns/{columnName}")
    public ResponseEntity<Map<String, Object>> alterColumn(
            @PathVariable String tableName,
            @PathVariable String columnName,
            @RequestBody Map<String, Object> body) {
        String newType = (String) body.get("type");
        if (newType == null || newType.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "type 不能为空"));
        }
        try {
            ddlService.alterColumn(tableName, columnName, newType);
            return ResponseEntity.ok(Map.of("success", true,
                    "tableName", tableName,
                    "columnName", columnName,
                    "newType", newType));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    /** 删除列 */
    @DeleteMapping("/{tableName}/columns/{columnName}")
    public ResponseEntity<Map<String, Object>> dropColumn(
            @PathVariable String tableName,
            @PathVariable String columnName) {
        try {
            ddlService.dropColumn(tableName, columnName);
            return ResponseEntity.ok(Map.of("success", true,
                    "tableName", tableName,
                    "columnName", columnName));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }
}
