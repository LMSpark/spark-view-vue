package com.spark.ai.service;

import com.spark.ai.config.AiSessionProperties;
import com.spark.ai.entity.AiSessionEntity;
import com.spark.ai.repository.AiContextSnapshotRepository;
import com.spark.ai.repository.AiMessageRepository;
import com.spark.ai.repository.AiSessionRepository;
import com.spark.ai.repository.AiToolCallRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

@Service
public class AiSessionRetentionJob {

    private static final Logger log = LoggerFactory.getLogger(AiSessionRetentionJob.class);

    private final AiSessionRepository sessionRepository;
    private final AiMessageRepository messageRepository;
    private final AiToolCallRepository toolCallRepository;
    private final AiContextSnapshotRepository contextSnapshotRepository;
    private final AiSessionProperties properties;

    public AiSessionRetentionJob(
            AiSessionRepository sessionRepository,
            AiMessageRepository messageRepository,
            AiToolCallRepository toolCallRepository,
            AiContextSnapshotRepository contextSnapshotRepository,
            AiSessionProperties properties) {
        this.sessionRepository = sessionRepository;
        this.messageRepository = messageRepository;
        this.toolCallRepository = toolCallRepository;
        this.contextSnapshotRepository = contextSnapshotRepository;
        this.properties = properties;
    }

    @Scheduled(cron = "${spark.ai.session.cleanup-cron:0 17 3 * * *}")
    @Transactional
    public void cleanupExpiredSessions() {
        int retentionDays = Math.max(1, properties.getRetentionDays());
        Instant cutoff = Instant.now().minus(retentionDays, ChronoUnit.DAYS);
        int deletedSessions = 0;
        for (AiSessionEntity session : sessionRepository.findByUpdatedAtBefore(cutoff)) {
            String sessionId = session.getSessionId();
            messageRepository.deleteBySessionId(sessionId);
            toolCallRepository.deleteBySessionId(sessionId);
            contextSnapshotRepository.deleteBySessionId(sessionId);
            sessionRepository.delete(session);
            deletedSessions++;
        }
        int deletedToolCalls = toolCallRepository.deleteByCreatedAtBefore(cutoff);
        int deletedSnapshots = contextSnapshotRepository.deleteByCreatedAtBefore(cutoff);
        if (deletedSessions > 0 || deletedToolCalls > 0 || deletedSnapshots > 0) {
            log.info("[SESSION] retention cleanup sessions={} toolCalls={} snapshots={} retentionDays={}",
                    deletedSessions, deletedToolCalls, deletedSnapshots, retentionDays);
        }
    }
}
