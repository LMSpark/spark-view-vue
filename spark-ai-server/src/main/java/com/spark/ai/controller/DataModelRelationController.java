package com.spark.ai.controller;

import com.spark.ai.service.DataModelRelationService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/tenants/{tenantId}/projects/{projectId}/table-relations")
public class DataModelRelationController {

    private final DataModelRelationService relationService;

    public DataModelRelationController(DataModelRelationService relationService) {
        this.relationService = relationService;
    }

    @GetMapping
    public ResponseEntity<?> listAllRelations(@PathVariable String tenantId, @PathVariable String projectId) {
        return ResponseEntity.ok(relationService.listAllRelations(tenantId, projectId));
    }

    @GetMapping("/by-table/{tableId}")
    public ResponseEntity<?> listRelationsByTable(@PathVariable Long tableId) {
        return ResponseEntity.ok(relationService.listRelations(tableId));
    }

    @PostMapping
    public ResponseEntity<?> createRelation(@RequestBody Map<String, Object> body) {
        try {
            return ResponseEntity.ok(relationService.createRelation(body));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteRelation(@PathVariable Long id) {
        relationService.deleteRelation(id);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    private Map<String, Object> error(String message) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("error", message);
        return payload;
    }
}
