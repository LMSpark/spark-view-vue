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
                .andExpect(jsonPath("$.data.document.workflow.graph.nodes[1].data.type").value("node"))
                .andExpect(jsonPath("$.data.document.workflow.graph.nodes[1].data.models[0].className").value("spark.placeholder.Model"))
                .andExpect(jsonPath("$.data.document.workflow.graph.nodes[2].data.type").value("output"))
                .andExpect(jsonPath("$.data.document.workflow.graph.lines.length()").value(2))
                .andReturn();

        ObjectNode document = readDocumentFromEnvelope(readResult);
        ((ObjectNode) document.path("x_spark").path("designer")).put("title", "API Workflow Saved");
        JsonNode graphNodes = document.at("/workflow/graph/nodes");
        ObjectNode nodeData = (ObjectNode) graphNodes.get(1).get("data");
        nodeData.put("title", "updated-from-api");

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
        ObjectNode inputs = (ObjectNode) definitionDocument.at("/workflow/graph/nodes/1/data/inputs");
        inputs.put("prompt", "edited-definition");

        mockMvc.perform(put("/api/tenants/t1/projects/p1/workflow-designs/{workflowId}/definition.json", workflowId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(definitionDocument)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ok").value(true));

        JsonNode editedDefinition = objectMapper.readTree(definitionFile.toFile());
        assertEquals("edited-definition", editedDefinition.at("/workflow/graph/nodes/1/data/inputs/prompt").asText());

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
        addRuntimeBinding(workflow);
        ObjectNode capability = workflow.putArray("capabilities").addObject();
        capability.put("id", "api.workflow");
        capability.put("title", "API Workflow");
        capability.put("scope", "workflow");
        capability.put("description", "Run API workflow.");
        capability.putArray("constraints");
        ObjectNode graph = workflow.putObject("graph");
        ArrayNode nodes = graph.putArray("nodes");
        addDefinitionNode(nodes, "start", "start", "Start");
        ObjectNode businessNode = addDefinitionNode(nodes, "node.model", "node", "Business Node");
        ObjectNode nodeData = (ObjectNode) businessNode.path("data");
        ObjectNode model = nodeData.putArray("models").addObject();
        model.put("id", "node.model.model");
        model.put("rootClassName", "ApiModel");
        model.put("className", "ApiModel");
        model.put("sourceRef", "$");
        ObjectNode completion = model.putObject("completion");
        completion.put("memberName", "validateApi");
        completion.put("returnContract", "boolean-or-reason");
        ObjectNode inputs = nodeData.putObject("inputs");
        inputs.put("prompt", "${workflow.input.prompt}");
        ObjectNode outputs = nodeData.putObject("outputs");
        outputs.put("result", "api.result");
        ObjectNode llm = nodeData.putObject("llm");
        ObjectNode task = llm.putObject("task");
        task.put("goal", "Run API workflow.");
        task.putObject("requirements");
        task.putObject("contextInputs");
        ObjectNode knowledge = llm.putObject("knowledge");
        knowledge.put("rootClassName", "ApiModel");
        knowledge.put("className", "ApiModel");
        knowledge.putArray("allowedActions").add("validateApi");
        knowledge.putArray("readableAttributes").add("result");
        ObjectNode functionCalling = llm.putObject("functionCalling");
        functionCalling.put("mode", "freeWithinModelContext");
        functionCalling.putArray("constraints");
        ObjectNode llmOutput = llm.putObject("output");
        llmOutput.putObject("structuredResult");
        llmOutput.put("handoffToValidation", true);
        nodeData.putObject("validation");
        ObjectNode nodeCapability = nodeData.putArray("capabilities").addObject();
        nodeCapability.put("id", "api.execute");
        nodeCapability.put("title", "Execute API Workflow");
        nodeCapability.put("scope", "node");
        nodeCapability.put("description", "Execute API workflow module.");
        nodeCapability.putArray("constraints");
        ObjectNode output = addDefinitionNode(nodes, "output", "output", "Output");
        ((ObjectNode) output.path("data")).putObject("outputs");
        ((ObjectNode) output.path("data")).putArray("capabilities");

        ArrayNode lines = graph.putArray("lines");
        addDefinitionLine(lines, "line.start.node", "start", "$workflow", "prompt",
                "node.model", "node.model.model", "prompt");
        addDefinitionLine(lines, "line.node.output", "node.model", "node.model.model", "result",
                "output", "$workflow", "result");

        ObjectNode spark = document.putObject("x_spark");
        spark.put("schema", "spark.agent.workflow.definition.v1");
        spark.put("publishedAt", "2026-06-16T00:00:00.000Z");
        ObjectNode validation = spark.putObject("validation");
        validation.put("status", "valid");
        validation.putArray("issues");
        return document;
    }

    private void addRuntimeBinding(ObjectNode workflow) {
        ObjectNode binding = workflow.putObject("runtimeBinding");
        ObjectNode registration = binding.putObject("registration");
        registration.put("alias", "api");
        registration.put("moduleId", "api");
        registration.put("businessId", "api");
        ObjectNode inputContract = binding.putObject("inputContract");
        inputContract.put("identityField", "prompt");
        inputContract.put("messageField", "prompt");
        ObjectNode paramsSchema = inputContract.putObject("paramsSchema");
        paramsSchema.put("type", "object");
        paramsSchema.putObject("properties");
        inputContract.putArray("readonlySteps");
        ObjectNode systemPrompt = binding.putObject("systemPrompt");
        systemPrompt.put("template", "API prompt");
        systemPrompt.putArray("conditionalHints");
        ObjectNode projectionRef = binding.putObject("modelProjectionRef");
        projectionRef.put("kind", "dts-class-model");
        projectionRef.put("rootClassName", "ApiModel");
        projectionRef.put("manifestUrlRef", "dts-class-model");
        ObjectNode executableRef = binding.putObject("executableRef");
        executableRef.put("kind", "js-module");
        executableRef.put("moduleSpecifier", "./api.js");
        executableRef.put("exportName", "ApiModel");
        ObjectNode resolveInstance = binding.putObject("resolveInstance");
        resolveInstance.put("editorSource", "api");
        resolveInstance.put("identityField", "prompt");
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

    private void addDefinitionLine(ArrayNode lines, String id,
                                   String fromNodeId, String fromModelId, String fromMemberName,
                                   String toNodeId, String toModelId, String toMemberName) {
        ObjectNode line = lines.addObject();
        line.put("id", id);
        ObjectNode from = line.putObject("from");
        from.put("nodeId", fromNodeId);
        from.put("modelId", fromModelId);
        from.put("memberName", fromMemberName);
        ObjectNode to = line.putObject("to");
        to.put("nodeId", toNodeId);
        to.put("modelId", toModelId);
        to.put("memberName", toMemberName);
    }

    private static Path createTempDirectory() {
        try {
            return Files.createTempDirectory("spark-workflow-design-api-");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
