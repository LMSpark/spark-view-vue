package com.spark.ai.model;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.Map;

/**
 * 返回给前端的 AI 生成结果，与 src/services/ai-loop.ts 中 AIResponse 接口对齐。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AiResponse {

    /** 生成的文件内容 — 键：rule.json / pagedata.json / script.js / style.css */
    private Map<String, String> files;

    /** 向用户展示的中文说明 */
    private String explanation;

    /** 是否需要继续迭代 */
    private Boolean needsIteration;

    /** 迭代轮次（1=首次生成，2+=自动迭代修正） */
    private Integer iterationRound;

    public AiResponse() {}

    public AiResponse(Map<String, String> files, String explanation, Boolean needsIteration) {
        this.files = files;
        this.explanation = explanation;
        this.needsIteration = needsIteration;
    }

    public AiResponse(Map<String, String> files, String explanation, Boolean needsIteration, Integer iterationRound) {
        this.files = files;
        this.explanation = explanation;
        this.needsIteration = needsIteration;
        this.iterationRound = iterationRound;
    }

    public Map<String, String> getFiles() { return files; }
    public void setFiles(Map<String, String> files) { this.files = files; }

    public String getExplanation() { return explanation; }
    public void setExplanation(String explanation) { this.explanation = explanation; }

    public Boolean getNeedsIteration() { return needsIteration; }
    public void setNeedsIteration(Boolean needsIteration) { this.needsIteration = needsIteration; }

    public Integer getIterationRound() { return iterationRound; }
    public void setIterationRound(Integer iterationRound) { this.iterationRound = iterationRound; }
}
