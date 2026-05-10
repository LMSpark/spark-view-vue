package com.spark.ai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.config.OpenAiProperties;
import com.spark.ai.service.AiSessionService.AppendMessageResult;
import com.spark.ai.service.AiSessionService.TurnResult;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class AiSessionServiceScopeTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    private AiSessionService createService() {
        OpenAiProperties props = new OpenAiProperties();
        props.setBaseUrl("https://api.openai.com");
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

    private Map<String, Object> scope(String pageId) {
        return Map.of(
                "moduleId", "pageDesign",
                "moduleInstanceId", pageId,
                "instanceId", pageId,
                "runtimeInstanceId", pageId
        );
    }
}
