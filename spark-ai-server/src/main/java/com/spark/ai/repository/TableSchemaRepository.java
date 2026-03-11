package com.spark.ai.repository;

import com.spark.ai.entity.TableSchemaEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TableSchemaRepository extends JpaRepository<TableSchemaEntity, String> {

    List<TableSchemaEntity> findAllByOrderByTableNameAsc();

    boolean existsByTableName(String tableName);
}
