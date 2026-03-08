package com.spark.ai.controller;

import com.spark.ai.model.AiChatRequest;
import com.spark.ai.model.AiResponse;
import com.spark.ai.service.AiPageService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * AI 页面生成端点。
 * 与 src/services/ai-loop.ts 中 AIPageLoop._callAI() 对接。
 */
@RestController
@RequestMapping("/api/ai")
public class AiChatController {

    private final AiPageService aiPageService;

    public AiChatController(AiPageService aiPageService) {
        this.aiPageService = aiPageService;
    }

    /**
     * POST /api/ai/chat
     * 接收 generate / iterate 指令，调用 LLM，返回 AIResponse。
     */
    @PostMapping("/chat")
    public AiResponse chat(@RequestBody AiChatRequest request) {
        return aiPageService.processRequest(request);
    }
}
