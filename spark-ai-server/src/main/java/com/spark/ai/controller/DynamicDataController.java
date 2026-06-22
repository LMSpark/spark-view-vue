package com.spark.ai.controller;

import com.spark.ai.service.DynamicDataService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

@RestController
@RequestMapping("/api/tenants/{tenantId}/projects/{projectId}/data")
public class DynamicDataController {

    private final DynamicDataService dataService;

    public DynamicDataController(DynamicDataService dataService) {
        this.dataService = dataService;
    }

    @PostMapping("/{tableName}/query")
    public ResponseEntity<?> query(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String tableName,
            @RequestBody(required = false) Map<String, Object> body
    ) {
        try {
            return ResponseEntity.ok(dataService.query(tenantId, projectId, tableName, body == null ? Map.of() : body));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/{tableName}/records")
    public ResponseEntity<?> create(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String tableName,
            @RequestBody Map<String, Object> body
    ) {
        try {
            return ResponseEntity.ok(dataService.createRecord(tenantId, projectId, tableName, body));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    @PostMapping("/{tableName}/records/get")
    public ResponseEntity<?> getByPost(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String tableName,
            @RequestBody Map<String, Object> body
    ) {
        return getRecord(tenantId, projectId, tableName, body);
    }

    @GetMapping("/{tableName}/records/get")
    public ResponseEntity<?> getByQuery(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String tableName,
            @RequestParam Map<String, Object> params
    ) {
        return getRecord(tenantId, projectId, tableName, params);
    }

    @PostMapping("/{tableName}/records/update")
    public ResponseEntity<?> update(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String tableName,
            @RequestBody Map<String, Object> body
    ) {
        try {
            return ResponseEntity.ok(dataService.updateRecord(tenantId, projectId, tableName, body));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/{tableName}/records/delete")
    public ResponseEntity<?> delete(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String tableName,
            @RequestBody Map<String, Object> body
    ) {
        try {
            dataService.deleteRecord(tenantId, projectId, tableName, body);
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/{tableName}/records/batch-create")
    public ResponseEntity<?> batchCreate(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String tableName,
            @RequestBody Object body
    ) {
        if (body instanceof List<?> rawList) {
            return ResponseEntity.ok(dataService.batchCreate(tenantId, projectId, tableName, toMapList(rawList)));
        }
        return create(tenantId, projectId, tableName, toMap(body));
    }

    @PostMapping("/{tableName}/records/batch-update")
    public ResponseEntity<?> batchUpdate(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String tableName,
            @RequestBody Object body
    ) {
        if (body instanceof List<?> rawList) {
            return ResponseEntity.ok(dataService.batchUpdate(tenantId, projectId, tableName, toMapList(rawList)));
        }
        return update(tenantId, projectId, tableName, toMap(body));
    }

    @PostMapping("/{tableName}/records/batch-delete")
    public ResponseEntity<?> batchDelete(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String tableName,
            @RequestBody Object body
    ) {
        if (body instanceof List<?> rawList) {
            return ResponseEntity.ok(dataService.batchDelete(tenantId, projectId, tableName, toMapList(rawList)));
        }
        return delete(tenantId, projectId, tableName, toMap(body));
    }

    @PostMapping("/batch-jobs")
    public ResponseEntity<?> submitBatchJob(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @RequestBody Map<String, Object> body
    ) {
        try {
            return ResponseEntity.ok(dataService.submitBatchJob(tenantId, projectId, body));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    @PostMapping("/transactions")
    public ResponseEntity<?> executeTransaction(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @RequestBody Map<String, Object> body
    ) {
        try {
            return ResponseEntity.ok(dataService.executeTransaction(tenantId, projectId, body));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    @PostMapping("/{tableName}/tree/children")
    public ResponseEntity<?> treeChildren(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String tableName,
            @RequestBody(required = false) Map<String, Object> body
    ) {
        Map<String, Object> result = dataService.treeChildren(tenantId, projectId, tableName, body == null ? Map.of() : body);
        return ResponseEntity.ok(result.get("rows"));
    }

    @PostMapping("/{tableName}/tree/path")
    public ResponseEntity<?> treePath(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String tableName,
            @RequestBody(required = false) Map<String, Object> body
    ) {
        return ResponseEntity.ok(dataService.treePath(tenantId, projectId, tableName, body == null ? Map.of() : body));
    }

    @PostMapping("/{tableName}/tree/subtree")
    public ResponseEntity<?> treeSubtree(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String tableName,
            @RequestBody(required = false) Map<String, Object> body
    ) {
        return ResponseEntity.ok(dataService.treeSubtree(tenantId, projectId, tableName, body == null ? Map.of() : body));
    }

    @PostMapping("/{tableName}/tree/move")
    public ResponseEntity<?> treeMove(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String tableName,
            @RequestBody Map<String, Object> body
    ) {
        try {
            return ResponseEntity.ok(dataService.treeMove(tenantId, projectId, tableName, body));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/{tableName}/tree/search")
    public ResponseEntity<?> treeSearch(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String tableName,
            @RequestBody(required = false) Map<String, Object> body
    ) {
        return ResponseEntity.ok(dataService.treeNestedSearch(tenantId, projectId, tableName, body == null ? Map.of() : body));
    }

    @PostMapping("/{tableName}/tree/nested")
    public ResponseEntity<?> treeNested(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String tableName,
            @RequestBody(required = false) Map<String, Object> body
    ) {
        return ResponseEntity.ok(dataService.treeNested(tenantId, projectId, tableName, body == null ? Map.of() : body));
    }

    @PostMapping("/{tableName}/tree/nested/search")
    public ResponseEntity<?> treeNestedSearch(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String tableName,
            @RequestBody(required = false) Map<String, Object> body
    ) {
        return ResponseEntity.ok(dataService.treeNestedSearch(tenantId, projectId, tableName, body == null ? Map.of() : body));
    }

    private ResponseEntity<?> getRecord(String tenantId, String projectId, String tableName, Map<String, Object> pk) {
        try {
            Map<String, Object> record = dataService.getRecord(tenantId, projectId, tableName, pk);
            if (record == null) return ResponseEntity.notFound().build();
            return ResponseEntity.ok(record);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    private Map<String, Object> error(String message) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("error", message);
        return payload;
    }

    private Map<String, Object> toMap(Object value) {
        if (!(value instanceof Map<?, ?> raw)) {
            throw new IllegalArgumentException("请求体必须是对象");
        }
        Map<String, Object> result = new LinkedHashMap<>();
        raw.forEach((key, item) -> result.put(String.valueOf(key), item));
        return result;
    }

    private List<Map<String, Object>> toMapList(List<?> rawList) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object item : rawList) {
            result.add(toMap(item));
        }
        return result;
    }
}
