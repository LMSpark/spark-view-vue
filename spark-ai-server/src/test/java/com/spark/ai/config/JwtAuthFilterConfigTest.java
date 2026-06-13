package com.spark.ai.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.service.JwtUtil;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

class JwtAuthFilterConfigTest {

    @Test
    void directTurnTestEndpointBypassesTokenOnlyWhenEnabled() throws Exception {
        JwtAuthFilterConfig.JwtFilter filter = new JwtAuthFilterConfig.JwtFilter(
                jwtUtil(),
                new ObjectMapper(),
                true);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/ai/test/direct-turn");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void directTurnTestEndpointRequiresTokenByDefault() throws Exception {
        JwtAuthFilterConfig.JwtFilter filter = new JwtAuthFilterConfig.JwtFilter(
                jwtUtil(),
                new ObjectMapper(),
                false);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/ai/test/direct-turn");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(401);
    }

    @Test
    void ordinaryApiStillRequiresTokenWhenDirectTurnPublicIsEnabled() throws Exception {
        JwtAuthFilterConfig.JwtFilter filter = new JwtAuthFilterConfig.JwtFilter(
                jwtUtil(),
                new ObjectMapper(),
                true);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/ai/sessions");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(401);
    }

    private static JwtUtil jwtUtil() {
        return new JwtUtil(
                "SparkView2026DefaultSecretKeyForJwtSigningMustBe256Bit!!",
                Duration.ofHours(1));
    }
}
