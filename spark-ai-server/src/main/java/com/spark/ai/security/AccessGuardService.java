package com.spark.ai.security;

import com.spark.ai.entity.UserEntity;
import com.spark.ai.repository.ProjectMemberRepository;
import com.spark.ai.repository.ProjectRepository;
import com.spark.ai.repository.TenantConfigRepository;
import com.spark.ai.repository.UserRepository;
import org.springframework.stereotype.Service;

/**
 * Service-layer tenant/project/user access guard.
 *
 * Unit tests and startup jobs run without a servlet request; in that case the
 * guard is intentionally inert. HTTP requests always carry JWT context.
 */
@Service
public class AccessGuardService {

    private final UserRepository userRepository;
    private final ProjectRepository projectRepository;
    private final ProjectMemberRepository memberRepository;
    private final TenantConfigRepository tenantRepository;

    public AccessGuardService(
            UserRepository userRepository,
            ProjectRepository projectRepository,
            ProjectMemberRepository memberRepository,
            TenantConfigRepository tenantRepository) {
        this.userRepository = userRepository;
        this.projectRepository = projectRepository;
        this.memberRepository = memberRepository;
        this.tenantRepository = tenantRepository;
    }

    public AuthenticatedRequestContext requireTenantUser(String tenantId) {
        AuthenticatedRequestContext ctx = AuthenticatedRequestContext.currentOrNull();
        if (ctx == null) {
            return null;
        }
        requireEnabledUser(ctx);
        if (ctx.isPlatformAdmin()) {
            return ctx;
        }
        if (!tenantId.equals(ctx.tenantId())) {
            throw new SecurityException("TENANT_MISMATCH");
        }
        requireTenantActive(tenantId);
        return ctx;
    }

    public AuthenticatedRequestContext requireProjectAccess(String tenantId, String projectId) {
        AuthenticatedRequestContext ctx = requireTenantUser(tenantId);
        if (ctx == null) {
            return null;
        }
        if (!projectRepository.existsByTenantIdAndProjectId(tenantId, projectId)) {
            throw new IllegalArgumentException("项目不存在: " + projectId);
        }
        if (ctx.isAdmin()) {
            return ctx;
        }
        if (!memberRepository.existsByTenantIdAndProjectIdAndUsername(tenantId, projectId, ctx.username())) {
            throw new SecurityException("PROJECT_ACCESS_DENIED");
        }
        return ctx;
    }

    public AuthenticatedRequestContext requireProjectAdmin(String tenantId, String projectId) {
        AuthenticatedRequestContext ctx = requireProjectAccess(tenantId, projectId);
        if (ctx == null || ctx.isAdmin() || ctx.isPlatformAdmin()) {
            return ctx;
        }
        throw new SecurityException("PROJECT_ADMIN_REQUIRED");
    }

    public AuthenticatedRequestContext requirePlatformAdmin() {
        AuthenticatedRequestContext ctx = AuthenticatedRequestContext.currentOrNull();
        if (ctx == null) {
            throw new SecurityException("UNAUTHORIZED");
        }
        requireEnabledUser(ctx);
        if (!"platform".equals(ctx.tenantId()) || !ctx.isPlatformAdmin()) {
            throw new SecurityException("PLATFORM_ADMIN_REQUIRED");
        }
        requireTenantActive("platform");
        return ctx;
    }

    private UserEntity requireEnabledUser(AuthenticatedRequestContext ctx) {
        UserEntity user = userRepository.findByTenantIdAndUsername(ctx.tenantId(), ctx.username())
                .orElseThrow(() -> new SecurityException("USER_NOT_FOUND"));
        if (!user.isEnabled()) {
            throw new SecurityException("USER_DISABLED");
        }
        return user;
    }

    private void requireTenantActive(String tenantId) {
        var tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new SecurityException("TENANT_NOT_FOUND"));
        if (tenant.getDeletedAt() != null) {
            throw new SecurityException("TENANT_DELETED");
        }
        if ("DISABLED".equalsIgnoreCase(tenant.getStatus())) {
            throw new SecurityException("TENANT_DISABLED");
        }
    }
}
