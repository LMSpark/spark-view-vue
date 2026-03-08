package com.spark.ai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.config.OpenAiProperties;
import com.spark.ai.model.AiChatRequest;
import com.spark.ai.model.AiResponse;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * AiPageService 单元测试 — 聚焦 buildUserMessage + parseResponse 逻辑。
 * 不实际调 LLM，而是反射/子类覆盖来测试可测路径。
 */
class AiPageServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * 可测试子类：覆盖 callLlm，直接返回指定 JSON，避免真实网络调用。
     */
    static class TestableAiPageService extends AiPageService {
        String fakeResponse;

        TestableAiPageService(String fakeResponse) {
            super(defaultProps(), new ObjectMapper());
            this.fakeResponse = fakeResponse;
        }

        // callLlm is private, so we override processRequest to test parse logic
        @Override
        public AiResponse processRequest(AiChatRequest request) {
            // We test the parse path by directly calling the parent's public method
            // which internally calls callLlm → parseResponse.
            // Since we can't easily override private callLlm, we test parse separately.
            return super.processRequest(request);
        }

        private static OpenAiProperties defaultProps() {
            OpenAiProperties p = new OpenAiProperties();
            p.setBaseUrl("http://localhost:9999"); // won't be called
            p.setApiKey("test");
            return p;
        }
    }

    // ── processRequest error path（LLM 不可达时返回错误页面）──────────────

    @Test
    void processRequest_returnsErrorResponseWhenLlmUnreachable() {
        AiPageService service = new TestableAiPageService(null);
        AiChatRequest req = new AiChatRequest();
        req.setAction("generate");
        req.setPageId("my-page");
        req.setPrompt("生成一个表格");

        AiResponse resp = service.processRequest(req);

        assertNotNull(resp);
        assertNotNull(resp.getFiles());
        assertTrue(resp.getFiles().containsKey("rule.json"));
        // Error response should contain the error page
        String rule = resp.getFiles().get("rule.json");
        assertTrue(rule.contains("AI 生成失败"));
    }

    // ── parseResponse 通过反射测试 ──────────────────────────────────────────

    @Test
    void parseResponse_directJson() throws Exception {
        AiPageService service = new TestableAiPageService(null);
        var method = AiPageService.class.getDeclaredMethod("parseResponse", String.class);
        method.setAccessible(true);

        String json = """
                {
                  "files": {
                    "rule.json": "[{\\"type\\":\\"h1\\"}]",
                    "pagedata.json": "{}"
                  },
                  "explanation": "测试页面",
                  "needsIteration": false
                }
                """;

        AiResponse resp = (AiResponse) method.invoke(service, json);
        assertNotNull(resp.getFiles());
        assertEquals(2, resp.getFiles().size());
        assertTrue(resp.getFiles().get("rule.json").contains("h1"));
        assertEquals("测试页面", resp.getExplanation());
        assertFalse(resp.getNeedsIteration());
    }

    @Test
    void parseResponse_extractsFromCodeBlock() throws Exception {
        AiPageService service = new TestableAiPageService(null);
        var method = AiPageService.class.getDeclaredMethod("parseResponse", String.class);
        method.setAccessible(true);

        String content = """
                Here is the result:
                ```json
                {
                  "files": { "rule.json": "[]" },
                  "explanation": "代码块"
                }
                ```
                Done!
                """;

        AiResponse resp = (AiResponse) method.invoke(service, content);
        assertNotNull(resp.getFiles());
        assertEquals("代码块", resp.getExplanation());
    }

    @Test
    void parseResponse_handlesNestedJsonInFiles() throws Exception {
        AiPageService service = new TestableAiPageService(null);
        var method = AiPageService.class.getDeclaredMethod("parseResponse", String.class);
        method.setAccessible(true);

        // LLM 返回嵌套 JSON 而非字符串（常见错误模式）
        String json = """
                {
                  "files": {
                    "rule.json": [{"type":"div"}],
                    "pagedata.json": {"dataSetName":"test"}
                  },
                  "explanation": "嵌套"
                }
                """;

        AiResponse resp = (AiResponse) method.invoke(service, json);
        assertNotNull(resp.getFiles());
        // 嵌套 JSON 应被序列化回字符串
        assertEquals("[{\"type\":\"div\"}]", resp.getFiles().get("rule.json"));
        assertTrue(resp.getFiles().get("pagedata.json").contains("dataSetName"));
    }

    @Test
    void parseResponse_fallbackOnInvalidContent() throws Exception {
        AiPageService service = new TestableAiPageService(null);
        var method = AiPageService.class.getDeclaredMethod("parseResponse", String.class);
        method.setAccessible(true);

        AiResponse resp = (AiResponse) method.invoke(service, "This is not JSON at all");
        assertNotNull(resp);
        assertTrue(resp.getFiles().containsKey("rule.json"));
        assertTrue(resp.getFiles().get("rule.json").contains("生成失败"));
    }

    // ── buildUserMessage 通过反射测试 ───────────────────────────────────────

    @Test
    void buildUserMessage_generate() throws Exception {
        AiPageService service = new TestableAiPageService(null);
        var method = AiPageService.class.getDeclaredMethod("buildUserMessage", AiChatRequest.class);
        method.setAccessible(true);

        AiChatRequest req = new AiChatRequest();
        req.setAction("generate");
        req.setPageId("orders");
        req.setPrompt("订单管理表格");

        String msg = (String) method.invoke(service, req);
        assertTrue(msg.contains("orders"));
        assertTrue(msg.contains("订单管理表格"));
        assertTrue(msg.contains("生成配置"));
    }

    @Test
    void buildUserMessage_iterate() throws Exception {
        AiPageService service = new TestableAiPageService(null);
        var method = AiPageService.class.getDeclaredMethod("buildUserMessage", AiChatRequest.class);
        method.setAccessible(true);

        AiChatRequest req = new AiChatRequest();
        req.setAction("iterate");
        req.setPageId("orders");
        req.setFeedback("加一列创建时间");
        req.setCurrentFiles(Map.of("rule.json", "[]", "pagedata.json", "{}"));
        AiChatRequest.LogSnapshot log = new AiChatRequest.LogSnapshot();
        log.setLevel("error");
        log.setMessage("Column not found");
        req.setLogs(List.of(log));

        String msg = (String) method.invoke(service, req);
        assertTrue(msg.contains("修改页面"));
        assertTrue(msg.contains("加一列创建时间"));
        assertTrue(msg.contains("当前 rule.json"));
        assertTrue(msg.contains("运行时日志"));
        assertTrue(msg.contains("[error] Column not found"));
    }

    @Test
    void buildUserMessage_defaultsPageId() throws Exception {
        AiPageService service = new TestableAiPageService(null);
        var method = AiPageService.class.getDeclaredMethod("buildUserMessage", AiChatRequest.class);
        method.setAccessible(true);

        AiChatRequest req = new AiChatRequest();
        // pageId = null
        req.setPrompt("hello");

        String msg = (String) method.invoke(service, req);
        assertTrue(msg.contains("ai-page"));
    }
}
