package com.spark.ai.stills;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.config.OpenAiProperties;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class StillsSessionServiceRuntimeMetaTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    private StillsSessionService createService() {
        OpenAiProperties props = new OpenAiProperties();
        props.setBaseUrl("https://api.openai.com");
        props.setApiKey("test-key");
        props.setModel("gpt-4o");
        return new StillsSessionService(props, objectMapper);
    }

    @Test
    void runtimeMeta_blocksIdempotencyReplayForWindowedPolicy() throws Exception {
        StillsSessionService service = createService();
        String sessionId = service.createSessionForTesting();

        List<Map<String, Object>> calls = List.of(
                toolCall("call_dup", "dataset.batch", Map.of("table", "orders", "ids", List.of("1", "2")))
        );

        Map<String, Object> firstMeta = service.analyzeRuntimeMetaForTesting(sessionId, 1, calls);
        Map<String, Object> firstGuard = map(firstMeta.get("guard"));
        assertEquals(false, firstGuard.get("blocked"));

        Map<String, Object> secondMeta = service.analyzeRuntimeMetaForTesting(sessionId, 1, calls);
        Map<String, Object> secondGuard = map(secondMeta.get("guard"));
        assertEquals(true, secondGuard.get("blocked"));
        assertEquals("IDEMPOTENCY_REPLAY_BLOCKED", secondGuard.get("reasonCode"));
    }

    @Test
    void runtimeMeta_blocksParallelWriteInSameGroup() throws Exception {
        StillsSessionService service = createService();
        String sessionId = service.createSessionForTesting();

        List<Map<String, Object>> calls = List.of(
                toolCall("call_w1", "dataset.batch", Map.of("table", "orders", "ids", List.of("1"))),
                toolCall("call_w2", "page.update", Map.of("pageId", "leave-form", "title", "T"))
        );

        Map<String, Object> meta = service.analyzeRuntimeMetaForTesting(sessionId, 2, calls);
        Map<String, Object> guard = map(meta.get("guard"));
        assertEquals(true, guard.get("blocked"));
        assertEquals("PARALLEL_WRITE_NOT_ALLOWED_STAGE1", guard.get("reasonCode"));
    }

    @Test
    void runtimeMeta_blocksWhenWriteBudgetExceeded() throws Exception {
        StillsSessionService service = createService();
        String sessionId = service.createSessionForTesting();

        List<Map<String, Object>> calls = List.of(
                toolCall("call_01", "dataset.batch", Map.of("table", "t1", "ids", List.of("1"))),
                toolCall("call_02", "dataset.batch", Map.of("table", "t2", "ids", List.of("1"))),
                toolCall("call_03", "dataset.batch", Map.of("table", "t3", "ids", List.of("1"))),
                toolCall("call_04", "dataset.batch", Map.of("table", "t4", "ids", List.of("1"))),
                toolCall("call_05", "dataset.batch", Map.of("table", "t5", "ids", List.of("1"))),
                toolCall("call_06", "dataset.batch", Map.of("table", "t6", "ids", List.of("1"))),
                toolCall("call_07", "dataset.batch", Map.of("table", "t7", "ids", List.of("1"))),
                toolCall("call_08", "dataset.batch", Map.of("table", "t8", "ids", List.of("1"))),
                toolCall("call_09", "dataset.batch", Map.of("table", "t9", "ids", List.of("1")))
        );

        Map<String, Object> meta = service.analyzeRuntimeMetaForTesting(sessionId, 3, calls);
        Map<String, Object> guard = map(meta.get("guard"));
        assertEquals(true, guard.get("blocked"));
        assertEquals("PARALLEL_WRITE_BUDGET_EXCEEDED", guard.get("reasonCode"));

        Map<String, Object> scheduling = map(meta.get("scheduling"));
        assertEquals("block", scheduling.get("decision"));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> map(Object value) {
        assertInstanceOf(Map.class, value);
        return (Map<String, Object>) value;
    }

    private Map<String, Object> toolCall(String id, String action, Map<String, Object> args)
            throws JsonProcessingException {
        Map<String, Object> function = new LinkedHashMap<>();
        function.put("name", action);
        function.put("arguments", objectMapper.writeValueAsString(args));

        Map<String, Object> call = new LinkedHashMap<>();
        call.put("id", id);
        call.put("type", "function");
        call.put("function", function);
        return call;
    }
}
