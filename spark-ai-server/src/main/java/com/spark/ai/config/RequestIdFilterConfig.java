package com.spark.ai.config;

import com.spark.ai.api.ApiResponseFactory;
import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;

/**
 * Assigns a requestId and binds it to MDC for logs and response envelopes.
 */
@Configuration
public class RequestIdFilterConfig {

    private static final Logger log = LoggerFactory.getLogger(RequestIdFilterConfig.class);

    @Bean
    public FilterRegistrationBean<Filter> requestIdFilter() {
        FilterRegistrationBean<Filter> reg = new FilterRegistrationBean<>();
        reg.setFilter(new RequestIdFilter());
        reg.addUrlPatterns("/*");
        reg.setOrder(0);
        return reg;
    }

    static class RequestIdFilter implements Filter {
        @Override
        public void doFilter(ServletRequest req, ServletResponse resp, FilterChain chain)
                throws IOException, ServletException {
            HttpServletRequest request = (HttpServletRequest) req;
            HttpServletResponse response = (HttpServletResponse) resp;
            long startedAt = System.currentTimeMillis();
            String requestId = ApiResponseFactory.requestId(request);
            MDC.put("requestId", requestId);
            try {
                response.setHeader(ApiResponseFactory.REQUEST_ID_HEADER, requestId);
                chain.doFilter(req, resp);
            } finally {
                long elapsed = System.currentTimeMillis() - startedAt;
                String tenantId = attr(request, "tenantId");
                String projectId = request.getHeader("X-Project-Id");
                String username = attr(request, "username");
                log.info("[HTTP] method={} path={} status={} requestId={} tenantId={} projectId={} username={} elapsedMs={}",
                        request.getMethod(), request.getRequestURI(), response.getStatus(),
                        requestId, tenantId, projectId, username, elapsed);
                MDC.clear();
            }
        }

        private String attr(HttpServletRequest request, String name) {
            Object value = request.getAttribute(name);
            return value instanceof String text ? text : "";
        }
    }
}
