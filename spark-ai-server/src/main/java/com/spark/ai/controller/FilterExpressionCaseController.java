package com.spark.ai.controller;

import com.spark.ai.service.FilterExpressionCaseService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * 独立远端过滤用例资源 Controller。
 *
 * <pre>
 * POST   /api/tenants/{tenantId}/projects/{projectId}/filter-expression-cases/query  — 列表查询（query.filter AST）
 * POST   /api/tenants/{tenantId}/projects/{projectId}/filter-expression-cases        — 创建
 * GET    /api/tenants/{tenantId}/projects/{projectId}/filter-expression-cases/{id}   — 详情
 * PUT    /api/tenants/{tenantId}/projects/{projectId}/filter-expression-cases/{id}   — 更新
 * DELETE /api/tenants/{tenantId}/projects/{projectId}/filter-expression-cases/{id}   — 删除
 * </pre>
 */
@RestController
@RequestMapping("/api/tenants/{tenantId}/projects/{projectId}/filter-expression-cases")
public class FilterExpressionCaseController {

    private final FilterExpressionCaseService caseService;

    public FilterExpressionCaseController(FilterExpressionCaseService caseService) {
        this.caseService = caseService;
    }

    @PostMapping("/query")
    public ResponseEntity<?> query(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @RequestBody(required = false) Map<String, Object> body
    ) {
        try {
            return ResponseEntity.ok(caseService.queryCases(tenantId, projectId, extractQuery(body)));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping
    public ResponseEntity<?> create(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @RequestBody Map<String, Object> body
    ) {
        try {
            return ResponseEntity.ok(caseService.createCase(tenantId, projectId, body));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> get(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable long id
    ) {
        Map<String, Object> record = caseService.getCase(tenantId, projectId, id);
        if (record == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(record);
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable long id,
            @RequestBody Map<String, Object> body
    ) {
        try {
            return ResponseEntity.ok(caseService.updateCase(tenantId, projectId, id, body));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable long id
    ) {
        try {
            caseService.deleteCase(tenantId, projectId, id);
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    private Map<String, Object> extractQuery(Map<String, Object> body) {
        if (body == null || !body.containsKey("query") || body.get("query") == null) {
            return Map.of();
        }
        Object query = body.get("query");
        if (!(query instanceof Map<?, ?> rawQuery)) {
            throw new IllegalArgumentException("query 必须是对象");
        }

        Map<String, Object> normalized = new LinkedHashMap<>();
        rawQuery.forEach((key, value) -> normalized.put(String.valueOf(key), value));
        return normalized;
    }
}