package com.spark.ai.service;

import java.util.Locale;

public enum DataIsolationMode {
    TENANT_SHARED(0),
    TENANT_ISOLATED(1),
    PROJECT_SHARED(2),
    PROJECT_ISOLATED(3);

    private final int strictness;

    DataIsolationMode(int strictness) {
        this.strictness = strictness;
    }

    public boolean canContain(DataIsolationMode child) {
        return child.strictness >= strictness;
    }

    public static DataIsolationMode parse(Object value, String fieldName) {
        if (value == null || value.toString().isBlank()) {
            throw new IllegalArgumentException(fieldName + " 不能为空");
        }
        String normalized = value.toString().trim().replace('-', '_').toUpperCase(Locale.ROOT);
        try {
            return DataIsolationMode.valueOf(normalized);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException(fieldName + " 只支持 TENANT_SHARED、TENANT_ISOLATED、PROJECT_SHARED、PROJECT_ISOLATED");
        }
    }

    public static DataIsolationMode parseOrDefault(Object value, DataIsolationMode defaultValue, String fieldName) {
        if (value == null || value.toString().isBlank()) {
            return defaultValue;
        }
        return parse(value, fieldName);
    }
}