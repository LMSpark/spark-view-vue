package com.spark.ai.controller;

import com.spark.ai.service.ProjectService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * 项目管理 REST 控制器。
 *
 * <pre>
 * GET    /api/tenants/{tenantId}/projects                    — 项目列表
 * POST   /api/tenants/{tenantId}/projects                    — 创建项目
 * GET    /api/tenants/{tenantId}/projects/{projectId}        — 项目详情
 * PUT    /api/tenants/{tenantId}/projects/{projectId}        — 更新项目
 * DELETE /api/tenants/{tenantId}/projects/{projectId}        — 删除项目
 * </pre>
 */
@RestController
@RequestMapping("/api/tenants/{tenantId}/projects")
public class ProjectController {

    private final ProjectService projectService;

    public ProjectController(ProjectService projectService) {
        this.projectService = projectService;
    }

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> list(@PathVariable String tenantId) {
        return ResponseEntity.ok(projectService.listProjects(tenantId));
    }

    @PostMapping
    public ResponseEntity<?> create(@PathVariable String tenantId,
                                     @RequestBody Map<String, String> body) {
        try {
            String projectId = body.get("projectId");
            if (projectId == null || projectId.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "projectId 不能为空"));
            }
            Map<String, Object> result = projectService.createProject(
                    tenantId, projectId,
                    body.get("name"), body.get("icon"), body.get("description"),
                    body.get("homeNodeId"));
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/{projectId}")
    public ResponseEntity<?> get(@PathVariable String tenantId,
                                  @PathVariable String projectId) {
        Map<String, Object> project = projectService.getProject(tenantId, projectId);
        if (project == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(project);
    }

    @PutMapping("/{projectId}")
    public ResponseEntity<?> update(@PathVariable String tenantId,
                                     @PathVariable String projectId,
                                     @RequestBody Map<String, Object> body) {
        try {
            Map<String, Object> result = projectService.updateProject(tenantId, projectId, body);
            return ResponseEntity.ok(result);
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{projectId}")
    public ResponseEntity<?> delete(@PathVariable String tenantId,
                                     @PathVariable String projectId) {
        try {
            projectService.deleteProject(tenantId, projectId);
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
