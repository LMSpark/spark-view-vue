package com.spark.ai.repository;

import com.spark.ai.entity.TenantConfigEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TenantConfigRepository extends JpaRepository<TenantConfigEntity, String> {
    List<TenantConfigEntity> findByDeletedAtIsNull();
}
