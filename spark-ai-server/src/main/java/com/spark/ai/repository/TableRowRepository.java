package com.spark.ai.repository;

import com.spark.ai.entity.TableRowEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface TableRowRepository extends JpaRepository<TableRowEntity, Long> {

    Optional<TableRowEntity> findByTenantIdAndProjectIdAndTableNameAndRowId(
            String tenantId, String projectId, String tableName, String rowId);

    Page<TableRowEntity> findByTenantIdAndProjectIdAndTableName(
            String tenantId, String projectId, String tableName, Pageable pageable);

    List<TableRowEntity> findByTenantIdAndProjectIdAndTableName(
            String tenantId, String projectId, String tableName);

    long countByTenantIdAndProjectIdAndTableName(
            String tenantId, String projectId, String tableName);

    void deleteByTenantIdAndProjectIdAndTableNameAndRowId(
            String tenantId, String projectId, String tableName, String rowId);

    void deleteByTenantIdAndProjectIdAndTableName(
            String tenantId, String projectId, String tableName);

    boolean existsByTenantIdAndProjectIdAndTableNameAndRowId(
            String tenantId, String projectId, String tableName, String rowId);

    /** 列出指定项目下所有不重复的逻辑表名及行数 */
    @Query("SELECT e.tableName, COUNT(e) FROM TableRowEntity e " +
           "WHERE e.tenantId = :tenantId AND e.projectId = :projectId " +
           "GROUP BY e.tableName ORDER BY e.tableName")
    List<Object[]> findTableSummary(
            @Param("tenantId") String tenantId,
            @Param("projectId") String projectId);

    /** keyword 模糊搜索 */
    @Query("SELECT e FROM TableRowEntity e " +
           "WHERE e.tenantId = :tenantId AND e.projectId = :projectId " +
           "AND e.tableName = :tableName AND e.dataJson LIKE %:keyword%")
    Page<TableRowEntity> searchByKeyword(
            @Param("tenantId") String tenantId,
            @Param("projectId") String projectId,
            @Param("tableName") String tableName,
            @Param("keyword") String keyword,
            Pageable pageable);
}
