package com.spark.ai.controller;

import com.spark.ai.config.DynamicDataSourceManager;
import com.spark.ai.security.AuthenticatedRequestContext;
import com.spark.ai.service.DataSourceServerService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/servers")
public class DataSourceServerController {

    private final DataSourceServerService serverService;
    private final DynamicDataSourceManager dsManager;

    public DataSourceServerController(DataSourceServerService serverService, DynamicDataSourceManager dsManager) {
        this.serverService = serverService;
        this.dsManager = dsManager;
    }

    @GetMapping
    public ResponseEntity<?> listServers(HttpServletRequest request) {
        var ctx = AuthenticatedRequestContext.currentOrNull();
        if (ctx == null) throw new SecurityException("UNAUTHORIZED");
        return ResponseEntity.ok(serverService.listServers(ctx.tenantId(), ctx.isPlatformAdmin()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getServer(@PathVariable Long id) {
        var ctx = requireContext();
        return ResponseEntity.ok(serverService.getServer(id, ctx.isPlatformAdmin(), ctx.tenantId()));
    }

    @PostMapping
    public ResponseEntity<?> createServer(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        var ctx = AuthenticatedRequestContext.currentOrNull();
        if (ctx == null) throw new SecurityException("UNAUTHORIZED");
        boolean isPlatformAdmin = ctx.isPlatformAdmin();
        String currentTenant = ctx.tenantId();
        String createdBy = ctx.username();
        try {
            return ResponseEntity.ok(serverService.createServer(body, isPlatformAdmin, currentTenant, createdBy));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> updateServer(@PathVariable Long id, @RequestBody Map<String, Object> body, HttpServletRequest request) {
        var ctx = AuthenticatedRequestContext.currentOrNull();
        if (ctx == null) throw new SecurityException("UNAUTHORIZED");
        boolean isPlatformAdmin = ctx.isPlatformAdmin();
        String currentTenant = ctx.tenantId();
        try {
            return ResponseEntity.ok(serverService.updateServer(id, body, isPlatformAdmin, currentTenant));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteServer(@PathVariable Long id) {
        var ctx = requireContext();
        serverService.deleteServer(id, ctx.isPlatformAdmin(), ctx.tenantId());
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @PostMapping("/{id}/test")
    public ResponseEntity<?> testConnection(@PathVariable Long id) {
        var ctx = requireContext();
        return ResponseEntity.ok(serverService.testConnection(id, ctx.isPlatformAdmin(), ctx.tenantId()));
    }

    @PostMapping("/test-new")
    public ResponseEntity<?> testNewConnection(@RequestBody Map<String, Object> body) {
        try {
            String host = (String) body.get("host");
            int port = body.get("port") instanceof Number n ? n.intValue() : 3306;
            String dbType = (String) body.getOrDefault("dbType", "mysql");
            String username = (String) body.get("username");
            String password = (String) body.get("password");
            boolean success = dsManager.testConnection(host, port, dbType, username, password);
            return ResponseEntity.ok(Map.of("success", success,
                    "message", success ? "连接成功" : "连接失败，请检查主机地址、端口和凭据"));
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of("success", false, "message", e.getMessage()));
        }
    }

    private Map<String, Object> error(String message) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("error", message);
        return payload;
    }

    private AuthenticatedRequestContext requireContext() {
        var ctx = AuthenticatedRequestContext.currentOrNull();
        if (ctx == null) throw new SecurityException("UNAUTHORIZED");
        return ctx;
    }
}
