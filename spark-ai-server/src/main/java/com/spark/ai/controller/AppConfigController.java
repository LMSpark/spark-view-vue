package com.spark.ai.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

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

    /** 模拟租户数据库（内存，重启丢失） */
    private final ConcurrentHashMap<String, Map<String, Object>> tenantDatabase = new ConcurrentHashMap<>();

    public AppConfigController() {
        initMockTenants();
    }

    // ── 默认配置 ──────────────────────────────────────────────────────────────

    @GetMapping("/api/config/default")
    public ResponseEntity<Map<String, Object>> getDefaultConfig() {
        return ResponseEntity.ok(Map.ofEntries(
            Map.entry("router", Map.of("mode", "history")),
            Map.entry("mountTarget", "#app"),
            Map.entry("plugins", Map.of(
                "element-plus", Map.of("enabled", true,  "options", Map.of("size", "default", "zIndex", 2000), "priority", 1),
                "vxe-table",    Map.of("enabled", true,  "priority", 2),
                "form-create",  Map.of("enabled", true,  "priority", 3)
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
    public ResponseEntity<?> getTenantConfig(@PathVariable String tenantId) {
        Map<String, Object> config = tenantDatabase.get(tenantId);
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
            @RequestBody Map<String, Object> config) {
        tenantDatabase.put(tenantId, config);
        return ResponseEntity.ok(Map.of(
            "success", true,
            "message", "Configuration updated for tenant: " + tenantId
        ));
    }

    @DeleteMapping("/api/config/tenant/{tenantId}")
    public ResponseEntity<?> deleteTenantConfig(@PathVariable String tenantId) {
        if (!tenantDatabase.containsKey(tenantId)) {
            return ResponseEntity.status(404).body(Map.of(
                "error", "TENANT_NOT_FOUND",
                "message", "Tenant '" + tenantId + "' not found",
                "code", 404
            ));
        }
        tenantDatabase.remove(tenantId);
        return ResponseEntity.ok(Map.of(
            "success", true,
            "message", "Configuration deleted for tenant: " + tenantId
        ));
    }

    // ── 租户列表 ──────────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    @GetMapping("/api/tenants")
    public ResponseEntity<List<Map<String, Object>>> listTenants() {
        List<Map<String, Object>> tenants = tenantDatabase.entrySet().stream()
            .map(entry -> {
                Map<String, Object> tenant = (Map<String, Object>) entry.getValue().get("tenant");
                return Map.<String, Object>of(
                    "tenantId",   entry.getKey(),
                    "tenantName", tenant != null ? tenant.getOrDefault("tenantName", "") : "",
                    "tenantCode", tenant != null ? tenant.getOrDefault("tenantCode", "") : ""
                );
            })
            .toList();
        return ResponseEntity.ok(tenants);
    }

    // ── 健康检查 ──────────────────────────────────────────────────────────────

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        return ResponseEntity.ok(Map.of(
            "status", "ok",
            "timestamp", java.time.Instant.now().toString(),
            "tenants", tenantDatabase.size()
        ));
    }

    // ── 初始化模拟数据 ────────────────────────────────────────────────────────

    private void initMockTenants() {
        tenantDatabase.put("demo", Map.of(
            "tenant", Map.of(
                "tenantId", "demo",
                "tenantName", "Demo Company",
                "tenantCode", "DEMO001",
                "logo", "https://via.placeholder.com/150/1890ff/ffffff?text=Demo",
                "theme", Map.of("primaryColor", "#1890ff", "borderRadius", "4px")
            ),
            "config", Map.of(
                "apiBaseUrl", "https://demo-api.example.com",
                "logLevel", "debug",
                "features", Map.of("enableAI", false, "enableExport", true, "enableOffline", true)
            ),
            "pageConfig", Map.of("homePath", "/demo-home"),
            "logger", Map.of("level", "debug", "enableRemote", true, "remoteEndpoint", "https://demo-api.example.com/logs")
        ));

        tenantDatabase.put("enterprise", Map.of(
            "tenant", Map.of(
                "tenantId", "enterprise",
                "tenantName", "Enterprise Corporation",
                "tenantCode", "ENT001",
                "logo", "https://via.placeholder.com/150/722ed1/ffffff?text=Enterprise",
                "theme", Map.of("primaryColor", "#722ed1", "borderRadius", "8px")
            ),
            "config", Map.of(
                "apiBaseUrl", "https://enterprise-api.example.com",
                "logLevel", "info",
                "features", Map.of("enableAI", true, "enableExport", true, "enableOffline", false)
            ),
            "pageConfig", Map.of("source", "remote", "homePath", "/enterprise-dashboard"),
            "logger", Map.of("level", "info", "enableRemote", true, "remoteEndpoint", "https://enterprise-api.example.com/logs")
        ));

        tenantDatabase.put("test", Map.of(
            "tenant", Map.of(
                "tenantId", "test",
                "tenantName", "Test Tenant",
                "tenantCode", "TEST001",
                "logo", "https://via.placeholder.com/150/52c41a/ffffff?text=Test",
                "theme", Map.of("primaryColor", "#52c41a")
            ),
            "config", Map.of(
                "apiBaseUrl", "https://test-api.example.com",
                "logLevel", "debug",
                "enableMock", true,
                "features", Map.of("enableAI", false, "enableExport", true, "enableOffline", true)
            )
        ));
    }
}
