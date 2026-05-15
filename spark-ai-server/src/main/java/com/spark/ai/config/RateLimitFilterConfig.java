package com.spark.ai.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.api.ApiResponseFactory;
import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Simple per-IP fixed-window rate limit.
 */
@Configuration
@EnableConfigurationProperties(RateLimitProperties.class)
public class RateLimitFilterConfig {

    @Bean
    public FilterRegistrationBean<Filter> rateLimitFilter(
            RateLimitProperties properties,
            ObjectMapper objectMapper) {
        FilterRegistrationBean<Filter> reg = new FilterRegistrationBean<>();
        reg.setFilter(new RateLimitFilter(properties, objectMapper));
        reg.addUrlPatterns("/api/*");
        reg.setOrder(2);
        return reg;
    }

    static class RateLimitFilter implements Filter {
        private final RateLimitProperties properties;
        private final ObjectMapper objectMapper;
        private final Map<String, Window> windows = new ConcurrentHashMap<>();

        RateLimitFilter(RateLimitProperties properties, ObjectMapper objectMapper) {
            this.properties = properties;
            this.objectMapper = objectMapper;
        }

        @Override
        public void doFilter(ServletRequest req, ServletResponse resp, FilterChain chain)
                throws IOException, ServletException {
            HttpServletRequest request = (HttpServletRequest) req;
            HttpServletResponse response = (HttpServletResponse) resp;
            if (!properties.isEnabled() || isPublicHealth(request.getRequestURI())) {
                chain.doFilter(req, resp);
                return;
            }

            String ip = clientIp(request);
            long now = System.currentTimeMillis();
            int allowed = Math.max(1, properties.getRequestsPerMinute()) + Math.max(0, properties.getBurst());
            Window window = windows.compute(ip, (key, current) -> {
                if (current == null || now - current.windowStartedAt >= 60_000L) {
                    return new Window(now, 1);
                }
                current.count++;
                return current;
            });

            if (window.count > allowed) {
                ApiResponseFactory.writeJsonError(request, response, objectMapper,
                        HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED", "请求过于频繁，请稍后重试");
                return;
            }

            chain.doFilter(req, resp);
        }

        private boolean isPublicHealth(String path) {
            return path != null && (path.startsWith("/actuator/") || path.equals("/health"));
        }

        private String clientIp(HttpServletRequest request) {
            if (properties.isTrustedProxy()) {
                String forwarded = request.getHeader("X-Forwarded-For");
                if (forwarded != null && !forwarded.isBlank()) {
                    return forwarded.split(",")[0].trim();
                }
            }
            return request.getRemoteAddr();
        }
    }

    static class Window {
        final long windowStartedAt;
        int count;

        Window(long windowStartedAt, int count) {
            this.windowStartedAt = windowStartedAt;
            this.count = count;
        }
    }
}
