package com.spark.ai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.config.OpenAiProperties;
import com.spark.ai.service.AiSessionService.AppendMessageResult;
import com.spark.ai.service.AiSessionService.TurnResult;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyEmitter;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

class AiSessionServiceScopeTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    private AiSessionService createService() {
        return createService("https://api.openai.com");
    }

    private AiSessionService createService(String baseUrl) {
        OpenAiProperties props = new OpenAiProperties();
        props.setBaseUrl(baseUrl);
        props.setApiKey("test-key");
        props.setModel("gpt-4o");
        return new AiSessionService(props, objectMapper);
    }

    @Test
    void reusesBackendSessionForSameModuleScope() {
        AiSessionService service = createService();
        Map<String, Object> scope = scope("page-a");

        String first = service.createSession("sys", "user", 30, List.of(), "function", scope);
        String second = service.createSession("sys2", "user2", 30, List.of(), "function", scope);

        assertEquals(first, second);
        assertEquals(1, service.getConversationFull(first).size());
    }

    @Test
    void doesNotReuseScopeSessionWhenReuseFlagDisabled() {
        AiSessionService service = createService();
        Map<String, Object> scope = scope("page-a");

        String first = service.createSession("sys", "user", 30, List.of(), "function", scope, false);
        String second = service.createSession("sys2", "user2", 30, List.of(), "function", scope, false);

        assertNotEquals(first, second);
        assertEquals(1, service.getConversationFull(first).size());
        assertEquals(1, service.getConversationFull(second).size());
    }

    @Test
    void createSessionInitializesConversationFromProtocolV3Messages() {
        AiSessionService service = createService();
        Map<String, Object> scope = scope("page-a");

        String sessionId = service.createSession(
                "sys",
                List.of(
                        Map.of("role", "user", "content", "我要请假"),
                        Map.of("role", "assistant", "content", "请补充开始日期")
                ),
                30,
                List.of(),
                "function",
                scope,
                false);

        List<Map<String, Object>> conversation = service.getConversationFull(sessionId);
        assertEquals(2, conversation.size());
        assertEquals("user", conversation.get(0).get("role"));
        assertEquals("我要请假", conversation.get(0).get("content"));
        assertEquals("assistant", conversation.get(1).get("role"));
        assertEquals("请补充开始日期", conversation.get(1).get("content"));
    }

    @Test
    void replacesBackendSessionWhenExistingScopeSessionIsNotReady() {
        AiSessionService service = createService();
        Map<String, Object> scope = scope("page-a");

        String first = service.createSession("sys", "user", 30, List.of(), "function", scope);
        service.setSessionStateForTesting(first, "CALL");

        String second = service.createSession("sys2", "user2", 30, List.of(), "function", scope);

        assertNotEquals(first, second);
        assertTrue(service.getConversationFull(first).isEmpty());
        assertEquals(1, service.getConversationFull(second).size());
    }

    @Test
    void appendRejectsMismatchedModuleScope() {
        AiSessionService service = createService();
        String sessionId = service.createSession("sys", "user", 30, List.of(), "function", scope("page-a"));

        AppendMessageResult mismatch = service.appendMessage(
                sessionId,
                "user",
                "wrong page",
                null,
                null,
                scope("page-b"));
        AppendMessageResult matched = service.appendMessage(
                sessionId,
                "user",
                "same page",
                null,
                null,
                scope("page-a"));

        assertEquals(AppendMessageResult.SCOPE_MISMATCH, mismatch);
        assertEquals(AppendMessageResult.OK, matched);
        assertEquals(2, service.getConversationFull(sessionId).size());
    }

    @Test
    void turnRejectsMismatchedModuleScopeBeforeCallingLlm() {
        AiSessionService service = createService();
        String sessionId = service.createSession("sys", "user", 30, List.of(), "function", scope("page-a"));

        TurnResult result = service.executeTurn(sessionId, scope("page-b"));

        assertEquals("SESSION_SCOPE_MISMATCH", result.getErrorCode());
        assertEquals("READY", result.getState());
        assertNotNull(result.getHandoff());
        assertEquals("SESSION_SCOPE_MISMATCH", result.getHandoff().get("reasonCode"));
    }

    @Test
    void streamTurnsRunInParallelAndReturnTheirOwnTurnEnvelope() throws Exception {
        ExecutorService serverExecutor = Executors.newCachedThreadPool();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.setExecutor(serverExecutor);
        server.createContext("/v1/chat/completions", exchange -> {
            String requestBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            boolean turnA = requestBody.contains("parallel A");
            try {
                Thread.sleep(turnA ? 80 : 10);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
            }
            String reply = turnA ? "reply A" : "reply B";
            byte[] response = ("data: {\"choices\":[{\"delta\":{\"content\":\"" + reply + "\"}}]}\n\n"
                    + "data: [DONE]\n\n").getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "text/event-stream");
            exchange.sendResponseHeaders(200, 0);
            try (OutputStream output = exchange.getResponseBody()) {
                output.write(response);
            }
        });
        server.start();

        AiSessionService service = createService("http://127.0.0.1:" + server.getAddress().getPort());
        try {
            String sessionId = service.createSession(
                    "sys",
                    List.of(),
                    30,
                    List.of(),
                    "function",
                    scope("page-a"),
                    false,
                    "pageDesign:page-a");
            CapturingSseEmitter emitterA = new CapturingSseEmitter();
            CapturingSseEmitter emitterB = new CapturingSseEmitter();

            service.executeTurnStream(
                    sessionId,
                    emitterA,
                    scope("page-a"),
                    "turn-a",
                    "stream-a",
                    List.of(Map.of("role", "user", "content", "parallel A")),
                    "sys",
                    30,
                    List.of(),
                    "function",
                    0);
            service.executeTurnStream(
                    sessionId,
                    emitterB,
                    scope("page-a"),
                    "turn-b",
                    "stream-b",
                    List.of(Map.of("role", "user", "content", "parallel B")),
                    "sys",
                    30,
                    List.of(),
                    "function",
                    0);

            assertTrue(emitterA.awaitComplete(), "turn-a stream did not complete");
            assertTrue(emitterB.awaitComplete(), "turn-b stream did not complete");

            String outputA = emitterA.joinedOutput();
            String outputB = emitterB.joinedOutput();
            assertTrue(outputA.contains("\"sessionId\":\"pageDesign:page-a\""));
            assertTrue(outputA.contains("\"turnId\":\"turn-a\""));
            assertTrue(outputA.contains("\"streamKey\":\"stream-a\""));
            assertTrue(outputA.contains("reply A"));
            assertFalse(outputA.contains("\"turnId\":\"turn-b\""));
            assertTrue(outputB.contains("\"sessionId\":\"pageDesign:page-a\""));
            assertTrue(outputB.contains("\"turnId\":\"turn-b\""));
            assertTrue(outputB.contains("\"streamKey\":\"stream-b\""));
            assertTrue(outputB.contains("reply B"));
            assertFalse(outputB.contains("\"turnId\":\"turn-a\""));
        } finally {
            service.shutdown();
            server.stop(0);
            serverExecutor.shutdownNow();
        }
    }

    private Map<String, Object> scope(String pageId) {
        return Map.of(
                "moduleId", "pageDesign",
                "moduleInstanceId", pageId,
                "instanceId", pageId,
                "runtimeInstanceId", pageId
        );
    }

    private static final class CapturingSseEmitter extends SseEmitter {
        private final List<String> output = Collections.synchronizedList(new ArrayList<>());
        private final CountDownLatch completed = new CountDownLatch(1);
        private volatile Throwable error;

        @Override
        public void send(SseEmitter.SseEventBuilder builder) {
            for (ResponseBodyEmitter.DataWithMediaType item : builder.build()) {
                output.add(String.valueOf(item.getData()));
            }
        }

        @Override
        public void complete() {
            completed.countDown();
        }

        @Override
        public void completeWithError(Throwable ex) {
            error = ex;
            completed.countDown();
        }

        boolean awaitComplete() throws InterruptedException {
            boolean done = completed.await(3, TimeUnit.SECONDS);
            if (error != null) {
                throw new AssertionError(error);
            }
            return done;
        }

        String joinedOutput() {
            synchronized (output) {
                return String.join("", output);
            }
        }
    }
}
