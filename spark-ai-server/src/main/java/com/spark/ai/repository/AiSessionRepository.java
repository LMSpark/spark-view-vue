package com.spark.ai.repository;

import com.spark.ai.entity.AiSessionEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface AiSessionRepository extends JpaRepository<AiSessionEntity, String> {

    List<AiSessionEntity> findByUpdatedAtBefore(Instant cutoff);

    @Modifying
    @Query("delete from AiSessionEntity s where s.updatedAt < :cutoff")
    int deleteExpired(@Param("cutoff") Instant cutoff);
}
