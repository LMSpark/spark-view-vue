package com.spark.ai.service;

import com.spark.ai.entity.UserEntity;
import com.spark.ai.repository.TenantConfigRepository;
import com.spark.ai.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 认证服务 — 用户注册、登录、Token 签发。
 */
@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private final UserRepository userRepo;
    private final TenantConfigRepository tenantRepo;
    private final JwtUtil jwtUtil;
    private final ProjectService projectService;
    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    public AuthService(UserRepository userRepo,
                       TenantConfigRepository tenantRepo,
                       JwtUtil jwtUtil,
                       ProjectService projectService) {
        this.userRepo = userRepo;
        this.tenantRepo = tenantRepo;
        this.jwtUtil = jwtUtil;
        this.projectService = projectService;
    }

    // ── 用户登录 ──────────────────────────────────────────────────────────────

    /**
     * 用户登录 — 验证密码后签发 JWT。
     *
     * @return 登录结果 Map（含 token + 用户信息），认证失败时返回 empty
     */
    public Optional<Map<String, Object>> login(String tenantId, String username, String password) {
        if (!isTenantUsable(tenantId)) {
            log.info("[Auth] 登录失败：租户不可用 tenant={} user={}", tenantId, username);
            return Optional.empty();
        }

        Optional<UserEntity> opt = userRepo.findByTenantIdAndUsername(tenantId, username);
        if (opt.isEmpty()) {
            log.info("[Auth] 登录失败：用户不存在 tenant={} user={}", tenantId, username);
            return Optional.empty();
        }

        UserEntity user = opt.get();
        if (!user.isEnabled()) {
            log.info("[Auth] 登录失败：用户已禁用 tenant={} user={}", tenantId, username);
            return Optional.empty();
        }

        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            log.info("[Auth] 登录失败：密码错误 tenant={} user={}", tenantId, username);
            return Optional.empty();
        }

        String token = jwtUtil.generateToken(tenantId, username, user.getRoles());
        log.info("[Auth] 登录成功 tenant={} user={}", tenantId, username);
        return Optional.of(buildUserResult(user, token));
    }

    // ── 用户注册 ──────────────────────────────────────────────────────────────

    /**
     * 用户注册 — 创建用户并签发 JWT。
     *
     * @param roles 角色（默认 "user"）
     * @return 注册结果，用户名已存在时返回 empty
     */
    @Transactional
    public Optional<Map<String, Object>> register(String tenantId, String username,
                                                    String password, String displayName,
                                                    String email, String roles) {
        if (!isTenantUsable(tenantId)) {
            log.info("[Auth] 注册失败：租户不可用 tenant={} user={}", tenantId, username);
            return Optional.empty();
        }
        if (userRepo.existsByTenantIdAndUsername(tenantId, username)) {
            log.info("[Auth] 注册失败：用户已存在 tenant={} user={}", tenantId, username);
            return Optional.empty();
        }

        UserEntity user = new UserEntity();
        user.setTenantId(tenantId);
        user.setUsername(username);
        user.setPasswordHash(passwordEncoder.encode(password));
        user.setDisplayName(displayName != null ? displayName : username);
        user.setEmail(email);
        user.setRoles(roles != null ? roles : "user");
        userRepo.save(user);
        projectService.ensureProjectMember(tenantId, ProjectService.HOMEPAGE_PROJECT_ID, username, "member");

        String token = jwtUtil.generateToken(tenantId, username, user.getRoles());
        log.info("[Auth] 注册成功 tenant={} user={}", tenantId, username);
        return Optional.of(buildUserResult(user, token));
    }

    // ── 种子用户 ──────────────────────────────────────────────────────────────

    /**
     * 确保租户下存在管理员用户（DataInitializer 调用）。
     */
    @Transactional
    public void ensureAdminUser(String tenantId, String username, String password) {
        ensureAdminUser(tenantId, username, password, "admin");
    }

    @Transactional
    public void ensureAdminUser(String tenantId, String username, String password, String roles) {
        String targetRoles = roles != null && !roles.isBlank() ? roles : "admin";
        Optional<UserEntity> existing = userRepo.findByTenantIdAndUsername(tenantId, username);
        if (existing.isPresent()) {
            UserEntity user = existing.get();
            if (!hasAllRoles(user.getRoles(), targetRoles)) {
                user.setRoles(mergeRoles(user.getRoles(), targetRoles));
                userRepo.save(user);
                log.info("[Auth] 管理员角色已补齐 tenant={} user={} roles={}", tenantId, username, user.getRoles());
            }
            return;
        }

        UserEntity admin = new UserEntity();
        admin.setTenantId(tenantId);
        admin.setUsername(username);
        admin.setPasswordHash(passwordEncoder.encode(password));
        admin.setDisplayName("管理员");
        admin.setRoles(targetRoles);
        userRepo.save(admin);
        projectService.ensureProjectMember(tenantId, ProjectService.HOMEPAGE_PROJECT_ID, username, "owner");
        log.info("[Auth] 种子管理员已创建 tenant={} user={}", tenantId, username);
    }

    @Transactional
    public void ensurePlatformAdminUser(String tenantId, String username, String password) {
        ensureAdminUser(tenantId, username, password, "admin,platform_admin");
    }

    // ── 查询 ──────────────────────────────────────────────────────────────────

    public Optional<UserEntity> findUser(String tenantId, String username) {
        return userRepo.findByTenantIdAndUsername(tenantId, username);
    }

    public List<UserEntity> listUsers(String tenantId) {
        return userRepo.findByTenantId(tenantId);
    }

    // ── 私有 ──────────────────────────────────────────────────────────────────

    private Map<String, Object> buildUserResult(UserEntity user, String token) {
        return Map.of(
            "token", token,
            "user", Map.of(
                "userId", String.valueOf(user.getId()),
                "username", user.getUsername(),
                "displayName", user.getDisplayName() != null ? user.getDisplayName() : user.getUsername(),
                "email", user.getEmail() != null ? user.getEmail() : "",
                "avatar", user.getAvatar() != null ? user.getAvatar() : "",
                "roles", Arrays.asList(user.getRoles().split(",")),
                "tenantId", user.getTenantId()
            )
        );
    }

    private static boolean hasAllRoles(String existingRoles, String requiredRoles) {
        List<String> existing = roleList(existingRoles);
        for (String role : roleList(requiredRoles)) {
            if (!existing.contains(role)) return false;
        }
        return true;
    }

    private static String mergeRoles(String existingRoles, String requiredRoles) {
        List<String> merged = new java.util.ArrayList<>(roleList(existingRoles));
        for (String role : roleList(requiredRoles)) {
            if (!merged.contains(role)) merged.add(role);
        }
        return String.join(",", merged);
    }

    private static List<String> roleList(String roles) {
        if (roles == null || roles.isBlank()) return List.of();
        return Arrays.stream(roles.split(","))
                .map(String::trim)
                .filter(role -> !role.isBlank())
                .distinct()
                .toList();
    }

    private boolean isTenantUsable(String tenantId) {
        return tenantRepo.findById(tenantId)
                .filter(tenant -> tenant.getDeletedAt() == null)
                .map(tenant -> !"DISABLED".equalsIgnoreCase(tenant.getStatus()))
                .orElse(false);
    }
}
