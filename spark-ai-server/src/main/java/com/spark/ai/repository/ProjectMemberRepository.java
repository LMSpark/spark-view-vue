package com.spark.ai.repository;

import com.spark.ai.entity.ProjectMemberEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ProjectMemberRepository extends JpaRepository<ProjectMemberEntity, Long> {
    boolean existsByTenantIdAndProjectIdAndUsername(String tenantId, String projectId, String username);

    List<ProjectMemberEntity> findByTenantIdAndProjectId(String tenantId, String projectId);
}
