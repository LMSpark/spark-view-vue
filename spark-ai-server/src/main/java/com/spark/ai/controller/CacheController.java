package com.spark.ai.controller;

import com.spark.ai.config.PagesConfigProperties;
import com.spark.ai.service.ComponentMetadataService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Stream;

/**
 * 缓存管理 REST 端点。
 * 提供后端缓存统计与清除功能。
 *
 * <pre>
 *   GET  /api/cache/stats  → 后端缓存统计信息
 *   POST /api/cache/clear-metadata → 清除历史组件元数据内存缓存
 * </pre>
 */
@RestController
@RequestMapping("/api/cache")
public class CacheController {

    private final ComponentMetadataService metadataService;
    private final Path configRoot;

    public CacheController(
            ComponentMetadataService metadataService,
            PagesConfigProperties pagesProps) {
        this.metadataService = metadataService;
        this.configRoot = Path.of(pagesProps.getConfigDir());
    }

    /**
     * GET /api/cache/stats
     * 返回后端缓存统计信息：组件元数据缓存状态 + 数据库统计。
     */
    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> stats() {
        Map<String, Object> result = new LinkedHashMap<>();

        // 历史组件元数据缓存（pageDesign LLM 不依赖）
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("legacy", true);
        metadata.put("loaded", metadataService.hasMetadata());
        metadata.put("buildTime", metadataService.getBuildTime());
        metadata.put("version", metadataService.getVersion());
        metadata.put("componentCount", metadataService.getComponentCount());
        result.put("componentMetadata", metadata);

        // 数据库统计
        Map<String, Object> db = new LinkedHashMap<>();
        db.put("pageCount", countPageDirectories());
        result.put("database", db);

        return ResponseEntity.ok(result);
    }

    private long countPageDirectories() {
        if (!Files.isDirectory(configRoot)) {
            return 0;
        }
        try (Stream<Path> walk = Files.walk(configRoot, 3)) {
            return walk
                    .filter(Files::isDirectory)
                    .filter(path -> configRoot.relativize(path).getNameCount() == 3)
                    .count();
        } catch (IOException e) {
            return 0;
        }
    }

    /**
     * POST /api/cache/clear-metadata
     * 清除组件元数据内存缓存（下次请求将从文件重新加载）。
     */
    @PostMapping("/clear-metadata")
    public ResponseEntity<Map<String, Object>> clearMetadata() {
        metadataService.clearInMemoryCache();
        return ResponseEntity.ok(Map.of(
                "ok", true,
                "message", "历史组件元数据内存缓存已清除（pageDesign LLM 不依赖该缓存）"
        ));
    }
}
