package com.spark.ai.config;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.lookup.JndiDataSourceLookup;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 动态数据源管理器。
 * 根据 databaseId 懒加载创建/获取对应的 HikariCP 连接池，
 * 支持运行时注册新的数据库服务器并动态创建连接池。
 */
@Component
public class DynamicDataSourceManager {

    private static final Logger log = LoggerFactory.getLogger(DynamicDataSourceManager.class);

    private final DataSource primaryDataSource;
    private final JdbcTemplate primaryJdbcTemplate;
    private final CryptoUtil cryptoUtil;
    private final DynamicDataSourceProperties properties;
    private final JndiDataSourceLookup jndiLookup = new JndiDataSourceLookup();

    /** databaseId → DataSourceEntry 缓存 */
    private final Map<Long, DataSourceEntry> cache = new ConcurrentHashMap<>();

    @Autowired
    public DynamicDataSourceManager(DataSource primaryDataSource,
                                    JdbcTemplate primaryJdbcTemplate,
                                    CryptoUtil cryptoUtil) {
        this(primaryDataSource, primaryJdbcTemplate, cryptoUtil, new DynamicDataSourceProperties());
    }

    public DynamicDataSourceManager(DataSource primaryDataSource,
                                    JdbcTemplate primaryJdbcTemplate,
                                    CryptoUtil cryptoUtil,
                                    DynamicDataSourceProperties properties) {
        this.primaryDataSource = primaryDataSource;
        this.primaryJdbcTemplate = primaryJdbcTemplate;
        this.cryptoUtil = cryptoUtil;
        this.properties = properties == null ? new DynamicDataSourceProperties() : properties;
    }

    /**
     * 获取指定数据库 ID 对应的 JdbcTemplate。
     * databaseId 为 null 时返回主库 JdbcTemplate。
     */
    public JdbcTemplate getJdbcTemplate(Long databaseId) {
        if (databaseId == null) {
            return primaryJdbcTemplate;
        }
        DataSourceEntry entry = cache.computeIfAbsent(databaseId, this::createEntry);
        return entry.jdbcTemplate;
    }

    /**
     * 获取指定数据库 ID 对应的 DatabaseDialect。
     * databaseId 为 null 时返回主库方言。
     */
    public DatabaseDialect getDialect(Long databaseId) {
        if (databaseId == null) {
            return DatabaseDialect.getCurrentDialect();
        }
        return parseDialect(loadDatabaseInfo(databaseId).dbType());
    }

    public boolean isJtaJndiMode() {
        return properties.isJtaJndiMode();
    }

    public DatabaseConnectionInfo getConnectionInfo(Long databaseId) {
        if (databaseId == null) {
            return new DatabaseConnectionInfo(null, null, null, null, "JNDI_XA", null);
        }
        return loadDatabaseInfo(databaseId).toConnectionInfo();
    }

    /**
     * 使指定数据库 ID 的缓存失效。
     */
    public void evict(Long databaseId) {
        DataSourceEntry entry = cache.remove(databaseId);
        if (entry != null && entry.dataSource != primaryDataSource) {
            if (entry.dataSource instanceof HikariDataSource hds) {
                log.info("[DS] 关闭连接池: databaseId={}", databaseId);
                hds.close();
            }
        }
    }

    /**
     * 使指定服务器下所有数据库的缓存失效（服务器更新/删除后调用）。
     */
    public void evictByServerId(Long serverId) {
        // 查询该服务器下所有数据库 ID
        var dbIds = primaryJdbcTemplate.queryForList(
                "SELECT ID FROM DATA_SOURCE_DATABASE WHERE SERVER_ID = ?", Long.class, serverId);
        for (Long dbId : dbIds) {
            evict(dbId);
        }
    }

    /**
     * 创建到服务器的单次连接（用于 CREATE DATABASE 等 DDL 操作）。
     * 连接的是服务器级别（不带具体数据库名），用完即关。
     */
    public Connection createSingleConnection(String host, int port, String dbType, String username, String password) {
        try {
            DatabaseDialect dialect = parseDialect(dbType);
            String url = dialect.jdbcUrl(host, port, "mysql".equals(dbType) ? "mysql" : "postgres");
            return DriverManager.getConnection(url, username, password);
        } catch (Exception e) {
            throw new RuntimeException("连接服务器失败: " + host + ":" + port, e);
        }
    }

    /**
     * 测试服务器连接。
     */
    public boolean testConnection(String host, int port, String dbType, String username, String password) {
        DatabaseDialect dialect = parseDialect(dbType);
        String url = dialect.jdbcUrl(host, port, "mysql".equals(dbType) ? "mysql" : "postgres");
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(url);
        config.setUsername(username);
        config.setPassword(password);
        config.setDriverClassName(dialect.driverClassName());
        config.setMaximumPoolSize(1);
        config.setConnectionTimeout(5000);
        try (HikariDataSource ds = new HikariDataSource(config)) {
            ds.getConnection().close();
            return true;
        } catch (Exception e) {
            log.warn("[DS] 连接测试失败: {}:{} {}", host, port, e.getMessage());
            return false;
        }
    }

    private DataSourceEntry createEntry(Long databaseId) {
        DatabaseMetadata metadata = loadDatabaseInfo(databaseId);
        DatabaseDialect dialect = parseDialect(metadata.dbType());
        if (properties.isJtaJndiMode()) {
            return createJndiEntry(metadata, dialect);
        }
        if ("JNDI_XA".equals(metadata.connectionMode())) {
            throw new IllegalStateException("JNDI_XA 数据源需要启用 spark.datasource.mode=jta-jndi: databaseId=" + databaseId);
        }
        return createDirectEntry(metadata, dialect);
    }

    private DataSourceEntry createDirectEntry(DatabaseMetadata metadata, DatabaseDialect dialect) {
        String password = cryptoUtil.decrypt(metadata.encryptedPassword());
        String url = dialect.jdbcUrl(metadata.host(), metadata.port(), metadata.databaseName());

        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(url);
        config.setUsername(metadata.username());
        config.setPassword(password);
        config.setDriverClassName(dialect.driverClassName());
        config.setMaximumPoolSize(10);
        config.setMinimumIdle(2);
        config.setConnectionTimeout(10000);
        config.setIdleTimeout(300000);
        config.setMaxLifetime(600000);

        HikariDataSource ds = new HikariDataSource(config);
        JdbcTemplate jdbcTemplate = new JdbcTemplate(ds);

        log.info("[DS] 创建直连连接池: databaseId={}, url={}", metadata.databaseId(), url);
        return new DataSourceEntry(ds, jdbcTemplate, dialect, metadata.connectionMode(), metadata.jndiName());
    }

    private DataSourceEntry createJndiEntry(DatabaseMetadata metadata, DatabaseDialect dialect) {
        if (!"JNDI_XA".equals(metadata.connectionMode()) || metadata.jndiName() == null || metadata.jndiName().isBlank()) {
            throw new IllegalStateException("JNDI_XA 数据源缺少 jndiName: databaseId=" + metadata.databaseId());
        }
        try {
            DataSource dataSource = jndiLookup.getDataSource(metadata.jndiName());
            log.info("[DS] 获取 JNDI XA 数据源: databaseId={}, jndiName={}", metadata.databaseId(), metadata.jndiName());
            return new DataSourceEntry(dataSource, new JdbcTemplate(dataSource), dialect, metadata.connectionMode(), metadata.jndiName());
        } catch (Exception e) {
            throw new IllegalStateException(
                    "JNDI 数据源 lookup 失败 databaseId=" + metadata.databaseId() + ", jndiName=" + metadata.jndiName(),
                    e
            );
        }
    }

    private DatabaseMetadata loadDatabaseInfo(Long databaseId) {
        try {
            return primaryJdbcTemplate.queryForObject("""
                SELECT
                    d.ID AS dbId,
                    d.SERVER_ID AS serverId,
                    d.DATABASE_NAME AS databaseName,
                    COALESCE(d.CONNECTION_MODE, 'DIRECT') AS connectionMode,
                    d.JNDI_NAME AS jndiName,
                    s.HOST AS host,
                    s.PORT AS port,
                    s.DB_TYPE AS dbType,
                    s.USERNAME AS username,
                    s.PASSWORD AS password
                FROM DATA_SOURCE_DATABASE d
                JOIN DATA_SOURCE_SERVER s ON d.SERVER_ID = s.ID
                WHERE d.ID = ?
                """, (rs, rowNum) -> new DatabaseMetadata(
                    rs.getLong("dbId"),
                    rs.getLong("serverId"),
                    rs.getString("databaseName"),
                    normalizeConnectionMode(rs.getString("connectionMode")),
                    rs.getString("jndiName"),
                    rs.getString("host"),
                    rs.getInt("port"),
                    rs.getString("dbType"),
                    rs.getString("username"),
                    rs.getString("password")
            ), databaseId);
        } catch (EmptyResultDataAccessException e) {
            throw new IllegalStateException("数据源元数据不存在 databaseId=" + databaseId, e);
        }
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

    private static String normalizeConnectionMode(String mode) {
        if (mode == null || mode.isBlank()) return "DIRECT";
        return mode.trim().replace('-', '_').toUpperCase();
    }

    private record DatabaseMetadata(
            Long databaseId,
            Long serverId,
            String databaseName,
            String connectionMode,
            String jndiName,
            String host,
            int port,
            String dbType,
            String username,
            String encryptedPassword
    ) {
        DatabaseConnectionInfo toConnectionInfo() {
            return new DatabaseConnectionInfo(databaseId, serverId, databaseName, dbType, connectionMode, jndiName);
        }
    }

    public record DatabaseConnectionInfo(
            Long databaseId,
            Long serverId,
            String databaseName,
            String dbType,
            String connectionMode,
            String jndiName
    ) {
        public boolean isJndiXa() {
            return "JNDI_XA".equals(connectionMode);
        }
    }

    private record DataSourceEntry(
            DataSource dataSource,
            JdbcTemplate jdbcTemplate,
            DatabaseDialect dialect,
            String connectionMode,
            String jndiName
    ) {}
}
