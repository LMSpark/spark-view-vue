package com.spark.ai.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Server-Sent Events 广播服务。
 * 管理所有活跃的 SSE 连接，文件变更时推送通知给前端 FileLoader。
 */
@Service
public class SseService {

    private static final Logger log = LoggerFactory.getLogger(SseService.class);

    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    /**
     * 创建并注册新的 SSE 连接（超时 30 分钟，防止断网后 emitter 泄漏）。
     * 客户端断开或超时后自动从列表移除；前端 EventSource 会自动重连。
     */
    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(30 * 60 * 1000L);
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError(ex -> emitters.remove(emitter));
        log.debug("[SSE] 新连接，当前活跃: {}", emitters.size());
        return emitter;
    }

    /**
     * 广播文件变更事件到所有活跃的 SSE 客户端。
     * 与 Vite 插件的 broadcastChange 格式保持一致：{ pageId, file, timestamp }
     */
    public void broadcast(String pageId, String file) {
        Map<String, String> payload = Map.of(
                "pageId", pageId,
                "file", file,
                "timestamp", String.valueOf(Instant.now().toEpochMilli())
        );
        List<SseEmitter> dead = new ArrayList<>();
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().data(payload, MediaType.APPLICATION_JSON));
            } catch (Exception e) {
                dead.add(emitter);
            }
        }
        if (!dead.isEmpty()) {
            emitters.removeAll(dead);
            log.debug("[SSE] 移除断开连接: {}", dead.size());
        }
        log.debug("[SSE] 已广播变更: pageId={}, file={}, 活跃连接={}", pageId, file, emitters.size());
    }
}
