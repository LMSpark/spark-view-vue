package com.spark.ai.repository;

import com.spark.ai.entity.PageConfigFileEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PageConfigFileRepository extends JpaRepository<PageConfigFileEntity, Long> {
    Optional<PageConfigFileEntity> findByTenantIdAndProjectIdAndPageIdAndFilename(
            String tenantId, String projectId, String pageId, String filename);

    boolean existsByTenantIdAndProjectIdAndPageIdAndFilename(
            String tenantId, String projectId, String pageId, String filename);

    List<PageConfigFileEntity> findByTenantIdAndProjectIdAndPageId(
            String tenantId, String projectId, String pageId);

    List<PageConfigFileEntity> findByTenantIdAndProjectId(String tenantId, String projectId);

    void deleteByTenantIdAndProjectIdAndPageId(String tenantId, String projectId, String pageId);
}
