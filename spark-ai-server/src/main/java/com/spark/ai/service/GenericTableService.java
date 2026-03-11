package com.spark.ai.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.entity.TableRowEntity;
import com.spark.ai.repository.TableRowRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.util.*;

/**
 * 通用表数据 CRUD 服务。
 *
 * <p>以 {@code table_data} 表为通用行存储后端，行数据以 JSON 字符串存储。
 * 调用方通过逻辑表名（tableName）区分不同业务实体（如 Users、Orders）。
 *
 * <h3>SPARK DataTable 接入</h3>
 * 在 pagedata.json 的 table.api 段填写对应端点即可：
 * <pre>
 * "api": {
 *   "list":   { "url": "/api/data/Users",     "method": "GET"    },
 *   "create": { "url": "/api/data/Users",     "method": "POST"   },
 *   "update": { "url": "/api/data/Users/:id", "method": "PUT"    },
 *   "delete": { "url": "/api/data/Users/:id", "method": "DELETE" }
 * }
 * </pre>
 */
@Service
public class GenericTableService {

    private static final Logger log = LoggerFactory.getLogger(GenericTableService.class);

    /** 每次请求最多返回行数（防止单请求拉取超大数据集） */
    private static final int MAX_PAGE_SIZE = 500;

    private final TableRowRepository rowRepo;
    private final ObjectMapper objectMapper;

    public GenericTableService(TableRowRepository rowRepo, ObjectMapper objectMapper) {
        this.rowRepo = rowRepo;
        this.objectMapper = objectMapper;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 表列表
    // ─────────────────────────────────────────────────────────────────────────

    /** 列出所有逻辑表名及行数。 */
    public List<Map<String, Object>> listTables() {
        List<Object[]> summary = rowRepo.findTableSummary();
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object[] row : summary) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("tableName", row[0]);
            item.put("rowCount", row[1]);
            result.add(item);
        }
        return result;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 行列表（分页 + 搜索）
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 分页查询指定逻辑表的行数据。
     *
     * @param tableName 逻辑表名
     * @param page      页码（1-based，传 0 返回全部，最多 MAX_PAGE_SIZE 条）
     * @param pageSize  每页行数（最大 MAX_PAGE_SIZE）
     * @param sort      排序字段（目前仅支持 "createdAt"/"updatedAt"）
     * @param order     "asc" 或 "desc"
     * @param keyword   全文搜索关键词（匹配 dataJson）
     */
    public Map<String, Object> listRows(String tableName, int page, int pageSize,
                                         String sort, String order, String keyword)
            throws IOException {
        validateTableName(tableName);

        int safePage = Math.max(page - 1, 0);           // 转 0-based
        int safeSize = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);

        Sort.Direction dir = "asc".equalsIgnoreCase(order)
                ? Sort.Direction.ASC : Sort.Direction.DESC;
        String sortField = resolveSortField(sort);
        Pageable pageable = PageRequest.of(safePage, safeSize, Sort.by(dir, sortField));

        Page<TableRowEntity> pageResult;
        if (keyword != null && !keyword.isBlank()) {
            pageResult = rowRepo.searchByTableNameAndKeyword(tableName, keyword, pageable);
        } else {
            pageResult = rowRepo.findByTableName(tableName, pageable);
        }

        List<Map<String, Object>> rows = new ArrayList<>();
        for (TableRowEntity entity : pageResult.getContent()) {
            rows.add(entityToMap(entity));
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rows", rows);
        result.put("total", pageResult.getTotalElements());
        result.put("page", page);
        result.put("pageSize", safeSize);
        result.put("totalPages", pageResult.getTotalPages());
        return result;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 单行读取
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 按 id 读取单行。
     *
     * @throws NoSuchElementException 若行不存在
     */
    public Map<String, Object> getRow(String tableName, String rowId) throws IOException {
        validateTableName(tableName);
        TableRowEntity entity = rowRepo.findByTableNameAndRowId(tableName, rowId)
                .orElseThrow(() -> new NoSuchElementException(
                        "Row not found: " + tableName + "/" + rowId));
        return entityToMap(entity);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 创建行
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 创建新行。若 body 中包含 "id" 字段则使用该值作为 rowId，否则自动生成 UUID。
     *
     * @param tableName 逻辑表名
     * @param body      行数据（Map，不必含 id）
     * @return 含 id 的完整行数据
     * @throws IllegalArgumentException 若 rowId 已存在
     */
    @Transactional
    public Map<String, Object> createRow(String tableName,
                                          Map<String, Object> body) throws IOException {
        validateTableName(tableName);

        String rowId = extractRowId(body);
        if (rowRepo.existsByTableNameAndRowId(tableName, rowId)) {
            throw new IllegalArgumentException("行 id 已存在: " + rowId);
        }

        // 从 body 移除 id（不存入 dataJson，避免重复）
        Map<String, Object> data = new LinkedHashMap<>(body);
        data.remove("id");

        TableRowEntity entity = new TableRowEntity();
        entity.setTableName(tableName);
        entity.setRowId(rowId);
        entity.setDataJson(objectMapper.writeValueAsString(data));
        entity = rowRepo.save(entity);

        log.info("[GenericTable] 创建行 {}/{}", tableName, rowId);
        return entityToMap(entity);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 更新行（完整替换）
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 全量替换行数据（PUT 语义）。
     *
     * @throws NoSuchElementException 若行不存在
     */
    @Transactional
    public Map<String, Object> replaceRow(String tableName, String rowId,
                                           Map<String, Object> body) throws IOException {
        validateTableName(tableName);
        TableRowEntity entity = rowRepo.findByTableNameAndRowId(tableName, rowId)
                .orElseThrow(() -> new NoSuchElementException(
                        "Row not found: " + tableName + "/" + rowId));

        Map<String, Object> data = new LinkedHashMap<>(body);
        data.remove("id");
        entity.setDataJson(objectMapper.writeValueAsString(data));
        entity = rowRepo.save(entity);

        log.info("[GenericTable] 替换行 {}/{}", tableName, rowId);
        return entityToMap(entity);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 局部更新行（合并 patch，PATCH 语义）
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 局部更新行数据（PATCH 语义，原字段与 patch 合并）。
     *
     * @throws NoSuchElementException 若行不存在
     */
    @Transactional
    public Map<String, Object> patchRow(String tableName, String rowId,
                                         Map<String, Object> patch) throws IOException {
        validateTableName(tableName);
        TableRowEntity entity = rowRepo.findByTableNameAndRowId(tableName, rowId)
                .orElseThrow(() -> new NoSuchElementException(
                        "Row not found: " + tableName + "/" + rowId));

        // 反序列化原数据并合并
        Map<String, Object> existing = entity.getDataJson() != null
                ? objectMapper.readValue(entity.getDataJson(),
                        new TypeReference<Map<String, Object>>() {})
                : new LinkedHashMap<>();

        existing.putAll(patch);
        existing.remove("id");
        entity.setDataJson(objectMapper.writeValueAsString(existing));
        entity = rowRepo.save(entity);

        log.info("[GenericTable] 更新行 {}/{}", tableName, rowId);
        return entityToMap(entity);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 删除
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 删除单行。
     *
     * @throws NoSuchElementException 若行不存在
     */
    @Transactional
    public void deleteRow(String tableName, String rowId) {
        validateTableName(tableName);
        if (!rowRepo.existsByTableNameAndRowId(tableName, rowId)) {
            throw new NoSuchElementException("Row not found: " + tableName + "/" + rowId);
        }
        rowRepo.deleteByTableNameAndRowId(tableName, rowId);
        log.info("[GenericTable] 删除行 {}/{}", tableName, rowId);
    }

    /**
     * 清空整个逻辑表（删除所有行）。
     */
    @Transactional
    public long truncateTable(String tableName) {
        validateTableName(tableName);
        long count = rowRepo.countByTableName(tableName);
        rowRepo.deleteByTableName(tableName);
        log.info("[GenericTable] 清空表 {} ({} 行)", tableName, count);
        return count;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 批量操作
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 批量 upsert（有则更新，无则插入）。
     *
     * @param tableName 逻辑表名
     * @param rows      行数据列表（每行需含 "id" 字段）
     * @return upserted 行数
     */
    @Transactional
    public int batchUpsert(String tableName, List<Map<String, Object>> rows) throws IOException {
        validateTableName(tableName);
        int count = 0;
        for (Map<String, Object> row : rows) {
            String rowId = extractRowId(row);
            Map<String, Object> data = new LinkedHashMap<>(row);
            data.remove("id");
            String json = objectMapper.writeValueAsString(data);

            Optional<TableRowEntity> opt = rowRepo.findByTableNameAndRowId(tableName, rowId);
            if (opt.isPresent()) {
                TableRowEntity entity = opt.get();
                entity.setDataJson(json);
                rowRepo.save(entity);
            } else {
                TableRowEntity entity = new TableRowEntity();
                entity.setTableName(tableName);
                entity.setRowId(rowId);
                entity.setDataJson(json);
                rowRepo.save(entity);
            }
            count++;
        }
        log.info("[GenericTable] 批量 upsert 表 {} ({} 行)", tableName, count);
        return count;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 工具
    // ─────────────────────────────────────────────────────────────────────────

    /** 将 entity 转为前端可用的 Map（id 字段 = rowId）。 */
    private Map<String, Object> entityToMap(TableRowEntity entity) throws IOException {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", entity.getRowId());

        if (entity.getDataJson() != null && !entity.getDataJson().isBlank()) {
            Map<String, Object> data = objectMapper.readValue(entity.getDataJson(),
                    new TypeReference<Map<String, Object>>() {});
            map.putAll(data);
        }

        map.put("_createdAt", entity.getCreatedAt().toString());
        map.put("_updatedAt", entity.getUpdatedAt().toString());
        return map;
    }

    /** 从 body 中取 id 字段，若不存在则自动生成 UUID。 */
    private String extractRowId(Map<String, Object> body) {
        Object idVal = body.get("id");
        if (idVal != null && !String.valueOf(idVal).isBlank()) {
            return String.valueOf(idVal);
        }
        return UUID.randomUUID().toString();
    }

    /** 校验表名：只允许字母/数字/下划线/连字符，防止 SQL 注入（虽然 JPA 已参数化）。 */
    private void validateTableName(String tableName) {
        if (tableName == null || tableName.isBlank()) {
            throw new IllegalArgumentException("表名不能为空");
        }
        if (!tableName.matches("[A-Za-z0-9_\\-]+")) {
            throw new IllegalArgumentException("表名只允许字母、数字、下划线、连字符: " + tableName);
        }
        if (tableName.length() > 128) {
            throw new IllegalArgumentException("表名过长（最大 128 字符）");
        }
    }

    /** 将前端传入的排序字段映射到 entity 字段名。 */
    private String resolveSortField(String sort) {
        if (sort == null || sort.isBlank()) return "createdAt";
        return switch (sort.toLowerCase()) {
            case "createdat", "created_at" -> "createdAt";
            case "updatedat", "updated_at" -> "updatedAt";
            default -> "createdAt";
        };
    }
}
