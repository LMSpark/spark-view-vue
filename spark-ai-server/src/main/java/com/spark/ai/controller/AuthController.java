package com.spark.ai.controller;

import com.spark.ai.service.AuthService;
import com.spark.ai.service.TenantService;
import com.spark.ai.service.ProjectService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.Map;

/**
 * 认证端点 — 登录、注册用户、注册租户。
 *
 * <p>所有端点均为公开接口，不需要 JWT 认证。
 * 前端通过 {@code X-Tenant-Id} 头指定租户上下文。
 *
 * <pre>
 *   POST /api/auth/login              → 用户登录
 *   POST /api/auth/register           → 用户注册（已有租户内）
 *   POST /api/auth/register-tenant    → 注册新租户 + 管理员
 *   GET  /api/auth/me                 → 获取当前用户信息（需 JWT）
 * </pre>
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final TenantService tenantService;
    private final ProjectService projectService;

    public AuthController(AuthService authService, TenantService tenantService, ProjectService projectService) {
        this.authService = authService;
        this.tenantService = tenantService;
        this.projectService = projectService;
    }

    // ── 登录 ──────────────────────────────────────────────────────────────────

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> body,
                                   @RequestHeader(value = "X-Tenant-Id", required = false) String headerTenantId) {
        String tenantId = resolveTenantId(body.get("tenantId"), headerTenantId);
        String username = body.get("username");
        String password = body.get("password");

        if (tenantId == null || username == null || password == null) {
            return ResponseEntity.badRequest().body(Map.of(
                "error", "MISSING_FIELDS",
                "message", "tenantId, username, password are required"
            ));
        }

        String defaultProjectId = ProjectService.HOMEPAGE_PROJECT_ID;
        return authService.login(tenantId, username, password)
            .<ResponseEntity<?>>map(result -> ResponseEntity.ok(Map.of(
                "success", true,
                "token", result.get("token"),
                "user", result.get("user"),
                "tenantId", tenantId,
                "defaultProjectId", defaultProjectId
            )))
            .orElse(ResponseEntity.status(401).body(Map.of(
                "error", "AUTH_FAILED",
                "message", "用户名或密码错误"
            )));
    }

    // ── 用户注册（已有租户内） ────────────────────────────────────────────────

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, String> body,
                                      @RequestHeader(value = "X-Tenant-Id", required = false) String headerTenantId)
            throws IOException {
        String tenantId = resolveTenantId(body.get("tenantId"), headerTenantId);
        String username = body.get("username");
        String password = body.get("password");

        if (tenantId == null || username == null || password == null) {
            return ResponseEntity.badRequest().body(Map.of(
                "error", "MISSING_FIELDS",
                "message", "tenantId, username, password are required"
            ));
        }

        if (password.length() < 6) {
            return ResponseEntity.badRequest().body(Map.of(
                "error", "WEAK_PASSWORD",
                "message", "密码长度至少 6 位"
            ));
        }

        // 验证租户是否存在
        if (tenantService.getTenantConfig(tenantId) == null) {
            return ResponseEntity.badRequest().body(Map.of(
                "error", "TENANT_NOT_FOUND",
                "message", "租户不存在: " + tenantId
            ));
        }

        String defaultProjectId = ProjectService.HOMEPAGE_PROJECT_ID;
        return authService.register(tenantId, username, password,
                body.get("displayName"), body.get("email"), "user")
            .<ResponseEntity<?>>map(result -> ResponseEntity.ok(Map.of(
                "success", true,
                "token", result.get("token"),
                "user", result.get("user"),
                "tenantId", tenantId,
                "defaultProjectId", defaultProjectId
            )))
            .orElse(ResponseEntity.status(409).body(Map.of(
                "error", "USER_EXISTS",
                "message", "用户名已存在"
            )));
    }

    // ── 注册新租户 + 管理员 ───────────────────────────────────────────────────

    @PostMapping("/register-tenant")
    public ResponseEntity<?> registerTenant(@RequestBody Map<String, String> body) throws IOException {
        String tenantId = body.get("tenantId");
        String tenantName = body.get("tenantName");
        String adminUsername = body.get("username");
        String adminPassword = body.get("password");

        if (tenantId == null || tenantName == null || adminUsername == null || adminPassword == null) {
            return ResponseEntity.badRequest().body(Map.of(
                "error", "MISSING_FIELDS",
                "message", "tenantId, tenantName, username, password are required"
            ));
        }

        if (!tenantId.matches("^[a-zA-Z][a-zA-Z0-9_-]{2,31}$")) {
            return ResponseEntity.badRequest().body(Map.of(
                "error", "INVALID_TENANT_ID",
                "message", "租户 ID 须以字母开头，3-32 个字母/数字/下划线/连字符"
            ));
        }

        if (adminPassword.length() < 6) {
            return ResponseEntity.badRequest().body(Map.of(
                "error", "WEAK_PASSWORD",
                "message", "密码长度至少 6 位"
            ));
        }

        // 检查租户是否已存在
        if (tenantService.getTenantConfig(tenantId) != null) {
            return ResponseEntity.status(409).body(Map.of(
                "error", "TENANT_EXISTS",
                "message", "租户 ID 已存在: " + tenantId
            ));
        }

        // 1. 创建租户配置
        tenantService.saveTenantConfig(tenantId, Map.of(
            "tenant", Map.of(
                "tenantId", tenantId,
                "tenantName", tenantName,
                "tenantCode", tenantId.toUpperCase()
            ),
            "config", Map.of(
                "apiBaseUrl", "/api",
                "logLevel", "info",
                "features", Map.of("enableAI", true, "enableExport", true, "enableOffline", false)
            ),
            "pageConfig", Map.of("homePath", "/")
        ));

        // 2. 创建默认项目（homepage）
        projectService.ensureHomepage(tenantId);

        // 3. 创建管理员用户
        authService.ensureAdminUser(tenantId, adminUsername, adminPassword);

        // 4. 签发 Token
        String defaultProjectId = ProjectService.HOMEPAGE_PROJECT_ID;
        return authService.login(tenantId, adminUsername, adminPassword)
            .<ResponseEntity<?>>map(result -> ResponseEntity.ok(Map.of(
                "success", true,
                "token", result.get("token"),
                "user", result.get("user"),
                "tenantId", tenantId,
                "defaultProjectId", defaultProjectId,
                "message", "租户注册成功"
            )))
            .orElse(ResponseEntity.status(500).body(Map.of(
                "error", "INTERNAL_ERROR",
                "message", "租户创建成功但登录失败"
            )));
    }

    // ── 获取当前用户信息（需 JWT，由 JwtAuthFilter 解析） ─────────────────────

    @GetMapping("/me")
    public ResponseEntity<?> me(@RequestAttribute(value = "tenantId", required = false) String tenantId,
                                @RequestAttribute(value = "username", required = false) String username) {
        if (tenantId == null || username == null) {
            return ResponseEntity.status(401).body(Map.of(
                "error", "UNAUTHORIZED",
                "message", "请先登录"
            ));
        }
        return authService.findUser(tenantId, username)
            .<ResponseEntity<?>>map(user -> ResponseEntity.ok(Map.of(
                "userId", String.valueOf(user.getId()),
                "username", user.getUsername(),
                "displayName", user.getDisplayName() != null ? user.getDisplayName() : user.getUsername(),
                "email", user.getEmail() != null ? user.getEmail() : "",
                "roles", user.getRoles().split(","),
                "tenantId", user.getTenantId()
            )))
            .orElse(ResponseEntity.status(404).body(Map.of(
                "error", "USER_NOT_FOUND",
                "message", "用户不存在"
            )));
    }

    // ── 私有 ──────────────────────────────────────────────────────────────────

    /** tenantId 优先级：body > X-Tenant-Id header */
    private String resolveTenantId(String bodyTenantId, String headerTenantId) {
        if (bodyTenantId != null && !bodyTenantId.isBlank()) return bodyTenantId.trim();
        if (headerTenantId != null && !headerTenantId.isBlank()) return headerTenantId.trim();
        return null;
    }
}
