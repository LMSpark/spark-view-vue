package com.spark.ai.security;

import com.spark.ai.api.ApiResponseFactory;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

public record AuthenticatedRequestContext(
        String requestId,
        String tenantId,
        String username,
        Set<String> roles
) {
    public boolean isAdmin() {
        return roles != null && roles.contains("admin");
    }

    public boolean isPlatformAdmin() {
        return roles != null && roles.contains("platform_admin");
    }

    public static AuthenticatedRequestContext currentOrNull() {
        RequestAttributes attrs = RequestContextHolder.getRequestAttributes();
        if (!(attrs instanceof ServletRequestAttributes servletAttrs)) {
            return null;
        }
        HttpServletRequest request = servletAttrs.getRequest();
        Object tenant = request.getAttribute("tenantId");
        Object username = request.getAttribute("username");
        Object roles = request.getAttribute("roles");
        if (!(tenant instanceof String tenantId) || !(username instanceof String user)) {
            return null;
        }
        Set<String> roleSet = roles instanceof String text && !text.isBlank()
                ? Arrays.stream(text.split(",")).map(String::trim).filter(s -> !s.isBlank()).collect(Collectors.toSet())
                : Set.of();
        return new AuthenticatedRequestContext(ApiResponseFactory.requestId(request), tenantId, user, roleSet);
    }
}
