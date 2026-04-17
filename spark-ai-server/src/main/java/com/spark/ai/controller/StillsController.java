package com.spark.ai.controller;

import com.spark.ai.stills.StillsAssistantService;
import com.spark.ai.stills.StillsAssistantService.StillsChatResponse;
import com.spark.ai.stills.StillsOrchestrator;
import com.spark.ai.stills.StillsSessionService;
import com.spark.ai.stills.StillsSessionService.TurnResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Stills 协议端点控制器。
 *
 * <ul>
 *   <li>POST /api/stills/chat      — AI 助手对话（自动工具回路）</li>
 *   <li>POST /api/stills/execute   — 直接执行 Stills 协议块（无 AI，用于测试/调试）</li>
 *   <li>POST /api/stills/session      — 创建 Stills 会话</li>
 *   <li>POST /api/stills/turn         — 执行一轮 LLM 对话</li>
 *   <li>POST /api/stills/append       — 向会话追加消息</li>
 *   <li>POST /api/stills/conversation — 获取完整对话记录</li>
 *   <li>POST /api/stills/destroy      — 销毁会话</li>
 * </ul>
 *
 * <p>Stills 会话以 sessionId（UUID）为唯一凭据，SSE 天然做到一个连接对应一个浏览器会话。
 */
@RestController
@RequestMapping("/api/stills")
public class StillsController {

    private static final Logger log = LoggerFactory.getLogger(StillsController.class);

    private final StillsAssistantService assistantService;
    private final StillsOrchestrator orchestrator;
    private final StillsSessionService stillsSessionService;

    public StillsController(StillsAssistantService assistantService,
                         StillsOrchestrator orchestrator,
                         StillsSessionService stillsSessionService) {
        this.assistantService = assistantService;
        this.orchestrator = orchestrator;
        this.stillsSessionService = stillsSessionService;
    }

    /**
     * POST /api/stills/chat
     * AI 对话入口 — 用户发自然语言，AI 自动走 Stills 协议工具回路。
     *
     * <p>请求体：{@code {"message": "帮我写一个 Hello Stills 的文件"}}
     * <p>响应体：{@code {"answer": "...", "rounds": 2, "toolTrace": [...]}}
     */
    @PostMapping("/chat")
    public ResponseEntity<Map<String, Object>> chat(@RequestBody Map<String, String> request) {
        String message = request.get("message");
        if (message == null || message.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "message 不能为空"));
        }

        String mode = request.getOrDefault("mode", "stills");
        log.info("[STILLS] /api/stills/chat mode={} message={}", mode, truncate(message, 100));

        StillsChatResponse response = assistantService.chat(message, mode);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("answer", response.getAnswer());
        result.put("rounds", response.getRounds());
        result.put("toolTrace", response.getToolTrace());
        return ResponseEntity.ok(result);
    }

    /**
     * POST /api/stills/execute
     * 直接执行 Stills 协议块（绕过 AI，纯工具调用），用于测试和调试。
     *
     * <p>请求体：原始 Stills 协议文本
     * <p>响应体：{@code {"result": "@@result:... @@end"}}
     */
    @PostMapping(value = "/execute", consumes = "text/plain")
    public ResponseEntity<Map<String, String>> execute(@RequestBody String stillsProtocol) {
        if (stillsProtocol == null || stillsProtocol.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "请求体不能为空"));
        }

        log.info("[STILLS] /api/stills/execute");
        String result = orchestrator.processProtocol(stillsProtocol);
        return ResponseEntity.ok(Map.of("result", result));
    }

    private static String truncate(String s, int maxLen) {
        return s.length() <= maxLen ? s : s.substring(0, maxLen) + "...";
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Stills 会话管理（前端编排器的通信层后端）
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * POST /api/stills/session
     * 创建 Stills 会话 — 设置 system prompt 和初始用户需求。
     *
     * <p>请求体：
     * <pre>{"systemPrompt":"...", "userPrompt":"...", "windowSize":30}</pre>
     *
     * <p>响应体：
     * <pre>{"sessionId":"uuid"}</pre>
     */
    @PostMapping("/session")
    public ResponseEntity<Map<String, Object>> createStillsSession(
            @RequestBody Map<String, Object> request) {
        String systemPrompt = getRequiredString(request, "systemPrompt");
        if (systemPrompt == null) {
            return badRequest("systemPrompt 不能为空");
        }
        String userPrompt = getRequiredString(request, "userPrompt");
        if (userPrompt == null) {
            return badRequest("userPrompt 不能为空");
        }
        int windowSize = request.get("windowSize") instanceof Number n ? n.intValue() : 30;

        String sessionId = stillsSessionService.createSession(
            systemPrompt,
            userPrompt,
            windowSize,
            null,
            "stills");
        return ResponseEntity.ok(Map.of("sessionId", sessionId));
    }

    /**
     * POST /api/stills/turn
     * 执行一轮 LLM 对话 — 将当前对话历史（滑动窗口裁剪后）发给 LLM，返回回复。
     *
     * <p>请求体：{@code {"sessionId":"uuid"}}
     * <p>响应体：{@code {"text":"...", "reasoning":"..."}}
     */
    @PostMapping("/turn")
    public ResponseEntity<Map<String, Object>> executeStillsTurn(
            @RequestBody Map<String, String> request) {
        String sessionId = request.get("sessionId");
        if (sessionId == null || sessionId.isBlank()) {
            return badRequest("sessionId 不能为空");
        }

        TurnResult result = stillsSessionService.executeTurn(sessionId);
        if (result == null) {
            return ResponseEntity.status(404).body(Map.of(
                    "error", "会话不存在或 LLM 调用失败",
                    "sessionId", sessionId));
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("text", result.getText());
        if (result.getReasoning() != null) {
            body.put("reasoning", result.getReasoning());
        }
        if (result.getToolCalls() != null && !result.getToolCalls().isEmpty()) {
            body.put("toolCalls", result.getToolCalls());
        }
        return ResponseEntity.ok(body);
    }

    /**
     * POST /api/stills/append
     * 向会话追加消息（通常是工具执行结果，以 user 角色注入）。
     *
     * <p>请求体：{@code {"sessionId":"uuid", "role":"user", "content":"..."}}
     */
    @PostMapping("/append")
    public ResponseEntity<Map<String, Object>> appendStillsMessage(
            @RequestBody Map<String, String> request) {
        String sessionId = request.get("sessionId");
        String role = request.get("role");
        String content = request.get("content");

        if (sessionId == null || sessionId.isBlank()) {
            return badRequest("sessionId 不能为空");
        }
        if (content == null || content.isBlank()) {
            return badRequest("content 不能为空");
        }
        if (role == null || role.isBlank()) {
            role = "user";
        }

        boolean ok = stillsSessionService.appendMessage(sessionId, role, content, null, null);
        if (!ok) {
            return ResponseEntity.status(404).body(Map.of("error", "会话不存在"));
        }
        return ResponseEntity.ok(Map.of("ok", true));
    }

    /**
     * POST /api/stills/conversation
     * 获取完整对话记录（供下游 self-check 等后处理使用）。
     *
     * <p>请求体：{@code {"sessionId":"uuid"}}
     * <p>响应体：{@code {"conversation":[{"role":"...","content":"..."},...]}}
     */
    @PostMapping("/conversation")
    public ResponseEntity<Map<String, Object>> getStillsConversation(
            @RequestBody Map<String, String> request) {
        String sessionId = request.get("sessionId");
        if (sessionId == null || sessionId.isBlank()) {
            return badRequest("sessionId 不能为空");
        }

        List<Map<String, Object>> conversation =
            stillsSessionService.getConversationFull(sessionId);
        return ResponseEntity.ok(Map.of("conversation", conversation));
    }

    /**
     * POST /api/stills/destroy
     * 销毁会话。
     *
     * <p>请求体：{@code {"sessionId":"uuid"}}
     */
    @PostMapping("/destroy")
    public ResponseEntity<Map<String, Object>> destroyStillsSession(
            @RequestBody Map<String, String> request) {
        String sessionId = request.get("sessionId");
        if (sessionId == null || sessionId.isBlank()) {
            return badRequest("sessionId 不能为空");
        }

        stillsSessionService.destroySession(sessionId);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    /**
     * POST /api/stills/destroy-batch
     * 批量销毁会话（前端切换用户时调用，清理本次浏览器会话创建的所有 sessionId）。
     *
     * <p>请求体：{@code {"sessionIds":["uuid1","uuid2"]}}
     * <p>响应体：{@code {"destroyed":2}}
     */
    @SuppressWarnings("unchecked")
    @PostMapping("/destroy-batch")
    public ResponseEntity<Map<String, Object>> destroyStillsSessions(
            @RequestBody Map<String, Object> request) {
        Object raw = request.get("sessionIds");
        if (!(raw instanceof List<?> list) || list.isEmpty()) {
            return badRequest("sessionIds 不能为空");
        }
        List<String> sessionIds = ((List<Object>) list).stream()
                .filter(String.class::isInstance)
                .map(String.class::cast)
                .toList();
        int destroyed = stillsSessionService.destroySessions(sessionIds);
        return ResponseEntity.ok(Map.of("destroyed", destroyed));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 辅助
    // ─────────────────────────────────────────────────────────────────────────

    private static String getRequiredString(Map<String, Object> map, String key) {
        Object val = map.get(key);
        if (val instanceof String s && !s.isBlank()) {
            return s;
        }
        return null;
    }

    private static ResponseEntity<Map<String, Object>> badRequest(String message) {
        return ResponseEntity.badRequest().body(Map.of("error", message));
    }
}
