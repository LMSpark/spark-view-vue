package com.spark.ai.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.api.ApiResponseFactory;
import com.spark.ai.service.JwtUtil;
import io.jsonwebtoken.Claims;
import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;
import java.util.Set;

/**
 * JWT 认证过滤器 — 拦截 /api/** 请求，验证 Bearer Token。
 *
 * <h3>公开端点（无需 Token）</h3>
 * <ul>
 *   <li>/api/auth/** — 登录、注册</li>
 *   <li>/api/config/default — 默认配置</li>
 *   <li>/api/events — SSE 事件流</li>
 * </ul>
 *
 * <h3>认证流程</h3>
 * <ol>
 *   <li>解析 Authorization: Bearer {token}</li>
 *   <li>验证签名 + 过期时间</li>
 *   <li>将 tenantId / username / roles 写入 request attribute</li>
 *   <li>验证 X-Tenant-Id 头与 Token 中 tenantId 一致</li>
 * </ol>
 */
@Configuration
public class JwtAuthFilterConfig {

    private static final Logger log = LoggerFactory.getLogger(JwtAuthFilterConfig.class);

    /** 不需要认证的 URL 前缀 */
    private static final Set<String> PUBLIC_PREFIXES = Set.of(
        "/api/auth/",
        "/api/config/default",
        "/api/events",
        "/api/logs",
        "/api/ai/debug/",
        "/api/openapi",
        "/api/swagger"
    );

    /** 不需要认证的完整路径 */
    private static final Set<String> PUBLIC_PATHS = Set.of(
        "/api/ai/component-metadata",
        "/health",
        "/h2-console"
    );

    @Bean
    public FilterRegistrationBean<Filter> jwtAuthFilter(JwtUtil jwtUtil, ObjectMapper objectMapper) {
        FilterRegistrationBean<Filter> reg = new FilterRegistrationBean<>();
        reg.setFilter(new JwtFilter(jwtUtil, objectMapper));
        reg.addUrlPatterns("/api/*");
        reg.setOrder(1);
        return reg;
    }

    static class JwtFilter implements Filter {

        private final JwtUtil jwtUtil;
        private final ObjectMapper objectMapper;

        JwtFilter(JwtUtil jwtUtil, ObjectMapper objectMapper) {
            this.jwtUtil = jwtUtil;
            this.objectMapper = objectMapper;
        }

        @Override
        public void doFilter(ServletRequest req, ServletResponse resp, FilterChain chain)
                throws IOException, ServletException {
            HttpServletRequest request = (HttpServletRequest) req;
            HttpServletResponse response = (HttpServletResponse) resp;

            String path = request.getRequestURI();

            // 1. 公开端点放行
            if (isPublic(path) || "OPTIONS".equalsIgnoreCase(request.getMethod())) {
                chain.doFilter(req, resp);
                return;
            }

            // 2. 提取 Bearer Token
            String authHeader = request.getHeader("Authorization");
            if (authHeader == null || !authHeader.startsWith("Bearer ")) {
                sendError(request, response, 401, "UNAUTHORIZED", "缺少认证 Token");
                return;
            }

            String token = authHeader.substring(7);

            // 3. 验证 Token
            Claims claims;
            try {
                claims = jwtUtil.parseToken(token);
            } catch (Exception e) {
                log.debug("[JwtFilter] Token 无效: {}", e.getMessage());
                sendError(request, response, 401, "INVALID_TOKEN", "Token 无效或已过期");
                return;
            }

            String tokenTenantId = jwtUtil.getTenantId(claims);
            String username = jwtUtil.getUsername(claims);
            String roles = jwtUtil.getRoles(claims);

            // 4. 验证 X-Tenant-Id 头与 Token 中的 tenantId 一致
            String headerTenantId = request.getHeader("X-Tenant-Id");
            if (headerTenantId != null && !headerTenantId.isBlank()
                    && !headerTenantId.equals(tokenTenantId)) {
                sendError(request, response, 403, "TENANT_MISMATCH",
                    "X-Tenant-Id 头与 Token 中的租户不匹配");
                return;
            }

            // 5. 将认证信息写入 request attribute（供 Controller 读取）
            request.setAttribute("tenantId", tokenTenantId);
            request.setAttribute("username", username);
            request.setAttribute("roles", roles);
            request.setAttribute(ApiResponseFactory.REQUEST_ID_ATTRIBUTE, ApiResponseFactory.requestId(request));

            chain.doFilter(req, resp);
        }

        private boolean isPublic(String path) {
            for (String prefix : PUBLIC_PREFIXES) {
                if (path.startsWith(prefix)) return true;
            }
            for (String p : PUBLIC_PATHS) {
                if (path.startsWith(p)) return true;
            }
            return false;
        }

        private void sendError(HttpServletRequest request, HttpServletResponse response, int status, String error, String message)
                throws IOException {
            ApiResponseFactory.writeJsonError(request, response, objectMapper,
                    org.springframework.http.HttpStatus.valueOf(status), error, message);
        }
    }
}
