package com.spark.ai.repository;

import com.spark.ai.entity.ProjectEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ProjectRepository extends JpaRepository<ProjectEntity, Long> {

    List<ProjectEntity> findByTenantIdOrderByOrderAscCreatedAtAsc(String tenantId);

    Optional<ProjectEntity> findByTenantIdAndProjectId(String tenantId, String projectId);

    boolean existsByTenantIdAndProjectId(String tenantId, String projectId);

    void deleteByTenantIdAndProjectId(String tenantId, String projectId);
}
