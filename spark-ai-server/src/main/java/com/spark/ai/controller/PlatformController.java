package com.spark.ai.controller;

import com.spark.ai.security.AccessGuardService;
import com.spark.ai.service.PlatformTenantService;
import com.spark.ai.service.ProjectNavigationTreeService;
import com.spark.ai.service.ProjectService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/platform")
public class PlatformController {

    private final AccessGuardService accessGuard;
    private final ProjectNavigationTreeService navigationTreeService;
    private final PlatformTenantService platformTenantService;

    public PlatformController(AccessGuardService accessGuard,
                              ProjectNavigationTreeService navigationTreeService,
                              PlatformTenantService platformTenantService) {
        this.accessGuard = accessGuard;
        this.navigationTreeService = navigationTreeService;
        this.platformTenantService = platformTenantService;
    }

    @GetMapping("/navigation")
    public ResponseEntity<Map<String, Object>> navigation() throws IOException {
        accessGuard.requirePlatformAdmin();
        Map<String, Object> config = navigationTreeService.getNavConfig(
                ProjectService.PLATFORM_TENANT_ID,
                ProjectService.HOMEPAGE_PROJECT_ID);
        if (config == null) {
            return ResponseEntity.ok(Map.of(
                    "childPlacement", "header",
                    "homePath", "/dashboard",
                    "children", List.of()
            ));
        }
        return ResponseEntity.ok(config);
    }

    @GetMapping("/tenants")
    public ResponseEntity<List<Map<String, Object>>> listTenants() {
        accessGuard.requirePlatformAdmin();
        return ResponseEntity.ok(platformTenantService.listTenants());
    }

    @PostMapping("/tenants")
    public ResponseEntity<Map<String, Object>> createTenant(@RequestBody Map<String, Object> body) {
        accessGuard.requirePlatformAdmin();
        return ResponseEntity.ok(platformTenantService.createTenant(body));
    }

    @PutMapping("/tenants/{tenantId}")
    public ResponseEntity<Map<String, Object>> updateTenant(
            @PathVariable String tenantId,
            @RequestBody Map<String, Object> body) {
        accessGuard.requirePlatformAdmin();
        return ResponseEntity.ok(platformTenantService.updateTenant(tenantId, body));
    }

    @PostMapping("/tenants/{tenantId}/enable")
    public ResponseEntity<Map<String, Object>> enableTenant(@PathVariable String tenantId) {
        accessGuard.requirePlatformAdmin();
        return ResponseEntity.ok(platformTenantService.enableTenant(tenantId));
    }

    @PostMapping("/tenants/{tenantId}/disable")
    public ResponseEntity<Map<String, Object>> disableTenant(@PathVariable String tenantId) {
        accessGuard.requirePlatformAdmin();
        return ResponseEntity.ok(platformTenantService.disableTenant(tenantId));
    }

    @DeleteMapping("/tenants/{tenantId}")
    public ResponseEntity<Map<String, Object>> deleteTenant(@PathVariable String tenantId) {
        accessGuard.requirePlatformAdmin();
        return ResponseEntity.ok(platformTenantService.softDeleteTenant(tenantId));
    }
}
