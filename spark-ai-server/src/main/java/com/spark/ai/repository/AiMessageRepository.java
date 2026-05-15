package com.spark.ai.repository;

import com.spark.ai.entity.AiMessageEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;

import java.util.List;
import java.util.Optional;

public interface AiMessageRepository extends JpaRepository<AiMessageEntity, Long> {

    List<AiMessageEntity> findBySessionIdOrderBySeqNoAsc(String sessionId);

    Optional<AiMessageEntity> findTopBySessionIdOrderBySeqNoDesc(String sessionId);

    @Modifying
    int deleteBySessionId(String sessionId);
}
