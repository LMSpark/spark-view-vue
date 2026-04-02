package com.spark.ai.controller;

import com.spark.ai.sap.SapAssistantService;
import com.spark.ai.sap.SapAssistantService.SapChatResponse;
import com.spark.ai.sap.SapOrchestrator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * SAP 协议端点控制器。
 *
 * <ul>
 *   <li>POST /api/sap/chat      — AI 助手对话（自动工具回路）</li>
 *   <li>POST /api/sap/execute   — 直接执行 SAP 协议块（无 AI，用于测试/调试）</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/sap")
public class SapController {

    private static final Logger log = LoggerFactory.getLogger(SapController.class);

    private final SapAssistantService assistantService;
    private final SapOrchestrator orchestrator;

    public SapController(SapAssistantService assistantService, SapOrchestrator orchestrator) {
        this.assistantService = assistantService;
        this.orchestrator = orchestrator;
    }

    /**
     * POST /api/sap/chat
     * AI 对话入口 — 用户发自然语言，AI 自动走 SAP 协议工具回路。
     *
     * <p>请求体：{@code {"message": "帮我写一个 Hello SAP 的文件"}}
     * <p>响应体：{@code {"answer": "...", "rounds": 2, "toolTrace": [...]}}
     */
    @PostMapping("/chat")
    public ResponseEntity<Map<String, Object>> chat(@RequestBody Map<String, String> request) {
        String message = request.get("message");
        if (message == null || message.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "message 不能为空"));
        }

        String mode = request.getOrDefault("mode", "sap");
        log.info("[SAP] /api/sap/chat mode={} message={}", mode, truncate(message, 100));

        SapChatResponse response = assistantService.chat(message, mode);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("answer", response.getAnswer());
        result.put("rounds", response.getRounds());
        result.put("toolTrace", response.getToolTrace());
        return ResponseEntity.ok(result);
    }

    /**
     * POST /api/sap/execute
     * 直接执行 SAP 协议块（绕过 AI，纯工具调用），用于测试和调试。
     *
     * <p>请求体：原始 SAP 协议文本
     * <p>响应体：{@code {"result": "@@result:... @@end"}}
     */
    @PostMapping(value = "/execute", consumes = "text/plain")
    public ResponseEntity<Map<String, String>> execute(@RequestBody String sapProtocol) {
        if (sapProtocol == null || sapProtocol.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "请求体不能为空"));
        }

        log.info("[SAP] /api/sap/execute");
        String result = orchestrator.processProtocol(sapProtocol);
        return ResponseEntity.ok(Map.of("result", result));
    }

    private static String truncate(String s, int maxLen) {
        return s.length() <= maxLen ? s : s.substring(0, maxLen) + "...";
    }
}
