package com.spark.ai.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 组件元数据存储服务。
 *
 * 前端构建时通过 POST /api/ai/component-metadata 上传 metadata JSON，
 * 服务端持久化到内存，供 AiPageService 构建系统提示词使用。
 */
@Service
public class ComponentMetadataService {

    private static final Logger log = LoggerFactory.getLogger(ComponentMetadataService.class);

    private final ObjectMapper objectMapper;

    /**
     * 存储完整的 metadata JSON（原始字符串，用于调试/持久化）
     */
    private final AtomicReference<String> rawMetadata = new AtomicReference<>(null);

    /**
     * 解析后的 Skill Prompt（compact 模式，直接拼接到系统提示词）
     */
    private final AtomicReference<String> skillPromptCompact = new AtomicReference<>(null);

    /**
     * 解析后的 Skill Prompt（full 模式，备用）
     */
    private final AtomicReference<String> skillPromptFull = new AtomicReference<>(null);

    /**
     * 构建时间戳
     */
    private final AtomicReference<String> buildTime = new AtomicReference<>(null);

    public ComponentMetadataService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * 接收并存储前端构建输出的组件元数据 JSON。
     *
     * @param json 完整的 spark-component-metadata.json 内容
     * @return 解析摘要信息
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> updateMetadata(String json) {
        try {
            Map<String, Object> metadata = objectMapper.readValue(json,
                    new TypeReference<Map<String, Object>>() {});

            // 提取基本信息
            String version = String.valueOf(metadata.getOrDefault("version", "unknown"));
            String buildTimeStr = String.valueOf(metadata.getOrDefault("buildTime", "unknown"));
            int componentCount = metadata.get("componentCount") instanceof Number n ? n.intValue() : 0;
            int skillCount = metadata.get("skillCount") instanceof Number n ? n.intValue() : 0;

            // 提取 skillPrompts
            if (metadata.get("skillPrompts") instanceof Map<?, ?> prompts) {
                Object compact = prompts.get("compact");
                Object full = prompts.get("full");
                if (compact instanceof String s) {
                    skillPromptCompact.set(s);
                }
                if (full instanceof String s) {
                    skillPromptFull.set(s);
                }
            }

            rawMetadata.set(json);
            buildTime.set(buildTimeStr);

            log.info("[ComponentMetadata] 更新成功: version={}, buildTime={}, components={}, skills={}",
                    version, buildTimeStr, componentCount, skillCount);

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

    /**
     * 获取 Skill Prompt（compact 模式）。
     * 如果未上传过元数据，返回 null。
     */
    public String getSkillPromptCompact() {
        return skillPromptCompact.get();
    }

    /**
     * 获取 Skill Prompt（full 模式）。
     */
    public String getSkillPromptFull() {
        return skillPromptFull.get();
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
}
