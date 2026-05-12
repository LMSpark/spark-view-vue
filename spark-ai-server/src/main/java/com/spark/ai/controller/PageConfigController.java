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
 * 椤甸潰閰嶇疆鏂囦欢 REST 绔偣 鈥?鎸?(tenantId, projectId) 闅旂銆? * SSE 浜嬩欢娴佷繚鎸佸叏灞€锛?api/events锛夈€? *
 * <h3>鏂囦欢绾х増鏈鐞?/h3>
 * 鐗堟湰鎿嶄綔璺緞锛歿pageId}/{filename}/__versions/...
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

    // 鈹€鈹€ SSE锛氱粺涓€浜嬩欢娴侊紙鍏ㄥ眬锛?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

    @GetMapping(value = "/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter unifiedEvents() {
        return sseService.subscribe();
    }

    // 鈹€鈹€ 椤甸潰鍒楄〃 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

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

    // 鈹€鈹€ 鍒涘缓椤甸潰 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

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
            return ResponseEntity.internalServerError().body(Map.of("error", "鏂囦欢绯荤粺閿欒: " + e.getMessage()));
        }
    }

    // 鈹€鈹€ 鍒犻櫎椤甸潰 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

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
            return ResponseEntity.internalServerError().body(Map.of("error", "鏂囦欢绯荤粺閿欒: " + e.getMessage()));
        }
    }

    // 鈹€鈹€ 闈欐€佽矾鐢卞悓姝?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

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

    // 鈹€鈹€ 璇诲彇鏍圭骇閰嶇疆鏂囦欢锛坮outes.json锛夆攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

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

    // 鈹€鈹€ 璇诲彇閰嶇疆鏂囦欢 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

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

    // 鈹€鈹€ 鍐欏叆鍗曚釜鏂囦欢锛堝彧鍐欑鐩橈紝涓嶈嚜鍔ㄥ崌鐗堬級鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

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

    // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲
    // 鏂囦欢绾х増鏈鐞?    // 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲

    /** 鍒涘缓鏂囦欢鐗堟湰蹇収锛堟墜鍔ㄥ崌鐗堬級 */
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

    /** 鏌ヨ鏌愭枃浠剁殑鐗堟湰鍒楄〃 */
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

    /** 鏌ヨ鏌愰〉闈㈠叏閮ㄦ枃浠剁殑鐗堟湰鍒楄〃 */
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

    /** 璇诲彇鎸囧畾鐗堟湰鐨勬枃浠跺唴瀹?*/
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

    /** 鎭㈠鎸囧畾鐗堟湰锛堣鐩栧伐浣滄枃浠讹級 */
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

    /** 鍒犻櫎鎸囧畾鐗堟湰 */
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

    /** 淇壀鏃х増鏈?*/
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

}
