package com.spark.ai.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.spark.ai.config.WorkflowDesignProperties;
import com.spark.ai.security.AccessGuardService;
import com.spark.ai.service.WorkflowDesignService;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(WorkflowDesignController.class)
@AutoConfigureMockMvc(addFilters = false)
@EnableConfigurationProperties(WorkflowDesignProperties.class)
@Import(WorkflowDesignService.class)
class WorkflowDesignApiIntegrationTest {

    private static final Path WORKFLOW_ROOT = createTempDirectory();

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @MockBean
    AccessGuardService accessGuardService;

    @DynamicPropertySource
    static void workflowDesignProperties(DynamicPropertyRegistry registry) {
        registry.add("spark.workflow-designs.storage-dir", () -> WORKFLOW_ROOT.toString());
    }

    @AfterAll
    static void cleanup() throws IOException {
        if (!Files.exists(WORKFLOW_ROOT)) {
            return;
        }
        try (var walk = Files.walk(WORKFLOW_ROOT)) {
            walk.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException e) {
                    throw new UncheckedIOException(e);
                }
            });
        } catch (UncheckedIOException e) {
            throw e.getCause();
        }
    }

    @Test
    void scopedHttpApi_persistsWorkflowDesignJsonEndToEnd() throws Exception {
        String workflowId = "spark.workflow.api";
        Path designFile = WORKFLOW_ROOT.resolve("t1/p1/" + workflowId + "/design.json");

        mockMvc.perform(post("/api/tenants/t1/projects/p1/workflow-designs/__create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "workflowId": "spark.workflow.api",
                                  "title": "API Workflow"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ok").value(true))
                .andExpect(jsonPath("$.data.workflowId").value(workflowId));
        assertTrue(Files.isRegularFile(designFile));

        MvcResult readResult = mockMvc.perform(get("/api/tenants/t1/projects/p1/workflow-designs/{workflowId}/design.json", workflowId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.document.kind").value("agent.workflow.design"))
                .andExpect(jsonPath("$.data.document.workflow.graph.nodes[1].data.type").value("loop"))
                .andExpect(jsonPath("$.data.document.workflow.graph.nodes[1].data.loop.subGraph.nodes[0].data.tool_name")
                        .value("single_model_edit"))
                .andReturn();

        ObjectNode document = readDocumentFromEnvelope(readResult);
        ((ObjectNode) document.get("app")).put("name", "API Workflow Saved");
        JsonNode phaseNodes = document.at("/workflow/graph/nodes/1/data/loop/subGraph/nodes");
        ObjectNode firstModel = (ObjectNode) phaseNodes.get(0).get("data").get("model");
        ObjectNode value = objectMapper.createObjectNode();
        value.put("name", "updated-from-api");
        firstModel.set("value", value);

        mockMvc.perform(put("/api/tenants/t1/projects/p1/workflow-designs/{workflowId}/design.json", workflowId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(document)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ok").value(true));

        JsonNode saved = objectMapper.readTree(designFile.toFile());
        assertEquals("API Workflow Saved", saved.path("app").path("name").asText());
        assertEquals("updated-from-api", saved.at("/workflow/graph/nodes/1/data/loop/subGraph/nodes/0/data/model/value/name").asText());

        mockMvc.perform(get("/api/tenants/t1/projects/p1/workflow-designs/__list"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].workflowId").value(workflowId))
                .andExpect(jsonPath("$.data[0].title").value("API Workflow Saved"));

        mockMvc.perform(delete("/api/tenants/t1/projects/p1/workflow-designs/{workflowId}", workflowId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ok").value(true));
        assertFalse(Files.exists(designFile.getParent()));
    }

    private ObjectNode readDocumentFromEnvelope(MvcResult result) throws IOException {
        JsonNode envelope = objectMapper.readTree(result.getResponse().getContentAsString());
        return (ObjectNode) envelope.at("/data/document").deepCopy();
    }

    private static Path createTempDirectory() {
        try {
            return Files.createTempDirectory("spark-workflow-design-api-");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
