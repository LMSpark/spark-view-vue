package com.spark.ai.service;

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
public class DataModelRelationService {

    private static final Logger log = LoggerFactory.getLogger(DataModelRelationService.class);

    private final JdbcTemplate jdbc;

    public DataModelRelationService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Map<String, Object>> listRelations(Long tableId) {
        return jdbc.queryForList(
                "SELECT r.*,"
                        + " pt.LOGICAL_TABLE_NAME AS parentTableName,"
                        + " ct.LOGICAL_TABLE_NAME AS childTableName"
                        + " FROM DATA_MODEL_RELATION r"
                        + " JOIN DATA_MODEL_TABLE pt ON r.PARENT_TABLE_ID = pt.ID"
                        + " JOIN DATA_MODEL_TABLE ct ON r.CHILD_TABLE_ID = ct.ID"
                        + " WHERE r.PARENT_TABLE_ID = ? OR r.CHILD_TABLE_ID = ?"
                        + " ORDER BY r.CREATED_AT DESC",
                tableId, tableId);
    }

    public List<Map<String, Object>> listAllRelations(String tenantId, String projectId) {
        return jdbc.queryForList(
                "SELECT r.*,"
                        + " pt.LOGICAL_TABLE_NAME AS parentTableName,"
                        + " ct.LOGICAL_TABLE_NAME AS childTableName"
                        + " FROM DATA_MODEL_RELATION r"
                        + " JOIN DATA_MODEL_TABLE pt ON r.PARENT_TABLE_ID = pt.ID"
                        + " JOIN DATA_MODEL_TABLE ct ON r.CHILD_TABLE_ID = ct.ID"
                        + " WHERE pt.TENANT_ID = ? AND pt.PROJECT_ID = ?"
                        + " ORDER BY r.CREATED_AT DESC",
                tenantId, projectId);
    }

    @Transactional
    public Map<String, Object> createRelation(Map<String, Object> body) {
        Long parentTableId = longParam(body.get("parentTableId"), null);
        Long childTableId = longParam(body.get("childTableId"), null);
        String parentField = require(body.get("parentField"), "parentField");
        String childField = require(body.get("childField"), "childField");
        String relationName = stringOrDefault(body.get("relationName"),
                parentTableId + "_" + childTableId + "_" + parentField);

        if (parentTableId == null || childTableId == null) {
            throw new IllegalArgumentException("parentTableId 和 childTableId 不能为空");
        }

        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO DATA_MODEL_RELATION (PARENT_TABLE_ID, CHILD_TABLE_ID, PARENT_FIELD, CHILD_FIELD, RELATION_NAME, CREATED_AT, UPDATED_AT)"
                            + " VALUES (?, ?, ?, ?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS
            );
            LocalDateTime now = LocalDateTime.now();
            statement.setLong(1, parentTableId);
            statement.setLong(2, childTableId);
            statement.setString(3, parentField);
            statement.setString(4, childField);
            statement.setString(5, relationName);
            statement.setObject(6, now);
            statement.setObject(7, now);
            return statement;
        }, keyHolder);

        Long id = generatedId(keyHolder);
        log.info("[Relation] 创建表关系 id={}, {}:{} → {}:{}", id,
                parentTableId, parentField, childTableId, childField);
        return jdbc.queryForMap("SELECT * FROM DATA_MODEL_RELATION WHERE ID = ?", id);
    }

    @Transactional
    public void deleteRelation(Long id) {
        jdbc.update("DELETE FROM DATA_MODEL_RELATION WHERE ID = ?", id);
        log.info("[Relation] 删除表关系 id={}", id);
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

    private Long longParam(Object value, Long defaultValue) {
        if (value instanceof Number n) return n.longValue();
        if (value instanceof String s) {
            try { return Long.parseLong(s.trim()); } catch (NumberFormatException e) { return defaultValue; }
        }
        return defaultValue;
    }

    private static Long generatedId(KeyHolder keyHolder) {
        Number key = keyHolder.getKey();
        if (key == null) {
            throw new IllegalStateException("创建表关系后未返回主键");
        }
        return key.longValue();
    }
}
