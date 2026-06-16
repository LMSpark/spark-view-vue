package com.spark.ai.repository;

import com.spark.ai.entity.PlanningAttachmentEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PlanningAttachmentRepository extends JpaRepository<PlanningAttachmentEntity, Long> {
    Optional<PlanningAttachmentEntity> findByAttachmentRef(String attachmentRef);
    Optional<PlanningAttachmentEntity> findByAttachmentRefAndTenantIdAndProjectId(
            String attachmentRef,
            String tenantId,
            String projectId);
}
