package com.spark.ai.controller;

import com.spark.ai.stills.StillsSessionService;
import com.spark.ai.stills.StillsSessionService.TurnResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 统一 AI 会话端点 — Generate/Iterate + Stills 共用。
 *
 * <ul>
 *   <li>POST   /api/ai/sessions           — 创建会话</li>
 *   <li>POST   /api/ai/sessions/{id}/turn  — 执行一轮 LLM（支持 SSE 流式）</li>
 *   <li>POST   /api/ai/sessions/{id}/append — 追加消息</li>
 *   <li>GET    /api/ai/sessions/{id}/conversation — 获取完整对话</li>
 *   <li>DELETE /api/ai/sessions/{id}       — 销毁会话</li>
 *   <li>DELETE /api/ai/sessions            — 批量销毁</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/ai/sessions")
public class AiSessionController {

    private static final Logger log = LoggerFactory.getLogger(AiSessionController.class);

    private final StillsSessionService sessionService;

    public AiSessionController(StillsSessionService sessionService) {
        this.sessionService = sessionService;
    }

    // ─────────────────────────────────────────────────────────
    // POST /api/ai/sessions — 创建会话
    // ─────────────────────────────────────────────────────────

    /**
     * 创建会话。
     *
     * <p>请求体：
     * <pre>{
     *   "systemPrompt": "...",
     *   "userPrompt": "...",
     *   "windowSize": 30,
     *   "tools": [...],           // FC tool definitions（可选）
     *   "mode": "generate"        // "generate" | "stills"
     * }</pre>
     */
    @PostMapping
    public ResponseEntity<Map<String, Object>> createSession(
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
        String mode = request.get("mode") instanceof String s ? s : "generate";

        // tools 是 JSON Array，直接存储转发给 LLM
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> tools = request.get("tools") instanceof List<?> list
                ? (List<Map<String, Object>>) list : null;

        String sessionId = sessionService.createSession(
                systemPrompt, userPrompt, windowSize, tools, mode);

        return ResponseEntity.ok(Map.of("sessionId", sessionId));
    }

    // ─────────────────────────────────────────────────────────
    // POST /api/ai/sessions/{id}/turn — 执行一轮 LLM 对话
    // ─────────────────────────────────────────────────────────

    /**
     * 非流式 turn — 返回 JSON。
     */
    @PostMapping("/{sessionId}/turn")
    public ResponseEntity<Map<String, Object>> executeTurn(
            @PathVariable String sessionId,
            @RequestBody(required = false) Map<String, Object> request) {

        boolean stream = request != null
                && request.get("stream") instanceof Boolean b && b;

        if (stream) {
            // 不应该走这里；流式走 SSE 端点
            return badRequest("流式请求请使用 SSE 端点");
        }

        TurnResult result = sessionService.executeTurn(sessionId);
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
     * 流式 turn — SSE 推送。
     */
    @PostMapping(value = "/{sessionId}/turn/stream",
            produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter executeTurnStream(@PathVariable String sessionId) {
        SseEmitter emitter = new SseEmitter(300_000L); // 5 min timeout

        sessionService.executeTurnStream(sessionId, emitter);

        return emitter;
    }

    // ─────────────────────────────────────────────────────────
    // POST /api/ai/sessions/{id}/append — 追加消息
    // ─────────────────────────────────────────────────────────

    /**
     * 追加消息（支持批量）。
     *
     * <p>请求体：
     * <pre>{
     *   "messages": [
     *     { "role": "assistant", "content": "...", "tool_calls": [...] },
     *     { "role": "tool", "content": "...", "tool_call_id": "call_xxx" }
     *   ]
     * }</pre>
     */
    @PostMapping("/{sessionId}/append")
    public ResponseEntity<Map<String, Object>> appendMessages(
            @PathVariable String sessionId,
            @RequestBody Map<String, Object> request) {

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> messages = request.get("messages") instanceof List<?> list
                ? (List<Map<String, Object>>) list : null;

        if (messages == null || messages.isEmpty()) {
            return badRequest("messages 不能为空");
        }

        for (Map<String, Object> msg : messages) {
            String role = msg.get("role") instanceof String s ? s : "user";
            String content = msg.get("content") instanceof String s ? s : "";
            String toolCallId = msg.get("tool_call_id") instanceof String s ? s : null;

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> toolCalls = msg.get("tool_calls") instanceof List<?> list
                    ? (List<Map<String, Object>>) list : null;

            boolean ok = sessionService.appendMessage(
                    sessionId, role, content, toolCallId, toolCalls);
            if (!ok) {
                return ResponseEntity.status(404).body(Map.of("error", "会话不存在"));
            }
        }

        return ResponseEntity.ok(Map.of("ok", true));
    }

    // ─────────────────────────────────────────────────────────
    // GET /api/ai/sessions/{id}/conversation
    // ─────────────────────────────────────────────────────────

    @GetMapping("/{sessionId}/conversation")
    public ResponseEntity<Map<String, Object>> getConversation(
            @PathVariable String sessionId) {
        List<Map<String, Object>> conversation =
                sessionService.getConversationFull(sessionId);
        return ResponseEntity.ok(Map.of("conversation", conversation));
    }

    // ─────────────────────────────────────────────────────────
    // DELETE /api/ai/sessions/{id}
    // ─────────────────────────────────────────────────────────

    @DeleteMapping("/{sessionId}")
    public ResponseEntity<Map<String, Object>> destroySession(
            @PathVariable String sessionId) {
        sessionService.destroySession(sessionId);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    // ─────────────────────────────────────────────────────────
    // DELETE /api/ai/sessions — 批量销毁
    // ─────────────────────────────────────────────────────────

    @DeleteMapping
    @SuppressWarnings("unchecked")
    public ResponseEntity<Map<String, Object>> destroySessions(
            @RequestBody Map<String, Object> request) {
        Object raw = request.get("sessionIds");
        if (!(raw instanceof List<?> list) || list.isEmpty()) {
            return badRequest("sessionIds 不能为空");
        }
        List<String> sessionIds = ((List<Object>) list).stream()
                .filter(String.class::isInstance)
                .map(String.class::cast)
                .toList();
        int destroyed = sessionService.destroySessions(sessionIds);
        return ResponseEntity.ok(Map.of("destroyed", destroyed));
    }

    // ─────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────

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
