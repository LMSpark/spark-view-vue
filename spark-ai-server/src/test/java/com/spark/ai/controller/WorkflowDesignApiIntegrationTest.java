package com.spark.ai.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
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
                .andExpect(jsonPath("$.data.document.workflow.graph.nodes[0].data.type").value("start"))
                .andExpect(jsonPath("$.data.document.workflow.graph.nodes[1].data.type").value("tool"))
                .andExpect(jsonPath("$.data.document.workflow.graph.nodes[1].data.provider").value("class-model"))
                .andExpect(jsonPath("$.data.document.workflow.graph.nodes[2].data.type").value("end"))
                .andExpect(jsonPath("$.data.document.workflow.graph.edges.length()").value(2))
                .andReturn();

        ObjectNode document = readDocumentFromEnvelope(readResult);
        ((ObjectNode) document.path("x_spark").path("designer")).put("title", "API Workflow Saved");
        JsonNode graphNodes = document.at("/workflow/graph/nodes");
        ObjectNode toolData = (ObjectNode) graphNodes.get(1).get("data");
        toolData.put("title", "updated-from-api");

        mockMvc.perform(put("/api/tenants/t1/projects/p1/workflow-designs/{workflowId}/design.json", workflowId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(document)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ok").value(true));

        JsonNode saved = objectMapper.readTree(designFile.toFile());
        assertEquals("API Workflow Saved", saved.path("x_spark").path("designer").path("title").asText());
        assertEquals("updated-from-api", saved.at("/workflow/graph/nodes/1/data/title").asText());

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

        MvcResult definitionResult = mockMvc.perform(get(
                        "/api/tenants/t1/projects/p1/workflow-designs/{workflowId}/definition.json", workflowId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.definition.kind").value("agent.workflow"))
                .andExpect(jsonPath("$.data.definition.workflowId").value(workflowId))
                .andReturn();

        ObjectNode definitionDocument = readDefinitionFromEnvelope(definitionResult);
        ObjectNode toolParameters = (ObjectNode) definitionDocument.at("/workflow/graph/nodes/1/data/toolParameters");
        toolParameters.put("prompt", "edited-definition");

        mockMvc.perform(put("/api/tenants/t1/projects/p1/workflow-designs/{workflowId}/definition.json", workflowId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(definitionDocument)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ok").value(true));

        JsonNode editedDefinition = objectMapper.readTree(definitionFile.toFile());
        assertEquals("edited-definition", editedDefinition.at("/workflow/graph/nodes/1/data/toolParameters/prompt").asText());

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

    private ObjectNode readDefinitionFromEnvelope(MvcResult result) throws IOException {
        JsonNode envelope = objectMapper.readTree(result.getResponse().getContentAsString());
        return (ObjectNode) envelope.at("/data/definition").deepCopy();
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

        ObjectNode workflow = document.putObject("workflow");
        workflow.putArray("variables");
        ObjectNode graph = workflow.putObject("graph");
        ArrayNode nodes = graph.putArray("nodes");
        addDefinitionNode(nodes, "start", "start", "Start");
        ObjectNode tool = addDefinitionNode(nodes, "tool.classModel", "tool", "ClassModel Tool");
        ObjectNode toolData = (ObjectNode) tool.path("data");
        toolData.put("provider", "class-model");
        toolData.put("toolName", "model_script");
        ObjectNode toolParameters = toolData.putObject("toolParameters");
        toolParameters.put("prompt", "${workflow.input.prompt}");
        toolData.putObject("outputMapping");
        addDefinitionNode(nodes, "end", "end", "End");

        ArrayNode edges = graph.putArray("edges");
        addDefinitionEdge(edges, "edge.start.tool", "start", "tool.classModel");
        addDefinitionEdge(edges, "edge.tool.end", "tool.classModel", "end");

        ObjectNode spark = document.putObject("x_spark");
        spark.put("schema", "spark.agent.workflow.definition.v1");
        spark.put("publishedAt", "2026-06-16T00:00:00.000Z");
        ObjectNode validation = spark.putObject("validation");
        validation.put("status", "valid");
        validation.putArray("issues");
        return document;
    }

    private ObjectNode addDefinitionNode(ArrayNode nodes, String id, String type, String title) {
        ObjectNode node = nodes.addObject();
        node.put("id", id);
        node.put("type", type);
        ObjectNode data = node.putObject("data");
        data.put("type", type);
        data.put("title", title);
        return node;
    }

    private void addDefinitionEdge(ArrayNode edges, String id, String source, String target) {
        ObjectNode edge = edges.addObject();
        edge.put("id", id);
        edge.put("source", source);
        edge.put("target", target);
    }

    private static Path createTempDirectory() {
        try {
            return Files.createTempDirectory("spark-workflow-design-api-");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
