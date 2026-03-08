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
    private final AtomicReference<String> skillPromptCompact = new AtomicReference<>(null);
    private final AtomicReference<String> skillPromptFull = new AtomicReference<>(null);
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
