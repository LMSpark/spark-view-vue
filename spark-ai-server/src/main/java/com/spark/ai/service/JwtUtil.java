package com.spark.ai.service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;

/**
 * JWT 工具 — 签发与验证 JWT Token。
 *
 * <p>Token 中携带 tenantId / username / roles 三个业务 claim，
 * 前端通过 Authorization: Bearer {token} 头传递。
 */
@Component
public class JwtUtil {

    private final SecretKey key;
    private final Duration expiration;

    public JwtUtil(
            @Value("${spark.auth.jwt-secret:SparkView2026DefaultSecretKeyForJwtSigningMustBe256Bit!!}") String secret,
            @Value("${spark.auth.jwt-expiration:24h}") Duration expiration) {
        byte[] keyBytes = secret.getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length < 32) {
            throw new IllegalArgumentException("JWT secret must be at least 256 bits (32 bytes)");
        }
        this.key = Keys.hmacShaKeyFor(keyBytes);
        this.expiration = expiration;
    }

    /** 签发 JWT */
    public String generateToken(String tenantId, String username, String roles) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(username)
                .claim("tenantId", tenantId)
                .claim("roles", roles)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(expiration)))
                .signWith(key)
                .compact();
    }

    /** 解析并验证 JWT，返回 Claims（过期/签名无效时抛异常） */
    public Claims parseToken(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    /** 从 Claims 取 tenantId */
    public String getTenantId(Claims claims) {
        return claims.get("tenantId", String.class);
    }

    /** 从 Claims 取 username */
    public String getUsername(Claims claims) {
        return claims.getSubject();
    }

    /** 从 Claims 取 roles */
    public String getRoles(Claims claims) {
        return claims.get("roles", String.class);
    }
}
