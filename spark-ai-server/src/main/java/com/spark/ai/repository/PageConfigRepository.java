package com.spark.ai.repository;

import com.spark.ai.entity.PageConfigEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PageConfigRepository extends JpaRepository<PageConfigEntity, Long> {

    List<PageConfigEntity> findByTenantIdAndProjectIdOrderByCreatedAtAsc(String tenantId, String projectId);

    Optional<PageConfigEntity> findByTenantIdAndProjectIdAndPageId(String tenantId, String projectId, String pageId);

    boolean existsByTenantIdAndProjectIdAndPageId(String tenantId, String projectId, String pageId);

    void deleteByTenantIdAndProjectIdAndPageId(String tenantId, String projectId, String pageId);
}
