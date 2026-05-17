package com.spark.ai.config;

/**
 * ThreadLocal 持有当前操作的目标数据库标识。
 * 在每次数据操作前由 Service 层设置，操作后清理。
 */
public final class DatabaseContextHolder {

    private static final ThreadLocal<Long> CURRENT_DATABASE_ID = new ThreadLocal<>();
    private static final ThreadLocal<String> CURRENT_LOOKUP_KEY = new ThreadLocal<>();
    private static final ThreadLocal<DatabaseDialect> CURRENT_DIALECT = new ThreadLocal<>();

    public static final String PRIMARY_LOOKUP_KEY = "PRIMARY";

    private DatabaseContextHolder() {}

    public static void setDatabaseId(Long databaseId) {
        CURRENT_DATABASE_ID.set(databaseId);
    }

    public static Long getDatabaseId() {
        return CURRENT_DATABASE_ID.get();
    }

    public static void setLookupKey(String key) {
        CURRENT_LOOKUP_KEY.set(key);
    }

    public static String getLookupKey() {
        String key = CURRENT_LOOKUP_KEY.get();
        return key != null ? key : PRIMARY_LOOKUP_KEY;
    }

    public static void setDialect(DatabaseDialect dialect) {
        CURRENT_DIALECT.set(dialect);
    }

    public static DatabaseDialect getDialect() {
        return CURRENT_DIALECT.get();
    }

    public static void clear() {
        CURRENT_DATABASE_ID.remove();
        CURRENT_LOOKUP_KEY.remove();
        CURRENT_DIALECT.remove();
    }
}
