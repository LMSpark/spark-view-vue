package com.spark.ai.service;

import com.spark.ai.api.ApiResponseFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * APP 公共 Server-Sent Events 广播服务。
 *
 * <p>该服务只负责维护 {@code /api/events} 连接和发送 v4 envelope。
 * 事件的业务执行由前端 APP 壳层、诊断面板或 MJS 脚本按 {@code event:}
 * 名称订阅后完成。</p>
 */
@Service
public class SseService {

    private static final Logger log = LoggerFactory.getLogger(SseService.class);
    private static final long EMITTER_TIMEOUT_MS = 30 * 60 * 1000L;

    public static final String EVENT_PAGE_FILE_CHANGE = "page-config";
    public static final String EVENT_DATA_BATCH_JOB = "data-batch-job";
    public static final String EVENT_DATA_CHANGE = "data-change";
    public static final String EVENT_NOTIFICATION = "notification";
    public static final String EVENT_DEBUG_ROUTE_REQUEST = "debug-route-request";
    public static final String EVENT_DEBUG_ROUTE_RESULT = "debug-route-result";
    public static final String EVENT_DEBUG_SCREENSHOT_REQUEST = "debug-screenshot-request";
    public static final String EVENT_DEBUG_SCREENSHOT_RESULT = "debug-screenshot-result";
    public static final String EVENT_DEBUG_FC_ERROR_REPORT = "debug-fc-error-report";

    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    /**
     * 注册 APP 公共 SSE 连接。
     *
     * <p>前端 EventSource 会自动重连，服务端只保留活跃 emitter，避免断网或
     * 页面关闭后继续持有无效连接。</p>
     */
    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(EMITTER_TIMEOUT_MS);
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError(ex -> emitters.remove(emitter));
        log.debug("[SSE] 新连接，当前活跃: {}", emitters.size());
        return emitter;
    }

    /**
     * 广播页面配置变更事件。
     */
    public void broadcast(String pageId, String file) {
        Map<String, Object> payload = Map.of(
                "pageId", pageId,
                "file", file,
                "timestamp", Instant.now().toEpochMilli()
        );
        emit(EVENT_PAGE_FILE_CHANGE, payload);
    }

    /**
     * 广播 APP 通知事件。通知面板只消费业务 payload，wire 层仍由 {@link #emit(String, Object)} 统一包装。
     */
    public void emitNotification(String title, String message, String level) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("title", title);
        payload.put("message", message);
        payload.put("level", level);
        payload.put("timestamp", Instant.now().toEpochMilli());
        emit(EVENT_NOTIFICATION, payload);
    }

    /**
     * 向所有客户端广播指定类型的 APP SSE 事件。
     *
     * @param eventType SSE {@code event:} 名称，必须与 v4 envelope 的 {@code event.name} 保持一致
     * @param payload   业务载荷，只放入 envelope.data
     */
    public void emit(String eventType, Object payload) {
        Object envelope = ApiResponseFactory.sseOk(
                eventType,
                payload,
                ApiResponseFactory.currentRequestId(),
                null,
                false);
        List<SseEmitter> deadEmitters = sendEnvelope(eventType, envelope);
        removeDeadEmitters(deadEmitters);
        log.debug("[SSE] 已广播事件: type={}, 活跃连接={}", eventType, emitters.size());
    }

    private List<SseEmitter> sendEnvelope(String eventType, Object envelope) {
        List<SseEmitter> deadEmitters = new ArrayList<>();
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(
                        SseEmitter.event()
                                .name(eventType)
                                .data(envelope, MediaType.APPLICATION_JSON)
                );
            } catch (Exception e) {
                deadEmitters.add(emitter);
            }
        }
        return deadEmitters;
    }

    private void removeDeadEmitters(List<SseEmitter> deadEmitters) {
        if (deadEmitters.isEmpty()) {
            return;
        }
        emitters.removeAll(deadEmitters);
        log.debug("[SSE] 移除断开连接: {}", deadEmitters.size());
    }
}
