package com.spark.ai.controller;

import com.spark.ai.security.AccessGuardService;
import com.spark.ai.service.DataModelRelationService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/tenants/{tenantId}/projects/{projectId}/table-relations")
public class DataModelRelationController {

    private final DataModelRelationService relationService;
    private final AccessGuardService accessGuard;

    public DataModelRelationController(DataModelRelationService relationService, AccessGuardService accessGuard) {
        this.relationService = relationService;
        this.accessGuard = accessGuard;
    }

    @GetMapping
    public ResponseEntity<?> listAllRelations(@PathVariable String tenantId,
                                              @PathVariable String projectId,
                                              @RequestParam(name = "databaseId", required = false) Long databaseId) {
        accessGuard.requireProjectAccess(tenantId, projectId);
        return ResponseEntity.ok(relationService.listAllRelations(tenantId, projectId, databaseId));
    }

    @GetMapping("/by-table/{tableId}")
    public ResponseEntity<?> listRelationsByTable(@PathVariable String tenantId,
                                                  @PathVariable String projectId,
                                                  @PathVariable Long tableId) {
        accessGuard.requireProjectAccess(tenantId, projectId);
        return ResponseEntity.ok(relationService.listRelations(tenantId, projectId, tableId));
    }

    @PostMapping
    public ResponseEntity<?> createRelation(@PathVariable String tenantId,
                                            @PathVariable String projectId,
                                            @RequestBody Map<String, Object> body) {
        accessGuard.requireProjectAdmin(tenantId, projectId);
        try {
            return ResponseEntity.ok(relationService.createRelation(tenantId, projectId, body));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteRelation(@PathVariable String tenantId,
                                            @PathVariable String projectId,
                                            @PathVariable Long id) {
        accessGuard.requireProjectAdmin(tenantId, projectId);
        try {
            relationService.deleteRelation(tenantId, projectId, id);
            return ResponseEntity.ok(Map.of("ok", true));
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
