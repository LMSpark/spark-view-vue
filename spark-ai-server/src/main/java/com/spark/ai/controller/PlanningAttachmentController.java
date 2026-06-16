package com.spark.ai.controller;

import com.spark.ai.service.PlanningAttachmentService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;

@RestController
@RequestMapping("/api/tenants/{tenantId}/projects/{projectId}/planning-attachments")
public class PlanningAttachmentController {

    private final PlanningAttachmentService attachmentService;

    public PlanningAttachmentController(PlanningAttachmentService attachmentService) {
        this.attachmentService = attachmentService;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, Object>> upload(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @RequestParam("file") MultipartFile file) throws IOException {
        return ResponseEntity.ok(attachmentService
                .uploadProjectPlanningAttachment(tenantId, projectId, file)
                .toMap());
    }

    @GetMapping("/{attachmentRef}/text")
    public ResponseEntity<Map<String, Object>> text(
            @PathVariable String tenantId,
            @PathVariable String projectId,
            @PathVariable String attachmentRef) {
        return ResponseEntity.ok(Map.of(
                "planningAttachmentRef", attachmentRef,
                "text", attachmentService.extractTextForPrompt(tenantId, projectId, attachmentRef)));
    }
}
