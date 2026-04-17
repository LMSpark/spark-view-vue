package com.spark.ai.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;
import java.util.Map;

/**
 * 前端 AIPageLoop 发送的请求体。
 *
 * generate 动作：{ action, pageId, prompt, sessionId }
 * iterate 动作：{ action, pageId, sessionId, feedback, currentFiles, logs }
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class AiChatRequest {

    private String action;
    private String pageId;
    private String prompt;
    private String sessionId;
    private String feedback;

    @JsonProperty("currentFiles")
    private Map<String, String> currentFiles;

    private List<LogSnapshot> logs;

    // ── getters / setters ─────────────────────────────────────────────────

    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }

    public String getPageId() { return pageId; }
    public void setPageId(String pageId) { this.pageId = pageId; }

    public String getPrompt() { return prompt; }
    public void setPrompt(String prompt) { this.prompt = prompt; }

    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }

    public String getFeedback() { return feedback; }
    public void setFeedback(String feedback) { this.feedback = feedback; }

    public Map<String, String> getCurrentFiles() { return currentFiles; }
    public void setCurrentFiles(Map<String, String> currentFiles) { this.currentFiles = currentFiles; }

    public List<LogSnapshot> getLogs() { return logs; }
    public void setLogs(List<LogSnapshot> logs) { this.logs = logs; }

    // ── 嵌套类：运行时日志快照 ───────────────────────────────────────────────

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class LogSnapshot {
        private long timestamp;
        private String level;
        private String message;
        private String componentType;
        private String pageId;
        private Map<String, Object> meta;

        public long getTimestamp() { return timestamp; }
        public void setTimestamp(long timestamp) { this.timestamp = timestamp; }

        public String getLevel() { return level; }
        public void setLevel(String level) { this.level = level; }

        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }

        public String getComponentType() { return componentType; }
        public void setComponentType(String componentType) { this.componentType = componentType; }

        public String getPageId() { return pageId; }
        public void setPageId(String pageId) { this.pageId = pageId; }

        public Map<String, Object> getMeta() { return meta; }
        public void setMeta(Map<String, Object> meta) { this.meta = meta; }
    }
}
