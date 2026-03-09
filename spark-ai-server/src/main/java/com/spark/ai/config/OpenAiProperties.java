package com.spark.ai.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * OpenAI-compatible API 配置。
 * 通过 application.yml 中的 spark.ai.openai.* 属性注入。
 * 支持 OpenAI / Azure OpenAI / Ollama / Qwen / DeepSeek 等 OpenAI 兼容端点。
 */
@ConfigurationProperties(prefix = "spark.ai.openai")
public class OpenAiProperties {

    /** API 基础 URL，默认 OpenAI 官方；Ollama 填 http://localhost:11434 */
    private String baseUrl = "https://api.openai.com";

    /** API Key；通过环境变量 OPENAI_API_KEY 注入 */
    private String apiKey = "";

    /** 模型名称；Ollama 填具体模型如 llama3、qwen2.5 */
    private String model = "gpt-4o";

    /** 采样温度，0 = 确定性输出，1 = 最大随机 */
    private double temperature = 0.3;

    /** 最大输出 token 数（DeepSeek 上限 8192） */
    private int maxTokens = 8192;

    /**
     * 是否启用 JSON 模式（response_format: json_object）。
     * OpenAI gpt-4o / gpt-3.5-turbo-1106+ 支持，Ollama 部分模型不支持，需设为 false。
     */
    private boolean jsonMode = true;

    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }

    public String getApiKey() { return apiKey; }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }

    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }

    public double getTemperature() { return temperature; }
    public void setTemperature(double temperature) { this.temperature = temperature; }

    public int getMaxTokens() { return maxTokens; }
    public void setMaxTokens(int maxTokens) { this.maxTokens = maxTokens; }

    public boolean isJsonMode() { return jsonMode; }
    public void setJsonMode(boolean jsonMode) { this.jsonMode = jsonMode; }
}
