package com.spark.ai.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spark.ai.service.WorkflowDesignService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.file.NoSuchFileException;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(WorkflowDesignController.class)
@AutoConfigureMockMvc(addFilters = false)
class WorkflowDesignControllerTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @MockBean
    WorkflowDesignService workflowDesignService;

    @Test
    void listDesigns_returnsWorkflowDesignSummaries() throws Exception {
        when(workflowDesignService.listDesigns("t1", "p1"))
                .thenReturn(List.of(Map.of(
                        "workflowId", "spark.workflow.demo",
                        "filename", "design.json",
                        "timestamp", "123",
                        "title", "Demo")));

        mockMvc.perform(get("/api/tenants/t1/projects/p1/workflow-designs/__list"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].workflowId").value("spark.workflow.demo"))
                .andExpect(jsonPath("$.data[0].filename").value("design.json"));
    }

    @Test
    void createDesign_writesScaffoldFile() throws Exception {
        when(workflowDesignService.createDesign("t1", "p1", "spark.workflow.demo", "Demo"))
                .thenReturn(Map.of(
                        "ok", true,
                        "workflowId", "spark.workflow.demo",
                        "filename", "design.json",
                        "timestamp", "123"));

        mockMvc.perform(post("/api/tenants/t1/projects/p1/workflow-designs/__create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "workflowId": "spark.workflow.demo",
                                  "title": "Demo"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ok").value(true))
                .andExpect(jsonPath("$.data.workflowId").value("spark.workflow.demo"));
    }

    @Test
    void getDesign_returnsDocument() throws Exception {
        JsonNode document = objectMapper.readTree("""
                {
                  "kind": "agent.workflow.design",
                  "version": 1,
                  "id": "spark.workflow.demo",
                  "app": {
                    "id": "spark.workflow.demo",
                    "name": "Demo",
                    "mode": "workflow"
                  },
                  "workflow": {
                    "id": "spark.workflow.demo",
                    "version": 1,
                    "graph": {
                      "nodes": [],
                      "edges": [],
                      "viewport": {}
                    }
                  },
                  "x_spark": {
                    "draft": {},
                    "validation": {}
                  }
                }
                """);
        when(workflowDesignService.readDesign("t1", "p1", "spark.workflow.demo", null))
                .thenReturn(Map.of(
                        "workflowId", "spark.workflow.demo",
                        "filename", "design.json",
                        "timestamp", "123",
                        "document", document));

        mockMvc.perform(get("/api/tenants/t1/projects/p1/workflow-designs/spark.workflow.demo/design.json"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.document.kind").value("agent.workflow.design"))
                .andExpect(jsonPath("$.data.document.workflow.id").value("spark.workflow.demo"));
    }

    @Test
    void putDesign_savesJsonDocument() throws Exception {
        when(workflowDesignService.writeDesign(eq("t1"), eq("p1"), eq("spark.workflow.demo"), any(JsonNode.class)))
                .thenReturn(Map.of(
                        "ok", true,
                        "workflowId", "spark.workflow.demo",
                        "filename", "design.json",
                        "timestamp", "123"));

        mockMvc.perform(put("/api/tenants/t1/projects/p1/workflow-designs/spark.workflow.demo/design.json")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "kind": "agent.workflow.design",
                                  "version": 1,
                                  "id": "spark.workflow.demo",
                                  "app": {
                                    "id": "spark.workflow.demo",
                                    "name": "Demo",
                                    "mode": "workflow"
                                  },
                                  "workflow": {
                                    "id": "spark.workflow.demo",
                                    "version": 1,
                                    "graph": {
                                      "nodes": [],
                                      "edges": [],
                                      "viewport": {}
                                    }
                                  },
                                  "x_spark": {
                                    "draft": {},
                                    "validation": {}
                                  }
                                }
                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ok").value(true));
    }

    @Test
    void getDefinition_returnsDefinitionDocument() throws Exception {
        JsonNode definition = objectMapper.readTree("""
                {
                  "kind": "agent.workflow",
                  "version": 1,
                  "workflowId": "spark.workflow.demo"
                }
                """);
        when(workflowDesignService.readDefinition("t1", "p1", "spark.workflow.demo", null))
                .thenReturn(Map.of(
                        "workflowId", "spark.workflow.demo",
                        "filename", "definition.json",
                        "timestamp", "123",
                        "definition", definition));

        mockMvc.perform(get("/api/tenants/t1/projects/p1/workflow-designs/spark.workflow.demo/definition.json"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.definition.kind").value("agent.workflow"))
                .andExpect(jsonPath("$.data.definition.workflowId").value("spark.workflow.demo"));
    }

    @Test
    void putDefinition_savesDefinitionDocument() throws Exception {
        when(workflowDesignService.writeDefinition(eq("t1"), eq("p1"), eq("spark.workflow.demo"), any(JsonNode.class)))
                .thenReturn(Map.of(
                        "ok", true,
                        "workflowId", "spark.workflow.demo",
                        "filename", "definition.json",
                        "timestamp", "123"));

        mockMvc.perform(put("/api/tenants/t1/projects/p1/workflow-designs/spark.workflow.demo/definition.json")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "kind": "agent.workflow",
                                  "version": 1,
                                  "workflowId": "spark.workflow.demo"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ok").value(true))
                .andExpect(jsonPath("$.data.filename").value("definition.json"));
    }

    @Test
    void publishDefinition_writesDefinitionJson() throws Exception {
        when(workflowDesignService.publishDefinition(eq("t1"), eq("p1"), eq("spark.workflow.demo"), any(JsonNode.class)))
                .thenReturn(Map.of(
                        "ok", true,
                        "workflowId", "spark.workflow.demo",
                        "filename", "definition.json",
                        "timestamp", "123"));

        mockMvc.perform(post("/api/tenants/t1/projects/p1/workflow-designs/spark.workflow.demo/__publish")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "kind": "agent.workflow",
                                  "version": 1,
                                  "workflowId": "spark.workflow.demo"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ok").value(true))
                .andExpect(jsonPath("$.data.filename").value("definition.json"));
    }

    @Test
    void getDesign_returns404WhenMissing() throws Exception {
        when(workflowDesignService.readDesign("t1", "p1", "missing", null))
                .thenThrow(new NoSuchFileException("missing/design.json"));

        mockMvc.perform(get("/api/tenants/t1/projects/p1/workflow-designs/missing/design.json"))
                .andExpect(status().isNotFound());
    }

    @Test
    void flatRoutes_requireTenantAndProjectHeaders() throws Exception {
        mockMvc.perform(get("/api/workflow-designs/__list"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("MISSING_CONTEXT"));
    }

    @Test
    void flatRoutes_useTenantAndProjectHeaders() throws Exception {
        when(workflowDesignService.listDesigns("t1", "p1"))
                .thenReturn(List.of());

        mockMvc.perform(get("/api/workflow-designs/__list")
                        .header("X-Tenant-Id", "t1")
                        .header("X-Project-Id", "p1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isArray());
    }

    @Test
    void flatDefinitionRoute_usesTenantAndProjectHeaders() throws Exception {
        JsonNode definition = objectMapper.readTree("""
                {
                  "kind": "agent.workflow",
                  "version": 1,
                  "workflowId": "spark.workflow.demo"
                }
                """);
        when(workflowDesignService.readDefinition("t1", "p1", "spark.workflow.demo", null))
                .thenReturn(Map.of(
                        "workflowId", "spark.workflow.demo",
                        "filename", "definition.json",
                        "timestamp", "123",
                        "definition", definition));

        mockMvc.perform(get("/api/workflow-designs/spark.workflow.demo/definition.json")
                        .header("X-Tenant-Id", "t1")
                        .header("X-Project-Id", "p1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.filename").value("definition.json"));
    }

    @Test
    void flatPublishRoute_usesTenantAndProjectHeaders() throws Exception {
        when(workflowDesignService.publishDefinition(eq("t1"), eq("p1"), eq("spark.workflow.demo"), any(JsonNode.class)))
                .thenReturn(Map.of(
                        "ok", true,
                        "workflowId", "spark.workflow.demo",
                        "filename", "definition.json",
                        "timestamp", "123"));

        mockMvc.perform(post("/api/workflow-designs/spark.workflow.demo/__publish")
                        .header("X-Tenant-Id", "t1")
                        .header("X-Project-Id", "p1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "kind": "agent.workflow",
                                  "version": 1,
                                  "workflowId": "spark.workflow.demo"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.filename").value("definition.json"));
    }
}
