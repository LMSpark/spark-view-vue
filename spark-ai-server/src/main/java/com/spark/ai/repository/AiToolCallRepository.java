package com.spark.ai.repository;

import com.spark.ai.entity.AiToolCallEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;

import java.time.Instant;

public interface AiToolCallRepository extends JpaRepository<AiToolCallEntity, Long> {

    @Modifying
    int deleteBySessionId(String sessionId);

    @Modifying
    int deleteByCreatedAtBefore(Instant cutoff);
}
