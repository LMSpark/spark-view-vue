package com.spark.ai.controller;

import com.spark.ai.repository.PageConfigRepository;
import com.spark.ai.service.ComponentMetadataService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 缓存管理 REST 端点。
 * 提供后端缓存统计与清除功能。
 *
 * <pre>
 *   GET  /api/cache/stats  → 后端缓存统计信息
 *   POST /api/cache/clear-metadata → 清除组件元数据内存缓存
 * </pre>
 */
@RestController
@RequestMapping("/api/cache")
public class CacheController {

    private final ComponentMetadataService metadataService;
    private final PageConfigRepository pageConfigRepo;

    public CacheController(
            ComponentMetadataService metadataService,
            PageConfigRepository pageConfigRepo) {
        this.metadataService = metadataService;
        this.pageConfigRepo = pageConfigRepo;
    }

    /**
     * GET /api/cache/stats
     * 返回后端缓存统计信息：组件元数据缓存状态 + 数据库统计。
     */
    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> stats() {
        Map<String, Object> result = new LinkedHashMap<>();

        // 组件元数据缓存
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("loaded", metadataService.hasMetadata());
        metadata.put("buildTime", metadataService.getBuildTime());
        metadata.put("hasIndex", metadataService.getSkillPromptIndex() != null);
        metadata.put("hasCompact", metadataService.getSkillPromptCompact() != null);
        metadata.put("hasFull", metadataService.getSkillPromptFull() != null);
        result.put("componentMetadata", metadata);

        // 数据库统计
        Map<String, Object> db = new LinkedHashMap<>();
        db.put("pageCount", pageConfigRepo.count());
        result.put("database", db);

        return ResponseEntity.ok(result);
    }

    /**
     * POST /api/cache/clear-metadata
     * 清除组件元数据内存缓存（下次请求将从文件重新加载）。
     */
    @PostMapping("/clear-metadata")
    public ResponseEntity<Map<String, Object>> clearMetadata() {
        metadataService.clearInMemoryCache();
        return ResponseEntity.ok(Map.of("ok", true, "message", "组件元数据内存缓存已清除"));
    }
}
