package com.spark.ai.controller;

import com.spark.ai.service.PageConfigService;
import com.spark.ai.service.SseService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.nio.file.NoSuchFileException;
import java.util.List;
import java.util.Map;

/**
 * 页面配置文件 REST 端点 — 按 (tenantId, projectId) 隔离。
 * SSE 事件流保持全局（/api/events）。
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

    // ── SSE：统一事件流（全局） ──────────────────────────────────────────────

    @GetMapping(value = "/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter unifiedEvents() {
        return sseService.subscribe();
    }

    // ── 页面列表 ─────────────────────────────────────────────────────────────

    @GetMapping("/tenants/{tenantId}/projects/{projectId}/pages-config/__list")
    public ResponseEntity<?> listPages(@PathVariable String tenantId,
                                        @PathVariable String projectId) {
        List<Map<String, Object>> pages = pageConfigService.listPages(tenantId, projectId);
        return ResponseEntity.ok(pages);
    }

    // ── 创建页面 ─────────────────────────────────────────────────────────────

    @PostMapping("/tenants/{tenantId}/projects/{projectId}/pages-config/__create")
    public ResponseEntity<?> createPage(@PathVariable String tenantId,
                                         @PathVariable String projectId,
                                         @RequestBody Map<String, String> body) {
        try {
            String pageId = body.get("pageId");
            String title = body.getOrDefault("title", pageId);
            String icon = body.getOrDefault("icon", "📄");
            Map<String, Object> result = pageConfigService.createPage(
                    tenantId, projectId, pageId, title, icon);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (java.io.IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "文件系统错误: " + e.getMessage()));
        }
    }

    // ── 删除页面 ─────────────────────────────────────────────────────────────

    @DeleteMapping("/tenants/{tenantId}/projects/{projectId}/pages-config/{pageId}")
    public ResponseEntity<?> deletePage(@PathVariable String tenantId,
                                         @PathVariable String projectId,
                                         @PathVariable String pageId) {
        try {
            Map<String, Object> result = pageConfigService.deletePage(
                    tenantId, projectId, pageId);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException | SecurityException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (java.io.IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", "文件系统错误: " + e.getMessage()));
        }
    }

    // ── 静态路由同步 ─────────────────────────────────────────────────────────

    @PostMapping("/tenants/{tenantId}/projects/{projectId}/pages-config/__sync-routes")
    public ResponseEntity<?> syncRoutes(@PathVariable String tenantId,
                                         @PathVariable String projectId,
                                         @RequestBody List<Map<String, String>> routes) {
        try {
            Map<String, Object> result = pageConfigService.syncStaticRoutes(
                    tenantId, projectId, routes);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ── 读取根级配置文件（routes.json）─────────────────────────────────────────

    @GetMapping("/tenants/{tenantId}/projects/{projectId}/pages-config/routes.json")
    public ResponseEntity<?> getRoutes(@PathVariable String tenantId,
                                        @PathVariable String projectId,
                                        @RequestParam(required = false) String timestamp) {
        try {
            Map<String, Object> result = pageConfigService.readRootFile(
                    tenantId, projectId, "routes.json", timestamp);
            return ResponseEntity.ok(result);
        } catch (java.nio.file.NoSuchFileException e) {
            return ResponseEntity.notFound().build();
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    // ── 读取配置文件 ──────────────────────────────────────────────────────────

    @GetMapping("/tenants/{tenantId}/projects/{projectId}/pages-config/{pageId}/{filename}")
    public ResponseEntity<?> getFile(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String pageId,
            @PathVariable String filename,
            @RequestParam(required = false) String timestamp) {
        try {
            Map<String, Object> result = pageConfigService.readFile(
                    tenantId, projectId, pageId, filename, timestamp);
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

    @PutMapping("/tenants/{tenantId}/projects/{projectId}/pages-config/{pageId}/{filename}")
    public ResponseEntity<?> putFile(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String pageId,
            @PathVariable String filename,
            @RequestBody String content) {
        try {
            Map<String, Object> result = pageConfigService.writeFile(
                    tenantId, projectId, pageId, filename, content);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException | SecurityException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    // ── 批量写入 ──────────────────────────────────────────────────────────────

    @PostMapping("/tenants/{tenantId}/projects/{projectId}/pages-config/{pageId}/__batch")
    public ResponseEntity<?> batch(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String pageId,
            @RequestBody Map<String, String> files) {
        try {
            Map<String, Object> result = pageConfigService.writeBatch(
                    tenantId, projectId, pageId, files);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException | SecurityException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }
}
