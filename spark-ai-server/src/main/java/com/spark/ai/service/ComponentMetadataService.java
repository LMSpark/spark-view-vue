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
 * 服务端持久化到 data/component-metadata.json，供当前聊天相关提示词消费。
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
        } catch (IllegalArgumentException e) {
            log.warn("[ComponentMetadata] {} 内容无效，已忽略并等待构建重新上传: {}", METADATA_FILE, e.getMessage());
        }
    }

    /**
     * 接收并存储前端构建输出的组件元数据 JSON。
     * 同时持久化到 data/component-metadata.json。
     *
        * @param json 完整的 component-catalog.json 内容
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
            Map<String, Map<String, Object>> components = normalizeComponents(metadata.get("components"));
            int componentCount = metadata.get("componentCount") instanceof Number n
                    ? n.intValue()
                    : components.size();
            int skillCount = componentCount;

            Map<String, String> promptsByType = buildSkillPromptByType(components);
            skillPromptByType.set(Map.copyOf(promptsByType));
            skillPromptIndex.set(buildSkillPromptIndex(components));
            skillPromptCompact.set(buildSkillPromptCompact(components));
            skillPromptFull.set(buildSkillPromptFull(components, promptsByType));

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

    /**
     * 清除所有内存缓存。下次 AI 请求将读取空值，直到重新上传或调用 loadFromFile。
     */
    public void clearInMemoryCache() {
        rawMetadata.set(null);
        skillPromptIndex.set(null);
        skillPromptCompact.set(null);
        skillPromptFull.set(null);
        skillPromptByType.set(Map.of());
        buildTime.set(null);
        log.info("[ComponentMetadata] 内存缓存已清除");
    }

    private Map<String, Map<String, Object>> normalizeComponents(Object rawComponents) {
        if (!(rawComponents instanceof Map<?, ?> rawMap) || rawMap.isEmpty()) {
            throw new IllegalArgumentException("元数据缺少 components 映射，无法构建组件目录提示词");
        }

        Map<String, Map<String, Object>> components = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : rawMap.entrySet()) {
            if (!(entry.getKey() instanceof String type) || type.isBlank()) {
                continue;
            }
            if (!(entry.getValue() instanceof Map<?, ?> valueMap)) {
                continue;
            }

            Map<String, Object> normalized = new LinkedHashMap<>();
            for (Map.Entry<?, ?> field : valueMap.entrySet()) {
                if (field.getKey() instanceof String key) {
                    normalized.put(key, field.getValue());
                }
            }

            if (!normalized.isEmpty()) {
                components.put(type, normalized);
            }
        }

        if (components.isEmpty()) {
            throw new IllegalArgumentException("元数据 components 为空，无法构建组件目录提示词");
        }
        return components;
    }

    private Map<String, String> buildSkillPromptByType(Map<String, Map<String, Object>> components) {
        Map<String, String> prompts = new LinkedHashMap<>();
        components.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .forEach(entry -> {
                    String prompt = buildSkillPrompt(entry.getKey(), entry.getValue());
                    if (!prompt.isBlank()) {
                        prompts.put(entry.getKey(), prompt);
                    }
                });
        return prompts;
    }

    private String buildSkillPromptIndex(Map<String, Map<String, Object>> components) {
        StringBuilder sb = new StringBuilder();
        sb.append("## 组件目录索引（").append(components.size()).append("）\n\n");

        components.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .forEach(entry -> {
                    String type = entry.getKey();
                    Map<String, Object> component = entry.getValue();
                    String category = asTrimmedString(component.get("category"));
                    String description = asTrimmedString(component.get("description"));
                    sb.append("- `").append(type).append("`");
                    if (!category.isBlank()) {
                        sb.append(" [").append(category).append("]");
                    }
                    if (!description.isBlank()) {
                        sb.append(" - ").append(description);
                    }
                    sb.append("\n");
                });

        return sb.toString().trim();
    }

    private String buildSkillPromptCompact(Map<String, Map<String, Object>> components) {
        StringBuilder sb = new StringBuilder();
        sb.append(buildSkillPromptIndex(components));
        sb.append("\n\n");
        sb.append("使用规则：先从索引确定组件 type，再结合相关组件详情补全 props/emits，避免猜测属性。\n");
        sb.append("数据绑定规则：表级容器使用 dataViewKey（table@viewId / #scope@table@viewId）；读取 DataView 输出字段或上下文行使用 dataMember 和 dataField。");
        return sb.toString().trim();
    }

    private String buildSkillPromptFull(
            Map<String, Map<String, Object>> components,
            Map<String, String> promptsByType
    ) {
        StringBuilder sb = new StringBuilder();
        sb.append("## 组件目录（Full）\n\n");
        sb.append("共 ").append(components.size()).append(" 个组件。\n\n");

        boolean first = true;
        for (Map.Entry<String, String> entry : promptsByType.entrySet()) {
            if (!first) {
                sb.append("\n\n");
            }
            sb.append(entry.getValue());
            first = false;
        }

        return sb.toString().trim();
    }

    private String buildSkillPrompt(String type, Map<String, Object> component) {
        StringBuilder sb = new StringBuilder();
        sb.append("### `").append(type).append("`\n");

        String description = asTrimmedString(component.get("description"));
        if (!description.isBlank()) {
            sb.append("> ").append(description).append("\n");
        }

        String category = asTrimmedString(component.get("category"));
        if (!category.isBlank()) {
            sb.append("- **分类**: `").append(category).append("`\n");
        }

        String source = asTrimmedString(component.get("source"));
        if (!source.isBlank()) {
            sb.append("- **来源**: `").append(source).append("`\n");
        }

        appendCapabilityLine(sb, "依赖能力（consumes）", toStringList(component.get("consumes")));
        appendCapabilityLine(sb, "提供能力（provides）", toStringList(component.get("provides")));

        appendPropsSection(sb, toMapList(component.get("props")));
        appendEmitsSection(sb, toMapList(component.get("emits")));

        String notes = asTrimmedString(component.get("notes"));
        if (!notes.isBlank()) {
            sb.append("- **说明**: ").append(notes.replace("\n", "；")).append("\n");
        }

        String filePath = asTrimmedString(component.get("filePath"));
        if (!filePath.isBlank()) {
            sb.append("- **源码**: `").append(filePath).append("`\n");
        }

        return sb.toString().trim();
    }

    private void appendPropsSection(StringBuilder sb, List<Map<String, Object>> props) {
        if (props.isEmpty()) {
            return;
        }

        sb.append("- **Props**:\n");
        for (Map<String, Object> prop : props) {
            String name = asTrimmedString(prop.get("name"));
            if (name.isBlank()) {
                continue;
            }
            String type = asTrimmedString(prop.get("type"));
            boolean required = asBoolean(prop.get("required"));
            String description = asTrimmedString(prop.get("description"));
            String defaultValue = asTrimmedString(prop.get("default"));

            sb.append("  - `").append(name).append("` : `")
                    .append(type.isBlank() ? "unknown" : type).append("`");
            sb.append(required ? " (required)" : " (optional)");
            if (!defaultValue.isBlank()) {
                sb.append("，default=`").append(defaultValue).append("`");
            }
            if (!description.isBlank()) {
                sb.append("，").append(description);
            }
            sb.append("\n");
        }
    }

    private void appendEmitsSection(StringBuilder sb, List<Map<String, Object>> emits) {
        if (emits.isEmpty()) {
            return;
        }

        sb.append("- **Events**:\n");
        for (Map<String, Object> emit : emits) {
            String name = asTrimmedString(emit.get("name"));
            if (name.isBlank()) {
                continue;
            }
            String type = asTrimmedString(emit.get("type"));
            String description = asTrimmedString(emit.get("description"));

            sb.append("  - `").append(name).append("`");
            if (!type.isBlank()) {
                sb.append(" : `").append(type).append("`");
            }
            if (!description.isBlank()) {
                sb.append("，").append(description);
            }
            sb.append("\n");
        }
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

    private List<Map<String, Object>> toMapList(Object value) {
        if (!(value instanceof List<?> list) || list.isEmpty()) {
            return List.of();
        }

        List<Map<String, Object>> result = new java.util.ArrayList<>();
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> map)) {
                continue;
            }
            Map<String, Object> normalized = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (entry.getKey() instanceof String key) {
                    normalized.put(key, entry.getValue());
                }
            }
            if (!normalized.isEmpty()) {
                result.add(normalized);
            }
        }
        return result;
    }

    private boolean asBoolean(Object value) {
        if (value instanceof Boolean b) {
            return b;
        }
        if (value instanceof Number n) {
            return n.intValue() != 0;
        }
        if (value instanceof String s) {
            return "true".equalsIgnoreCase(s.trim());
        }
        return false;
    }

    private String asTrimmedString(Object value) {
        return value instanceof String text ? text.trim() : "";
    }

}
