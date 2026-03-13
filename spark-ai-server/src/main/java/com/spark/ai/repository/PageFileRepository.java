package com.spark.ai.repository;

import com.spark.ai.entity.PageFileEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PageFileRepository extends JpaRepository<PageFileEntity, Long> {

    Optional<PageFileEntity> findByTenantIdAndProjectIdAndPageIdAndFilename(
            String tenantId, String projectId, String pageId, String filename);

    List<PageFileEntity> findByTenantIdAndProjectIdAndPageId(
            String tenantId, String projectId, String pageId);

    void deleteByTenantIdAndProjectIdAndPageId(
            String tenantId, String projectId, String pageId);
}
