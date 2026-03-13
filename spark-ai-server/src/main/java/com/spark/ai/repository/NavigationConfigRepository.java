package com.spark.ai.repository;

import com.spark.ai.entity.NavigationConfigEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface NavigationConfigRepository extends JpaRepository<NavigationConfigEntity, Long> {

    Optional<NavigationConfigEntity> findByTenantIdAndProjectId(String tenantId, String projectId);
}
