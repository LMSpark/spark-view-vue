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
        Path definitionFile = WORKFLOW_ROOT.resolve("t1/p1/" + workflowId + "/definition.json");

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

        mockMvc.perform(post("/api/tenants/t1/projects/p1/workflow-designs/{workflowId}/__publish", workflowId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createDefinition(workflowId))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ok").value(true))
                .andExpect(jsonPath("$.data.filename").value("definition.json"));
        assertTrue(Files.isRegularFile(definitionFile));
        JsonNode definition = objectMapper.readTree(definitionFile.toFile());
        assertEquals("agent.workflow", definition.path("kind").asText());
        assertEquals(workflowId, definition.path("workflowId").asText());

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

    private ObjectNode createDefinition(String workflowId) {
        ObjectNode document = objectMapper.createObjectNode();
        document.put("kind", "agent.workflow");
        document.put("version", 1);
        document.put("workflowId", workflowId);

        ObjectNode source = document.putObject("source");
        source.put("designKind", "agent.workflow.design");
        source.put("designId", workflowId);
        source.put("designVersion", 1);

        ObjectNode factory = document.putObject("factory");
        addDefinitionSection(factory, "identity", "F0", "factory.identity", "workflow.factory.identity");
        addDefinitionSection(factory, "materials", "F1", "factory.materials", "workflow.factory.materials");
        addDefinitionSection(factory, "knowledge", "F2", "factory.knowledge", "workflow.factory.knowledge");
        addDefinitionSection(factory, "contract", "F3", "factory.contract", "workflow.factory.contract");
        addDefinitionSection(factory, "runtime", "F4", "factory.runtime", "workflow.factory.runtime");
        addDefinitionSection(factory, "governance", "F5", "factory.governance", "workflow.factory.governance");
        addDefinitionSection(factory, "acceptance", "F6", "factory.acceptance", "workflow.factory.acceptance");
        addDefinitionSection(factory, "activation", "F7", "factory.activation", "workflow.factory.activation");
        addDefinitionSection(factory, "workOrder", "F8", "factory.workOrder", "workflow.factory.workOrder");
        addDefinitionSection(factory, "delivery", "F9", "factory.delivery", "workflow.factory.delivery");

        ObjectNode spark = document.putObject("x_spark");
        spark.put("schema", "spark.agent.workflow.definition.v1");
        spark.put("publishedAt", "2026-06-16T00:00:00.000Z");
        ObjectNode validation = spark.putObject("validation");
        validation.put("status", "valid");
        validation.putArray("issues");
        return document;
    }

    private void addDefinitionSection(ObjectNode factory,
                                      String phase,
                                      String phaseId,
                                      String sectionPath,
                                      String publishPath) {
        ObjectNode section = factory.putObject(phase);
        section.put("phaseId", phaseId);
        section.put("phase", phase);
        section.put("sectionPath", sectionPath);
        section.put("publishPath", publishPath);
        section.putObject("value");
    }

    private static Path createTempDirectory() {
        try {
            return Files.createTempDirectory("spark-workflow-design-api-");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
