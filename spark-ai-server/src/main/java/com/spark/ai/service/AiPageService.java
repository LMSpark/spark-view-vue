package com.spark.ai.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.config.OpenAiProperties;
import com.spark.ai.model.AiChatRequest;
import com.spark.ai.model.AiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 核心服务：构建提示词 → 调用 LLM → 解析响应。
 *
 * 支持所有 OpenAI 兼容端点（OpenAI / Azure / Ollama / Qwen / DeepSeek 等）。
 */
@Service
public class AiPageService {

    private static final Logger log = LoggerFactory.getLogger(AiPageService.class);

    private final OpenAiProperties props;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;
    private final ComponentMetadataService metadataService;

    public AiPageService(OpenAiProperties props, ObjectMapper objectMapper,
                         ComponentMetadataService metadataService) {
        this.props = props;
        this.objectMapper = objectMapper;
        this.metadataService = metadataService;

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10_000);   // 连接超时 10s
        factory.setReadTimeout(60_000);      // 读取超时 60s（LLM 生成可能较慢）

        this.restClient = RestClient.builder()
                .requestFactory(factory)
                .baseUrl(props.getBaseUrl())
                .defaultHeader("Authorization", "Bearer " + props.getApiKey())
                .defaultHeader("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                .build();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 公共入口
    // ─────────────────────────────────────────────────────────────────────────

    public AiResponse processRequest(AiChatRequest request) {
        try {
            String userMessage = buildUserMessage(request);
            // 拼接系统提示词：基础模板 + 前端传入的 Skill 目录
            String systemPrompt = buildSystemPrompt(request.getSkillCatalog());
            log.info("[SPARK-AI] action={} pageId={} promptLen={} systemLen={}",
                    request.getAction(), request.getPageId(),
                    userMessage.length(), systemPrompt.length());

            String llmContent = callLlm(systemPrompt, userMessage);
            AiResponse response = parseResponse(llmContent);
            log.info("[SPARK-AI] done, files={}", response.getFiles() != null
                    ? response.getFiles().keySet() : "none");
            return response;

        } catch (Exception e) {
            log.error("[SPARK-AI] error: {}", e.getMessage(), e);
            return buildErrorResponse(request, e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 构建用户消息
    // ─────────────────────────────────────────────────────────────────────────

    private String buildUserMessage(AiChatRequest request) {
        StringBuilder sb = new StringBuilder();
        String pid = request.getPageId() != null ? request.getPageId() : "ai-page";

        if ("iterate".equals(request.getAction())) {
            sb.append("请根据以下反馈修改页面 `").append(pid).append("` 的配置。\n\n");

            String feedback = request.getFeedback() != null
                    ? request.getFeedback()
                    : request.getPrompt();
            if (feedback != null && !feedback.isBlank()) {
                sb.append("**用户反馈**：").append(feedback).append("\n\n");
            }

            if (request.getCurrentFiles() != null) {
                String ruleJson = request.getCurrentFiles().getOrDefault("rule.json", "(空)");
                String pagedataJson = request.getCurrentFiles().getOrDefault("pagedata.json", "(空)");
                sb.append("**当前 rule.json**：\n```json\n").append(ruleJson).append("\n```\n\n");
                sb.append("**当前 pagedata.json**：\n```json\n").append(pagedataJson).append("\n```\n\n");
            }

            if (request.getLogs() != null && !request.getLogs().isEmpty()) {
                sb.append("**运行时日志**（供你判断错误原因）：\n");
                for (AiChatRequest.LogSnapshot l : request.getLogs()) {
                    sb.append("  [").append(l.getLevel()).append("] ")
                      .append(l.getMessage()).append("\n");
                }
                sb.append("\n");
            }

        } else {
            // generate（默认）
            sb.append("请为页面 `").append(pid).append("` 生成配置。\n\n");
            String prompt = request.getPrompt() != null ? request.getPrompt() : "";
            sb.append("**用户需求**：").append(prompt);
        }

        return sb.toString();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 调用 LLM（OpenAI 兼容 API）
    // ─────────────────────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private String callLlm(String systemPrompt, String userMessage) throws Exception {
        List<Map<String, String>> messages = List.of(
                Map.of("role", "system", "content", systemPrompt),
                Map.of("role", "user", "content", userMessage)
        );

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", props.getModel());
        body.put("messages", messages);
        body.put("temperature", props.getTemperature());
        body.put("max_tokens", props.getMaxTokens());
        if (props.isJsonMode()) {
            body.put("response_format", Map.of("type", "json_object"));
        }

        Map<String, Object> responseMap = restClient.post()
                .uri("/v1/chat/completions")
                .body(body)
                .retrieve()
                .body(new ParameterizedTypeReference<Map<String, Object>>() {});

        if (responseMap == null) {
            throw new RuntimeException("LLM 返回空响应");
        }
        List<Map<String, Object>> choices =
                (List<Map<String, Object>>) responseMap.get("choices");
        if (choices == null || choices.isEmpty()) {
            throw new RuntimeException("LLM choices 为空");
        }
        Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");
        return (String) message.get("content");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 解析 LLM 输出 → AiResponse
    // ─────────────────────────────────────────────────────────────────────────

    private AiResponse parseResponse(String content) {
        // 1. 尝试直接解析
        AiResponse response = tryParseJson(content);
        if (response != null) return response;

        // 2. 尝试从 ```json ... ``` 代码块提取
        Pattern codeBlock = Pattern.compile("```(?:json)?\\s*([\\s\\S]+?)```");
        Matcher matcher = codeBlock.matcher(content);
        while (matcher.find()) {
            response = tryParseJson(matcher.group(1).trim());
            if (response != null) return response;
        }

        // 3. fallback：把整个内容放入 explanation
        log.warn("[SPARK-AI] 响应解析失败，内容片段：{}", content.substring(0, Math.min(200, content.length())));
        return buildErrorResponse(null, "响应解析失败，LLM 未返回标准 JSON");
    }

    @SuppressWarnings("unchecked")
    private AiResponse tryParseJson(String text) {
        try {
            Map<String, Object> raw = objectMapper.readValue(text,
                    new TypeReference<Map<String, Object>>() {});

            AiResponse response = new AiResponse();

            // 处理 files：LLM 可能返回嵌套 JSON 或字符串，都要转成字符串
            if (raw.get("files") instanceof Map<?, ?> rawFiles) {
                Map<String, String> files = new LinkedHashMap<>();
                for (Map.Entry<?, ?> entry : rawFiles.entrySet()) {
                    String key = entry.getKey().toString();
                    Object val = entry.getValue();
                    if (val instanceof String s) {
                        files.put(key, s);
                    } else if (val != null) {
                        // 嵌套 JSON → 序列化回字符串
                        files.put(key, objectMapper.writeValueAsString(val));
                    }
                }
                response.setFiles(files);
            }

            if (raw.get("explanation") instanceof String s) {
                response.setExplanation(s);
            }
            if (raw.get("needsIteration") instanceof Boolean b) {
                response.setNeedsIteration(b);
            }

            // 必须至少有 files 才算成功
            if (response.getFiles() == null || response.getFiles().isEmpty()) {
                return null;
            }
            return response;

        } catch (Exception e) {
            return null;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 错误响应
    // ─────────────────────────────────────────────────────────────────────────

    private AiResponse buildErrorResponse(AiChatRequest request, String errorMessage) {
        String pid = (request != null && request.getPageId() != null)
                ? request.getPageId() : "ai-page";
        // 转义特殊字符防止 JSON 注入
        String safeMsg = errorMessage != null
                ? errorMessage.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ")
                : "未知错误";

        String ruleJson = "[{\"type\":\"h2\",\"children\":[\"⚠️ AI 生成失败\"]},"
                + "{\"type\":\"p\",\"children\":[\"" + safeMsg + "\"]},"
                + "{\"type\":\"p\",\"children\":[\"请检查控制台日志或 application.yml 配置\"]}]";

        Map<String, String> files = new HashMap<>();
        files.put("rule.json", ruleJson);
        return new AiResponse(files, "错误：" + safeMsg, false);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 系统提示词：从 classpath 资源加载 + 运行时拼接 Skill Catalog
    // ─────────────────────────────────────────────────────────────────────────

    /** 基础系统提示词（从 resources/prompts/system-prompt.txt 加载） */
    private static final String BASE_SYSTEM_PROMPT = loadResourceFile("prompts/system-prompt.txt");

    /** 加载 classpath 资源文件 */
    private static String loadResourceFile(String path) {
        try (InputStream is = AiPageService.class.getClassLoader().getResourceAsStream(path)) {
            if (is == null) {
                throw new RuntimeException("资源文件未找到: " + path);
            }
            return new String(is.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new RuntimeException("加载资源文件失败: " + path, e);
        }
    }

    /**
     * 拼接完整系统提示词 = 基础模板 + Skill Catalog。
     *
     * 优先级：
     * 1. 服务端存储的组件元数据（由构建时上传的 spark-component-metadata.json 提供）
     * 2. 请求体中的 skillCatalog（前端运行时传入，作为 fallback）
     * 3. 无 Skill 信息时仅使用基础模板
     */
    private String buildSystemPrompt(String requestSkillCatalog) {
        // 优先使用服务端存储的元数据
        String storedPrompt = metadataService.getSkillPromptCompact();
        if (storedPrompt != null && !storedPrompt.isBlank()) {
            log.debug("[SPARK-AI] 使用服务端存储的 Skill Prompt (buildTime={})",
                    metadataService.getBuildTime());
            return BASE_SYSTEM_PROMPT + "\n\n" + storedPrompt;
        }

        // Fallback: 使用请求体传入的 skillCatalog
        if (requestSkillCatalog != null && !requestSkillCatalog.isBlank()) {
            log.debug("[SPARK-AI] 使用请求体传入的 Skill Catalog");
            return BASE_SYSTEM_PROMPT + "\n\n" + requestSkillCatalog;
        }

        return BASE_SYSTEM_PROMPT;
    }
}
