package com.spark.ai.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/**
 * 通用 AI 对话请求体。
 *
 * POST /api/ai/chat/stream
 * {
 *   "messages": [{"role":"user","content":"你好"}],
 *   "mode": "multi",
 *   "systemPrompt": "(可选) 系统提示词"
 * }
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class GeneralChatRequest {

    /** 对话消息列表（含历史上下文） */
    private List<MessageDto> messages;

    /**
     * 会话模式：
     * "multi"  — 多轮，messages 含完整历史
     * "single" — 单轮，messages 仅含当前用户输入
     */
    private String mode = "multi";

    /** 可选：自定义系统提示词（覆盖后端默认 systemPrompt） */
    private String systemPrompt;

    // ── getters / setters ──────────────────────────────────────────────────────

    public List<MessageDto> getMessages() { return messages; }
    public void setMessages(List<MessageDto> messages) { this.messages = messages; }

    public String getMode() { return mode; }
    public void setMode(String mode) { this.mode = mode; }

    public String getSystemPrompt() { return systemPrompt; }
    public void setSystemPrompt(String systemPrompt) { this.systemPrompt = systemPrompt; }

    // ── 嵌套 DTO ──────────────────────────────────────────────────────────────

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class MessageDto {
        private String role;    // "user" | "assistant" | "system"
        private String content;

        public String getRole() { return role; }
        public void setRole(String role) { this.role = role; }

        public String getContent() { return content; }
        public void setContent(String content) { this.content = content; }
    }
}
