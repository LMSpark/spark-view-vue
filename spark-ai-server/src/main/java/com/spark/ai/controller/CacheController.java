package com.spark.ai.controller;

import com.spark.ai.config.PagesConfigProperties;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Stream;

/**
 * 缓存管理 REST 端点。
 *
 * <pre>
 *   GET /api/cache/stats → 后端缓存统计信息
 * </pre>
 */
@RestController
@RequestMapping("/api/cache")
public class CacheController {

    private final Path configRoot;

    public CacheController(PagesConfigProperties pagesProps) {
        this.configRoot = Path.of(pagesProps.getConfigDir());
    }

    /**
     * GET /api/cache/stats
     * 返回后端页面配置统计。
     */
    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> stats() {
        Map<String, Object> result = new LinkedHashMap<>();

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
}
