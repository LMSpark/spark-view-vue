package com.spark.ai.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.config.OpenAiProperties;
import com.spark.ai.model.AiChatRequest;
import com.spark.ai.model.AiResponse;
import org.junit.jupiter.api.Test;

import java.util.Collection;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * AiPageService 单元测试 — 聚焦 buildPhase1Message + parseResponse 逻辑。
 * 不实际调 LLM，而是反射/子类覆盖来测试可测路径。
 */
class AiPageServiceTest {

    /**
     * 可测试子类：覆盖 callLlm，直接返回指定 JSON，避免真实网络调用。
     */
    static class TestableAiPageService extends AiPageService {
        String fakeResponse;

        TestableAiPageService(String fakeResponse) {
            this(fakeResponse, new ComponentMetadataService(new ObjectMapper()));
        }

        TestableAiPageService(String fakeResponse, ComponentMetadataService metadataService) {
            super(defaultProps(), new ObjectMapper(), metadataService);
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

    static class StubComponentMetadataService extends ComponentMetadataService {
        private final boolean hasMetadata;
        private final String skillPromptIndex;
        private final String skillPromptCompact;
        private final Map<String, String> promptsByType;

        StubComponentMetadataService(boolean hasMetadata,
                                     String skillPromptIndex,
                                     String skillPromptCompact,
                                     Map<String, String> promptsByType) {
            super(new ObjectMapper());
            this.hasMetadata = hasMetadata;
            this.skillPromptIndex = skillPromptIndex;
            this.skillPromptCompact = skillPromptCompact;
            this.promptsByType = promptsByType;
        }

        @Override
        public boolean hasMetadata() {
            return hasMetadata;
        }

        @Override
        public String getSkillPromptIndex() {
            return skillPromptIndex;
        }

        @Override
        public String getSkillPromptCompact() {
            return skillPromptCompact;
        }

        @Override
        public String getSkillPromptForTypes(Collection<String> types) {
            if (types == null || types.isEmpty()) {
                return null;
            }

            StringBuilder sb = new StringBuilder();
            for (String type : types) {
                String prompt = promptsByType.get(type);
                if (prompt == null || prompt.isBlank()) {
                    continue;
                }
                if (!sb.isEmpty()) {
                    sb.append("\n\n");
                }
                sb.append(prompt);
            }
            return sb.isEmpty() ? null : sb.toString();
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

    // ── buildPhase1Message 通过反射测试 ──────────────────────────────────────

    @Test
    void buildPhase1Message_generate() throws Exception {
        AiPageService service = new TestableAiPageService(null);
        var method = AiPageService.class.getDeclaredMethod("buildPhase1Message", AiChatRequest.class);
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
    void buildPhase1Message_iterate() throws Exception {
        AiPageService service = new TestableAiPageService(null);
        var method = AiPageService.class.getDeclaredMethod("buildPhase1Message", AiChatRequest.class);
        method.setAccessible(true);

        AiChatRequest req = new AiChatRequest();
        req.setAction("iterate");
        req.setPageId("orders");
        req.setFeedback("加一列创建时间");
        req.setCurrentFiles(Map.of("rule.json", "[]", "style.css", ".container{}"));
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
    void buildPhase1Message_defaultsPageId() throws Exception {
        AiPageService service = new TestableAiPageService(null);
        var method = AiPageService.class.getDeclaredMethod("buildPhase1Message", AiChatRequest.class);
        method.setAccessible(true);

        AiChatRequest req = new AiChatRequest();
        // pageId = null
        req.setPrompt("hello");

        String msg = (String) method.invoke(service, req);
        assertTrue(msg.contains("ai-page"));
    }

    // ── buildIterateRequest 通过反射测试 ────────────────────────────────────

    @Test
    void buildIterateRequest_populatesFieldsCorrectly() throws Exception {
        AiPageService service = new TestableAiPageService(null);
        var method = AiPageService.class.getDeclaredMethod("buildIterateRequest",
                AiChatRequest.class, Map.class, String.class);
        method.setAccessible(true);

        AiChatRequest original = new AiChatRequest();
        original.setAction("generate");
        original.setPageId("test-page");
        original.setPrompt("原始需求");
        original.setLogs(List.of());

        Map<String, String> files = Map.of("rule.json", "[]", "style.css", ".x{}");
        String explanation = "发现表名不一致";

        AiChatRequest result = (AiChatRequest) method.invoke(service, original, files, explanation);

        assertEquals("iterate", result.getAction());
        assertEquals("test-page", result.getPageId());
        assertEquals("原始需求", result.getPrompt());
        assertTrue(result.getFeedback().contains("发现表名不一致"));
        assertEquals(files, result.getCurrentFiles());
        assertNotNull(result.getLogs());
    }

    @Test
    void mergePhaseFiles_keepsPhase1UiFilesWhenPhase2ReturnsBlankOverrides() throws Exception {
        AiPageService service = new TestableAiPageService(null);
        var method = AiPageService.class.getDeclaredMethod("mergePhaseFiles", Map.class, Map.class);
        method.setAccessible(true);

        Map<String, String> phase1 = Map.of(
                "rule.json", "[{\"type\":\"div\"}]",
                "style.css", ".page { padding: 20px; }"
        );
        Map<String, String> phase2 = Map.of(
                "rule.json", "",
                "style.css", "   ",
                "pagedata.json", "{}",
                "script.js", "function __init__() {}"
        );

        @SuppressWarnings("unchecked")
        Map<String, String> merged = (Map<String, String>) method.invoke(service, phase1, phase2);

        assertEquals("[{\"type\":\"div\"}]", merged.get("rule.json"));
        assertEquals(".page { padding: 20px; }", merged.get("style.css"));
        assertEquals("{}", merged.get("pagedata.json"));
        assertEquals("function __init__() {}", merged.get("script.js"));
    }

    // ── AiResponse iterationRound 字段测试 ──────────────────────────────────

    @Test
    void aiResponse_iterationRoundField() {
        AiResponse resp = new AiResponse(Map.of("rule.json", "[]"), "说明", false, 2);
        assertEquals(2, resp.getIterationRound());
        assertFalse(resp.getNeedsIteration());

        // 3-arg constructor 不设 iterationRound
        AiResponse errResp = new AiResponse(Map.of(), "err", false);
        assertNull(errResp.getIterationRound());
    }

    @Test
    void buildSystemPrompt_usesSkillIndexByDefault() throws Exception {
        ComponentMetadataService metadataService = new StubComponentMetadataService(
                true,
                "## Skill Index\n- r-table\n- r-tree",
                "## Compact Prompt",
                Map.of("r-tree", "### `r-tree`\n> 树形容器")
        );
        AiPageService service = new TestableAiPageService(null, metadataService);
        var method = AiPageService.class.getDeclaredMethod("buildSystemPrompt", AiChatRequest.class);
        method.setAccessible(true);

        AiChatRequest req = new AiChatRequest();
        req.setPrompt("生成一个首页概览");

        String prompt = (String) method.invoke(service, req);
        assertTrue(prompt.contains("## Skill Index"));
        assertFalse(prompt.contains("## Compact Prompt"));
        assertFalse(prompt.contains("### `r-tree`"));
    }

    @Test
    void buildSystemPrompt_appendsRelevantSkillDetailsWhenDetected() throws Exception {
        ComponentMetadataService metadataService = new StubComponentMetadataService(
                true,
                "## Skill Index\n- r-table\n- r-tree",
                "## Compact Prompt",
                Map.of(
                        "r-tree", "### `r-tree`\n> 树形容器",
                        "r-form", "### `r-form`\n> 表单容器"
                )
        );
        AiPageService service = new TestableAiPageService(null, metadataService);
        var method = AiPageService.class.getDeclaredMethod("buildSystemPrompt", AiChatRequest.class);
        method.setAccessible(true);

        AiChatRequest req = new AiChatRequest();
        req.setPrompt("生成一个树形部门页面，支持树节点展开与懒加载");

        String prompt = (String) method.invoke(service, req);
        assertTrue(prompt.contains("## Skill Index"));
        assertTrue(prompt.contains("### `r-tree`"));
        assertFalse(prompt.contains("### `r-form`"));
    }

    @Test
    void buildSystemPrompt_fallsBackToRequestSkillCatalogWithoutMetadata() throws Exception {
        ComponentMetadataService metadataService = new StubComponentMetadataService(
                false,
                null,
                null,
                Map.of()
        );
        AiPageService service = new TestableAiPageService(null, metadataService);
        var method = AiPageService.class.getDeclaredMethod("buildSystemPrompt", AiChatRequest.class);
        method.setAccessible(true);

        AiChatRequest req = new AiChatRequest();
        req.setPrompt("生成一个页面");
        req.setSkillCatalog("## Frontend Skill Catalog\n- el-table");

        String prompt = (String) method.invoke(service, req);
        assertTrue(prompt.contains("## Frontend Skill Catalog"));
    }
}
