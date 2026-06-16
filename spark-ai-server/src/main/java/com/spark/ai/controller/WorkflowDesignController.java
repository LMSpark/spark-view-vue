package com.spark.ai.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.spark.ai.service.WorkflowDesignService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.NoSuchFileException;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class WorkflowDesignController {

    private static final ResponseEntity<?> MISSING_CONTEXT = ResponseEntity.badRequest().body(
            Map.of("error", "MISSING_CONTEXT",
                    "message", "missing X-Tenant-Id or X-Project-Id request header"));

    private final WorkflowDesignService workflowDesignService;

    public WorkflowDesignController(WorkflowDesignService workflowDesignService) {
        this.workflowDesignService = workflowDesignService;
    }

    @GetMapping("/tenants/{tenantId}/projects/{projectId}/workflow-designs/__list")
    public ResponseEntity<?> listDesigns(@PathVariable String tenantId,
                                         @PathVariable String projectId) {
        try {
            return ResponseEntity.ok(workflowDesignService.listDesigns(tenantId, projectId));
        } catch (IllegalArgumentException | SecurityException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (UncheckedIOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/tenants/{tenantId}/projects/{projectId}/workflow-designs/__create")
    public ResponseEntity<?> createDesign(@PathVariable String tenantId,
                                          @PathVariable String projectId,
                                          @RequestBody Map<String, String> body) {
        try {
            String workflowId = body.get("workflowId");
            String title = body.get("title");
            return ResponseEntity.ok(workflowDesignService.createDesign(
                    tenantId, projectId, workflowId, title));
        } catch (IllegalArgumentException | SecurityException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/tenants/{tenantId}/projects/{projectId}/workflow-designs/{workflowId}/design.json")
    public ResponseEntity<?> getDesign(@PathVariable String tenantId,
                                       @PathVariable String projectId,
                                       @PathVariable String workflowId,
                                       @RequestParam(required = false) String timestamp) {
        try {
            return ResponseEntity.ok(workflowDesignService.readDesign(
                    tenantId, projectId, workflowId, timestamp));
        } catch (IllegalArgumentException | SecurityException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (NoSuchFileException e) {
            return ResponseEntity.notFound().build();
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/tenants/{tenantId}/projects/{projectId}/workflow-designs/{workflowId}/design.json")
    public ResponseEntity<?> putDesign(@PathVariable String tenantId,
                                       @PathVariable String projectId,
                                       @PathVariable String workflowId,
                                       @RequestBody JsonNode document) {
        try {
            return ResponseEntity.ok(workflowDesignService.writeDesign(
                    tenantId, projectId, workflowId, document));
        } catch (IllegalArgumentException | SecurityException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/tenants/{tenantId}/projects/{projectId}/workflow-designs/{workflowId}/definition.json")
    public ResponseEntity<?> getDefinition(@PathVariable String tenantId,
                                           @PathVariable String projectId,
                                           @PathVariable String workflowId,
                                           @RequestParam(required = false) String timestamp) {
        try {
            return ResponseEntity.ok(workflowDesignService.readDefinition(
                    tenantId, projectId, workflowId, timestamp));
        } catch (IllegalArgumentException | SecurityException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (NoSuchFileException e) {
            return ResponseEntity.notFound().build();
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/tenants/{tenantId}/projects/{projectId}/workflow-designs/{workflowId}/definition.json")
    public ResponseEntity<?> putDefinition(@PathVariable String tenantId,
                                           @PathVariable String projectId,
                                           @PathVariable String workflowId,
                                           @RequestBody JsonNode definition) {
        try {
            return ResponseEntity.ok(workflowDesignService.writeDefinition(
                    tenantId, projectId, workflowId, definition));
        } catch (IllegalArgumentException | SecurityException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (NoSuchFileException e) {
            return ResponseEntity.notFound().build();
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/tenants/{tenantId}/projects/{projectId}/workflow-designs/{workflowId}/__publish")
    public ResponseEntity<?> publishDefinition(@PathVariable String tenantId,
                                               @PathVariable String projectId,
                                               @PathVariable String workflowId,
                                               @RequestBody JsonNode definition) {
        try {
            return ResponseEntity.ok(workflowDesignService.publishDefinition(
                    tenantId, projectId, workflowId, definition));
        } catch (IllegalArgumentException | SecurityException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (NoSuchFileException e) {
            return ResponseEntity.notFound().build();
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/tenants/{tenantId}/projects/{projectId}/workflow-designs/{workflowId}")
    public ResponseEntity<?> deleteDesign(@PathVariable String tenantId,
                                          @PathVariable String projectId,
                                          @PathVariable String workflowId) {
        try {
            return ResponseEntity.ok(workflowDesignService.deleteDesign(
                    tenantId, projectId, workflowId));
        } catch (IllegalArgumentException | SecurityException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/workflow-designs/__list")
    public ResponseEntity<?> listDesignsFlat(HttpServletRequest request) {
        String[] ctx = resolveContext(request);
        if (ctx == null) return MISSING_CONTEXT;
        return listDesigns(ctx[0], ctx[1]);
    }

    @PostMapping("/workflow-designs/__create")
    public ResponseEntity<?> createDesignFlat(HttpServletRequest request,
                                              @RequestBody Map<String, String> body) {
        String[] ctx = resolveContext(request);
        if (ctx == null) return MISSING_CONTEXT;
        return createDesign(ctx[0], ctx[1], body);
    }

    @GetMapping("/workflow-designs/{workflowId}/design.json")
    public ResponseEntity<?> getDesignFlat(HttpServletRequest request,
                                           @PathVariable String workflowId,
                                           @RequestParam(required = false) String timestamp) {
        String[] ctx = resolveContext(request);
        if (ctx == null) return MISSING_CONTEXT;
        return getDesign(ctx[0], ctx[1], workflowId, timestamp);
    }

    @PutMapping("/workflow-designs/{workflowId}/design.json")
    public ResponseEntity<?> putDesignFlat(HttpServletRequest request,
                                           @PathVariable String workflowId,
                                           @RequestBody JsonNode document) {
        String[] ctx = resolveContext(request);
        if (ctx == null) return MISSING_CONTEXT;
        return putDesign(ctx[0], ctx[1], workflowId, document);
    }

    @GetMapping("/workflow-designs/{workflowId}/definition.json")
    public ResponseEntity<?> getDefinitionFlat(HttpServletRequest request,
                                               @PathVariable String workflowId,
                                               @RequestParam(required = false) String timestamp) {
        String[] ctx = resolveContext(request);
        if (ctx == null) return MISSING_CONTEXT;
        return getDefinition(ctx[0], ctx[1], workflowId, timestamp);
    }

    @PutMapping("/workflow-designs/{workflowId}/definition.json")
    public ResponseEntity<?> putDefinitionFlat(HttpServletRequest request,
                                               @PathVariable String workflowId,
                                               @RequestBody JsonNode definition) {
        String[] ctx = resolveContext(request);
        if (ctx == null) return MISSING_CONTEXT;
        return putDefinition(ctx[0], ctx[1], workflowId, definition);
    }

    @PostMapping("/workflow-designs/{workflowId}/__publish")
    public ResponseEntity<?> publishDefinitionFlat(HttpServletRequest request,
                                                   @PathVariable String workflowId,
                                                   @RequestBody JsonNode definition) {
        String[] ctx = resolveContext(request);
        if (ctx == null) return MISSING_CONTEXT;
        return publishDefinition(ctx[0], ctx[1], workflowId, definition);
    }

    @DeleteMapping("/workflow-designs/{workflowId}")
    public ResponseEntity<?> deleteDesignFlat(HttpServletRequest request,
                                              @PathVariable String workflowId) {
        String[] ctx = resolveContext(request);
        if (ctx == null) return MISSING_CONTEXT;
        return deleteDesign(ctx[0], ctx[1], workflowId);
    }

    private String[] resolveContext(HttpServletRequest request) {
        String tenant = request.getHeader("X-Tenant-Id");
        String project = request.getHeader("X-Project-Id");
        if (tenant == null || tenant.isBlank() || project == null || project.isBlank()) {
            return null;
        }
        return new String[] { tenant, project };
    }
}
