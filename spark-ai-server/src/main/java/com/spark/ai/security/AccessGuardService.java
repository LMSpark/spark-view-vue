package com.spark.ai.security;

import com.spark.ai.entity.UserEntity;
import com.spark.ai.repository.ProjectMemberRepository;
import com.spark.ai.repository.ProjectRepository;
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

    public AccessGuardService(
            UserRepository userRepository,
            ProjectRepository projectRepository,
            ProjectMemberRepository memberRepository) {
        this.userRepository = userRepository;
        this.projectRepository = projectRepository;
        this.memberRepository = memberRepository;
    }

    public AuthenticatedRequestContext requireTenantUser(String tenantId) {
        AuthenticatedRequestContext ctx = AuthenticatedRequestContext.currentOrNull();
        if (ctx == null) {
            return null;
        }
        if (!tenantId.equals(ctx.tenantId())) {
            throw new SecurityException("TENANT_MISMATCH");
        }
        UserEntity user = userRepository.findByTenantIdAndUsername(ctx.tenantId(), ctx.username())
                .orElseThrow(() -> new SecurityException("USER_NOT_FOUND"));
        if (!user.isEnabled()) {
            throw new SecurityException("USER_DISABLED");
        }
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
        if (ctx == null || ctx.isAdmin()) {
            return ctx;
        }
        throw new SecurityException("PROJECT_ADMIN_REQUIRED");
    }
}
