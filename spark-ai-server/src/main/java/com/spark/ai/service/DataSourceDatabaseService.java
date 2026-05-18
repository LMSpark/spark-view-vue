package com.spark.ai.service;

import com.spark.ai.config.CryptoUtil;
import com.spark.ai.config.DatabaseDialect;
import com.spark.ai.config.DynamicDataSourceManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.util.*;

@Service
public class DataSourceDatabaseService {

    private static final Logger log = LoggerFactory.getLogger(DataSourceDatabaseService.class);

    private final JdbcTemplate jdbc;
    private final CryptoUtil cryptoUtil;
    private final DynamicDataSourceManager dsManager;
    private final DataSource primaryDataSource;

    public DataSourceDatabaseService(JdbcTemplate jdbc, CryptoUtil cryptoUtil,
                                     DynamicDataSourceManager dsManager, DataSource primaryDataSource) {
        this.jdbc = jdbc;
        this.cryptoUtil = cryptoUtil;
        this.dsManager = dsManager;
        this.primaryDataSource = primaryDataSource;
    }

    public List<Map<String, Object>> listDatabases(String tenantId, String projectId, Long serverId) {
        String sql = "SELECT d.*, s.SERVER_NAME, s.HOST, s.PORT, s.DB_TYPE"
                + " FROM DATA_SOURCE_DATABASE d"
                + " JOIN DATA_SOURCE_SERVER s ON d.SERVER_ID = s.ID"
                + " WHERE (d.ISOLATION_MODE = 'TENANT_SHARED'"
                + " OR (d.ISOLATION_MODE IN ('TENANT_ISOLATED', 'PROJECT_SHARED') AND d.TENANT_ID = ?)"
                + " OR (d.ISOLATION_MODE = 'PROJECT_ISOLATED' AND d.TENANT_ID = ? AND d.PROJECT_ID = ?))";
        List<Object> args = new ArrayList<>();
        args.add(tenantId);
        args.add(tenantId);
        args.add(projectId);
        if (serverId != null) {
            sql += " AND d.SERVER_ID = ?";
            args.add(serverId);
        }
        sql += " ORDER BY d.CREATED_AT DESC";
        return jdbc.queryForList(sql, args.toArray());
    }

    public List<String> listPhysicalDatabaseNames(Long serverId, boolean isPlatformAdmin, String currentTenant) {
        if (serverId == null) throw new IllegalArgumentException("serverId 不能为空");
        Map<String, Object> server = jdbc.queryForMap(
                "SELECT HOST, PORT, DB_TYPE, USERNAME, PASSWORD, ISOLATION_MODE, TENANT_ID"
                        + " FROM DATA_SOURCE_SERVER WHERE ID = ?",
                serverId);
        requireServerAccess(server, isPlatformAdmin, currentTenant);

        String host = (String) server.get("HOST");
        int port = ((Number) server.get("PORT")).intValue();
        String dbType = (String) server.get("DB_TYPE");
        String username = (String) server.get("USERNAME");
        String password = cryptoUtil.decrypt((String) server.get("PASSWORD"));
        DatabaseDialect dialect = parseDialect(dbType);

        try (Connection conn = dsManager.createSingleConnection(host, port, dbType, username, password)) {
            List<String> names = queryPhysicalDatabaseNames(conn, dialect);
            names.sort(String.CASE_INSENSITIVE_ORDER);
            return names;
        } catch (Exception e) {
            throw new RuntimeException("读取服务器数据库列表失败: " + e.getMessage(), e);
        }
    }

    public Map<String, Object> getDatabase(Long id) {
        return jdbc.queryForMap(
                "SELECT d.*, s.SERVER_NAME, s.HOST, s.PORT, s.DB_TYPE"
                        + " FROM DATA_SOURCE_DATABASE d"
                        + " JOIN DATA_SOURCE_SERVER s ON d.SERVER_ID = s.ID"
                        + " WHERE d.ID = ?", id);
    }

    @Transactional
    public Map<String, Object> createDatabase(String tenantId, String projectId, Map<String, Object> body, String createdBy) {
        Long serverId = longParam(body.get("serverId"), null);
        if (serverId == null) throw new IllegalArgumentException("serverId 不能为空");
        String databaseName = require(body.get("databaseName"), "databaseName");
        DataIsolationMode mode = DataIsolationMode.parseOrDefault(body.get("isolationMode"), DataIsolationMode.PROJECT_ISOLATED, "isolationMode");
        String isolationMode = mode.name();
        String targetProjectId = mode == DataIsolationMode.PROJECT_ISOLATED ? projectId : null;
        String connectionMode = normalizeConnectionMode(body.get("connectionMode"), "DIRECT");
        String jndiName = optionalString(body.get("jndiName"));
        validateConnectionMode(connectionMode, jndiName);
        boolean createNew = booleanParam(body.get("createNew"), false);

        Map<String, Object> server = jdbc.queryForMap(
            "SELECT HOST, PORT, DB_TYPE, USERNAME, PASSWORD, ISOLATION_MODE FROM DATA_SOURCE_SERVER WHERE ID = ?", serverId);
        DataIsolationMode serverMode = DataIsolationMode.parse(server.get("ISOLATION_MODE"), "server.isolationMode");
        if (!serverMode.canContain(mode)) {
            throw new IllegalArgumentException("数据库隔离模式不能比服务器更宽");
        }

        if (createNew) {
            String charset = stringOrDefault(body.get("charset"), "utf8mb4");
            String collation = stringOrDefault(body.get("collation"), "utf8mb4_unicode_ci");
            String dbType = (String) server.get("DB_TYPE");
            DatabaseDialect dialect = parseDialect(dbType);
            String createSql = dialect.createDatabaseSql(databaseName, charset, collation);
            executeOnServer(server, dialect, createSql);
            log.info("[DB] 创建物理数据库: {} 在服务器 serverId={}", databaseName, serverId);
        }

        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO DATA_SOURCE_DATABASE (SERVER_ID, DATABASE_NAME, ISOLATION_MODE, TENANT_ID, PROJECT_ID, CONNECTION_MODE, JNDI_NAME, CREATED_BY, STATUS, CREATED_AT, UPDATED_AT)"
                            + " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS
            );
            LocalDateTime now = LocalDateTime.now();
            statement.setLong(1, serverId);
            statement.setString(2, databaseName);
            statement.setString(3, isolationMode);
            statement.setString(4, tenantId);
            statement.setString(5, targetProjectId);
            statement.setString(6, connectionMode);
            statement.setString(7, jndiName);
            statement.setString(8, createdBy);
            statement.setString(9, "active");
            statement.setObject(10, now);
            statement.setObject(11, now);
            return statement;
        }, keyHolder);

        Long id = generatedId(keyHolder);
        log.info("[DB] 注册数据库 id={}, name={}, tenant={}", id, databaseName, tenantId);
        return getDatabase(id);
    }

    @Transactional
    public Map<String, Object> updateDatabase(Long id, Map<String, Object> body) {
        Map<String, Object> existing = jdbc.queryForMap("SELECT * FROM DATA_SOURCE_DATABASE WHERE ID = ?", id);
        String databaseName = stringOrDefault(body.get("databaseName"), (String) existing.get("DATABASE_NAME"));
        String status = stringOrDefault(body.get("status"), (String) existing.get("STATUS"));
        DataIsolationMode mode = DataIsolationMode.parseOrDefault(body.get("isolationMode"), DataIsolationMode.parse(existing.get("ISOLATION_MODE"), "isolationMode"), "isolationMode");
        DataIsolationMode serverMode = DataIsolationMode.parse(jdbc.queryForObject(
            "SELECT ISOLATION_MODE FROM DATA_SOURCE_SERVER WHERE ID = ?",
            String.class,
            ((Number) existing.get("SERVER_ID")).longValue()
        ), "server.isolationMode");
        if (!serverMode.canContain(mode)) {
            throw new IllegalArgumentException("数据库隔离模式不能比服务器更宽");
        }
        String isolationMode = mode.name();
        String projectId = mode == DataIsolationMode.PROJECT_ISOLATED ? (String) existing.get("PROJECT_ID") : null;
        String connectionMode = normalizeConnectionMode(body.get("connectionMode"), (String) existing.get("CONNECTION_MODE"));
        String jndiName = body.containsKey("jndiName")
                ? optionalString(body.get("jndiName"))
                : optionalString(existing.get("JNDI_NAME"));
        validateConnectionMode(connectionMode, jndiName);

        jdbc.update(
        "UPDATE DATA_SOURCE_DATABASE SET DATABASE_NAME=?, ISOLATION_MODE=?, PROJECT_ID=?, CONNECTION_MODE=?, JNDI_NAME=?, STATUS=?, UPDATED_AT=? WHERE ID=?",
        databaseName, isolationMode, projectId, connectionMode, jndiName, status, LocalDateTime.now(), id);
        dsManager.evict(id);

        return getDatabase(id);
    }

    @Transactional
    public void deleteDatabase(Long id, boolean dropPhysical) {
        Map<String, Object> db = jdbc.queryForMap(
                "SELECT d.DATABASE_NAME, s.HOST, s.PORT, s.DB_TYPE, s.USERNAME, s.PASSWORD"
                        + " FROM DATA_SOURCE_DATABASE d JOIN DATA_SOURCE_SERVER s ON d.SERVER_ID = s.ID"
                        + " WHERE d.ID = ?", id);

        if (dropPhysical) {
            String dbType = (String) db.get("DB_TYPE");
            DatabaseDialect dialect = parseDialect(dbType);
            String dropSql = "DROP DATABASE IF EXISTS " + dialect.quote((String) db.get("DATABASE_NAME"));
            executeOnServer(db, dialect, dropSql);
        }

        jdbc.update("DELETE FROM DATA_SOURCE_DATABASE WHERE ID = ?", id);
        dsManager.evict(id);
        log.info("[DB] 删除数据库 id={}", id);
    }

    private List<String> queryPhysicalDatabaseNames(Connection conn, DatabaseDialect dialect) throws SQLException {
        String sql = switch (dialect) {
            case MYSQL -> "SHOW DATABASES";
            case POSTGRESQL -> "SELECT datname FROM pg_database WHERE datallowconn = true AND datistemplate = false ORDER BY datname";
            case H2 -> "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA ORDER BY SCHEMA_NAME";
        };
        List<String> names = new ArrayList<>();
        Set<String> seen = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        try (Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery(sql)) {
            while (rs.next()) {
                String name = optionalString(rs.getString(1));
                if (name != null && isUserDatabaseName(dialect, name) && seen.add(name)) {
                    names.add(name);
                }
            }
        }
        return names;
    }

    private boolean isUserDatabaseName(DatabaseDialect dialect, String databaseName) {
        String normalized = databaseName.toLowerCase(Locale.ROOT);
        return switch (dialect) {
            case MYSQL -> !Set.of("information_schema", "mysql", "performance_schema", "sys").contains(normalized);
            case POSTGRESQL -> !Set.of("template0", "template1").contains(normalized);
            case H2 -> !Set.of("information_schema", "public").contains(normalized);
        };
    }

    private void requireServerAccess(Map<String, Object> server, boolean isPlatformAdmin, String currentTenant) {
        if (isPlatformAdmin) {
            return;
        }
        String isolationMode = Objects.toString(server.get("ISOLATION_MODE"), "");
        String tenantId = Objects.toString(server.get("TENANT_ID"), "");
        if (DataIsolationMode.TENANT_SHARED.name().equals(isolationMode)) {
            return;
        }
        if (!currentTenant.equals(tenantId)) {
            throw new SecurityException("DATA_SOURCE_SERVER_ACCESS_DENIED");
        }
    }

    private void executeOnServer(Map<String, Object> server, DatabaseDialect dialect, String sql) {
        String host = (String) server.get("HOST");
        int port = ((Number) server.get("PORT")).intValue();
        String dbType = (String) server.get("DB_TYPE");
        String username = (String) server.get("USERNAME");
        String password = cryptoUtil.decrypt((String) server.get("PASSWORD"));

        try (Connection conn = dsManager.createSingleConnection(host, port, dbType, username, password);
             Statement stmt = conn.createStatement()) {
            stmt.execute(sql);
        } catch (Exception e) {
            throw new RuntimeException("在服务器 " + host + ":" + port + " 上执行 SQL 失败: " + e.getMessage(), e);
        }
    }

    private String require(Object value, String fieldName) {
        if (value == null || (value instanceof String s && s.isBlank())) {
            throw new IllegalArgumentException(fieldName + " 不能为空");
        }
        return value.toString().trim();
    }

    private String stringOrDefault(Object value, String defaultValue) {
        if (value == null || (value instanceof String s && s.isBlank())) return defaultValue;
        return value.toString().trim();
    }

    private String optionalString(Object value) {
        if (value == null) return null;
        String text = value.toString().trim();
        return text.isEmpty() ? null : text;
    }

    private String normalizeConnectionMode(Object value, String defaultValue) {
        String mode = stringOrDefault(value, defaultValue == null ? "DIRECT" : defaultValue);
        String normalized = mode.trim().replace('-', '_').toUpperCase(Locale.ROOT);
        if (!"DIRECT".equals(normalized) && !"JNDI_XA".equals(normalized)) {
            throw new IllegalArgumentException("connectionMode 只支持 DIRECT 或 JNDI_XA");
        }
        return normalized;
    }

    private void validateConnectionMode(String connectionMode, String jndiName) {
        if ("JNDI_XA".equals(connectionMode) && (jndiName == null || jndiName.isBlank())) {
            throw new IllegalArgumentException("JNDI_XA 数据库必须填写 jndiName");
        }
    }

    private Long longParam(Object value, Long defaultValue) {
        if (value instanceof Number n) return n.longValue();
        if (value instanceof String s) {
            try { return Long.parseLong(s.trim()); } catch (NumberFormatException e) { return defaultValue; }
        }
        return defaultValue;
    }

    private boolean booleanParam(Object value, boolean defaultValue) {
        if (value instanceof Boolean b) return b;
        if (value instanceof String s) return "true".equalsIgnoreCase(s.trim());
        return defaultValue;
    }

    private static DatabaseDialect parseDialect(String dbType) {
        if (dbType == null) return DatabaseDialect.MYSQL;
        return switch (dbType.toLowerCase()) {
            case "mysql" -> DatabaseDialect.MYSQL;
            case "postgresql", "postgres" -> DatabaseDialect.POSTGRESQL;
            case "h2" -> DatabaseDialect.H2;
            default -> DatabaseDialect.MYSQL;
        };
    }

    private static Long generatedId(KeyHolder keyHolder) {
        Number key = keyHolder.getKey();
        if (key == null) {
            throw new IllegalStateException("创建数据库后未返回主键");
        }
        return key.longValue();
    }
}
