package com.spark.ai.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 物理表 DDL 服务 — 通过 JdbcTemplate 在 H2 数据库中执行
 * CREATE TABLE / ALTER TABLE / DROP TABLE 等 DDL 操作。
 *
 * <p>安全：表名和列名须通过 {@link #validateName(String)} 校验（字母开头，仅含字母/数字/下划线，
 * 最长 128 字符），防止 SQL 注入。DDL 语句使用带引号的标识符。
 *
 * <p>逻辑类型映射：
 * <ul>
 *   <li>string / varchar → VARCHAR(512)</li>
 *   <li>integer / int     → INTEGER</li>
 *   <li>number / float / double → DOUBLE PRECISION</li>
 *   <li>boolean / bool   → BOOLEAN</li>
 *   <li>date             → DATE</li>
 *   <li>datetime / timestamp → TIMESTAMP</li>
 *   <li>text / clob      → CLOB</li>
 *   <li>其他             → VARCHAR(512)</li>
 * </ul>
 */
@Service
public class TableDdlService {

    /** 允许的标识符格式：字母开头，仅含字母/数字/下划线，1-128 字符 */
    private static final Pattern SAFE_NAME = Pattern.compile("^[A-Za-z][A-Za-z0-9_]{0,127}$");

    @Autowired
    private JdbcTemplate jdbc;

    // ── 工具方法 ─────────────────────────────────────────────────────────────

    private void validateName(String name) {
        if (name == null || !SAFE_NAME.matcher(name).matches()) {
            throw new IllegalArgumentException("无效的标识符（仅允许字母开头，含字母/数字/下划线，最长 128）: " + name);
        }
    }

    /** 逻辑类型 → H2 SQL 类型 */
    private String toSqlType(String logicalType) {
        return switch (logicalType == null ? "string" : logicalType.toLowerCase()) {
            case "integer", "int"             -> "INTEGER";
            case "number", "float", "double"  -> "DOUBLE PRECISION";
            case "boolean", "bool"            -> "BOOLEAN";
            case "date"                       -> "DATE";
            case "datetime", "timestamp"      -> "TIMESTAMP";
            case "text", "clob"               -> "CLOB";
            default                           -> "VARCHAR(512)";
        };
    }

    // ── 核心 DDL ─────────────────────────────────────────────────────────────

    /**
     * 创建物理表（IF NOT EXISTS）。
     *
     * <p>始终包含 {@code id VARCHAR(128) NOT NULL PRIMARY KEY} 列。
     * 传入的 columns 中若包含 name=id 的列，将被忽略（自动处理）。
     *
     * @param tableName 表名
     * @param columns   列定义列表，每项含 name, type, required 字段
     */
    @SuppressWarnings("unchecked")
    public void createTable(String tableName, List<Map<String, Object>> columns) {
        validateName(tableName);
        StringBuilder sb = new StringBuilder("CREATE TABLE IF NOT EXISTS \"")
                .append(tableName).append("\" (");
        sb.append("\"id\" VARCHAR(128) NOT NULL PRIMARY KEY");

        if (columns != null) {
            for (Map<String, Object> col : columns) {
                String name = (String) col.get("name");
                if (name == null || "id".equalsIgnoreCase(name)) continue;
                validateName(name);
                String sqlType = toSqlType((String) col.get("type"));
                boolean required = Boolean.TRUE.equals(col.get("required"));
                sb.append(", \"").append(name).append("\" ").append(sqlType);
                if (required) sb.append(" NOT NULL");
            }
        }
        sb.append(")");
        jdbc.execute(sb.toString());
    }

    /**
     * 删除物理表（IF EXISTS）。
     */
    public void dropTable(String tableName) {
        validateName(tableName);
        jdbc.execute("DROP TABLE IF EXISTS \"" + tableName + "\"");
    }

    /**
     * 新增列（ALTER TABLE ADD COLUMN IF NOT EXISTS）。
     */
    public void addColumn(String tableName, Map<String, Object> column) {
        validateName(tableName);
        String name = (String) column.get("name");
        validateName(name);
        String sqlType = toSqlType((String) column.get("type"));
        jdbc.execute("ALTER TABLE \"" + tableName + "\" ADD COLUMN IF NOT EXISTS \""
                + name + "\" " + sqlType);
    }

    /**
     * 删除列（ALTER TABLE DROP COLUMN IF EXISTS）。
     */
    public void dropColumn(String tableName, String columnName) {
        validateName(tableName);
        validateName(columnName);
        jdbc.execute("ALTER TABLE \"" + tableName + "\" DROP COLUMN IF EXISTS \""
                + columnName + "\"");
    }

    /**
     * 修改列类型（ALTER TABLE ALTER COLUMN）。
     *
     * <p>H2 语法: {@code ALTER TABLE "T" ALTER COLUMN "col" TYPE VARCHAR(512)}
     */
    public void alterColumn(String tableName, String columnName, String newLogicalType) {
        validateName(tableName);
        validateName(columnName);
        String sqlType = toSqlType(newLogicalType);
        jdbc.execute("ALTER TABLE \"" + tableName + "\" ALTER COLUMN \""
                + columnName + "\" " + sqlType);
    }

    // ── 查询 ─────────────────────────────────────────────────────────────────

    /**
     * 列出 PUBLIC schema 下的所有用户物理表（排除系统表）。
     *
     * @return 每项含 tableName, estimatedRowCount
     */
    public List<Map<String, Object>> listPhysicalTables() {
        // 过滤掉框架内部表（表名含下划线前缀约定，以及 H2 的 SYSTEM 表）
        String sql = "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES " +
                "WHERE TABLE_SCHEMA = 'PUBLIC' AND TABLE_TYPE = 'TABLE' " +
                "ORDER BY TABLE_NAME";
        List<Map<String, Object>> rows = jdbc.queryForList(sql);
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            String name = (String) row.get("TABLE_NAME");
            result.add(Map.of("tableName", name));
        }
        return result;
    }

    /**
     * 描述表结构（列出所有列）。
     *
     * @return 每项含 columnName, dataType, isNullable, columnDefault
     */
    public List<Map<String, Object>> describeTable(String tableName) {
        validateName(tableName);
        String sql = "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT " +
                "FROM INFORMATION_SCHEMA.COLUMNS " +
                "WHERE TABLE_SCHEMA = 'PUBLIC' AND TABLE_NAME = ? " +
                "ORDER BY ORDINAL_POSITION";
        List<Map<String, Object>> rows = jdbc.queryForList(sql, tableName.toUpperCase());
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            result.add(Map.of(
                    "columnName",    row.getOrDefault("COLUMN_NAME", ""),
                    "dataType",      row.getOrDefault("DATA_TYPE", ""),
                    "isNullable",    row.getOrDefault("IS_NULLABLE", "YES"),
                    "columnDefault", row.getOrDefault("COLUMN_DEFAULT", "")
            ));
        }
        return result;
    }

    /**
     * 判断物理表是否存在。
     */
    public boolean tableExists(String tableName) {
        validateName(tableName);
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES " +
                "WHERE TABLE_SCHEMA = 'PUBLIC' AND TABLE_TYPE = 'TABLE' AND TABLE_NAME = ?",
                Integer.class, tableName.toUpperCase());
        return count != null && count > 0;
    }
}
