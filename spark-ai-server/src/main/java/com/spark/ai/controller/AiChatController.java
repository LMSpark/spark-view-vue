package com.spark.ai.controller;

import com.spark.ai.model.AiChatRequest;
import com.spark.ai.model.AiResponse;
import com.spark.ai.service.AiPageService;
import com.spark.ai.service.ComponentMetadataService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * AI 页面生成端点。
 * 与 src/services/ai-loop.ts 中 AIPageLoop._callAI() 对接。
 */
@RestController
@RequestMapping("/api/ai")
public class AiChatController {

    private final AiPageService aiPageService;
    private final ComponentMetadataService metadataService;

    public AiChatController(AiPageService aiPageService,
                            ComponentMetadataService metadataService) {
        this.aiPageService = aiPageService;
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
}
