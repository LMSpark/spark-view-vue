package com.spark.ai.stills.handler;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.stills.model.StillsResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * db.query 动作处理器 — 安全只读 SQL 查询。
 *
 * <h3>安全措施</h3>
 * <ul>
 *   <li>仅允许 SELECT 语句（禁止 INSERT/UPDATE/DELETE/DROP/ALTER/CREATE/TRUNCATE）</li>
 *   <li>强制 LIMIT 上限（最大 100 行）</li>
 *   <li>禁止多语句执行（分号分隔）</li>
 *   <li>禁止危险函数（LOAD_FILE、INTO OUTFILE 等）</li>
 * </ul>
 */
@Component
public class DbQueryHandler implements ActionHandler {

    private static final Logger log = LoggerFactory.getLogger(DbQueryHandler.class);
    private static final String EXPECTED_FORMAT =
            "{\"sql\":\"string (必填, 仅 SELECT)\", \"limit\": 10}";
    private static final int MAX_LIMIT = 100;

    /** 危险 SQL 关键字（大写匹配） */
    private static final Set<String> DANGEROUS_KEYWORDS = Set.of(
            "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE",
            "TRUNCATE", "GRANT", "REVOKE", "EXEC", "EXECUTE",
            "LOAD_FILE", "INTO OUTFILE", "INTO DUMPFILE"
    );

    /** 匹配以 SELECT 开头（忽略前导空白和括号） */
    private static final Pattern SELECT_PATTERN =
            Pattern.compile("^\\s*\\(?\\s*SELECT\\b", Pattern.CASE_INSENSITIVE);

    private final ObjectMapper objectMapper;
    private final JdbcTemplate jdbcTemplate;

    public DbQueryHandler(ObjectMapper objectMapper, JdbcTemplate jdbcTemplate) {
        this.objectMapper = objectMapper;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public String getAction() {
        return "db.query";
    }

    @Override
    public StillsResult execute(String requestId, String jsonBody)
            throws ActionValidationException, ActionExecutionException {

        // 1. 反序列化参数
        DbQueryParams params;
        try {
            params = objectMapper.readValue(jsonBody, DbQueryParams.class);
        } catch (Exception e) {
            throw new ActionValidationException(
                    "JSON 解析失败: " + e.getMessage(),
                    "请严格按照此格式重发",
                    EXPECTED_FORMAT);
        }

        // 2. 必填字段校验
        if (params.sql == null || params.sql.isBlank()) {
            throw new ActionValidationException(
                    "缺失必填参数: sql",
                    "请补充 sql 字段（仅 SELECT 语句）",
                    EXPECTED_FORMAT);
        }

        // 3. 安全校验
        validateSql(params.sql);

        // 4. 限制 limit
        int limit = Math.min(Math.max(params.limit, 1), MAX_LIMIT);

        // 5. 执行查询
        try {
            String safeSql = applySafeLimit(params.sql.trim(), limit);
            log.info("[STILLS] 执行 SQL: {} (limit={})", safeSql, limit);

            List<Map<String, Object>> rows = jdbcTemplate.queryForList(safeSql);

            Map<String, Object> data = new LinkedHashMap<>();
            data.put("status", "success");
            data.put("rowCount", rows.size());
            data.put("data", rows);
            return new StillsResult("db.query", requestId, data);

        } catch (Exception e) {
            throw new ActionExecutionException("SQL 执行失败: " + e.getMessage(), e);
        }
    }

    private void validateSql(String sql) throws ActionValidationException {
        String trimmed = sql.trim();

        // 必须以 SELECT 开头
        if (!SELECT_PATTERN.matcher(trimmed).find()) {
            throw new ActionValidationException(
                    "仅允许 SELECT 查询",
                    "请将 sql 改为 SELECT 语句",
                    EXPECTED_FORMAT);
        }

        // 禁止多语句（分号后还有内容）
        // 先去掉末尾的分号，再检查中间是否有分号
        String withoutTrailingSemicolon = trimmed.replaceAll(";\\s*$", "");
        if (withoutTrailingSemicolon.contains(";")) {
            throw new ActionValidationException(
                    "禁止多语句执行（不要用分号分隔多条 SQL）",
                    "请只发送单条 SELECT 语句",
                    EXPECTED_FORMAT);
        }

        // 检查危险关键字
        String upper = trimmed.toUpperCase(Locale.ROOT);
        for (String keyword : DANGEROUS_KEYWORDS) {
            // 使用单词边界检查，避免误匹配列名
            if (Pattern.compile("\\b" + keyword + "\\b").matcher(upper).find()) {
                throw new ActionValidationException(
                        "SQL 包含禁止的关键字: " + keyword,
                        "db.query 仅支持只读 SELECT 查询，禁止 " + keyword,
                        EXPECTED_FORMAT);
            }
        }

        // 检查注释注入（-- 和 /* */）
        if (trimmed.contains("--") || trimmed.contains("/*")) {
            throw new ActionValidationException(
                    "SQL 包含注释语法（-- 或 /* */），疑似注入",
                    "请去掉 SQL 中的注释",
                    EXPECTED_FORMAT);
        }
    }

    /**
     * 如果 SQL 末尾没有 LIMIT，自动追加。
     */
    private String applySafeLimit(String sql, int limit) {
        String upper = sql.toUpperCase(Locale.ROOT);
        if (!upper.contains("LIMIT")) {
            return sql.replaceAll(";\\s*$", "") + " LIMIT " + limit;
        }
        return sql;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 参数 POJO
    // ─────────────────────────────────────────────────────────────────────────

    static class DbQueryParams {
        public String sql;
        public int limit = 10;
    }
}
