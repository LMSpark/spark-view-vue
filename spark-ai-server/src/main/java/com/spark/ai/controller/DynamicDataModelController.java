package com.spark.ai.controller;

import com.spark.ai.service.DynamicDataModelService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.NoSuchElementException;

@RestController
@RequestMapping("/api/tenants/{tenantId}/projects/{projectId}/data-model")
public class DynamicDataModelController {

    private final DynamicDataModelService modelService;

    public DynamicDataModelController(DynamicDataModelService modelService) {
        this.modelService = modelService;
    }

    @GetMapping("/tables")
    public ResponseEntity<?> listTables(@PathVariable String tenantId, @PathVariable String projectId) {
        return ResponseEntity.ok(modelService.listTables(tenantId, projectId));
    }

    @PostMapping("/tables")
    public ResponseEntity<?> createTable(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @RequestBody Map<String, Object> body
    ) {
        try {
            return ResponseEntity.ok(modelService.createTable(tenantId, projectId, body));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    @GetMapping("/tables/{tableName}")
    public ResponseEntity<?> getTable(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String tableName
    ) {
        try {
            return ResponseEntity.ok(modelService.getTablePayload(tenantId, projectId, tableName));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PutMapping("/tables/{tableName}")
    public ResponseEntity<?> updateTable(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String tableName,
            @RequestBody Map<String, Object> body
    ) {
        try {
            return ResponseEntity.ok(modelService.updateTable(tenantId, projectId, tableName, body));
        } catch (DynamicDataModelService.PreflightRequiredException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(e.report());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/tables/{tableName}")
    public ResponseEntity<?> deleteTable(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String tableName,
            @RequestParam(name = "dropPhysical", defaultValue = "false") boolean dropPhysical
    ) {
        try {
            modelService.deleteTable(tenantId, projectId, tableName, dropPhysical);
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/tables/{tableName}/consistency")
    public ResponseEntity<?> consistency(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String tableName
    ) {
        try {
            return ResponseEntity.ok(modelService.consistency(tenantId, projectId, tableName));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/tables/{tableName}/reconcile")
    public ResponseEntity<?> reconcile(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String tableName
    ) {
        try {
            return ResponseEntity.ok(modelService.reconcile(tenantId, projectId, tableName));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/introspection/tables")
    public ResponseEntity<?> listPhysicalTables() {
        return ResponseEntity.ok(modelService.listPhysicalTables());
    }

    @GetMapping("/introspection/tables/{physicalTableName}")
    public ResponseEntity<?> describePhysicalTable(@PathVariable String physicalTableName) {
        try {
            return ResponseEntity.ok(modelService.describePhysicalTable(physicalTableName));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/import-existing-tables")
    public ResponseEntity<?> importExistingTables(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @RequestBody Map<String, Object> body
    ) {
        try {
            return ResponseEntity.ok(modelService.importExistingTables(tenantId, projectId, body));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    private Map<String, Object> error(String message) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("error", message);
        return payload;
    }
}
