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
 * 历史兼容：持久化旧版 component-catalog.json 到 data/component-metadata.json。
 *
 * pageDesign LLM 主路径不读取该缓存；仅保留文件读写与运维状态查询。
 */
@Service
public class ComponentMetadataService {

    private static final Logger log = LoggerFactory.getLogger(ComponentMetadataService.class);
    private static final Path METADATA_FILE = Path.of("data", "component-metadata.json");

    private final ObjectMapper objectMapper;

    private final AtomicReference<String> rawMetadata = new AtomicReference<>(null);
    private final AtomicReference<String> version = new AtomicReference<>(null);
    private final AtomicReference<String> buildTime = new AtomicReference<>(null);
    private final AtomicReference<Integer> componentCount = new AtomicReference<>(0);

    public ComponentMetadataService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * 启动时从 data/component-metadata.json 加载已有元数据。
     */
    @PostConstruct
    void loadFromFile() {
        if (!Files.isRegularFile(METADATA_FILE)) {
            log.info("[ComponentMetadata] 未找到 {}，跳过历史组件元数据缓存", METADATA_FILE);
            return;
        }
        try {
            String json = Files.readString(METADATA_FILE, StandardCharsets.UTF_8);
            parseAndStore(json, false);
        } catch (IOException e) {
            log.warn("[ComponentMetadata] 读取 {} 失败: {}", METADATA_FILE, e.getMessage());
        } catch (IllegalArgumentException e) {
            log.warn("[ComponentMetadata] {} 内容无效，已忽略: {}", METADATA_FILE, e.getMessage());
        }
    }

    /**
     * 接收并存储历史组件元数据 JSON，同时持久化到 data/component-metadata.json。
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

            String versionStr = String.valueOf(metadata.getOrDefault("version", "unknown"));
            String buildTimeStr = String.valueOf(metadata.getOrDefault("buildTime", "unknown"));
            int count = metadata.get("componentCount") instanceof Number number
                    ? number.intValue()
                    : countComponents(metadata.get("components"));

            rawMetadata.set(json);
            version.set(versionStr);
            buildTime.set(buildTimeStr);
            componentCount.set(count);

            String action = logUpdate ? "更新成功" : "从文件加载";
            log.info("[ComponentMetadata] {}: version={}, buildTime={}, components={}",
                    action, versionStr, buildTimeStr, count);

            return Map.of(
                    "ok", true,
                    "legacy", true,
                    "version", versionStr,
                    "buildTime", buildTimeStr,
                    "componentCount", count
            );
        } catch (IllegalArgumentException e) {
            throw e;
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
     * 获取原始 metadata JSON。
     */
    public String getRawMetadata() {
        return rawMetadata.get();
    }

    /**
     * 获取 catalog version 字段。
     */
    public String getVersion() {
        return version.get();
    }

    /**
     * 获取构建时间戳。
     */
    public String getBuildTime() {
        return buildTime.get();
    }

    /**
     * 获取 components 数量摘要。
     */
    public int getComponentCount() {
        Integer count = componentCount.get();
        return count == null ? 0 : count;
    }

    /**
     * 是否已有元数据。
     */
    public boolean hasMetadata() {
        return rawMetadata.get() != null;
    }

    /**
     * 清除内存缓存；重启后或手动 POST 写入可恢复。
     */
    public void clearInMemoryCache() {
        rawMetadata.set(null);
        version.set(null);
        buildTime.set(null);
        componentCount.set(0);
        log.info("[ComponentMetadata] 内存缓存已清除");
    }

    private int countComponents(Object rawComponents) {
        if (!(rawComponents instanceof Map<?, ?> rawMap) || rawMap.isEmpty()) {
            throw new IllegalArgumentException("元数据缺少 components 映射");
        }

        int count = 0;
        for (Map.Entry<?, ?> entry : rawMap.entrySet()) {
            if (!(entry.getKey() instanceof String type) || type.isBlank()) {
                continue;
            }
            if (!(entry.getValue() instanceof Map<?, ?> valueMap) || valueMap.isEmpty()) {
                continue;
            }
            count++;
        }

        if (count == 0) {
            throw new IllegalArgumentException("元数据 components 为空");
        }
        return count;
    }

}
