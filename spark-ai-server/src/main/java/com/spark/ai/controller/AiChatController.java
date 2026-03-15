package com.spark.ai.controller;

import com.spark.ai.model.AiChatRequest;
import com.spark.ai.model.AiResponse;
import com.spark.ai.model.GeneralChatRequest;
import com.spark.ai.service.AiPageService;
import com.spark.ai.service.AiStreamService;
import com.spark.ai.service.ComponentMetadataService;
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
import java.util.Map;
import java.util.UUID;

/**
 * AI 端点控制器。
 *
 * <ul>
 *   <li>POST /api/ai/chat              — 页面配置生成（非流式，AIPageLoop 使用）</li>
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

    private final AiPageService aiPageService;
    private final AiStreamService aiStreamService;
    private final ComponentMetadataService metadataService;

    @Value("${spark.pages.config-dir:./data/pages-config}")
    private String pagesConfigDir;

    public AiChatController(AiPageService aiPageService,
                            AiStreamService aiStreamService,
                            ComponentMetadataService metadataService) {
        this.aiPageService = aiPageService;
        this.aiStreamService = aiStreamService;
        this.metadataService = metadataService;
    }

    /**
     * POST /api/ai/chat
     * 接收 generate / iterate 指令，调用 LLM，返回 AIResponse。
     */
    @PostMapping("/chat")
    public AiResponse chat(@RequestBody AiChatRequest request) {
        return aiPageService.processRequest(request);
    }

    /**
     * POST /api/ai/chat/stream-page
     * 流式版页面配置生成，以 SSE 逐 token 推送 LLM 输出。
     *
     * <p>SSE 事件类型：
     * <ul>
     *   <li><b>phase</b>：阶段进度（{"phase":1,"status":"start","message":"..."}）</li>
     *   <li><b>delta</b>：LLM 正文增量（{"delta":"..."}）</li>
     *   <li><b>reasoning</b>：推理过程增量（{"reasoning":"..."}，仅 DeepSeek）</li>
     *   <li><b>result</b>：最终合并结果（{"files":{...},"explanation":"..."}）</li>
     *   <li><b>done</b>：流结束（{"done":true}）</li>
     *   <li><b>error</b>：错误（{"error":"..."}）</li>
     * </ul>
     */
    @PostMapping(value = "/chat/stream-page", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter chatStreamPage(@RequestBody AiChatRequest request) {
        return aiPageService.processRequestStream(request);
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
}
