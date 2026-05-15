package com.spark.ai.repository;

import com.spark.ai.entity.AiContextSnapshotEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;

import java.time.Instant;

public interface AiContextSnapshotRepository extends JpaRepository<AiContextSnapshotEntity, Long> {

    @Modifying
    int deleteBySessionId(String sessionId);

    @Modifying
    int deleteByCreatedAtBefore(Instant cutoff);
}
