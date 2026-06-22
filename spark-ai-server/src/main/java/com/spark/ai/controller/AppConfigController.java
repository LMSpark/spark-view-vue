package com.spark.ai.controller;

import com.spark.ai.security.AccessGuardService;
import com.spark.ai.service.TenantService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * 应用配置 & 租户管理端点。
 * 替代 tools/mock-config-api.mjs (port 3001)，使前端只需连接一个后端。
 *
 * <pre>
 *   GET    /api/config/default            → 默认应用配置
 *   GET    /api/config/tenant/{tenantId}  → 租户配置
 *   POST   /api/config/tenant/{tenantId}  → 创建/更新租户
 *   DELETE /api/config/tenant/{tenantId}  → 删除租户
 *   GET    /api/tenants                   → 列出所有租户
 *   GET    /health                        → 健康检查
 * </pre>
 */
@RestController
public class AppConfigController {

    private final TenantService tenantService;
    private final AccessGuardService accessGuard;

    public AppConfigController(TenantService tenantService, AccessGuardService accessGuard) {
        this.tenantService = tenantService;
        this.accessGuard = accessGuard;
    }

    // ── 默认配置 ──────────────────────────────────────────────────────────────

    @GetMapping("/api/config/default")
    public ResponseEntity<Map<String, Object>> getDefaultConfig() {
        return ResponseEntity.ok(Map.ofEntries(
            Map.entry("router", Map.of("mode", "history")),
            Map.entry("mountTarget", "#app"),
            Map.entry("plugins", Map.of(
                "element-plus", Map.of("enabled", true,  "options", Map.of("size", "default", "zIndex", 2000), "priority", 1),
                "vxe-table",    Map.of("enabled", true,  "priority", 2)
            )),
            Map.entry("spark", Map.of("enabled", true)),
            Map.entry("pageConfig", Map.of("source", "local", "apiBaseUrl", "/api", "homePath", "/home")),
            Map.entry("config", Map.of(
                "apiBaseUrl", "/api",
                "logLevel", "info",
                "enableMock", false,
                "version", "1.0.0",
                "features", Map.of("enableAI", true, "enableExport", true, "enableOffline", false)
            )),
            Map.entry("logger", Map.of(
                "level", "info",
                "enableColors", true,
                "showTimestamp", false,
                "enableRemote", true,
                "remoteEndpoint", "/api/logs"
            ))
        ));
    }

    // ── 租户配置 CRUD ─────────────────────────────────────────────────────────

    @GetMapping("/api/config/tenant/{tenantId}")
    public ResponseEntity<?> getTenantConfig(@PathVariable String tenantId) throws IOException {
        accessGuard.requireTenantUser(tenantId);
        Map<String, Object> config = tenantService.getTenantConfig(tenantId);
        if (config == null) {
            return ResponseEntity.status(404).body(Map.of(
                "error", "TENANT_NOT_FOUND",
                "message", "Tenant '" + tenantId + "' not found",
                "code", 404
            ));
        }
        return ResponseEntity.ok(config);
    }

    @PostMapping("/api/config/tenant/{tenantId}")
    public ResponseEntity<Map<String, Object>> updateTenantConfig(
            @PathVariable String tenantId,
            @RequestBody Map<String, Object> config) throws IOException {
        accessGuard.requirePlatformAdmin();
        tenantService.saveTenantConfig(tenantId, config);
        return ResponseEntity.ok(Map.of(
            "success", true,
            "message", "Configuration updated for tenant: " + tenantId
        ));
    }

    @DeleteMapping("/api/config/tenant/{tenantId}")
    public ResponseEntity<?> deleteTenantConfig(@PathVariable String tenantId) {
        accessGuard.requirePlatformAdmin();
        if (!tenantService.deleteTenantConfig(tenantId)) {
            return ResponseEntity.status(404).body(Map.of(
                "error", "TENANT_NOT_FOUND",
                "message", "Tenant '" + tenantId + "' not found",
                "code", 404
            ));
        }
        return ResponseEntity.ok(Map.of(
            "success", true,
            "message", "Configuration deleted for tenant: " + tenantId
        ));
    }

    // ── 租户列表 ──────────────────────────────────────────────────────────────

    @GetMapping("/api/tenants")
    public ResponseEntity<List<Map<String, Object>>> listTenants() {
        accessGuard.requirePlatformAdmin();
        return ResponseEntity.ok(tenantService.listTenants());
    }

    // ── 健康检查 ──────────────────────────────────────────────────────────────

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        return ResponseEntity.ok(Map.of(
            "status", "ok",
            "timestamp", java.time.Instant.now().toString(),
            "tenants", tenantService.count()
        ));
    }
}
