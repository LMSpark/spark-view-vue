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
 * 统一 Server-Sent Events 广播服务。
 * <p>
 * 管理所有活跃的 SSE 连接，通过 {@code event:} 字段区分事件类型，
 * 前端单个 EventSource 即可监听所有服务端推送。
 * <p>
 * 事件类型约定：
 * <ul>
 *   <li>{@code page-config} — 页面配置文件变更（pageId, file, timestamp）</li>
 *   <li>后续可扩展：{@code notification}, {@code data-change} 等</li>
 * </ul>
 */
@Service
public class SseService {

    private static final Logger log = LoggerFactory.getLogger(SseService.class);

    /** 事件类型常量 */
    public static final String EVENT_PAGE_CONFIG = "page-config";

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
     * 广播页面配置变更事件（语义快捷方法）。
     * 与 Vite 插件的 broadcastChange 格式保持一致：{ pageId, file, timestamp }
     */
    public void broadcast(String pageId, String file) {
        Map<String, String> payload = Map.of(
                "pageId", pageId,
                "file", file,
                "timestamp", String.valueOf(Instant.now().toEpochMilli())
        );
        emit(EVENT_PAGE_CONFIG, payload);
    }

    /**
     * 向所有客户端发送带类型的 SSE 事件。
     *
     * @param eventType SSE event 名称（前端通过 addEventListener(eventType) 监听）
     * @param payload   JSON 序列化的数据载荷
     */
    public void emit(String eventType, Object payload) {
        List<SseEmitter> dead = new ArrayList<>();
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(
                        SseEmitter.event()
                                .name(eventType)
                                .data(payload, MediaType.APPLICATION_JSON)
                );
            } catch (Exception e) {
                dead.add(emitter);
            }
        }
        if (!dead.isEmpty()) {
            emitters.removeAll(dead);
            log.debug("[SSE] 移除断开连接: {}", dead.size());
        }
        log.debug("[SSE] 已广播事件: type={}, 活跃连接={}", eventType, emitters.size());
    }
}
