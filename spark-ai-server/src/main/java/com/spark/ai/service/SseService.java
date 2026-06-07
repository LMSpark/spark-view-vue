package com.spark.ai.service;

import com.spark.ai.api.ApiResponseFactory;
import jakarta.annotation.PreDestroy;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * APP 公共 Server-Sent Events 连接服务。
 *
 * <p>该服务维护 {@code /api/events} 连接、浏览器 app client 标识、连接级
 * outbound queue 和 v4 envelope 写入。业务事件解释留在调用方或前端适配层。</p>
 */
@Service
public class SseService {

    private static final Logger log = LoggerFactory.getLogger(SseService.class);
    private static final long EMITTER_TIMEOUT_MS = 30 * 60 * 1000L;
    private static final long HEARTBEAT_INTERVAL_MS = 25_000L;
    private static final int OUTBOUND_QUEUE_CAPACITY = 512;
    public static final String APP_CLIENT_COOKIE = "SPARK_APP_CLIENT_ID";

    public static final String EVENT_PAGE_FILE_CHANGE = "page-config";
    public static final String EVENT_DATA_BATCH_JOB = "data-batch-job";
    public static final String EVENT_DATA_CHANGE = "data-change";
    public static final String EVENT_NOTIFICATION = "notification";
    public static final String EVENT_AI_HOST_RUN_REQUEST = "ai-host-run-request";
    public static final String EVENT_AI_HOST_RUN_RESULT = "ai-host-run-result";
    public static final String EVENT_AI_TURN_DELTA = "ai-turn-delta";
    public static final String EVENT_AI_TURN_REASONING = "ai-turn-reasoning";
    public static final String EVENT_AI_TURN_USAGE = "ai-turn-usage";
    public static final String EVENT_AI_TURN_RESULT = "ai-turn-result";
    public static final String EVENT_AI_TURN_ERROR = "ai-turn-error";
    public static final String EVENT_AI_TURN_DONE = "ai-turn-done";
    public static final String EVENT_LLM_FRAME = "llm-frame";

    private final ConcurrentHashMap<String, CopyOnWriteArraySet<SseConnection>> connectionsByAppClient =
            new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, SseConnection> connectionsById = new ConcurrentHashMap<>();
    private final ExecutorService writerExecutor = Executors.newCachedThreadPool();
    private final ScheduledExecutorService heartbeatExecutor = Executors.newSingleThreadScheduledExecutor();

    public SseService() {
        heartbeatExecutor.scheduleAtFixedRate(
                this::heartbeat,
                HEARTBEAT_INTERVAL_MS,
                HEARTBEAT_INTERVAL_MS,
                TimeUnit.MILLISECONDS);
    }

    /**
     * 注册 APP 公共 SSE 连接。
     *
     * <p>前端 EventSource 会自动重连，服务端只保留活跃 emitter，避免断网或
     * 页面关闭后继续持有无效连接。</p>
     */
    public SseEmitter subscribe() {
        return subscribe(UUID.randomUUID().toString());
    }

    public SseEmitter subscribe(HttpServletRequest request, HttpServletResponse response) {
        return subscribe(ensureAppClientId(request, response));
    }

    private SseEmitter subscribe(String appClientId) {
        SseEmitter emitter = new SseEmitter(EMITTER_TIMEOUT_MS);
        SseConnection connection = new SseConnection(appClientId, UUID.randomUUID().toString(), emitter);
        connectionsById.put(connection.connectionId, connection);
        connectionsByAppClient
                .computeIfAbsent(appClientId, ignored -> new CopyOnWriteArraySet<>())
                .add(connection);

        emitter.onCompletion(() -> removeConnection(connection));
        emitter.onTimeout(() -> removeConnection(connection));
        emitter.onError(ex -> removeConnection(connection));

        writerExecutor.submit(() -> writeLoop(connection));
        connection.enqueue(OutboundMessage.comment("open"));
        log.debug("[SSE] 新连接 appClientId={} connectionId={} 活跃连接={}",
                appClientId, connection.connectionId, connectionsById.size());
        return emitter;
    }

    public String currentAppClientId(HttpServletRequest request) {
        return readCookie(request, APP_CLIENT_COOKIE);
    }

    public boolean hasActiveConnection(String appClientId) {
        if (appClientId == null || appClientId.isBlank()) {
            return false;
        }
        CopyOnWriteArraySet<SseConnection> connections = connectionsByAppClient.get(appClientId);
        return connections != null && connections.stream().anyMatch(connection -> !connection.closed.get());
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
        emit(eventType, payload, null, false);
    }

    public void emit(String eventType, Object payload, Map<String, Object> context, boolean terminal) {
        Object envelope = okEnvelope(eventType, payload, ApiResponseFactory.currentRequestId(), context, terminal);
        int delivered = enqueueEnvelope(activeConnections(), eventType, envelope);
        log.debug("[SSE] 已广播事件: type={}, 活跃连接={}, delivered={}",
                eventType, connectionsById.size(), delivered);
    }

    public boolean emitToAppClient(
            String appClientId,
            String eventType,
            Object payload,
            String requestId,
            Map<String, Object> context,
            boolean terminal) {
        if (!hasActiveConnection(appClientId)) {
            return false;
        }
        Object envelope = okEnvelope(eventType, payload, requestId, context, terminal);
        int delivered = enqueueEnvelope(connectionsFor(appClientId), eventType, envelope);
        log.debug("[SSE] 已定向发送事件: appClientId={} type={} delivered={}",
                appClientId, eventType, delivered);
        return delivered > 0;
    }

    private Object okEnvelope(
            String eventType,
            Object payload,
            String requestId,
            Map<String, Object> context,
            boolean terminal) {
        return ApiResponseFactory.sseOk(
                eventType,
                payload,
                requestId,
                context,
                terminal);
    }

    public void emitError(
            String eventType,
            HttpStatusCode status,
            String code,
            String message,
            String category,
            String retryPolicy,
            Map<String, Object> details,
            String requestId,
            Map<String, Object> context) {
        Object envelope = ApiResponseFactory.sseError(
                eventType,
                status,
                code,
                message,
                category,
                retryPolicy,
                details,
                requestId,
                context);
        int delivered = enqueueEnvelope(activeConnections(), eventType, envelope);
        log.debug("[SSE] 已广播错误事件: type={}, 活跃连接={}, delivered={}",
                eventType, connectionsById.size(), delivered);
    }

    private int enqueueEnvelope(Collection<SseConnection> connections, String eventType, Object envelope) {
        int delivered = 0;
        for (SseConnection connection : connections) {
            if (connection.closed.get()) {
                continue;
            }
            boolean accepted = connection.enqueue(OutboundMessage.event(eventType, envelope));
            if (accepted) {
                delivered++;
            } else {
                log.warn("[SSE] outbound queue overflow appClientId={} connectionId={}",
                        connection.appClientId, connection.connectionId);
                removeConnection(connection);
            }
        }
        return delivered;
    }

    private Collection<SseConnection> activeConnections() {
        return new ArrayList<>(connectionsById.values());
    }

    private Collection<SseConnection> connectionsFor(String appClientId) {
        CopyOnWriteArraySet<SseConnection> connections = connectionsByAppClient.get(appClientId);
        return connections == null ? List.of() : new ArrayList<>(connections);
    }

    private void heartbeat() {
        for (SseConnection connection : activeConnections()) {
            if (!connection.enqueue(OutboundMessage.comment("heartbeat"))) {
                removeConnection(connection);
            }
        }
    }

    private void writeLoop(SseConnection connection) {
        try {
            while (!connection.closed.get()) {
                OutboundMessage message = connection.queue.take();
                if (message == OutboundMessage.CLOSE) {
                    break;
                }
                try {
                    if (message.comment != null) {
                        connection.emitter.send(SseEmitter.event().comment(message.comment));
                    } else {
                        connection.emitter.send(
                                SseEmitter.event()
                                        .name(message.eventType)
                                        .data(message.payload, MediaType.APPLICATION_JSON));
                    }
                } catch (IOException error) {
                    log.debug("[SSE] 连接写入失败 connectionId={}: {}", connection.connectionId, error.getMessage());
                    break;
                }
            }
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
        } finally {
            removeConnection(connection);
        }
    }

    private void removeConnection(SseConnection connection) {
        if (!connection.closed.compareAndSet(false, true)) {
            return;
        }
        connectionsById.remove(connection.connectionId);
        CopyOnWriteArraySet<SseConnection> connections = connectionsByAppClient.get(connection.appClientId);
        if (connections != null) {
            connections.remove(connection);
            if (connections.isEmpty()) {
                connectionsByAppClient.remove(connection.appClientId, connections);
            }
        }
        connection.queue.offer(OutboundMessage.CLOSE);
        connection.emitter.complete();
        log.debug("[SSE] 移除连接 appClientId={} connectionId={} 活跃连接={}",
                connection.appClientId, connection.connectionId, connectionsById.size());
    }

    private String ensureAppClientId(HttpServletRequest request, HttpServletResponse response) {
        String existing = readCookie(request, APP_CLIENT_COOKIE);
        if (existing != null) {
            return existing;
        }
        String created = UUID.randomUUID().toString();
        ResponseCookie cookie = ResponseCookie.from(APP_CLIENT_COOKIE, created)
                .httpOnly(true)
                .sameSite("Lax")
                .path("/api")
                .maxAge(Duration.ofDays(30))
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
        return created;
    }

    private static String readCookie(HttpServletRequest request, String name) {
        if (request == null || request.getCookies() == null) {
            return null;
        }
        for (Cookie cookie : request.getCookies()) {
            if (name.equals(cookie.getName())) {
                String value = cookie.getValue();
                return value == null || value.isBlank() ? null : value;
            }
        }
        return null;
    }

    @PreDestroy
    public void shutdown() {
        heartbeatExecutor.shutdownNow();
        writerExecutor.shutdownNow();
    }

    private static final class SseConnection {
        private final String appClientId;
        private final String connectionId;
        private final SseEmitter emitter;
        private final BlockingQueue<OutboundMessage> queue = new ArrayBlockingQueue<>(OUTBOUND_QUEUE_CAPACITY);
        private final AtomicBoolean closed = new AtomicBoolean(false);

        private SseConnection(String appClientId, String connectionId, SseEmitter emitter) {
            this.appClientId = appClientId;
            this.connectionId = connectionId;
            this.emitter = emitter;
        }

        private boolean enqueue(OutboundMessage message) {
            return !closed.get() && queue.offer(message);
        }
    }

    private static final class OutboundMessage {
        private static final OutboundMessage CLOSE = new OutboundMessage(null, null, null);

        private final String eventType;
        private final Object payload;
        private final String comment;

        private OutboundMessage(String eventType, Object payload, String comment) {
            this.eventType = eventType;
            this.payload = payload;
            this.comment = comment;
        }

        private static OutboundMessage event(String eventType, Object payload) {
            return new OutboundMessage(eventType, payload, null);
        }

        private static OutboundMessage comment(String comment) {
            return new OutboundMessage(null, null, comment);
        }
    }
}
