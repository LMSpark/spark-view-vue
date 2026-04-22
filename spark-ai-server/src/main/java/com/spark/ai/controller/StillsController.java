package com.spark.ai.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 旧 stills 协议端点（已下线）。
 *
 * <p>本控制器仅保留历史路径占位，所有请求统一返回 410 GONE，
 * 并引导调用方迁移到 /api/ai/sessions（protocolVersion=3）。
 */
@RestController
@RequestMapping("/api/stills")
public class StillsController {

    private static final Logger log = LoggerFactory.getLogger(StillsController.class);

    /**
     * POST /api/stills/chat（已下线）。
     */
    @PostMapping("/chat")
    public ResponseEntity<Map<String, Object>> chat(@RequestBody Map<String, String> request) {
        return legacyStillsEndpointRemoved();
    }

    /**
     * POST /api/stills/execute（已下线）。
     */
    @PostMapping(value = "/execute", consumes = "text/plain")
    public ResponseEntity<Map<String, Object>> execute(@RequestBody String stillsProtocol) {
        return legacyStillsEndpointRemoved();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Stills 会话管理（前端编排器的通信层后端）
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * POST /api/stills/session
     * 创建 Stills 会话 — 设置 system prompt 和初始用户需求。
     *
     * <p>请求体：
     * <pre>{"systemPrompt":"...", "userPrompt":"...", "windowSize":30, "tools":[...]}</pre>
     *
     * <p>响应体：
     * <pre>{"sessionId":"uuid"}</pre>
     */
    @SuppressWarnings("unchecked")
    @PostMapping("/session")
    public ResponseEntity<Map<String, Object>> createStillsSession(
            @RequestBody Map<String, Object> request) {
        return legacyStillsEndpointRemoved();
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
        return legacyStillsEndpointRemoved();
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
        return legacyStillsEndpointRemoved();
    }

    /**
     * POST /api/stills/append-batch
     * 向会话批量追加消息（支持 FC 模式的 assistant + tool results）。
     *
     * <p>请求体：
     * <pre>{"sessionId":"uuid", "messages":[{"role":"assistant","content":"...","tool_calls":[...]}, {"role":"tool","content":"...","tool_call_id":"..."}]}</pre>
     */
    @SuppressWarnings("unchecked")
    @PostMapping("/append-batch")
    public ResponseEntity<Map<String, Object>> appendStillsMessages(
            @RequestBody Map<String, Object> request) {
        return legacyStillsEndpointRemoved();
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
        return legacyStillsEndpointRemoved();
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
        return legacyStillsEndpointRemoved();
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
        return legacyStillsEndpointRemoved();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 辅助
    // ─────────────────────────────────────────────────────────────────────────

    private static ResponseEntity<Map<String, Object>> legacyStillsEndpointRemoved() {
        log.debug("Rejected request to removed legacy /api/stills endpoint");
        return ResponseEntity.status(HttpStatus.GONE).body(Map.of(
                "error", "LEGACY_PROTOCOL_REMOVED",
                "message", "/api/stills/* 接口已下线，请改用 /api/ai/sessions 并传递 protocolVersion=3"
        ));
    }
}
