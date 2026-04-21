package com.spark.ai.controller;

import com.spark.ai.model.GeneralChatRequest;
import com.spark.ai.service.AiStreamService;
import com.spark.ai.service.ComponentMetadataService;
import com.spark.ai.service.SseService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * AI 端点控制器。
 *
 * <ul>
 *   <li>POST /api/ai/chat/stream       — 通用对话流式 SSE（AiChatWidget 使用）</li>
 *   <li>POST /api/ai/upload            — 文件上传（聊天附件）</li>
 *   <li>POST /api/ai/component-metadata — 组件元数据上传（构建时自动调用）</li>
 *   <li>GET  /api/ai/component-metadata — 元数据状态查询</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/ai")
public class AiChatController {

    private static final Logger log = LoggerFactory.getLogger(AiChatController.class);

    private final AiStreamService aiStreamService;
    private final ComponentMetadataService metadataService;
    private final SseService sseService;

    @Value("${spark.pages.config-dir:./data/pages-config}")
    private String pagesConfigDir;

    public AiChatController(AiStreamService aiStreamService,
                            ComponentMetadataService metadataService,
                            SseService sseService) {
        this.aiStreamService = aiStreamService;
        this.metadataService = metadataService;
        this.sseService = sseService;
    }

    /**
     * POST /api/ai/component-metadata
     * 接收前端构建输出的组件元数据 JSON（组件注册表 + Skill 目录 + 预构建 prompt）。
     * 由 scripts/upload-component-metadata.mjs 在 vite build 后调用。
     */
    @PostMapping("/component-metadata")
    public ResponseEntity<Map<String, Object>> uploadMetadata(@RequestBody String body) {
        Map<String, Object> result = metadataService.updateMetadata(body);
        return ResponseEntity.ok(result);
    }

    /**
     * GET /api/ai/component-metadata
     * 查看当前存储的组件元数据摘要（调试用）。
     */
    @GetMapping("/component-metadata")
    public ResponseEntity<Map<String, Object>> getMetadataStatus() {
        if (!metadataService.hasMetadata()) {
            return ResponseEntity.ok(Map.of(
                    "hasMetadata", false,
                    "message", "尚未上传组件元数据，请执行 pnpm run build 后上传"
            ));
        }
        return ResponseEntity.ok(Map.of(
                "hasMetadata", true,
                "buildTime", metadataService.getBuildTime(),
                "skillPromptLength", metadataService.getSkillPromptCompact() != null
                        ? metadataService.getSkillPromptCompact().length() : 0
        ));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 通用流式对话
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * POST /api/ai/chat/stream
     * 通用多轮/单轮对话，以 SSE 流形式逐 token 返回 AI 回复。
     *
     * <p>前端通过 fetch + ReadableStream 消费：
     * <pre>
     * event: delta
     * data: {"delta":"你好"}
     *
     * event: done
     * data: {"done":true}
     * </pre>
     */
    @PostMapping(value = "/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter chatStream(@RequestBody GeneralChatRequest request) {
        return aiStreamService.streamChat(request);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 文件上传（聊天附件）
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * POST /api/ai/upload
     * 上传聊天附件文件，存储到 data/uploads/，返回文件元信息。
     *
     * @return { fileId, name, size, mimeType }
     */
    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, Object>> uploadFile(
            @RequestPart("file") MultipartFile file) throws IOException {

        String rawName = file.getOriginalFilename() != null
                ? file.getOriginalFilename() : "unknown";
        // 安全：仅保留文件名部分，防止路径穿越
        String originalName = Paths.get(rawName).getFileName().toString();
        String fileId = UUID.randomUUID().toString();
        // 安全：仅允许字母数字和常见扩展名字符
        String ext = "";
        if (originalName.contains(".")) {
            String rawExt = originalName.substring(originalName.lastIndexOf('.'));
            if (rawExt.matches("\\.[a-zA-Z0-9]{1,10}")) {
                ext = rawExt;
            }
        }
        String storedName = fileId + ext;

        Path uploadDir = Paths.get(pagesConfigDir).getParent().resolve("uploads");
        Files.createDirectories(uploadDir);
        Path dest = uploadDir.resolve(storedName);
        file.transferTo(dest);

        log.info("[SPARK-AI][UPLOAD] saved {} -> {}", originalName, dest);

        return ResponseEntity.ok(Map.of(
                "fileId", fileId,
                "name", originalName,
                "size", file.getSize(),
                "mimeType", file.getContentType() != null ? file.getContentType() : "application/octet-stream"
        ));
    }

    @PostMapping("/debug/screenshot-request")
    public ResponseEntity<Map<String, Object>> requestScreenshot(
            @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> payload = new LinkedHashMap<>();
        String requestId = UUID.randomUUID().toString();

        if (body != null) {
            Object rawRequestId = body.get("requestId");
            if (rawRequestId instanceof String req && !req.isBlank()) {
                requestId = req;
            }
            putIfText(payload, "reason", body.get("reason"));
            putIfText(payload, "selector", body.get("selector"));
            putIfText(payload, "pageId", body.get("pageId"));
        }

        payload.put("requestId", requestId);
        payload.put("timestamp", System.currentTimeMillis());
        sseService.emit(SseService.EVENT_DEBUG_SCREENSHOT_REQUEST, payload);

        return ResponseEntity.ok(Map.of(
                "ok", true,
                "requestId", requestId,
                "eventType", SseService.EVENT_DEBUG_SCREENSHOT_REQUEST
        ));
    }

    @PostMapping("/debug/screenshot-result")
    public ResponseEntity<Map<String, Object>> reportScreenshotResult(
            @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> payload = new LinkedHashMap<>();
        if (body != null) {
            payload.putAll(body);
        }
        payload.put("serverTimestamp", System.currentTimeMillis());

        sseService.emit(SseService.EVENT_DEBUG_SCREENSHOT_RESULT, payload);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("ok", true);
        response.put("eventType", SseService.EVENT_DEBUG_SCREENSHOT_RESULT);
        Object requestId = payload.get("requestId");
        if (requestId instanceof String req && !req.isBlank()) {
            response.put("requestId", req);
        }
        return ResponseEntity.ok(response);
    }

    @PostMapping("/debug/route-request")
    public ResponseEntity<Map<String, Object>> requestDebugRoute(
            @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> payload = new LinkedHashMap<>();
        String requestId = UUID.randomUUID().toString();

        if (body != null) {
            payload.putAll(body);
            Object rawRequestId = body.get("requestId");
            if (rawRequestId instanceof String req && !req.isBlank()) {
                requestId = req;
            }
        }

        payload.put("requestId", requestId);
        payload.put("timestamp", System.currentTimeMillis());
        sseService.emit(SseService.EVENT_DEBUG_ROUTE_REQUEST, payload);

        return ResponseEntity.ok(Map.of(
                "ok", true,
                "requestId", requestId,
                "eventType", SseService.EVENT_DEBUG_ROUTE_REQUEST
        ));
    }

    @PostMapping("/debug/route-result")
    public ResponseEntity<Map<String, Object>> reportDebugRouteResult(
            @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> payload = new LinkedHashMap<>();
        if (body != null) {
            payload.putAll(body);
        }
        payload.put("serverTimestamp", System.currentTimeMillis());

        sseService.emit(SseService.EVENT_DEBUG_ROUTE_RESULT, payload);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("ok", true);
        response.put("eventType", SseService.EVENT_DEBUG_ROUTE_RESULT);
        Object requestId = payload.get("requestId");
        if (requestId instanceof String req && !req.isBlank()) {
            response.put("requestId", req);
        }
        return ResponseEntity.ok(response);
    }

    private static void putIfText(Map<String, Object> payload, String key, Object value) {
        if (value instanceof String text && !text.isBlank()) {
            payload.put(key, text);
        }
    }
}
