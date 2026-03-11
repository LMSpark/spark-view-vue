package com.spark.ai.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * OpenAI-compatible API 配置。
 * 通过 application.yml 中的 spark.ai.openai.* 属性注入。
 * 支持 OpenAI / Azure OpenAI / Ollama / Qwen / DeepSeek 等 OpenAI 兼容端点。
 *
 * <h3>DeepSeek 适配</h3>
 * <ul>
 *   <li>baseUrl 包含 "deepseek" 或 model 以 "deepseek-" 开头时自动检测为 DeepSeek 提供者</li>
 *   <li>deepseek-reasoner 模型：禁用 temperature/top_p/json-mode，流式返回 reasoning_content</li>
 *   <li>deepseek-chat 模型：支持 response_format: json_object，支持 temperature/top_p</li>
 * </ul>
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

    /** 最大输出 token 数（DeepSeek-chat 上限 8192，DeepSeek-reasoner 上限 16384） */
    private int maxTokens = 8192;

    /**
     * 是否启用 JSON 模式（response_format: json_object）。
     * OpenAI gpt-4o / gpt-3.5-turbo-1106+ 支持，Ollama 部分模型不支持，需设为 false。
     * DeepSeek-reasoner 不支持此模式（自动跳过）。
     */
    private boolean jsonMode = true;

    /**
     * frequency_penalty（-2.0 ~ 2.0）。DeepSeek 建议在线搜索场景设 0.6 以上。
     * null 表示不传（使用服务端默认值 0）。
     */
    private Double frequencyPenalty;

    /**
     * presence_penalty（-2.0 ~ 2.0）。
     * null 表示不传（使用服务端默认值 0）。
     */
    private Double presencePenalty;

    /**
     * top_p（0 ~ 1）。
     * null 表示不传（使用服务端默认值 1）。
     * 注意：DeepSeek-reasoner 不支持此参数。
     */
    private Double topP;

    // ── Getter / Setter ──────────────────────────────────────────────────────

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

    public Double getFrequencyPenalty() { return frequencyPenalty; }
    public void setFrequencyPenalty(Double frequencyPenalty) { this.frequencyPenalty = frequencyPenalty; }

    public Double getPresencePenalty() { return presencePenalty; }
    public void setPresencePenalty(Double presencePenalty) { this.presencePenalty = presencePenalty; }

    public Double getTopP() { return topP; }
    public void setTopP(Double topP) { this.topP = topP; }

    // ── DeepSeek 智能检测 ────────────────────────────────────────────────────

    /**
     * 是否为 DeepSeek 提供者（基于 baseUrl 或 model 名称自动判断）。
     */
    public boolean isDeepSeek() {
        return (baseUrl != null && baseUrl.toLowerCase().contains("deepseek"))
                || (model != null && model.toLowerCase().startsWith("deepseek-"));
    }

    /**
     * 是否为 DeepSeek-reasoner 模型（需要特殊处理 reasoning_content）。
     * <p>
     * deepseek-reasoner 的限制：
     * <ul>
     *   <li>不支持 temperature / top_p / presence_penalty / frequency_penalty</li>
     *   <li>不支持 response_format: json_object</li>
     *   <li>流式输出 delta 中包含 reasoning_content 字段</li>
     *   <li>非流式输出 message 中包含 reasoning_content 字段</li>
     *   <li>max_tokens 上限 16384</li>
     * </ul>
     */
    public boolean isReasonerModel() {
        return model != null && model.toLowerCase().contains("reasoner");
    }

    /**
     * 当前配置是否应启用 JSON 模式。
     * DeepSeek-reasoner 强制禁用，其余场景遵循 jsonMode 配置。
     */
    public boolean isEffectiveJsonMode() {
        if (isReasonerModel()) return false;
        return jsonMode;
    }

    /**
     * 获取有效的 temperature。
     * DeepSeek-reasoner 不支持 temperature 参数，返回 null 表示不传。
     */
    public Double getEffectiveTemperature() {
        if (isReasonerModel()) return null;
        return temperature;
    }

    /**
     * 获取有效的 max_tokens。
     * DeepSeek-reasoner 上限 16384，DeepSeek-chat 上限 8192。
     */
    public int getEffectiveMaxTokens() {
        if (isReasonerModel()) {
            return Math.min(maxTokens, 16384);
        }
        if (isDeepSeek()) {
            return Math.min(maxTokens, 8192);
        }
        return maxTokens;
    }
}
