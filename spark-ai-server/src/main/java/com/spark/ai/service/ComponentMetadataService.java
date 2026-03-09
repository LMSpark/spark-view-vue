package com.spark.ai.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 组件元数据存储服务。
 *
 * 前端构建时通过 POST /api/ai/component-metadata 上传 metadata JSON，
 * 服务端持久化到 data/component-metadata.json，供 AiPageService 构建系统提示词使用。
 * 启动时自动从文件加载，生产环境无需每次重新上传。
 */
@Service
public class ComponentMetadataService {

    private static final Logger log = LoggerFactory.getLogger(ComponentMetadataService.class);
    private static final Path METADATA_FILE = Path.of("data", "component-metadata.json");

    private final ObjectMapper objectMapper;

    private final AtomicReference<String> rawMetadata = new AtomicReference<>(null);
    private final AtomicReference<String> skillPromptIndex = new AtomicReference<>(null);
    private final AtomicReference<String> skillPromptCompact = new AtomicReference<>(null);
    private final AtomicReference<String> skillPromptFull = new AtomicReference<>(null);
    private final AtomicReference<Map<String, String>> skillPromptByType = new AtomicReference<>(Map.of());
    private final AtomicReference<String> buildTime = new AtomicReference<>(null);

    public ComponentMetadataService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * 启动时从 data/component-metadata.json 加载已有元数据。
     */
    @PostConstruct
    void loadFromFile() {
        if (!Files.isRegularFile(METADATA_FILE)) {
            log.info("[ComponentMetadata] 未找到 {}，等待构建上传", METADATA_FILE);
            return;
        }
        try {
            String json = Files.readString(METADATA_FILE, StandardCharsets.UTF_8);
            parseAndStore(json, false);
        } catch (IOException e) {
            log.warn("[ComponentMetadata] 读取 {} 失败: {}", METADATA_FILE, e.getMessage());
        }
    }

    /**
     * 接收并存储前端构建输出的组件元数据 JSON。
     * 同时持久化到 data/component-metadata.json。
     *
     * @param json 完整的 spark-component-metadata.json 内容
     * @return 解析摘要信息
     */
    public Map<String, Object> updateMetadata(String json) {
        Map<String, Object> summary = parseAndStore(json, true);
        persistToFile(json);
        return summary;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseAndStore(String json, boolean logUpdate) {
        try {
            Map<String, Object> metadata = objectMapper.readValue(json,
                    new TypeReference<Map<String, Object>>() {});

            String version = String.valueOf(metadata.getOrDefault("version", "unknown"));
            String buildTimeStr = String.valueOf(metadata.getOrDefault("buildTime", "unknown"));
            int componentCount = metadata.get("componentCount") instanceof Number n ? n.intValue() : 0;
            int skillCount = metadata.get("skillCount") instanceof Number n ? n.intValue() : 0;

            if (metadata.get("skillPrompts") instanceof Map<?, ?> prompts) {
                Object index = prompts.get("index");
                Object compact = prompts.get("compact");
                Object full = prompts.get("full");
                skillPromptIndex.set(index instanceof String s ? s : null);
                if (compact instanceof String s) {
                    skillPromptCompact.set(s);
                } else {
                    skillPromptCompact.set(null);
                }
                if (full instanceof String s) {
                    skillPromptFull.set(s);
                } else {
                    skillPromptFull.set(null);
                }
            } else {
                skillPromptIndex.set(null);
                skillPromptCompact.set(null);
                skillPromptFull.set(null);
            }

            if (metadata.get("skills") instanceof List<?> skills) {
                skillPromptByType.set(buildSkillPromptByType(skills));
            } else {
                skillPromptByType.set(Map.of());
            }

            rawMetadata.set(json);
            buildTime.set(buildTimeStr);

            String action = logUpdate ? "更新成功" : "从文件加载";
            log.info("[ComponentMetadata] {}: version={}, buildTime={}, components={}, skills={}",
                    action, version, buildTimeStr, componentCount, skillCount);

            return Map.of(
                    "ok", true,
                    "version", version,
                    "buildTime", buildTimeStr,
                    "componentCount", componentCount,
                    "skillCount", skillCount
            );
        } catch (Exception e) {
            log.error("[ComponentMetadata] 解析失败: {}", e.getMessage());
            throw new IllegalArgumentException("元数据 JSON 解析失败: " + e.getMessage());
        }
    }

    private void persistToFile(String json) {
        try {
            Files.createDirectories(METADATA_FILE.getParent());
            Files.writeString(METADATA_FILE, json, StandardCharsets.UTF_8);
            log.info("[ComponentMetadata] 已持久化到 {}", METADATA_FILE);
        } catch (IOException e) {
            log.warn("[ComponentMetadata] 写入 {} 失败: {}", METADATA_FILE, e.getMessage());
        }
    }

    /**
     * 获取 Skill Prompt（compact 模式）。
     * 如果未上传过元数据，返回 null。
     */
    public String getSkillPromptCompact() {
        return skillPromptCompact.get();
    }

    /**
     * 获取 Skill Prompt 索引（最短摘要）。
     */
    public String getSkillPromptIndex() {
        return skillPromptIndex.get();
    }

    /**
     * 获取 Skill Prompt（full 模式）。
     */
    public String getSkillPromptFull() {
        return skillPromptFull.get();
    }

    /**
     * 按 skill type 获取相关详情片段。
     */
    public String getSkillPromptForTypes(Collection<String> types) {
        if (types == null || types.isEmpty()) {
            return null;
        }

        Map<String, String> prompts = skillPromptByType.get();
        if (prompts == null || prompts.isEmpty()) {
            return null;
        }

        StringBuilder sb = new StringBuilder("## 本次需求相关 Skill 详情\n\n");
        boolean appended = false;
        LinkedHashSet<String> orderedTypes = new LinkedHashSet<>();
        for (String type : types) {
            if (type != null && !type.isBlank()) {
                orderedTypes.add(type);
            }
        }

        for (String type : orderedTypes) {
            String prompt = prompts.get(type);
            if (prompt == null || prompt.isBlank()) {
                continue;
            }
            if (appended) {
                sb.append("\n\n");
            }
            sb.append(prompt);
            appended = true;
        }

        return appended ? sb.toString() : null;
    }

    /**
     * 获取原始 metadata JSON。
     */
    public String getRawMetadata() {
        return rawMetadata.get();
    }

    /**
     * 获取构建时间戳。
     */
    public String getBuildTime() {
        return buildTime.get();
    }

    /**
     * 是否已有元数据。
     */
    public boolean hasMetadata() {
        return rawMetadata.get() != null;
    }

    private Map<String, String> buildSkillPromptByType(List<?> skills) {
        Map<String, String> prompts = new LinkedHashMap<>();
        for (Object entry : skills) {
            if (!(entry instanceof Map<?, ?> skill)) {
                continue;
            }
            Object rawType = skill.get("type");
            if (!(rawType instanceof String type) || type.isBlank()) {
                continue;
            }
            String prompt = buildSkillPrompt(type, skill);
            if (!prompt.isBlank()) {
                prompts.put(type, prompt);
            }
        }
        return Map.copyOf(prompts);
    }

    private String buildSkillPrompt(String type, Map<?, ?> skill) {
        StringBuilder sb = new StringBuilder();
        sb.append("### `").append(type).append("`\n");

        String description = asTrimmedString(skill.get("description"));
        if (!description.isBlank()) {
            sb.append("> ").append(description).append("\n");
        }

        appendCapabilityLine(sb, "依赖能力（consumes）", toStringList(skill.get("consumes")));
        appendCapabilityLine(sb, "提供能力（provides）", toStringList(skill.get("provides")));

        String inputSchema = asTrimmedString(skill.get("inputSchema"));
        if (!inputSchema.isBlank()) {
            sb.append("- **输入参数**: `").append(inputSchema).append("`\n");
        }

        String example = asTrimmedString(skill.get("example"));
        if (!example.isBlank()) {
            if (looksLikeJson(example)) {
                sb.append("- **调用示例**:\n```json\n")
                  .append(example)
                  .append("\n```\n");
            } else {
                sb.append("- **调用示例**: ").append(example).append("\n");
            }
        }

        return sb.toString().trim();
    }

    private void appendCapabilityLine(StringBuilder sb, String label, List<String> values) {
        if (values.isEmpty()) {
            return;
        }
        sb.append("- **").append(label).append("**: ");
        for (int index = 0; index < values.size(); index++) {
            if (index > 0) {
                sb.append(", ");
            }
            sb.append('`').append(values.get(index)).append('`');
        }
        sb.append("\n");
    }

    private List<String> toStringList(Object value) {
        if (!(value instanceof List<?> list) || list.isEmpty()) {
            return List.of();
        }
        return list.stream()
                .filter(String.class::isInstance)
                .map(String.class::cast)
                .map(String::trim)
                .filter(item -> !item.isEmpty())
                .toList();
    }

    private String asTrimmedString(Object value) {
        return value instanceof String text ? text.trim() : "";
    }

    private boolean looksLikeJson(String value) {
        String trimmed = value.trim();
        return trimmed.startsWith("{") || trimmed.startsWith("[");
    }
}
