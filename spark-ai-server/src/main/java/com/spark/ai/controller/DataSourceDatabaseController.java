package com.spark.ai.controller;

import com.spark.ai.security.AuthenticatedRequestContext;
import com.spark.ai.security.AccessGuardService;
import com.spark.ai.service.DataSourceDatabaseService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/tenants/{tenantId}/projects/{projectId}/databases")
public class DataSourceDatabaseController {

    private final DataSourceDatabaseService databaseService;
    private final AccessGuardService accessGuard;

    public DataSourceDatabaseController(DataSourceDatabaseService databaseService, AccessGuardService accessGuard) {
        this.databaseService = databaseService;
        this.accessGuard = accessGuard;
    }

    @GetMapping
    public ResponseEntity<?> listDatabases(@PathVariable String tenantId,
                                           @PathVariable String projectId,
                                           @RequestParam(name = "serverId", required = false) Long serverId) {
        accessGuard.requireProjectAccess(tenantId, projectId);
        return ResponseEntity.ok(databaseService.listDatabases(tenantId, projectId, serverId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getDatabase(@PathVariable Long id) {
        return ResponseEntity.ok(databaseService.getDatabase(id));
    }

    @PostMapping
    public ResponseEntity<?> createDatabase(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @RequestBody Map<String, Object> body
    ) {
        accessGuard.requireProjectAdmin(tenantId, projectId);
        var ctx = AuthenticatedRequestContext.currentOrNull();
        if (ctx == null) throw new SecurityException("UNAUTHORIZED");
        String createdBy = ctx.username();
        try {
            return ResponseEntity.ok(databaseService.createDatabase(tenantId, projectId, body, createdBy));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> updateDatabase(@PathVariable String tenantId,
                                            @PathVariable String projectId,
                                            @PathVariable Long id,
                                            @RequestBody Map<String, Object> body) {
        accessGuard.requireProjectAdmin(tenantId, projectId);
        return ResponseEntity.ok(databaseService.updateDatabase(id, body));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteDatabase(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable Long id,
            @RequestParam(name = "dropPhysical", defaultValue = "false") boolean dropPhysical
    ) {
        accessGuard.requireProjectAdmin(tenantId, projectId);
        databaseService.deleteDatabase(id, dropPhysical);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    private Map<String, Object> error(String message) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("error", message);
        return payload;
    }
}
