package com.spark.ai.controller;

import com.spark.ai.service.GenericTableService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * 通用数据表 RESTful API 控制器（按 tenantId + projectId 隔离）。
 */
@RestController
@RequestMapping("/api/tenants/{tenantId}/projects/{projectId}/data")
public class GenericTableController {

    private final GenericTableService tableService;

    public GenericTableController(GenericTableService tableService) {
        this.tableService = tableService;
    }

    @GetMapping
    public ResponseEntity<?> listTables(@PathVariable String tenantId,
                                         @PathVariable String projectId) {
        List<Map<String, Object>> tables = tableService.listTables(tenantId, projectId);
        return ResponseEntity.ok(Map.of("tables", tables, "total", tables.size()));
    }

    @GetMapping("/{tableName}")
    public ResponseEntity<?> listRows(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String tableName,
            @RequestParam(defaultValue = "1")   int page,
            @RequestParam(defaultValue = "20")  int pageSize,
            @RequestParam(required = false)     String q,
            @RequestParam(defaultValue = "createdAt") String sort,
            @RequestParam(defaultValue = "desc") String order) {
        try {
            Map<String, Object> result = tableService.listRows(
                    tenantId, projectId, tableName, page, pageSize, sort, order, q);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "查询失败: " + e.getMessage()));
        }
    }

    @GetMapping("/{tableName}/{id}")
    public ResponseEntity<?> getRow(@PathVariable String tenantId,
                                     @PathVariable String projectId,
                                     @PathVariable String tableName,
                                     @PathVariable String id) {
        try {
            Map<String, Object> row = tableService.getRow(tenantId, projectId, tableName, id);
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

    @PostMapping("/{tableName}")
    public ResponseEntity<?> createRow(@PathVariable String tenantId,
                                        @PathVariable String projectId,
                                        @PathVariable String tableName,
                                        @RequestBody Map<String, Object> body) {
        try {
            Map<String, Object> created = tableService.createRow(tenantId, projectId, tableName, body);
            return ResponseEntity.status(201).body(created);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "创建失败: " + e.getMessage()));
        }
    }

    @PutMapping("/{tableName}/{id}")
    public ResponseEntity<?> replaceRow(@PathVariable String tenantId,
                                         @PathVariable String projectId,
                                         @PathVariable String tableName,
                                         @PathVariable String id,
                                         @RequestBody Map<String, Object> body) {
        try {
            Map<String, Object> updated = tableService.replaceRow(tenantId, projectId, tableName, id, body);
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

    @PatchMapping("/{tableName}/{id}")
    public ResponseEntity<?> patchRow(@PathVariable String tenantId,
                                       @PathVariable String projectId,
                                       @PathVariable String tableName,
                                       @PathVariable String id,
                                       @RequestBody Map<String, Object> patch) {
        try {
            Map<String, Object> updated = tableService.patchRow(tenantId, projectId, tableName, id, patch);
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

    @DeleteMapping("/{tableName}/{id}")
    public ResponseEntity<?> deleteRow(@PathVariable String tenantId,
                                        @PathVariable String projectId,
                                        @PathVariable String tableName,
                                        @PathVariable String id) {
        try {
            tableService.deleteRow(tenantId, projectId, tableName, id);
            return ResponseEntity.ok(Map.of("success", true, "id", id));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{tableName}")
    public ResponseEntity<?> truncateTable(@PathVariable String tenantId,
                                            @PathVariable String projectId,
                                            @PathVariable String tableName) {
        try {
            long deleted = tableService.truncateTable(tenantId, projectId, tableName);
            return ResponseEntity.ok(Map.of("success", true, "deleted", deleted));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/{tableName}/__batch")
    public ResponseEntity<?> batchUpsert(@PathVariable String tenantId,
                                          @PathVariable String projectId,
                                          @PathVariable String tableName,
                                          @RequestBody Map<String, Object> body) {
        try {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> rows = (List<Map<String, Object>>) body.get("rows");
            if (rows == null || rows.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "缺少 rows 字段或为空"));
            }
            int upserted = tableService.batchUpsert(tenantId, projectId, tableName, rows);
            return ResponseEntity.ok(Map.of("success", true, "upserted", upserted));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "批量操作失败: " + e.getMessage()));
        }
    }
}
