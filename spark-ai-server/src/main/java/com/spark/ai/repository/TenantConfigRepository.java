package com.spark.ai.repository;

import com.spark.ai.entity.TenantConfigEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TenantConfigRepository extends JpaRepository<TenantConfigEntity, String> {
}
