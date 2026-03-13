package com.spark.ai.repository;

import com.spark.ai.entity.TableSchemaEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface TableSchemaRepository extends JpaRepository<TableSchemaEntity, Long> {

    List<TableSchemaEntity> findByTenantIdAndProjectIdOrderByTableNameAsc(
            String tenantId, String projectId);

    Optional<TableSchemaEntity> findByTenantIdAndProjectIdAndTableName(
            String tenantId, String projectId, String tableName);

    boolean existsByTenantIdAndProjectIdAndTableName(
            String tenantId, String projectId, String tableName);

    void deleteByTenantIdAndProjectIdAndTableName(
            String tenantId, String projectId, String tableName);
}
