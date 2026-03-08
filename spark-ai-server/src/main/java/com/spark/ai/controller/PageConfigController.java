package com.spark.ai.controller;

import com.spark.ai.service.PageConfigService;
import com.spark.ai.service.SseService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.nio.file.NoSuchFileException;
import java.util.Map;

/**
 * 页面配置文件 REST 端点。
 * 完全对齐 Vite 插件 spark-pages-config-server 的行为，
 * 使 Java 后端可完整接管 /api/pages-config/** 路由。
 *
 * <pre>
 *   GET  /api/pages-config/__events          → SSE 文件变更通知
 *   GET  /api/pages-config/{pageId}/{file}   → 读取配置文件（支持时间戳协议）
 *   PUT  /api/pages-config/{pageId}/{file}   → 写入单个配置文件
 *   POST /api/pages-config/{pageId}/__batch  → 批量写入配置文件
 * </pre>
 */
@RestController
@RequestMapping("/api")
public class PageConfigController {

    private final PageConfigService pageConfigService;
    private final SseService sseService;

    public PageConfigController(PageConfigService pageConfigService, SseService sseService) {
        this.pageConfigService = pageConfigService;
        this.sseService = sseService;
    }

    // ── SSE：文件变更通知 ──────────────────────────────────────────────────────

    /**
     * GET /api/pages-config/__events
     * 前端 setupHotReload 通过此 SSE 流监听文件变更并自动重载页面。
     */
    @GetMapping(value = "/pages-config/__events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter events() {
        return sseService.subscribe();
    }

    // ── 读取根级配置文件（routes.json）─────────────────────────────────────────

    /**
     * GET /api/pages-config/routes.json?timestamp={iso}
     * 根级配置文件（不在任何 pageId 目录下），遵循 FileLoader 时间戳缓存协议。
     */
    @GetMapping("/pages-config/routes.json")
    public ResponseEntity<?> getRoutes(@RequestParam(required = false) String timestamp) {
        try {
            Map<String, Object> result = pageConfigService.readRootFile("routes.json", timestamp);
            return ResponseEntity.ok(result);
        } catch (java.nio.file.NoSuchFileException e) {
            return ResponseEntity.notFound().build();
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    // ── 读取配置文件 ──────────────────────────────────────────────────────────

    /**
     * GET /api/pages-config/{pageId}/{filename}?timestamp={iso}
     * 响应格式与 FileLoader 时间戳缓存协议对齐：
     *   { content, timestamp } 或 { notModified: true, timestamp, content: '' }
     */
    @GetMapping("/pages-config/{pageId}/{filename}")
    public ResponseEntity<?> getFile(
            @PathVariable String pageId,
            @PathVariable String filename,
            @RequestParam(required = false) String timestamp) {
        try {
            Map<String, Object> result = pageConfigService.readFile(pageId, filename, timestamp);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException | SecurityException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (NoSuchFileException e) {
            return ResponseEntity.notFound().build();
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    // ── 写入单个文件 ──────────────────────────────────────────────────────────

    /**
     * PUT /api/pages-config/{pageId}/{filename}
     * 写入单个配置文件，请求体为文件的原始文本内容。
     */
    @PutMapping("/pages-config/{pageId}/{filename}")
    public ResponseEntity<?> putFile(
            @PathVariable String pageId,
            @PathVariable String filename,
            @RequestBody String content) {
        try {
            Map<String, Object> result = pageConfigService.writeFile(pageId, filename, content);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException | SecurityException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    // ── 批量写入（AI 闭环核心路径）────────────────────────────────────────────

    /**
     * POST /api/pages-config/{pageId}/__batch
     * AI 生成页面后一次性写入 rule.json / pagedata.json / script.js / style.css，
     * 并自动在 routes.json 注册新页面路由，最后广播 SSE 触发热重载。
     */
    @PostMapping("/pages-config/{pageId}/__batch")
    public ResponseEntity<?> batch(
            @PathVariable String pageId,
            @RequestBody Map<String, String> files) {
        try {
            Map<String, Object> result = pageConfigService.writeBatch(pageId, files);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException | SecurityException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }
}
