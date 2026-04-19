package com.spark.ai.stills;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.config.OpenAiProperties;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class StillsSessionServiceStateMachineTest {

    private StillsSessionService createService() {
        OpenAiProperties props = new OpenAiProperties();
        props.setBaseUrl("https://api.openai.com");
        props.setApiKey("test-key");
        props.setModel("gpt-4o");
        return new StillsSessionService(props, new ObjectMapper());
    }

    @Test
    void stateMachine_allowsWhitelistedTransitions() {
        StillsSessionService service = createService();

        assertTrue(service.isTransitionAllowedForTesting("READY", "PLAN"));
        assertTrue(service.isTransitionAllowedForTesting("PLAN", "CALL"));
        assertTrue(service.isTransitionAllowedForTesting("CALL", "APPLY"));
        assertTrue(service.isTransitionAllowedForTesting("APPLY", "VERIFY"));
        assertTrue(service.isTransitionAllowedForTesting("VERIFY", "DONE"));
        assertTrue(service.isTransitionAllowedForTesting("VERIFY", "PLAN"));
        assertTrue(service.isTransitionAllowedForTesting("FAILED", "HANDOFF"));
        assertTrue(service.isTransitionAllowedForTesting("HANDOFF", "PLAN"));
        assertTrue(service.isTransitionAllowedForTesting("DONE", "READY"));
    }

    @Test
    void stateMachine_rejectsNonWhitelistedTransitions() {
        StillsSessionService service = createService();

        assertFalse(service.isTransitionAllowedForTesting("READY", "CALL"));
        assertFalse(service.isTransitionAllowedForTesting("CALL", "DONE"));
        assertFalse(service.isTransitionAllowedForTesting("HANDOFF", "READY"));
    }

    @Test
    void applyTransition_throwsOnInvalidTransition() {
        StillsSessionService service = createService();

        IllegalStateException ex = assertThrows(
                IllegalStateException.class,
                () -> service.applyTransitionForTesting("READY", "CALL")
        );
        assertTrue(ex.getMessage().contains("INVALID_STATE_TRANSITION"));
    }

    @Test
    void handoffPayload_containsRequiredFields() {
        StillsSessionService service = createService();

        Map<String, Object> payload = service.buildHandoffPayloadForTesting(
                "HANDOFF_REQUIRED",
                "请人工确认后恢复到 PLAN"
        );

        assertEquals("HANDOFF_REQUIRED", payload.get("reasonCode"));
        assertEquals("请人工确认后恢复到 PLAN", payload.get("nextAction"));

        Object checklistRaw = payload.get("checklist");
        assertInstanceOf(List.class, checklistRaw);
        List<?> checklist = (List<?>) checklistRaw;
        assertFalse(checklist.isEmpty());
    }
}
