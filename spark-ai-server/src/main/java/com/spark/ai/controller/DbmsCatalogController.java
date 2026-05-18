package com.spark.ai.controller;

import com.spark.ai.security.AccessGuardService;
import com.spark.ai.security.AuthenticatedRequestContext;
import com.spark.ai.service.DbmsCatalogService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.NoSuchElementException;

@RestController
@RequestMapping("/api/tenants/{tenantId}/projects/{projectId}/dbms")
public class DbmsCatalogController {

    private final DbmsCatalogService catalogService;
    private final AccessGuardService accessGuard;

    public DbmsCatalogController(DbmsCatalogService catalogService, AccessGuardService accessGuard) {
        this.catalogService = catalogService;
        this.accessGuard = accessGuard;
    }

    @GetMapping("/servers/{serverId}/catalog")
    public ResponseEntity<?> catalog(@PathVariable String tenantId,
                                     @PathVariable String projectId,
                                     @PathVariable Long serverId) {
        accessGuard.requireProjectAccess(tenantId, projectId);
        AuthenticatedRequestContext ctx = AuthenticatedRequestContext.currentOrNull();
        if (ctx == null) throw new SecurityException("UNAUTHORIZED");
        try {
            return ResponseEntity.ok(catalogService.catalog(
                    tenantId,
                    projectId,
                    serverId,
                    ctx.isPlatformAdmin(),
                    ctx.tenantId()
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    @PostMapping("/servers/{serverId}/sync")
    public ResponseEntity<?> sync(@PathVariable String tenantId,
                                  @PathVariable String projectId,
                                  @PathVariable Long serverId,
                                  @RequestBody(required = false) Map<String, Object> body) {
        accessGuard.requireProjectAdmin(tenantId, projectId);
        AuthenticatedRequestContext ctx = AuthenticatedRequestContext.currentOrNull();
        if (ctx == null) throw new SecurityException("UNAUTHORIZED");
        try {
            return ResponseEntity.ok(catalogService.sync(
                    tenantId,
                    projectId,
                    serverId,
                    body == null ? Map.of() : body,
                    ctx.username(),
                    ctx.isPlatformAdmin(),
                    ctx.tenantId()
            ));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    @GetMapping("/objects/{objectId}/sql")
    public ResponseEntity<?> objectSql(@PathVariable String tenantId,
                                       @PathVariable String projectId,
                                       @PathVariable Long objectId) {
        accessGuard.requireProjectAccess(tenantId, projectId);
        try {
            return ResponseEntity.ok(catalogService.objectSql(tenantId, projectId, objectId));
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(404).body(error(e.getMessage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    @GetMapping("/objects/{objectId}/data")
    public ResponseEntity<?> objectData(@PathVariable String tenantId,
                                        @PathVariable String projectId,
                                        @PathVariable Long objectId,
                                        @RequestParam(name = "page", required = false) Integer page,
                                        @RequestParam(name = "pageSize", required = false) Integer pageSize) {
        accessGuard.requireProjectAccess(tenantId, projectId);
        try {
            return ResponseEntity.ok(catalogService.objectData(tenantId, projectId, objectId, page, pageSize));
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(404).body(error(e.getMessage()));
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
