package com.spark.ai.service;

import com.spark.ai.entity.UserEntity;
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
    private final JwtUtil jwtUtil;
    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    public AuthService(UserRepository userRepo, JwtUtil jwtUtil) {
        this.userRepo = userRepo;
        this.jwtUtil = jwtUtil;
    }

    // ── 用户登录 ──────────────────────────────────────────────────────────────

    /**
     * 用户登录 — 验证密码后签发 JWT。
     *
     * @return 登录结果 Map（含 token + 用户信息），认证失败时返回 empty
     */
    public Optional<Map<String, Object>> login(String tenantId, String username, String password) {
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
        if (userRepo.existsByTenantIdAndUsername(tenantId, username)) return;

        UserEntity admin = new UserEntity();
        admin.setTenantId(tenantId);
        admin.setUsername(username);
        admin.setPasswordHash(passwordEncoder.encode(password));
        admin.setDisplayName("管理员");
        admin.setRoles("admin");
        userRepo.save(admin);
        log.info("[Auth] 种子管理员已创建 tenant={} user={}", tenantId, username);
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
}
