package com.spark.ai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.crud.FilterExpressionSqlBuilder;
import com.spark.ai.crud.FilterExpressionSqlBuilder.SqlFragment;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.Statement;
import java.sql.Timestamp;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

/**
 * 元数据驱动的统一数据 CRUD、DataView 查询、树查询和多表异步更新服务。
 */
@Service
public class DynamicDataService {

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final DynamicDataModelService modelService;
    private final SseService sseService;

    public DynamicDataService(
            JdbcTemplate jdbcTemplate,
            ObjectMapper objectMapper,
            DynamicDataModelService modelService,
            SseService sseService
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.modelService = modelService;
        this.sseService = sseService;
    }

    public Map<String, Object> query(String tenantId, String projectId, String tableName, Map<String, Object> body) {
        DynamicDataModelService.TableDefinition definition = modelService.requireDefinition(tenantId, projectId, tableName);
        QuerySpec spec = resolveQuerySpec(definition, body);
        if (spec.isTreeQuery()) {
            return queryTree(tenantId, projectId, definition, spec);
        }
        return queryFlat(tenantId, projectId, definition, spec);
    }

    @Transactional
    public Map<String, Object> createRecord(String tenantId, String projectId, String tableName, Map<String, Object> body) {
        DynamicDataModelService.TableDefinition definition = modelService.requireDefinition(tenantId, projectId, tableName);
        DynamicDataModelService.ColumnInfo pk = primaryKeyColumn(definition);
        List<DynamicDataModelService.ColumnInfo> insertColumns = definition.columns().stream()
                .filter(column -> !column.autoIncrement())
                .filter(column -> body.containsKey(column.columnName()))
                .toList();

        List<String> physicalColumns = new ArrayList<>();
        List<Object> args = new ArrayList<>();
        physicalColumns.add(DynamicDataModelService.q("TENANT_ID"));
        args.add(tenantId);
        physicalColumns.add(DynamicDataModelService.q("PROJECT_ID"));
        args.add(projectId);
        for (DynamicDataModelService.ColumnInfo column : insertColumns) {
            physicalColumns.add(DynamicDataModelService.q(column.physicalColumnName()));
            args.add(toDbValue(column, body.get(column.columnName())));
        }

        String placeholders = String.join(", ", Collections.nCopies(physicalColumns.size(), "?"));
        String sql = "INSERT INTO " + DynamicDataModelService.q(definition.table().physicalTableName())
                + " (" + String.join(", ", physicalColumns) + ") VALUES (" + placeholders + ")";

        Object pkValue = body.get(pk.columnName());
        if (pk.autoIncrement()) {
            KeyHolder keyHolder = new GeneratedKeyHolder();
            jdbcTemplate.update(connection -> {
                PreparedStatement statement = connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
                for (int i = 0; i < args.size(); i++) {
                    statement.setObject(i + 1, args.get(i));
                }
                return statement;
            }, keyHolder);
            Number key = keyHolder.getKey();
            if (key != null) {
                pkValue = key;
            }
        } else {
            jdbcTemplate.update(sql, args.toArray());
        }

        Map<String, Object> created = getRecord(tenantId, projectId, tableName, Map.of(pk.columnName(), pkValue));
        emitDataChange(tenantId, projectId, tableName, "create", null);
        return created;
    }

    public Map<String, Object> getRecord(String tenantId, String projectId, String tableName, Map<String, Object> pkPayload) {
        DynamicDataModelService.TableDefinition definition = modelService.requireDefinition(tenantId, projectId, tableName);
        DynamicDataModelService.ColumnInfo pk = primaryKeyColumn(definition);
        Object pkValue = readRequired(pkPayload, pk.columnName());
        List<Object> args = new ArrayList<>();
        args.add(tenantId);
        args.add(projectId);
        args.add(pkValue);
        List<Map<String, Object>> rows = jdbcTemplate.query(
                "SELECT " + projection(definition.columns()) + " FROM " + DynamicDataModelService.q(definition.table().physicalTableName())
                        + " WHERE " + DynamicDataModelService.q("TENANT_ID") + " = ?"
                        + " AND " + DynamicDataModelService.q("PROJECT_ID") + " = ?"
                        + " AND " + DynamicDataModelService.q(pk.physicalColumnName()) + " = ?",
                (rs, rowNum) -> rowMap(rs, definition.columns()),
                args.toArray()
        );
        return rows.isEmpty() ? null : rows.get(0);
    }

    @Transactional
    public Map<String, Object> updateRecord(String tenantId, String projectId, String tableName, Map<String, Object> body) {
        DynamicDataModelService.TableDefinition definition = modelService.requireDefinition(tenantId, projectId, tableName);
        DynamicDataModelService.ColumnInfo pk = primaryKeyColumn(definition);
        Object pkValue = readRequired(body, pk.columnName());

        List<String> assignments = new ArrayList<>();
        List<Object> args = new ArrayList<>();
        for (DynamicDataModelService.ColumnInfo column : definition.columns()) {
            if (column.primaryKey() || !body.containsKey(column.columnName())) continue;
            assignments.add(DynamicDataModelService.q(column.physicalColumnName()) + " = ?");
            args.add(toDbValue(column, body.get(column.columnName())));
        }
        if (assignments.isEmpty()) {
            return requireRecord(tenantId, projectId, tableName, Map.of(pk.columnName(), pkValue));
        }
        args.add(tenantId);
        args.add(projectId);
        args.add(pkValue);

        int updated = jdbcTemplate.update(
                "UPDATE " + DynamicDataModelService.q(definition.table().physicalTableName())
                        + " SET " + String.join(", ", assignments)
                        + " WHERE " + DynamicDataModelService.q("TENANT_ID") + " = ?"
                        + " AND " + DynamicDataModelService.q("PROJECT_ID") + " = ?"
                        + " AND " + DynamicDataModelService.q(pk.physicalColumnName()) + " = ?",
                args.toArray()
        );
        if (updated == 0) {
            throw new NoSuchElementException("记录不存在: " + pkValue);
        }
        Map<String, Object> record = requireRecord(tenantId, projectId, tableName, Map.of(pk.columnName(), pkValue));
        emitDataChange(tenantId, projectId, tableName, "update", null);
        return record;
    }

    @Transactional
    public void deleteRecord(String tenantId, String projectId, String tableName, Map<String, Object> pkPayload) {
        DynamicDataModelService.TableDefinition definition = modelService.requireDefinition(tenantId, projectId, tableName);
        DynamicDataModelService.ColumnInfo pk = primaryKeyColumn(definition);
        Object pkValue = readRequired(pkPayload, pk.columnName());
        int deleted = jdbcTemplate.update(
                "DELETE FROM " + DynamicDataModelService.q(definition.table().physicalTableName())
                        + " WHERE " + DynamicDataModelService.q("TENANT_ID") + " = ?"
                        + " AND " + DynamicDataModelService.q("PROJECT_ID") + " = ?"
                        + " AND " + DynamicDataModelService.q(pk.physicalColumnName()) + " = ?",
                tenantId,
                projectId,
                pkValue
        );
        if (deleted == 0) {
            throw new NoSuchElementException("记录不存在: " + pkValue);
        }
        emitDataChange(tenantId, projectId, tableName, "delete", null);
    }

    public Map<String, Object> batchCreate(String tenantId, String projectId, String tableName, List<Map<String, Object>> rows) {
        List<Map<String, Object>> results = new ArrayList<>();
        int success = 0;
        for (Map<String, Object> row : rows) {
            try {
                results.add(Map.of("success", true, "data", createRecord(tenantId, projectId, tableName, row)));
                success++;
            } catch (Exception e) {
                results.add(Map.of("success", false, "message", e.getMessage()));
            }
        }
        return batchResult(results, success);
    }

    public Map<String, Object> batchUpdate(String tenantId, String projectId, String tableName, List<Map<String, Object>> rows) {
        List<Map<String, Object>> results = new ArrayList<>();
        int success = 0;
        for (Map<String, Object> row : rows) {
            try {
                results.add(Map.of("success", true, "data", updateRecord(tenantId, projectId, tableName, row)));
                success++;
            } catch (Exception e) {
                results.add(Map.of("success", false, "message", e.getMessage()));
            }
        }
        return batchResult(results, success);
    }

    public Map<String, Object> batchDelete(String tenantId, String projectId, String tableName, List<Map<String, Object>> pks) {
        List<Map<String, Object>> results = new ArrayList<>();
        int success = 0;
        for (Map<String, Object> pk : pks) {
            try {
                deleteRecord(tenantId, projectId, tableName, pk);
                results.add(Map.of("success", true, "data", true));
                success++;
            } catch (Exception e) {
                results.add(Map.of("success", false, "message", e.getMessage()));
            }
        }
        return batchResult(results, success);
    }

    public Map<String, Object> treeChildren(String tenantId, String projectId, String tableName, Map<String, Object> body) {
        DynamicDataModelService.TableDefinition definition = modelService.requireDefinition(tenantId, projectId, tableName);
        QuerySpec spec = resolveQuerySpec(definition, Map.of("query", body == null ? Map.of() : body));
        TreeFields fields = treeFields(definition, spec.treeConfig());
        Object parentId = normalizeTreeId(body == null ? null : body.get("parentId"));
        Integer limit = readNullablePositiveInt(body == null ? null : body.get("limit"), null, "limit");
        List<Map<String, Object>> rows = fetchTreeRowsByParent(tenantId, projectId, definition, fields, parentId, limit);
        return Map.of("rows", rows.stream().map(row -> toFlatTreeNode(row, fields)).toList());
    }

    public Map<String, Object> treePath(String tenantId, String projectId, String tableName, Map<String, Object> body) {
        DynamicDataModelService.TableDefinition definition = modelService.requireDefinition(tenantId, projectId, tableName);
        QuerySpec spec = resolveQuerySpec(definition, Map.of("query", body == null ? Map.of() : body));
        TreeFields fields = treeFields(definition, spec.treeConfig());
        Object id = readRequired(body, "id");
        List<Map<String, Object>> allRows = fetchAllScopedRows(tenantId, projectId, definition, List.of());
        Map<Object, Map<String, Object>> byId = indexBy(allRows, fields.idField());
        List<Object> pathIds = pathIds(id, byId, fields);
        return Map.of("pathIds", pathIds);
    }

    public Map<String, Object> treeSubtree(String tenantId, String projectId, String tableName, Map<String, Object> body) {
        DynamicDataModelService.TableDefinition definition = modelService.requireDefinition(tenantId, projectId, tableName);
        QuerySpec spec = resolveQuerySpec(definition, Map.of("query", body == null ? Map.of() : body));
        TreeFields fields = treeFields(definition, spec.treeConfig());
        Object targetId = readRequired(body, "toId");
        boolean includeTargetChildren = readBoolean(body == null ? null : body.get("includeTargetChildren"), true);
        List<Map<String, Object>> allRows = fetchAllScopedRows(tenantId, projectId, definition, List.of());
        Map<Object, Map<String, Object>> byId = indexBy(allRows, fields.idField());
        Set<Object> includeIds = new LinkedHashSet<>(pathIds(targetId, byId, fields));
        if (includeTargetChildren) {
            for (Map<String, Object> row : allRows) {
                if (Objects.equals(normalizeTreeId(row.get(fields.parentIdField())), normalizeTreeId(targetId))) {
                    includeIds.add(row.get(fields.idField()));
                }
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        for (Object id : includeIds) {
            Map<String, Object> row = byId.get(id);
            if (row != null) {
                result.put(String.valueOf(id), toFlatTreeNode(row, fields));
            }
        }
        return result;
    }

    @Transactional
    public Map<String, Object> treeMove(String tenantId, String projectId, String tableName, Map<String, Object> body) {
        DynamicDataModelService.TableDefinition definition = modelService.requireDefinition(tenantId, projectId, tableName);
        QuerySpec spec = resolveQuerySpec(definition, Map.of("query", body == null ? Map.of() : body));
        TreeFields fields = treeFields(definition, spec.treeConfig());
        Object id = readRequired(body, "id");
        Object newParentId = normalizeTreeId(body.get("newParentId"));
        List<Map<String, Object>> allRows = fetchAllScopedRows(tenantId, projectId, definition, List.of());
        Map<Object, Map<String, Object>> byId = indexBy(allRows, fields.idField());
        if (!byId.containsKey(id)) {
            throw new NoSuchElementException("节点不存在: " + id);
        }
        if (newParentId != null && pathIds(newParentId, byId, fields).contains(id)) {
            throw new IllegalArgumentException("不能将节点移动到自身或子孙节点下");
        }
        DynamicDataModelService.ColumnInfo parentColumn = columnByLogical(definition, fields.parentIdField());
        DynamicDataModelService.ColumnInfo idColumn = columnByLogical(definition, fields.idField());
        jdbcTemplate.update(
                "UPDATE " + DynamicDataModelService.q(definition.table().physicalTableName())
                        + " SET " + DynamicDataModelService.q(parentColumn.physicalColumnName()) + " = ?"
                        + " WHERE " + DynamicDataModelService.q("TENANT_ID") + " = ?"
                        + " AND " + DynamicDataModelService.q("PROJECT_ID") + " = ?"
                        + " AND " + DynamicDataModelService.q(idColumn.physicalColumnName()) + " = ?",
                newParentId,
                tenantId,
                projectId,
                id
        );
        Map<String, Object> node = requireRecord(tenantId, projectId, tableName, Map.of(fields.idField(), id));
        emitDataChange(tenantId, projectId, tableName, "tree-move", null);
        return Map.of("node", toFlatTreeNode(node, fields));
    }

    public List<Map<String, Object>> treeNested(String tenantId, String projectId, String tableName, Map<String, Object> body) {
        DynamicDataModelService.TableDefinition definition = modelService.requireDefinition(tenantId, projectId, tableName);
        Map<String, Object> query = new LinkedHashMap<>(body == null ? Map.of() : body);
        query.put("treeMode", "nested");
        QuerySpec spec = resolveQuerySpec(definition, Map.of("query", query));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) queryTree(tenantId, projectId, definition, spec).get("rows");
        return rows;
    }

    public List<Map<String, Object>> treeNestedSearch(String tenantId, String projectId, String tableName, Map<String, Object> body) {
        DynamicDataModelService.TableDefinition definition = modelService.requireDefinition(tenantId, projectId, tableName);
        Map<String, Object> query = new LinkedHashMap<>(body == null ? Map.of() : body);
        query.put("search", query.get("keyword"));
        QuerySpec spec = resolveQuerySpec(definition, Map.of("query", query));
        TreeFields fields = treeFields(definition, spec.treeConfig());
        List<Map<String, Object>> allRows = fetchAllScopedRows(tenantId, projectId, definition, List.of());
        Map<Object, Map<String, Object>> byId = indexBy(allRows, fields.idField());
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> hits = (List<Map<String, Object>>) queryTree(tenantId, projectId, definition, spec).get("rows");
        Integer limit = readNullablePositiveInt(query.get("limit"), null, "limit");
        if (limit != null && hits.size() > limit) {
            hits = hits.subList(0, limit);
        }
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> hit : flattenTreeRows(hits)) {
            Object id = hit.get(fields.idField());
            List<Map<String, Object>> path = pathIds(id, byId, fields).stream()
                    .map(byId::get)
                    .filter(Objects::nonNull)
                    .map(row -> toFlatTreeNode(row, fields))
                    .toList();
            result.add(Map.of("node", toFlatTreeNode(hit, fields), "path", path));
        }
        return result;
    }

    public Map<String, Object> submitBatchJob(String tenantId, String projectId, Map<String, Object> body) {
        List<Map<String, Object>> operations = readOperations(body);
        String jobId = UUID.randomUUID().toString();
        Timestamp now = Timestamp.from(Instant.now());
        jdbcTemplate.update("""
            INSERT INTO DATA_BATCH_JOB (
                JOB_ID, TENANT_ID, PROJECT_ID, REQUEST_ID, STATUS, TOTAL_COUNT,
                COMPLETED_COUNT, SUCCESS_COUNT, FAILURE_COUNT, PAYLOAD,
                CREATED_AT, UPDATED_AT
            ) VALUES (?, ?, ?, ?, 'queued', ?, 0, 0, 0, ?, ?, ?)
            """,
                jobId,
                tenantId,
                projectId,
                stringOrNull(body.get("requestId")),
                operations.size(),
                writeJson(operations),
                now,
                now
        );
        emitBatchJob(tenantId, projectId, jobId, "queued", 0, operations.size(), null, null);
        CompletableFuture.runAsync(() -> runBatchJob(tenantId, projectId, jobId, operations));
        return Map.of("jobId", jobId, "status", "queued");
    }

    @Transactional
    public Map<String, Object> executeTransaction(String tenantId, String projectId, Map<String, Object> body) {
        List<Map<String, Object>> operations = readOperations(body);
        if (operations.isEmpty()) {
            throw new IllegalArgumentException("operations 不能为空");
        }

        String requestId = body == null ? null : stringOrNull(body.get("requestId"));
        String requestHash = requestId == null ? null : transactionRequestHash(operations);
        Map<String, Object> replayed = requestId == null ? null : readCommittedTransaction(tenantId, projectId, requestId, requestHash);
        if (replayed != null) {
            return replayed;
        }

        String transactionId = UUID.randomUUID().toString();
        if (requestId != null) {
            try {
                insertTransactionCommit(tenantId, projectId, transactionId, requestId, requestHash, operations);
            } catch (DataIntegrityViolationException e) {
                Map<String, Object> committed = readCommittedTransaction(tenantId, projectId, requestId, requestHash);
                if (committed != null) {
                    return committed;
                }
                throw new IllegalArgumentException("事务请求正在处理中: " + requestId, e);
            }
        }

        List<Map<String, Object>> results = new ArrayList<>();
        int index = 0;
        for (Map<String, Object> operation : operations) {
            index++;
            String operationId = stringOrDefault(operation.get("operationId"), String.valueOf(index));
            try {
                Map<String, Object> itemResult = executeTransactionOperation(tenantId, projectId, operation);
                results.add(Map.of(
                        "operationId", operationId,
                        "status", "success",
                        "result", itemResult
                ));
            } catch (Exception e) {
                throw new IllegalArgumentException("事务操作失败[" + operationId + "]: " + e.getMessage(), e);
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("transactionId", transactionId);
        if (requestId != null) result.put("requestId", requestId);
        result.put("operationCount", operations.size());
        result.put("results", results);
        if (requestId != null) {
            completeTransactionCommit(transactionId, result);
        }
        return result;
    }

    private Map<String, Object> queryFlat(
            String tenantId,
            String projectId,
            DynamicDataModelService.TableDefinition definition,
            QuerySpec spec
    ) {
        SqlFragment where = buildWhere(definition, spec.filter());
        List<Object> baseArgs = scopedArgs(tenantId, projectId, where);
        String fromWhere = scopedFromWhere(definition, where);
        int total = count(fromWhere, baseArgs);
        List<Object> args = new ArrayList<>(baseArgs);
        args.add(spec.pageSize());
        args.add((spec.page() - 1) * spec.pageSize());
        List<DynamicDataModelService.ColumnInfo> selected = selectedColumns(definition, spec.fields());
        List<Map<String, Object>> rows = jdbcTemplate.query(
                "SELECT " + projection(selected)
                        + " " + fromWhere
                        + orderBy(definition, spec.sort())
                        + " LIMIT ? OFFSET ?",
                (rs, rowNum) -> rowMap(rs, selected),
                args.toArray()
        );
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rows", rows);
        result.put("total", total);
        result.put("page", spec.page());
        result.put("pageSize", spec.pageSize());
        if (!spec.aggregates().isEmpty()) {
            result.put("aggregateResult", aggregate(fetchAllRows(definition, selected, fromWhere, baseArgs, spec.sort()), spec.aggregates()));
        }
        return result;
    }

    private Map<String, Object> queryTree(
            String tenantId,
            String projectId,
            DynamicDataModelService.TableDefinition definition,
            QuerySpec spec
    ) {
        TreeFields treeFields = treeFields(definition, spec.treeConfig());
        List<DynamicDataModelService.ColumnInfo> selected = selectedColumns(definition, spec.fields());
        List<Map<String, Object>> rows = fetchTreeQueryRows(tenantId, projectId, definition, selected, spec, treeFields);
        Object rootId = normalizeTreeId(spec.query().get("rootId"));
        List<Map<String, Object>> pageRoots = rootRows(rows, treeFields, rootId);
        int total = pageRoots.size();
        int from = Math.min((spec.page() - 1) * spec.pageSize(), pageRoots.size());
        int to = Math.min(from + spec.pageSize(), pageRoots.size());
        Set<Object> rootIds = new LinkedHashSet<>(pageRoots.subList(from, to).stream().map(row -> row.get(treeFields.idField())).toList());
        List<Map<String, Object>> pageRows = includeDescendants(rows, treeFields, rootIds);
        Object rowPayload = "nested".equals(spec.treeMode())
                ? buildNestedRows(pageRows, treeFields, rootId)
                : pageRows;

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rows", rowPayload);
        result.put("total", total);
        result.put("page", spec.page());
        result.put("pageSize", spec.pageSize());
        if (!spec.aggregates().isEmpty()) {
            result.put("aggregateResult", aggregate(rows, spec.aggregates()));
        }
        return result;
    }

    private List<Map<String, Object>> fetchTreeQueryRows(
            String tenantId,
            String projectId,
            DynamicDataModelService.TableDefinition definition,
            List<DynamicDataModelService.ColumnInfo> selected,
            QuerySpec spec,
            TreeFields treeFields
    ) {
        SqlFragment where = buildWhere(definition, spec.filter());
        List<Object> args = scopedArgs(tenantId, projectId, where);
        List<Map<String, Object>> matchingRows = fetchAllRows(definition, selected, scopedFromWhere(definition, where), args, spec.sort());
        if (where.sql().isBlank()) {
            return matchingRows;
        }

        String filterMode = stringOrDefault(spec.treeConfig().get("filterMode"), "include-ancestors");
        if (!"include-ancestors".equals(filterMode)) {
            return matchingRows;
        }

        List<Map<String, Object>> allRows = fetchAllScopedRows(tenantId, projectId, definition, selected);
        Map<Object, Map<String, Object>> allById = indexBy(allRows, treeFields.idField());
        Set<Object> include = new LinkedHashSet<>();
        for (Map<String, Object> row : matchingRows) {
            include.addAll(pathIds(row.get(treeFields.idField()), allById, treeFields));
        }
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> row : allRows) {
            if (include.contains(row.get(treeFields.idField()))) {
                result.add(row);
            }
        }
        return result;
    }

    private List<Map<String, Object>> fetchAllScopedRows(
            String tenantId,
            String projectId,
            DynamicDataModelService.TableDefinition definition,
            List<DynamicDataModelService.ColumnInfo> selectedOverride
    ) {
        List<DynamicDataModelService.ColumnInfo> selected = selectedOverride == null || selectedOverride.isEmpty()
                ? definition.columns()
                : selectedOverride;
        return jdbcTemplate.query(
                "SELECT " + projection(selected)
                        + " FROM " + DynamicDataModelService.q(definition.table().physicalTableName())
                        + " WHERE " + DynamicDataModelService.q("TENANT_ID") + " = ?"
                        + " AND " + DynamicDataModelService.q("PROJECT_ID") + " = ?",
                (rs, rowNum) -> rowMap(rs, selected),
                tenantId,
                projectId
        );
    }

    private List<Map<String, Object>> fetchTreeRowsByParent(
            String tenantId,
            String projectId,
            DynamicDataModelService.TableDefinition definition,
            TreeFields treeFields,
            Object parentId,
            Integer limit
    ) {
        DynamicDataModelService.ColumnInfo parentColumn = columnByLogical(definition, treeFields.parentIdField());
        List<Object> args = new ArrayList<>();
        args.add(tenantId);
        args.add(projectId);
        String parentWhere;
        if (parentId == null) {
            parentWhere = " AND (" + DynamicDataModelService.q(parentColumn.physicalColumnName()) + " IS NULL OR "
                    + DynamicDataModelService.q(parentColumn.physicalColumnName()) + " = '')";
        } else {
            parentWhere = " AND " + DynamicDataModelService.q(parentColumn.physicalColumnName()) + " = ?";
            args.add(parentId);
        }
        String limitSql = "";
        if (limit != null) {
            limitSql = " LIMIT ?";
            args.add(limit);
        }
        return jdbcTemplate.query(
                "SELECT " + projection(definition.columns())
                        + " FROM " + DynamicDataModelService.q(definition.table().physicalTableName())
                        + " WHERE " + DynamicDataModelService.q("TENANT_ID") + " = ?"
                        + " AND " + DynamicDataModelService.q("PROJECT_ID") + " = ?"
                        + parentWhere
                        + orderBy(definition, null)
                        + limitSql,
                (rs, rowNum) -> rowMap(rs, definition.columns()),
                args.toArray()
        );
    }

    private List<Map<String, Object>> fetchAllRows(
            DynamicDataModelService.TableDefinition definition,
            List<DynamicDataModelService.ColumnInfo> selected,
            String fromWhere,
            List<Object> args,
            String sort
    ) {
        return jdbcTemplate.query(
                "SELECT " + projection(selected) + " " + fromWhere + orderBy(definition, sort),
                (rs, rowNum) -> rowMap(rs, selected),
                args.toArray()
        );
    }

    private int count(String fromWhere, List<Object> args) {
        Integer total = jdbcTemplate.queryForObject("SELECT COUNT(*) " + fromWhere, Integer.class, args.toArray());
        return total == null ? 0 : total;
    }

    private String scopedFromWhere(DynamicDataModelService.TableDefinition definition, SqlFragment where) {
        String base = "FROM " + DynamicDataModelService.q(definition.table().physicalTableName())
                + " WHERE " + DynamicDataModelService.q("TENANT_ID") + " = ?"
                + " AND " + DynamicDataModelService.q("PROJECT_ID") + " = ?";
        if (where.sql().isBlank()) {
            return base;
        }
        return base + " AND " + where.sql();
    }

    private List<Object> scopedArgs(String tenantId, String projectId, SqlFragment where) {
        List<Object> args = new ArrayList<>();
        args.add(tenantId);
        args.add(projectId);
        args.addAll(where.parameters());
        return args;
    }

    private SqlFragment buildWhere(DynamicDataModelService.TableDefinition definition, Object filter) {
        Object normalized = normalizeFilter(filter);
        FilterExpressionSqlBuilder builder = new FilterExpressionSqlBuilder(fieldSqlMap(definition));
        return builder.buildWhere(normalized);
    }

    private String orderBy(DynamicDataModelService.TableDefinition definition, String sort) {
        FilterExpressionSqlBuilder builder = new FilterExpressionSqlBuilder(fieldSqlMap(definition));
        DynamicDataModelService.ColumnInfo pk = primaryKeyColumn(definition);
        return builder.buildOrderBy(sort, DynamicDataModelService.q(pk.physicalColumnName()));
    }

    private Map<String, String> fieldSqlMap(DynamicDataModelService.TableDefinition definition) {
        Map<String, String> result = new LinkedHashMap<>();
        for (DynamicDataModelService.ColumnInfo column : definition.columns()) {
            result.put(column.columnName(), DynamicDataModelService.q(column.physicalColumnName()));
        }
        return result;
    }

    private QuerySpec resolveQuerySpec(DynamicDataModelService.TableDefinition definition, Map<String, Object> body) {
        Map<String, Object> query = extractQuery(body);
        String viewId = stringOrDefault(body == null ? null : body.get("viewId"), stringOrDefault(query.get("viewId"), "default"));
        Map<String, Object> storedView = new LinkedHashMap<>(definition.views().getOrDefault(viewId, definition.views().getOrDefault("default", Map.of())));
        Map<String, Object> requestView = readViewConfig(body, query);
        Map<String, Object> mergedView = new LinkedHashMap<>(storedView);
        mergedView.putAll(requestView);

        Object filter = combineFilters(
                mergedView.get("filterExpression"),
                query.get("filter"),
                searchFilter(definition, query.get("search"), mergedView)
        );
        String sort = stringOrDefault(query.get("sort"), serializeSortExpression(mergedView.get("sortExpression")));
        int page = readPositiveInt(query.get("page"), readPositiveInt(mergedView.get("page"), 1, "page"), "page");
        int pageSize = readPositiveInt(query.get("pageSize"), readPositiveInt(mergedView.get("pageSize"), 20, "pageSize"), "pageSize");
        List<String> fields = readStringList(query.get("fields"));
        String treeMode = stringOrDefault(query.get("treeMode"), stringOrDefault(mergedView.get("treeMode"), stringOrDefault(readMap(mergedView.get("treeConfig")).get("treeMode"), "flat")));
        Map<String, Object> treeConfig = readMap(mergedView.get("treeConfig"));
        Map<String, Object> aggregates = readMap(mergedView.get("aggregates"));
        return new QuerySpec(query, mergedView, filter, sort, page, pageSize, fields, treeMode, treeConfig, aggregates);
    }

    private Map<String, Object> extractQuery(Map<String, Object> body) {
        if (body == null) return new LinkedHashMap<>();
        Object query = body.get("query");
        if (query == null) return new LinkedHashMap<>();
        if (!(query instanceof Map<?, ?> rawQuery)) {
            throw new IllegalArgumentException("query 必须是对象");
        }
        return toStringKeyMap(rawQuery);
    }

    private Map<String, Object> readViewConfig(Map<String, Object> body, Map<String, Object> query) {
        Object value = query.get("viewConfig");
        if (value == null && body != null) value = body.get("viewConfig");
        return readMap(value);
    }

    private Object combineFilters(Object... filters) {
        List<Object> normalized = new ArrayList<>();
        for (Object filter : filters) {
            Object current = normalizeFilter(filter);
            if (current != null) normalized.add(current);
        }
        if (normalized.isEmpty()) return null;
        if (normalized.size() == 1) return normalized.get(0);
        return Map.of("type", "and", "children", normalized);
    }

    private Object normalizeFilter(Object filter) {
        if (filter == null) return null;
        if (!(filter instanceof Map<?, ?> rawMap)) return filter;
        Map<String, Object> map = toStringKeyMap(rawMap);
        if (map.containsKey("field") || map.containsKey("type") || map.containsKey("op")) {
            return map;
        }
        List<Object> children = new ArrayList<>();
        for (Map.Entry<String, Object> entry : map.entrySet()) {
            Object value = entry.getValue();
            if (value == null) continue;
            if (value instanceof Collection<?> collection) {
                if (!collection.isEmpty()) {
                    children.add(Map.of("field", entry.getKey(), "op", "in", "value", new ArrayList<>(collection)));
                }
            } else {
                children.add(Map.of("field", entry.getKey(), "op", "==", "value", value));
            }
        }
        if (children.isEmpty()) return null;
        if (children.size() == 1) return children.get(0);
        return Map.of("type", "and", "children", children);
    }

    private Object searchFilter(DynamicDataModelService.TableDefinition definition, Object search, Map<String, Object> viewConfig) {
        if (!(search instanceof String text) || text.isBlank()) return null;
        List<String> fields = readStringList(viewConfig.get("searchFields"));
        if (fields.isEmpty()) {
            Map<String, Object> treeConfig = readMap(viewConfig.get("treeConfig"));
            Object textField = treeConfig.get("textField");
            Object labelField = viewConfig.get("labelField");
            if (textField instanceof String textFieldName) fields.add(textFieldName);
            if (labelField instanceof String labelFieldName) fields.add(labelFieldName);
            for (DynamicDataModelService.ColumnInfo column : definition.columns()) {
                if ("string".equals(column.dataType()) || "text".equals(column.dataType())) {
                    fields.add(column.columnName());
                }
            }
        }
        List<Object> children = new ArrayList<>();
        Set<String> uniqueFields = new LinkedHashSet<>(fields);
        Set<String> validFields = new LinkedHashSet<>(definition.columns().stream().map(DynamicDataModelService.ColumnInfo::columnName).toList());
        for (String field : uniqueFields) {
            if (validFields.contains(field)) {
                children.add(Map.of("field", field, "op", "contains", "value", text.trim()));
            }
        }
        if (children.isEmpty()) return null;
        return Map.of("type", "or", "children", children);
    }

    private String serializeSortExpression(Object value) {
        if (value instanceof String text) return text;
        if (!(value instanceof List<?> list)) return null;
        List<String> parts = new ArrayList<>();
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> raw)) continue;
            Map<String, Object> map = toStringKeyMap(raw);
            Object field = map.get("field");
            if (field instanceof String fieldName && !fieldName.isBlank()) {
                parts.add(fieldName + ":" + stringOrDefault(map.get("direction"), "asc"));
            }
        }
        return parts.isEmpty() ? null : String.join(",", parts);
    }

    private List<DynamicDataModelService.ColumnInfo> selectedColumns(
            DynamicDataModelService.TableDefinition definition,
            List<String> fields
    ) {
        if (fields == null || fields.isEmpty()) {
            return definition.columns();
        }
        Map<String, DynamicDataModelService.ColumnInfo> byName = new LinkedHashMap<>();
        for (DynamicDataModelService.ColumnInfo column : definition.columns()) {
            byName.put(column.columnName(), column);
        }
        List<DynamicDataModelService.ColumnInfo> selected = new ArrayList<>();
        for (String field : fields) {
            DynamicDataModelService.ColumnInfo column = byName.get(field);
            if (column != null) selected.add(column);
        }
        DynamicDataModelService.ColumnInfo pk = primaryKeyColumn(definition);
        if (selected.stream().noneMatch(column -> column.columnName().equals(pk.columnName()))) {
            selected.add(0, pk);
        }
        return selected.isEmpty() ? definition.columns() : selected;
    }

    private String projection(List<DynamicDataModelService.ColumnInfo> columns) {
        return columns.stream()
                .map(column -> DynamicDataModelService.q(column.physicalColumnName()))
                .reduce((left, right) -> left + ", " + right)
                .orElse("*");
    }

    private Map<String, Object> rowMap(ResultSet rs, List<DynamicDataModelService.ColumnInfo> columns) {
        try {
            ResultSetMetaData metaData = rs.getMetaData();
            Set<String> presentLabels = new LinkedHashSet<>();
            for (int i = 1; i <= metaData.getColumnCount(); i++) {
                presentLabels.add(metaData.getColumnLabel(i).toUpperCase(Locale.ROOT));
            }
            Map<String, Object> row = new LinkedHashMap<>();
            for (DynamicDataModelService.ColumnInfo column : columns) {
                if (!presentLabels.contains(column.physicalColumnName().toUpperCase(Locale.ROOT))) continue;
                row.put(column.columnName(), fromDbValue(rs.getObject(column.physicalColumnName())));
            }
            return row;
        } catch (Exception e) {
            throw new IllegalStateException("读取动态表行失败", e);
        }
    }

    private Object fromDbValue(Object value) {
        if (value instanceof Timestamp timestamp) {
            return timestamp.toInstant().toString();
        }
        return value;
    }

    private Object toDbValue(DynamicDataModelService.ColumnInfo column, Object value) {
        if (value == null) return null;
        if (("object".equals(column.dataType()) || "array".equals(column.dataType()) || "text".equals(column.dataType()))
                && !(value instanceof String)) {
            return writeJson(value);
        }
        return value;
    }

    private Map<String, Object> requireRecord(String tenantId, String projectId, String tableName, Map<String, Object> pk) {
        Map<String, Object> record = getRecord(tenantId, projectId, tableName, pk);
        if (record == null) {
            throw new NoSuchElementException("记录不存在");
        }
        return record;
    }

    private DynamicDataModelService.ColumnInfo primaryKeyColumn(DynamicDataModelService.TableDefinition definition) {
        return definition.columns().stream()
                .filter(DynamicDataModelService.ColumnInfo::primaryKey)
                .findFirst()
                .orElseGet(() -> columnByLogical(definition, definition.table().primaryKeyField()));
    }

    private DynamicDataModelService.ColumnInfo columnByLogical(DynamicDataModelService.TableDefinition definition, String field) {
        return definition.columns().stream()
                .filter(column -> column.columnName().equals(field))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("字段不存在: " + field));
    }

    private Object readRequired(Map<String, Object> body, String key) {
        if (body == null || !body.containsKey(key) || body.get(key) == null) {
            throw new IllegalArgumentException(key + " 不能为空");
        }
        return body.get(key);
    }

    private Map<String, Object> batchResult(List<Map<String, Object>> results, int success) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("successCount", success);
        payload.put("failureCount", results.size() - success);
        payload.put("results", results);
        payload.put("errors", results.stream().filter(row -> Boolean.FALSE.equals(row.get("success"))).toList());
        return payload;
    }

    private Map<String, Object> aggregate(List<Map<String, Object>> rows, Map<String, Object> aggregates) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : aggregates.entrySet()) {
            if (!(entry.getValue() instanceof Map<?, ?> rawConfig)) continue;
            Map<String, Object> config = toStringKeyMap(rawConfig);
            String type = stringOrDefault(config.get("type"), "count");
            String field = stringOrDefault(config.get("field"), entry.getKey());
            List<Object> values = rows.stream().map(row -> row.get(field)).toList();
            result.put(entry.getKey(), switch (type) {
                case "sum" -> values.stream().mapToDouble(this::asDouble).sum();
                case "avg" -> values.isEmpty() ? 0 : values.stream().mapToDouble(this::asDouble).average().orElse(0);
                case "min" -> values.stream().filter(Objects::nonNull).mapToDouble(this::asDouble).min().stream().boxed().findFirst().orElse(null);
                case "max" -> values.stream().filter(Objects::nonNull).mapToDouble(this::asDouble).max().stream().boxed().findFirst().orElse(null);
                case "join" -> String.join(stringOrDefault(config.get("separator"), ", "),
                        values.stream().filter(Objects::nonNull).map(String::valueOf).toList());
                default -> values.stream().filter(Objects::nonNull).count();
            });
        }
        return result;
    }

    private double asDouble(Object value) {
        if (value instanceof Number number) return number.doubleValue();
        if (value == null) return 0;
        try {
            return Double.parseDouble(String.valueOf(value));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private TreeFields treeFields(DynamicDataModelService.TableDefinition definition, Map<String, Object> treeConfig) {
        String idField = stringOrDefault(treeConfig.get("idField"), definition.table().primaryKeyField());
        String parentIdField = stringOrDefault(treeConfig.get("parentIdField"), "parentId");
        String textField = stringOrDefault(treeConfig.get("textField"), "name");
        columnByLogical(definition, idField);
        columnByLogical(definition, parentIdField);
        if (definition.columns().stream().noneMatch(column -> column.columnName().equals(textField))) {
            return new TreeFields(idField, parentIdField, idField);
        }
        return new TreeFields(idField, parentIdField, textField);
    }

    private List<Map<String, Object>> rootRows(List<Map<String, Object>> rows, TreeFields fields, Object rootId) {
        return rows.stream()
                .filter(row -> Objects.equals(normalizeTreeId(row.get(fields.parentIdField())), rootId))
                .toList();
    }

    private List<Map<String, Object>> includeDescendants(List<Map<String, Object>> rows, TreeFields fields, Set<Object> rootIds) {
        Map<Object, List<Map<String, Object>>> byParent = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            byParent.computeIfAbsent(normalizeTreeId(row.get(fields.parentIdField())), ignored -> new ArrayList<>()).add(row);
        }
        List<Map<String, Object>> result = new ArrayList<>();
        Deque<Object> queue = new ArrayDeque<>(rootIds);
        Set<Object> visited = new LinkedHashSet<>();
        while (!queue.isEmpty()) {
            Object id = queue.removeFirst();
            if (!visited.add(id)) continue;
            Map<String, Object> row = rows.stream().filter(item -> Objects.equals(item.get(fields.idField()), id)).findFirst().orElse(null);
            if (row != null) result.add(row);
            for (Map<String, Object> child : byParent.getOrDefault(id, List.of())) {
                queue.addLast(child.get(fields.idField()));
            }
        }
        return result;
    }

    private List<Map<String, Object>> buildNestedRows(List<Map<String, Object>> rows, TreeFields fields, Object rootId) {
        Map<Object, Map<String, Object>> clones = new LinkedHashMap<>();
        Map<Object, List<Map<String, Object>>> byParent = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> clone = new LinkedHashMap<>(row);
            clone.put("children", new ArrayList<Map<String, Object>>());
            clones.put(row.get(fields.idField()), clone);
            byParent.computeIfAbsent(normalizeTreeId(row.get(fields.parentIdField())), ignored -> new ArrayList<>()).add(clone);
        }
        for (Map<String, Object> clone : clones.values()) {
            Object parentId = normalizeTreeId(clone.get(fields.parentIdField()));
            Map<String, Object> parent = clones.get(parentId);
            if (parent != null) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> children = (List<Map<String, Object>>) parent.get("children");
                children.add(clone);
            }
        }
        return byParent.getOrDefault(rootId, List.of()).stream()
                .filter(row -> !clones.containsKey(normalizeTreeId(row.get(fields.parentIdField()))))
                .toList();
    }

    private List<Map<String, Object>> flattenTreeRows(List<Map<String, Object>> rows) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            result.add(row);
            Object children = row.get("children");
            if (children instanceof List<?> list) {
                List<Map<String, Object>> childRows = new ArrayList<>();
                for (Object child : list) {
                    if (child instanceof Map<?, ?> rawChild) childRows.add(toStringKeyMap(rawChild));
                }
                result.addAll(flattenTreeRows(childRows));
            }
        }
        return result;
    }

    private Map<Object, Map<String, Object>> indexBy(List<Map<String, Object>> rows, String field) {
        Map<Object, Map<String, Object>> result = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            result.put(row.get(field), row);
        }
        return result;
    }

    private List<Object> pathIds(Object id, Map<Object, Map<String, Object>> byId, TreeFields fields) {
        List<Object> result = new ArrayList<>();
        Set<Object> visited = new LinkedHashSet<>();
        Object current = id;
        while (current != null && byId.containsKey(current) && visited.add(current)) {
            result.add(0, current);
            current = normalizeTreeId(byId.get(current).get(fields.parentIdField()));
        }
        return result;
    }

    private Map<String, Object> toFlatTreeNode(Map<String, Object> row, TreeFields fields) {
        Map<String, Object> node = new LinkedHashMap<>(row);
        node.put("id", row.get(fields.idField()));
        node.put("parentId", normalizeTreeId(row.get(fields.parentIdField())));
        node.put("name", stringOrDefault(row.get(fields.textField()), String.valueOf(row.get(fields.idField()))));
        return node;
    }

    private Object normalizeTreeId(Object id) {
        if (id == null) return null;
        if (id instanceof String text && text.isBlank()) return null;
        return id;
    }

    private void runBatchJob(String tenantId, String projectId, String jobId, List<Map<String, Object>> operations) {
        int completed = 0;
        int success = 0;
        int failure = 0;
        List<Map<String, Object>> results = new ArrayList<>();
        try {
            jdbcTemplate.update("UPDATE DATA_BATCH_JOB SET STATUS = 'running', UPDATED_AT = ? WHERE JOB_ID = ?",
                    Timestamp.from(Instant.now()), jobId);
            emitBatchJob(tenantId, projectId, jobId, "running", completed, operations.size(), null, null);
            for (Map<String, Object> operation : operations) {
                Map<String, Object> itemResult;
                String status;
                String error = null;
                try {
                    itemResult = executeBatchOperation(tenantId, projectId, operation, jobId);
                    status = "success";
                    success++;
                } catch (Exception e) {
                    itemResult = Map.of("message", e.getMessage());
                    status = "failed";
                    error = e.getMessage();
                    failure++;
                }
                completed++;
                results.add(Map.of(
                        "operationId", stringOrDefault(operation.get("operationId"), String.valueOf(completed)),
                        "status", status,
                        "result", itemResult
                ));
                insertJobItem(jobId, operation, status, itemResult, error);
                updateJobProgress(jobId, "running", completed, success, failure, null, null);
                emitBatchJob(tenantId, projectId, jobId, "running", completed, operations.size(), itemResult, error);
            }
            String finalStatus = failure == 0 ? "success" : "failed";
            updateJobProgress(jobId, finalStatus, completed, success, failure, results, failure == 0 ? null : "部分操作失败");
            emitBatchJob(tenantId, projectId, jobId, finalStatus, completed, operations.size(), results, failure == 0 ? null : "部分操作失败");
        } catch (Exception e) {
            updateJobProgress(jobId, "failed", completed, success, failure + 1, results, e.getMessage());
            emitBatchJob(tenantId, projectId, jobId, "failed", completed, operations.size(), results, e.getMessage());
        }
    }

    private Map<String, Object> executeBatchOperation(String tenantId, String projectId, Map<String, Object> operation, String jobId) {
        String tableName = stringOrDefault(operation.get("tableName"), null);
        String op = stringOrDefault(operation.get("op"), stringOrDefault(operation.get("operation"), null));
        if (tableName == null || op == null) {
            throw new IllegalArgumentException("operation.tableName/op 不能为空");
        }
        Map<String, Object> payload = readMap(operation.get("data"));
        if (payload.isEmpty()) payload = readMap(operation.get("pk"));
        Map<String, Object> result = switch (op) {
            case "create" -> createRecord(tenantId, projectId, tableName, readMap(operation.get("data")));
            case "update" -> updateRecord(tenantId, projectId, tableName, merged(readMap(operation.get("data")), readMap(operation.get("pk"))));
            case "delete" -> {
                deleteRecord(tenantId, projectId, tableName, readMap(operation.get("pk")));
                yield Map.of("deleted", true);
            }
            default -> throw new IllegalArgumentException("未知批量操作: " + op);
        };
        emitDataChange(tenantId, projectId, tableName, op, jobId);
        return result;
    }

    private Map<String, Object> executeTransactionOperation(String tenantId, String projectId, Map<String, Object> operation) {
        String tableName = stringOrDefault(operation.get("tableName"), null);
        String op = stringOrDefault(operation.get("op"), stringOrDefault(operation.get("operation"), null));
        if (tableName == null || op == null) {
            throw new IllegalArgumentException("operation.tableName/op 不能为空");
        }
        return switch (op) {
            case "create" -> createRecord(tenantId, projectId, tableName, readMap(operation.get("data")));
            case "update" -> updateRecord(tenantId, projectId, tableName, merged(readMap(operation.get("data")), readMap(operation.get("pk"))));
            case "delete" -> {
                deleteRecord(tenantId, projectId, tableName, readMap(operation.get("pk")));
                yield Map.of("deleted", true);
            }
            default -> throw new IllegalArgumentException("未知事务操作: " + op);
        };
    }

    private void insertJobItem(String jobId, Map<String, Object> operation, String status, Object result, String error) {
        Timestamp now = Timestamp.from(Instant.now());
        jdbcTemplate.update("""
            INSERT INTO DATA_BATCH_JOB_ITEM (
                JOB_ID, OPERATION_ID, TABLE_NAME, OPERATION, STATUS,
                PAYLOAD, RESULT, ERROR_MESSAGE, CREATED_AT, UPDATED_AT
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                jobId,
                stringOrDefault(operation.get("operationId"), null),
                stringOrDefault(operation.get("tableName"), ""),
                stringOrDefault(operation.get("op"), stringOrDefault(operation.get("operation"), "")),
                status,
                writeJson(operation),
                writeJson(result),
                error,
                now,
                now
        );
    }

    private void updateJobProgress(
            String jobId,
            String status,
            int completed,
            int success,
            int failure,
            Object result,
            String error
    ) {
        Timestamp now = Timestamp.from(Instant.now());
        jdbcTemplate.update("""
            UPDATE DATA_BATCH_JOB
            SET STATUS = ?, COMPLETED_COUNT = ?, SUCCESS_COUNT = ?, FAILURE_COUNT = ?,
                RESULT = ?, ERROR_MESSAGE = ?, UPDATED_AT = ?, COMPLETED_AT = CASE WHEN ? IN ('success', 'failed') THEN ? ELSE COMPLETED_AT END
            WHERE JOB_ID = ?
            """,
                status,
                completed,
                success,
                failure,
                result == null ? null : writeJson(result),
                error,
                now,
                status,
                now,
                jobId
        );
    }

    private void insertTransactionCommit(
            String tenantId,
            String projectId,
            String transactionId,
            String requestId,
            String requestHash,
            List<Map<String, Object>> operations
    ) {
        Timestamp now = Timestamp.from(Instant.now());
        jdbcTemplate.update("""
            INSERT INTO DATA_TRANSACTION_COMMIT (
                TRANSACTION_ID, TENANT_ID, PROJECT_ID, REQUEST_ID, REQUEST_HASH,
                STATUS, PAYLOAD, CREATED_AT, UPDATED_AT
            ) VALUES (?, ?, ?, ?, ?, 'running', ?, ?, ?)
            """,
                transactionId,
                tenantId,
                projectId,
                requestId,
                requestHash,
                writeJson(operations),
                now,
                now
        );
    }

    private void completeTransactionCommit(String transactionId, Map<String, Object> result) {
        Timestamp now = Timestamp.from(Instant.now());
        jdbcTemplate.update("""
            UPDATE DATA_TRANSACTION_COMMIT
            SET STATUS = 'success', RESULT = ?, UPDATED_AT = ?, COMPLETED_AT = ?
            WHERE TRANSACTION_ID = ?
            """,
                writeJson(result),
                now,
                now,
                transactionId
        );
    }

    private Map<String, Object> readCommittedTransaction(
            String tenantId,
            String projectId,
            String requestId,
            String requestHash
    ) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList("""
            SELECT REQUEST_HASH, STATUS, RESULT
            FROM DATA_TRANSACTION_COMMIT
            WHERE TENANT_ID = ? AND PROJECT_ID = ? AND REQUEST_ID = ?
            """, tenantId, projectId, requestId);
        if (rows.isEmpty()) {
            return null;
        }

        Map<String, Object> row = rows.get(0);
        if (!Objects.equals(requestHash, row.get("REQUEST_HASH"))) {
            throw new IllegalArgumentException("requestId 已用于不同事务: " + requestId);
        }
        String status = stringOrDefault(row.get("STATUS"), "");
        if (!"success".equals(status)) {
            throw new IllegalArgumentException("事务请求正在处理中: " + requestId);
        }
        Map<String, Object> result = readJsonMap(stringOrDefault(row.get("RESULT"), null));
        result.put("replayed", true);
        return result;
    }

    private void emitBatchJob(String tenantId, String projectId, String jobId, String status, int completed, int total, Object result, String error) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("tenantId", tenantId);
        payload.put("projectId", projectId);
        payload.put("jobId", jobId);
        payload.put("status", status);
        payload.put("completed", completed);
        payload.put("total", total);
        payload.put("timestamp", Instant.now().toEpochMilli());
        if (result != null) payload.put("result", result);
        if (error != null) payload.put("error", error);
        sseService.emit(SseService.EVENT_DATA_BATCH_JOB, payload);
    }

    private void emitDataChange(String tenantId, String projectId, String tableName, String operation, String jobId) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("tenantId", tenantId);
        payload.put("projectId", projectId);
        payload.put("tableName", tableName);
        payload.put("operation", operation);
        payload.put("timestamp", Instant.now().toEpochMilli());
        if (jobId != null) payload.put("jobId", jobId);
        emitAfterCommit(() -> sseService.emit(SseService.EVENT_DATA_CHANGE, payload));
    }

    private void emitAfterCommit(Runnable emitter) {
        if (TransactionSynchronizationManager.isSynchronizationActive()
                && TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    emitter.run();
                }
            });
            return;
        }
        emitter.run();
    }

    private static List<Map<String, Object>> readOperations(Map<String, Object> body) {
        Object operationsValue = body == null ? null : body.get("operations");
        if (!(operationsValue instanceof List<?> rawOperations)) {
            throw new IllegalArgumentException("operations 必须是数组");
        }
        return rawOperations.stream().map(item -> {
            if (!(item instanceof Map<?, ?> rawMap)) {
                throw new IllegalArgumentException("operation 必须是对象");
            }
            return toStringKeyMap(rawMap);
        }).toList();
    }

    private String transactionRequestHash(List<Map<String, Object>> operations) {
        return sha256(writeJson(canonicalizeJson(operations)));
    }

    private static Object canonicalizeJson(Object value) {
        if (value instanceof Map<?, ?> rawMap) {
            Map<String, Object> sorted = new TreeMap<>();
            rawMap.forEach((key, mapValue) -> sorted.put(String.valueOf(key), canonicalizeJson(mapValue)));
            return sorted;
        }
        if (value instanceof List<?> rawList) {
            return rawList.stream().map(DynamicDataService::canonicalizeJson).toList();
        }
        return value;
    }

    private static String sha256(String text) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(text.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) {
                builder.append(String.format("%02x", b));
            }
            return builder.toString();
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 不可用", e);
        }
    }

    private static Map<String, Object> merged(Map<String, Object> data, Map<String, Object> pk) {
        Map<String, Object> result = new LinkedHashMap<>(data);
        result.putAll(pk);
        return result;
    }

    private static Map<String, Object> readMap(Object value) {
        if (value == null) return new LinkedHashMap<>();
        if (!(value instanceof Map<?, ?> raw)) return new LinkedHashMap<>();
        return toStringKeyMap(raw);
    }

    private static List<String> readStringList(Object value) {
        List<String> result = new ArrayList<>();
        if (!(value instanceof List<?> list)) return result;
        for (Object item : list) {
            if (item instanceof String text && !text.isBlank()) {
                result.add(text.trim());
            }
        }
        return result;
    }

    private static int readPositiveInt(Object value, int defaultValue, String fieldName) {
        if (value == null) return defaultValue;
        int result;
        if (value instanceof Number number) {
            result = number.intValue();
        } else {
            result = Integer.parseInt(String.valueOf(value));
        }
        if (result <= 0) throw new IllegalArgumentException(fieldName + " 必须为正整数");
        return result;
    }

    private static Integer readNullablePositiveInt(Object value, Integer defaultValue, String fieldName) {
        if (value == null) return defaultValue;
        return readPositiveInt(value, defaultValue == null ? 1 : defaultValue, fieldName);
    }

    private static boolean readBoolean(Object value, boolean defaultValue) {
        if (value == null) return defaultValue;
        if (value instanceof Boolean bool) return bool;
        return Boolean.parseBoolean(String.valueOf(value));
    }

    private static String stringOrDefault(Object value, String defaultValue) {
        if (value == null) return defaultValue;
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? defaultValue : text;
    }

    private static String stringOrNull(Object value) {
        return stringOrDefault(value, null);
    }

    private static Map<String, Object> toStringKeyMap(Map<?, ?> raw) {
        Map<String, Object> result = new LinkedHashMap<>();
        raw.forEach((key, value) -> result.put(String.valueOf(key), value));
        return result;
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalArgumentException("JSON 序列化失败", e);
        }
    }

    @SuppressWarnings("unused")
    private Map<String, Object> readJsonMap(String json) {
        if (json == null || json.isBlank()) return new LinkedHashMap<>();
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> result = objectMapper.readValue(json, LinkedHashMap.class);
            return result;
        } catch (Exception e) {
            throw new IllegalStateException("读取 JSON 失败", e);
        }
    }

    private record QuerySpec(
            Map<String, Object> query,
            Map<String, Object> viewConfig,
            Object filter,
            String sort,
            int page,
            int pageSize,
            List<String> fields,
            String treeMode,
            Map<String, Object> treeConfig,
            Map<String, Object> aggregates
    ) {
        boolean isTreeQuery() {
            return !treeConfig.isEmpty() || "nested".equals(treeMode) || query.containsKey("rootId") || query.containsKey("parentId") || query.containsKey("depthLimit");
        }
    }

    private record TreeFields(String idField, String parentIdField, String textField) {}
}
