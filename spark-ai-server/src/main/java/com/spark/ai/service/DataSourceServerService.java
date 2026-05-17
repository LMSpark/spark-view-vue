package com.spark.ai.service;

import com.spark.ai.config.CryptoUtil;
import com.spark.ai.config.DynamicDataSourceManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.util.*;

@Service
public class DataSourceServerService {

    private static final Logger log = LoggerFactory.getLogger(DataSourceServerService.class);

    private final JdbcTemplate jdbc;
    private final CryptoUtil cryptoUtil;
    private final DynamicDataSourceManager dsManager;

    public DataSourceServerService(JdbcTemplate jdbc, CryptoUtil cryptoUtil, DynamicDataSourceManager dsManager) {
        this.jdbc = jdbc;
        this.cryptoUtil = cryptoUtil;
        this.dsManager = dsManager;
    }

    public List<Map<String, Object>> listServers(String tenantId, boolean isPlatformAdmin) {
        String sql;
        Object[] args;
        if (isPlatformAdmin) {
            sql = "SELECT * FROM DATA_SOURCE_SERVER ORDER BY CREATED_AT DESC";
            args = new Object[0];
        } else {
            sql = "SELECT * FROM DATA_SOURCE_SERVER WHERE ISOLATION_MODE = 'SHARED'"
                    + " OR (ISOLATION_MODE = 'TENANT_ISOLATED' AND TENANT_ID = ?)"
                    + " ORDER BY CREATED_AT DESC";
            args = new Object[]{tenantId};
        }
        List<Map<String, Object>> servers = jdbc.queryForList(sql, args);
        for (Map<String, Object> server : servers) {
            server.put("password", "***");
        }
        return servers;
    }

    public Map<String, Object> getServer(Long id, boolean isPlatformAdmin, String currentTenant) {
        Map<String, Object> server = jdbc.queryForMap(
                "SELECT * FROM DATA_SOURCE_SERVER WHERE ID = ?", id);
        requireServerAccess(server, isPlatformAdmin, currentTenant);
        server.put("password", "***");
        return server;
    }

    @Transactional
    public Map<String, Object> createServer(Map<String, Object> body, boolean isPlatformAdmin, String currentTenant, String createdBy) {
        String serverName = require(body.get("serverName"), "serverName");
        String host = require(body.get("host"), "host");
        int port = intParam(body.get("port"), 3306);
        String dbType = stringOrDefault(body.get("dbType"), "mysql");
        String username = require(body.get("username"), "username");
        String rawPassword = require(body.get("password"), "password");
        String encryptedPassword = cryptoUtil.encrypt(rawPassword);
        String status = stringOrDefault(body.get("status"), "active");

        String isolationMode;
        String tenantId;
        if (isPlatformAdmin) {
            isolationMode = stringOrDefault(body.get("isolationMode"), "TENANT_ISOLATED");
            tenantId = "SHARED".equals(isolationMode) ? null : stringOrDefault(body.get("tenantId"), currentTenant);
        } else {
            isolationMode = "TENANT_ISOLATED";
            tenantId = currentTenant;
        }

        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO DATA_SOURCE_SERVER (SERVER_NAME, HOST, PORT, DB_TYPE, USERNAME, PASSWORD, ISOLATION_MODE, TENANT_ID, CREATED_BY, STATUS, CREATED_AT, UPDATED_AT)"
                            + " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS
            );
            LocalDateTime now = LocalDateTime.now();
            statement.setString(1, serverName);
            statement.setString(2, host);
            statement.setInt(3, port);
            statement.setString(4, dbType.toLowerCase());
            statement.setString(5, username);
            statement.setString(6, encryptedPassword);
            statement.setString(7, isolationMode);
            statement.setString(8, tenantId);
            statement.setString(9, createdBy);
            statement.setString(10, status);
            statement.setObject(11, now);
            statement.setObject(12, now);
            return statement;
        }, keyHolder);

        Long id = generatedId(keyHolder);
        log.info("[Server] {} 注册服务器 id={}, host={}:{}", createdBy, id, host, port);
        return getServer(id, isPlatformAdmin, currentTenant);
    }

    @Transactional
    public Map<String, Object> updateServer(Long id, Map<String, Object> body, boolean isPlatformAdmin, String currentTenant) {
        Map<String, Object> existing = jdbc.queryForMap("SELECT * FROM DATA_SOURCE_SERVER WHERE ID = ?", id);
        requireServerAccess(existing, isPlatformAdmin, currentTenant);

        String serverName = stringOrDefault(body.get("serverName"), (String) existing.get("SERVER_NAME"));
        String host = stringOrDefault(body.get("host"), (String) existing.get("HOST"));
        int port = body.containsKey("port") ? intParam(body.get("port"), 3306) : ((Number) existing.get("PORT")).intValue();
        String dbType = stringOrDefault(body.get("dbType"), (String) existing.get("DB_TYPE"));
        String username = stringOrDefault(body.get("username"), (String) existing.get("USERNAME"));
        String encryptedPassword = existing.get("PASSWORD").toString();
        if (body.containsKey("password") && !"***".equals(body.get("password"))) {
            encryptedPassword = cryptoUtil.encrypt((String) body.get("password"));
        }
        String status = stringOrDefault(body.get("status"), (String) existing.get("STATUS"));

        String isolationMode = (String) existing.get("ISOLATION_MODE");
        String tenantId = (String) existing.get("TENANT_ID");
        if (isPlatformAdmin && body.containsKey("isolationMode")) {
            isolationMode = (String) body.get("isolationMode");
            tenantId = "SHARED".equals(isolationMode) ? null : stringOrDefault(body.get("tenantId"), currentTenant);
        }

        jdbc.update(
                "UPDATE DATA_SOURCE_SERVER SET SERVER_NAME=?, HOST=?, PORT=?, DB_TYPE=?, USERNAME=?, PASSWORD=?, ISOLATION_MODE=?, TENANT_ID=?, STATUS=?, UPDATED_AT=? WHERE ID=?",
                serverName, host, port, dbType, username, encryptedPassword, isolationMode, tenantId, status, LocalDateTime.now(), id);

        dsManager.evictByServerId(id);

        log.info("[Server] 更新服务器 id={}", id);
        return getServer(id, isPlatformAdmin, currentTenant);
    }

    @Transactional
    public void deleteServer(Long id, boolean isPlatformAdmin, String currentTenant) {
        Map<String, Object> existing = jdbc.queryForMap("SELECT * FROM DATA_SOURCE_SERVER WHERE ID = ?", id);
        requireServerAccess(existing, isPlatformAdmin, currentTenant);
        jdbc.update("DELETE FROM DATA_SOURCE_SERVER WHERE ID = ?", id);
        dsManager.evictByServerId(id);
        log.info("[Server] 删除服务器 id={}", id);
    }

    public Map<String, Object> testConnection(Long id, boolean isPlatformAdmin, String currentTenant) {
        Map<String, Object> existing = jdbc.queryForMap("SELECT * FROM DATA_SOURCE_SERVER WHERE ID = ?", id);
        requireServerAccess(existing, isPlatformAdmin, currentTenant);
        Map<String, Object> server = jdbc.queryForMap(
                "SELECT HOST, PORT, DB_TYPE, USERNAME, PASSWORD FROM DATA_SOURCE_SERVER WHERE ID = ?", id);
        String host = (String) server.get("HOST");
        int port = ((Number) server.get("PORT")).intValue();
        String dbType = (String) server.get("DB_TYPE");
        String username = (String) server.get("USERNAME");
        String password = cryptoUtil.decrypt((String) server.get("PASSWORD"));

        boolean ok = dsManager.testConnection(host, port, dbType, username, password);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", ok);
        result.put("serverId", id);
        result.put("host", host + ":" + port);
        if (!ok) {
            result.put("message", "连接失败，请检查主机地址、端口和认证信息");
        }
        return result;
    }

    private void requireServerAccess(Map<String, Object> server, boolean isPlatformAdmin, String currentTenant) {
        if (isPlatformAdmin) {
            return;
        }
        String isolationMode = Objects.toString(server.get("ISOLATION_MODE"), "");
        String tenantId = Objects.toString(server.get("TENANT_ID"), "");
        if ("SHARED".equals(isolationMode)) {
            return;
        }
        if (!currentTenant.equals(tenantId)) {
            throw new SecurityException("DATA_SOURCE_SERVER_ACCESS_DENIED");
        }
    }

    private String require(Object value, String fieldName) {
        if (value == null || (value instanceof String s && s.isBlank())) {
            throw new IllegalArgumentException(fieldName + " 不能为空");
        }
        return value.toString().trim();
    }

    private String stringOrDefault(Object value, String defaultValue) {
        if (value == null || (value instanceof String s && s.isBlank())) {
            return defaultValue;
        }
        return value.toString().trim();
    }

    private int intParam(Object value, int defaultValue) {
        if (value instanceof Number n) return n.intValue();
        if (value instanceof String s) {
            try { return Integer.parseInt(s.trim()); } catch (NumberFormatException e) { return defaultValue; }
        }
        return defaultValue;
    }

    private static Long generatedId(KeyHolder keyHolder) {
        Number key = keyHolder.getKey();
        if (key == null) {
            throw new IllegalStateException("创建服务器后未返回主键");
        }
        return key.longValue();
    }
}
