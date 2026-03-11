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

    Optional<TableRowEntity> findByTableNameAndRowId(String tableName, String rowId);

    Page<TableRowEntity> findByTableName(String tableName, Pageable pageable);

    List<TableRowEntity> findByTableName(String tableName);

    long countByTableName(String tableName);

    void deleteByTableNameAndRowId(String tableName, String rowId);

    void deleteByTableName(String tableName);

    boolean existsByTableNameAndRowId(String tableName, String rowId);

    /** 列出所有不重复的逻辑表名及行数 */
    @Query("SELECT e.tableName, COUNT(e) FROM TableRowEntity e GROUP BY e.tableName ORDER BY e.tableName")
    List<Object[]> findTableSummary();

    /** keyword 模糊搜索（搜索 dataJson 内容） */
    @Query("SELECT e FROM TableRowEntity e WHERE e.tableName = :tableName AND e.dataJson LIKE %:keyword%")
    Page<TableRowEntity> searchByTableNameAndKeyword(
            @Param("tableName") String tableName,
            @Param("keyword") String keyword,
            Pageable pageable);
}
