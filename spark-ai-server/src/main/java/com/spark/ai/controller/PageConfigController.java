package com.spark.ai.controller;

import com.spark.ai.service.PageConfigService;
import com.spark.ai.service.SseService;
import jakarta.servlet.http.HttpServletRequest;
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
 *
 * <h3>文件级版本管理</h3>
 * 版本操作路径：{pageId}/{filename}/__versions/...
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

    @GetMapping("/tenants/{tenantId}/projects/{projectId}/pages-config/__health")
    public ResponseEntity<?> checkPagesHealth(@PathVariable String tenantId,
                                               @PathVariable String projectId) {
        return ResponseEntity.ok(pageConfigService.checkPagesHealth(tenantId, projectId));
    }

    // ── 创建页面 ─────────────────────────────────────────────────────────────

    @PostMapping("/tenants/{tenantId}/projects/{projectId}/pages-config/__create")
    public ResponseEntity<?> createPage(@PathVariable String tenantId,
                                         @PathVariable String projectId,
                                         @RequestBody Map<String, String> body) {
        try {
            String pageId = body.get("pageId");
            String title = body.getOrDefault("title", pageId);
            String icon = body.getOrDefault("icon", "Document");
            Map<String, Object> result = pageConfigService.createPage(
                    tenantId, projectId, pageId, title, icon);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
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
        } catch (IOException e) {
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
        } catch (NoSuchFileException e) {
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

    // ── 写入单个文件（只写磁盘，不自动升版）──────────────────────────────────

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

    // ══════════════════════════════════════════════════════════════════════════
    // 文件级版本管理
    // ══════════════════════════════════════════════════════════════════════════

    /** 创建文件版本快照（手动升版） */
    @PostMapping("/tenants/{tenantId}/projects/{projectId}/pages-config/{pageId}/{filename}/__versions")
    public ResponseEntity<?> createFileVersion(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String pageId,
            @PathVariable String filename,
            @RequestBody(required = false) Map<String, String> body) {
        try {
            String modifiedBy = body != null ? body.get("modifiedBy") : null;
            Map<String, Object> result = pageConfigService.createFileVersion(
                    tenantId, projectId, pageId, filename, modifiedBy);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException | SecurityException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (NoSuchFileException e) {
            return ResponseEntity.notFound().build();
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    /** 查询某文件的版本列表 */
    @GetMapping("/tenants/{tenantId}/projects/{projectId}/pages-config/{pageId}/{filename}/__versions")
    public ResponseEntity<?> listFileVersions(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String pageId,
            @PathVariable String filename) {
        try {
            return ResponseEntity.ok(pageConfigService.listFileVersions(
                    tenantId, projectId, pageId, filename));
        } catch (IllegalArgumentException | SecurityException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /** 查询某页面全部文件的版本列表 */
    @GetMapping("/tenants/{tenantId}/projects/{projectId}/pages-config/{pageId}/__versions")
    public ResponseEntity<?> listPageFileVersions(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String pageId) {
        try {
            return ResponseEntity.ok(pageConfigService.listPageFileVersions(
                    tenantId, projectId, pageId));
        } catch (IllegalArgumentException | SecurityException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /** 读取指定版本的文件内容 */
    @GetMapping("/tenants/{tenantId}/projects/{projectId}/pages-config/{pageId}/{filename}/__versions/{version}")
    public ResponseEntity<?> getFileVersionContent(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String pageId,
            @PathVariable String filename,
            @PathVariable int version) {
        try {
            return ResponseEntity.ok(pageConfigService.readFileVersionContent(
                    tenantId, projectId, pageId, filename, version));
        } catch (IllegalArgumentException | SecurityException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (NoSuchFileException e) {
            return ResponseEntity.notFound().build();
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    /** 恢复指定版本（覆盖工作文件） */
    @PostMapping("/tenants/{tenantId}/projects/{projectId}/pages-config/{pageId}/{filename}/__versions/{version}/__restore")
    public ResponseEntity<?> restoreFileVersion(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String pageId,
            @PathVariable String filename,
            @PathVariable int version) {
        try {
            return ResponseEntity.ok(pageConfigService.restoreFileVersion(
                    tenantId, projectId, pageId, filename, version));
        } catch (IllegalArgumentException | SecurityException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (NoSuchFileException e) {
            return ResponseEntity.notFound().build();
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    /** 删除指定版本 */
    @DeleteMapping("/tenants/{tenantId}/projects/{projectId}/pages-config/{pageId}/{filename}/__versions/{version}")
    public ResponseEntity<?> deleteFileVersion(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String pageId,
            @PathVariable String filename,
            @PathVariable int version) {
        try {
            pageConfigService.deleteFileVersion(tenantId, projectId, pageId, filename, version);
            return ResponseEntity.ok(Map.of("ok", true, "pageId", pageId,
                    "filename", filename, "deletedVersion", version));
        } catch (IllegalArgumentException | SecurityException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (NoSuchFileException e) {
            return ResponseEntity.notFound().build();
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    /** 修剪旧版本 */
    @PostMapping("/tenants/{tenantId}/projects/{projectId}/pages-config/{pageId}/{filename}/__versions/__prune")
    public ResponseEntity<?> pruneFileVersions(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String pageId,
            @PathVariable String filename,
            @RequestBody Map<String, Object> body) {
        try {
            int keepCount = body.containsKey("keepCount") ? ((Number) body.get("keepCount")).intValue() : 10;
            int deleted = pageConfigService.pruneFileVersions(
                    tenantId, projectId, pageId, filename, keepCount);
            return ResponseEntity.ok(Map.of("ok", true, "pageId", pageId,
                    "filename", filename, "keepCount", keepCount, "deleted", deleted));
        } catch (IllegalArgumentException | SecurityException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // 扁平兼容路由（/api/pages-config/**）
    // 前端 PageConfigLoader 使用这些路由，租户 / 项目从请求头推断
    // ══════════════════════════════════════════════════════════════════════════

    private static final ResponseEntity<?> MISSING_CONTEXT = ResponseEntity.badRequest().body(
        Map.of("error", "MISSING_CONTEXT",
               "message", "请求头缺少 X-Tenant-Id 或 X-Project-Id，请先登录"));

    private String[] resolveContext(HttpServletRequest request) {
        String tenant = request.getHeader("X-Tenant-Id");
        String project = request.getHeader("X-Project-Id");
        if (tenant == null || tenant.isBlank() || project == null || project.isBlank()) {
            return null;
        }
        return new String[] { tenant, project };
    }

    @PostMapping("/pages-config/__sync-routes")
    public ResponseEntity<?> syncRoutesFlat(HttpServletRequest request,
                                             @RequestBody List<Map<String, String>> routes) {
        String[] ctx = resolveContext(request);
        if (ctx == null) return MISSING_CONTEXT;
        return syncRoutes(ctx[0], ctx[1], routes);
    }

    @GetMapping("/pages-config/routes.json")
    public ResponseEntity<?> getRoutesFlat(HttpServletRequest request,
                                            @RequestParam(required = false) String timestamp) {
        String[] ctx = resolveContext(request);
        if (ctx == null) return MISSING_CONTEXT;
        return getRoutes(ctx[0], ctx[1], timestamp);
    }

    @GetMapping("/pages-config/{pageId}/{filename}")
    public ResponseEntity<?> getFileFlat(HttpServletRequest request,
                                          @PathVariable String pageId,
                                          @PathVariable String filename,
                                          @RequestParam(required = false) String timestamp) {
        String[] ctx = resolveContext(request);
        if (ctx == null) return MISSING_CONTEXT;
        return getFile(ctx[0], ctx[1], pageId, filename, timestamp);
    }

    @PutMapping("/pages-config/{pageId}/{filename}")
    public ResponseEntity<?> putFileFlat(HttpServletRequest request,
                                          @PathVariable String pageId,
                                          @PathVariable String filename,
                                          @RequestBody String content) {
        String[] ctx = resolveContext(request);
        if (ctx == null) return MISSING_CONTEXT;
        return putFile(ctx[0], ctx[1], pageId, filename, content);
    }

    @PostMapping("/pages-config/{pageId}/{filename}/__versions")
    public ResponseEntity<?> createFileVersionFlat(HttpServletRequest request,
                                                    @PathVariable String pageId,
                                                    @PathVariable String filename,
                                                    @RequestBody(required = false) Map<String, String> body) {
        String[] ctx = resolveContext(request);
        if (ctx == null) return MISSING_CONTEXT;
        return createFileVersion(ctx[0], ctx[1], pageId, filename, body);
    }

    @GetMapping("/pages-config/{pageId}/{filename}/__versions")
    public ResponseEntity<?> listFileVersionsFlat(HttpServletRequest request,
                                                   @PathVariable String pageId,
                                                   @PathVariable String filename) {
        String[] ctx = resolveContext(request);
        if (ctx == null) return MISSING_CONTEXT;
        return listFileVersions(ctx[0], ctx[1], pageId, filename);
    }

    @GetMapping("/pages-config/{pageId}/__versions")
    public ResponseEntity<?> listPageFileVersionsFlat(HttpServletRequest request,
                                                       @PathVariable String pageId) {
        String[] ctx = resolveContext(request);
        if (ctx == null) return MISSING_CONTEXT;
        return listPageFileVersions(ctx[0], ctx[1], pageId);
    }

    @GetMapping("/pages-config/{pageId}/{filename}/__versions/{version}")
    public ResponseEntity<?> getFileVersionContentFlat(HttpServletRequest request,
                                                        @PathVariable String pageId,
                                                        @PathVariable String filename,
                                                        @PathVariable int version) {
        String[] ctx = resolveContext(request);
        if (ctx == null) return MISSING_CONTEXT;
        return getFileVersionContent(ctx[0], ctx[1], pageId, filename, version);
    }

    @PostMapping("/pages-config/{pageId}/{filename}/__versions/{version}/__restore")
    public ResponseEntity<?> restoreFileVersionFlat(HttpServletRequest request,
                                                     @PathVariable String pageId,
                                                     @PathVariable String filename,
                                                     @PathVariable int version) {
        String[] ctx = resolveContext(request);
        if (ctx == null) return MISSING_CONTEXT;
        return restoreFileVersion(ctx[0], ctx[1], pageId, filename, version);
    }

    @DeleteMapping("/pages-config/{pageId}/{filename}/__versions/{version}")
    public ResponseEntity<?> deleteFileVersionFlat(HttpServletRequest request,
                                                    @PathVariable String pageId,
                                                    @PathVariable String filename,
                                                    @PathVariable int version) {
        String[] ctx = resolveContext(request);
        if (ctx == null) return MISSING_CONTEXT;
        return deleteFileVersion(ctx[0], ctx[1], pageId, filename, version);
    }

    @PostMapping("/pages-config/{pageId}/{filename}/__versions/__prune")
    public ResponseEntity<?> pruneFileVersionsFlat(HttpServletRequest request,
                                                    @PathVariable String pageId,
                                                    @PathVariable String filename,
                                                    @RequestBody Map<String, Object> body) {
        String[] ctx = resolveContext(request);
        if (ctx == null) return MISSING_CONTEXT;
        return pruneFileVersions(ctx[0], ctx[1], pageId, filename, body);
    }

    @GetMapping("/pages-config/__list")
    public ResponseEntity<?> listPagesFlat(HttpServletRequest request) {
        String[] ctx = resolveContext(request);
        if (ctx == null) return MISSING_CONTEXT;
        return listPages(ctx[0], ctx[1]);
    }

    @GetMapping("/pages-config/__health")
    public ResponseEntity<?> checkPagesHealthFlat(HttpServletRequest request) {
        String[] ctx = resolveContext(request);
        if (ctx == null) return MISSING_CONTEXT;
        return checkPagesHealth(ctx[0], ctx[1]);
    }

    @PostMapping("/pages-config/__create")
    public ResponseEntity<?> createPageFlat(HttpServletRequest request,
                                             @RequestBody Map<String, String> body) {
        String[] ctx = resolveContext(request);
        if (ctx == null) return MISSING_CONTEXT;
        return createPage(ctx[0], ctx[1], body);
    }

    @DeleteMapping("/pages-config/{pageId}")
    public ResponseEntity<?> deletePageFlat(HttpServletRequest request,
                                             @PathVariable String pageId) {
        String[] ctx = resolveContext(request);
        if (ctx == null) return MISSING_CONTEXT;
        return deletePage(ctx[0], ctx[1], pageId);
    }
}
