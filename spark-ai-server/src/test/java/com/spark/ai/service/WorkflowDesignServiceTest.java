package com.spark.ai.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WorkflowDesignServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @TempDir
    Path tempDir;

    @Test
    void createDesign_writesScaffoldDesignJson() throws Exception {
        WorkflowDesignService service = new WorkflowDesignService(objectMapper, tempDir);

        Map<String, Object> result = service.createDesign("t1", "p1", "spark.workflow.demo", "Demo Workflow");

        assertEquals(true, result.get("ok"));
        assertEquals("spark.workflow.demo", result.get("workflowId"));
        Path file = tempDir.resolve("t1/p1/spark.workflow.demo/design.json");
        assertTrue(Files.isRegularFile(file));

        JsonNode document = objectMapper.readTree(file.toFile());
        assertEquals("agent.workflow.design", document.path("kind").asText());
        assertEquals("spark.workflow.demo", document.path("id").asText());
        assertFalse(document.has("app"));
        assertFalse(document.has("factory"));
        assertEquals("spark.workflow.demo", document.path("workflow").path("id").asText());
        assertEquals("Demo Workflow", document.path("x_spark").path("designer").path("title").asText());
        JsonNode nodes = document.path("workflow").path("graph").path("nodes");
        assertEquals(3, nodes.size());
        assertEquals("start", nodes.get(0).path("type").asText());
        assertEquals("node", nodes.get(1).path("type").asText());
        assertEquals("spark.placeholder.RootModel", nodes.get(1).path("data").path("model").path("rootClassName").asText());
        assertEquals("spark.placeholder.Model", nodes.get(1).path("data").path("model").path("className").asText());
        assertEquals("spark.placeholder.validate",
                nodes.get(1).path("data").path("validation").path("action").path("actionName").asText());
        assertTrue(nodes.get(1).path("data").path("inputs").isObject());
        assertTrue(nodes.get(1).path("data").path("outputs").isObject());
        assertTrue(nodes.get(1).path("data").path("llm").isObject());
        assertTrue(nodes.get(1).path("data").path("capabilities").isArray());
        assertEquals("output", nodes.get(2).path("type").asText());
        assertTrue(nodes.get(2).path("data").path("outputs").isObject());
        assertEquals(2, document.path("workflow").path("graph").path("edges").size());
    }

    @Test
    void readDesign_returnsDocumentAndSupportsNotModified() throws Exception {
        WorkflowDesignService service = new WorkflowDesignService(objectMapper, tempDir);
        service.createDesign("t1", "p1", "spark.workflow.demo", "Demo Workflow");

        Map<String, Object> first = service.readDesign("t1", "p1", "spark.workflow.demo", null);

        assertEquals("spark.workflow.demo", first.get("workflowId"));
        assertInstanceOf(JsonNode.class, first.get("document"));
        String timestamp = (String) first.get("timestamp");
        assertNotNull(timestamp);

        Map<String, Object> second = service.readDesign("t1", "p1", "spark.workflow.demo", timestamp);

        assertEquals(true, second.get("notModified"));
        assertEquals(timestamp, second.get("timestamp"));
        assertFalse(second.containsKey("document"));
    }

    @Test
    void writeDesign_rejectsWorkflowIdMismatch() throws Exception {
        WorkflowDesignService service = new WorkflowDesignService(objectMapper, tempDir);
        service.createDesign("t1", "p1", "spark.workflow.demo", "Demo Workflow");
        JsonNode document = (JsonNode) service.readDesign("t1", "p1", "spark.workflow.demo", null).get("document");
        ObjectNode copy = document.deepCopy();
        ((ObjectNode) copy.get("workflow")).put("id", "spark.workflow.other");

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> service.writeDesign("t1", "p1", "spark.workflow.demo", copy));

        assertTrue(error.getMessage().contains("workflowId mismatch"));
    }

    @Test
    void writeDesign_savesUpdatedJsonDocument() throws Exception {
        WorkflowDesignService service = new WorkflowDesignService(objectMapper, tempDir);
        service.createDesign("t1", "p1", "spark.workflow.demo", "Demo Workflow");
        JsonNode document = (JsonNode) service.readDesign("t1", "p1", "spark.workflow.demo", null).get("document");
        ObjectNode copy = document.deepCopy();
        ObjectNode designer = (ObjectNode) copy.path("x_spark").path("designer");
        designer.put("title", "Updated Workflow");

        service.writeDesign("t1", "p1", "spark.workflow.demo", copy);

        JsonNode saved = objectMapper.readTree(tempDir.resolve("t1/p1/spark.workflow.demo/design.json").toFile());
        assertEquals("Updated Workflow", saved.path("x_spark").path("designer").path("title").asText());
    }

    @Test
    void writeDesign_rejectsLegacyAppField() throws Exception {
        WorkflowDesignService service = new WorkflowDesignService(objectMapper, tempDir);
        service.createDesign("t1", "p1", "spark.workflow.demo", "Demo Workflow");
        JsonNode document = (JsonNode) service.readDesign("t1", "p1", "spark.workflow.demo", null).get("document");
        ObjectNode copy = document.deepCopy();
        copy.putObject("app").put("mode", "workflow");

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> service.writeDesign("t1", "p1", "spark.workflow.demo", copy));

        assertTrue(error.getMessage().contains("forbidden field: app"));
    }

    @Test
    void publishDefinition_writesDefinitionJson() throws Exception {
        WorkflowDesignService service = new WorkflowDesignService(objectMapper, tempDir);
        service.createDesign("t1", "p1", "spark.workflow.demo", "Demo Workflow");

        Map<String, Object> result = service.publishDefinition(
                "t1", "p1", "spark.workflow.demo", createDefinition("spark.workflow.demo", "valid"));

        assertEquals(true, result.get("ok"));
        assertEquals("definition.json", result.get("filename"));
        Path file = tempDir.resolve("t1/p1/spark.workflow.demo/definition.json");
        assertTrue(Files.isRegularFile(file));
        JsonNode saved = objectMapper.readTree(file.toFile());
        assertEquals("agent.workflow", saved.path("kind").asText());
        assertEquals("spark.workflow.demo", saved.path("workflowId").asText());
        assertEquals("validateDemo",
                saved.at("/workflow/graph/nodes/1/data/validation/action/actionName").asText());
        assertFalse(saved.has("factory"));
    }

    @Test
    void readDefinition_returnsDefinitionAndSupportsNotModified() throws Exception {
        WorkflowDesignService service = new WorkflowDesignService(objectMapper, tempDir);
        service.createDesign("t1", "p1", "spark.workflow.demo", "Demo Workflow");
        service.publishDefinition("t1", "p1", "spark.workflow.demo",
                createDefinition("spark.workflow.demo", "valid"));

        Map<String, Object> first = service.readDefinition("t1", "p1", "spark.workflow.demo", null);

        assertEquals("spark.workflow.demo", first.get("workflowId"));
        assertEquals("definition.json", first.get("filename"));
        assertInstanceOf(JsonNode.class, first.get("definition"));
        String timestamp = (String) first.get("timestamp");
        assertNotNull(timestamp);

        Map<String, Object> second = service.readDefinition("t1", "p1", "spark.workflow.demo", timestamp);

        assertEquals(true, second.get("notModified"));
        assertEquals(timestamp, second.get("timestamp"));
        assertFalse(second.containsKey("definition"));
    }

    @Test
    void writeDefinition_savesUpdatedDefinitionJson() throws Exception {
        WorkflowDesignService service = new WorkflowDesignService(objectMapper, tempDir);
        service.createDesign("t1", "p1", "spark.workflow.demo", "Demo Workflow");
        ObjectNode definition = createDefinition("spark.workflow.demo", "valid");
        ObjectNode action = (ObjectNode) definition.at("/workflow/graph/nodes/1/data/validation/action");
        action.put("actionName", "validateDemoUpdated");

        Map<String, Object> result = service.writeDefinition("t1", "p1", "spark.workflow.demo", definition);

        assertEquals(true, result.get("ok"));
        assertEquals("definition.json", result.get("filename"));
        JsonNode saved = objectMapper.readTree(tempDir.resolve("t1/p1/spark.workflow.demo/definition.json").toFile());
        assertEquals("validateDemoUpdated", saved.at("/workflow/graph/nodes/1/data/validation/action/actionName").asText());
    }

    @Test
    void publishDefinition_rejectsWorkflowIdMismatch() throws Exception {
        WorkflowDesignService service = new WorkflowDesignService(objectMapper, tempDir);
        service.createDesign("t1", "p1", "spark.workflow.demo", "Demo Workflow");

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> service.publishDefinition(
                        "t1", "p1", "spark.workflow.demo", createDefinition("spark.workflow.other", "valid")));

        assertTrue(error.getMessage().contains("workflowId mismatch"));
    }

    @Test
    void publishDefinition_rejectsInvalidDefinitionStatus() throws Exception {
        WorkflowDesignService service = new WorkflowDesignService(objectMapper, tempDir);
        service.createDesign("t1", "p1", "spark.workflow.demo", "Demo Workflow");

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> service.publishDefinition(
                        "t1", "p1", "spark.workflow.demo", createDefinition("spark.workflow.demo", "invalid")));

        assertTrue(error.getMessage().contains("validation status"));
    }

    @Test
    void publishDefinition_rejectsPlaceholderModelBinding() throws Exception {
        WorkflowDesignService service = new WorkflowDesignService(objectMapper, tempDir);
        service.createDesign("t1", "p1", "spark.workflow.demo", "Demo Workflow");
        ObjectNode definition = createDefinition("spark.workflow.demo", "valid");
        ObjectNode model = (ObjectNode) definition.at("/workflow/graph/nodes/1/data/model");
        model.put("className", "spark.placeholder.Model");

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> service.publishDefinition("t1", "p1", "spark.workflow.demo", definition));

        assertTrue(error.getMessage().contains("real model"));
    }

    @Test
    void publishDefinition_rejectsClassModelSchemaRefs() throws Exception {
        WorkflowDesignService service = new WorkflowDesignService(objectMapper, tempDir);
        service.createDesign("t1", "p1", "spark.workflow.demo", "Demo Workflow");
        ObjectNode definition = createDefinition("spark.workflow.demo", "valid");
        ((ObjectNode) definition.at("/workflow/graph/nodes/1/data"))
                .putObject("x_spark")
                .putObject("classModel")
                .put("sourcePath", "packages/spark-project-model/src/project/project-model.ts");

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> service.publishDefinition("t1", "p1", "spark.workflow.demo", definition));

        assertTrue(error.getMessage().contains("classModel"));
    }

    @Test
    void listDesigns_returnsSortedSummaries() throws Exception {
        WorkflowDesignService service = new WorkflowDesignService(objectMapper, tempDir);
        service.createDesign("t1", "p1", "spark.workflow.beta", "Beta");
        service.createDesign("t1", "p1", "spark.workflow.alpha", "Alpha");

        List<Map<String, Object>> designs = service.listDesigns("t1", "p1");

        assertEquals(2, designs.size());
        assertEquals("spark.workflow.alpha", designs.get(0).get("workflowId"));
        assertEquals("Alpha", designs.get(0).get("title"));
        assertEquals("spark.workflow.beta", designs.get(1).get("workflowId"));
    }

    @Test
    void listDesigns_marksLegacyDesignAsUnreadable() throws Exception {
        WorkflowDesignService service = new WorkflowDesignService(objectMapper, tempDir);
        service.createDesign("t1", "p1", "spark.workflow.legacy", "Legacy Workflow");
        Path file = tempDir.resolve("t1/p1/spark.workflow.legacy/design.json");
        ObjectNode document = (ObjectNode) objectMapper.readTree(file.toFile());
        document.putObject("app").put("mode", "workflow");
        ((ObjectNode) document.path("x_spark").path("draft")).put("status", "saved");
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(file.toFile(), document);

        List<Map<String, Object>> designs = service.listDesigns("t1", "p1");

        assertEquals(1, designs.size());
        assertEquals("spark.workflow.legacy", designs.get(0).get("workflowId"));
        assertEquals("Legacy Workflow", designs.get(0).get("title"));
        assertEquals("unreadable", designs.get(0).get("status"));
        assertTrue(((String) designs.get(0).get("error")).contains("forbidden field: app"));
        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> service.readDesign("t1", "p1", "spark.workflow.legacy", null));
        assertTrue(error.getMessage().contains("forbidden field: app"));
    }

    @Test
    void deleteDesign_removesWorkflowDirectory() throws Exception {
        WorkflowDesignService service = new WorkflowDesignService(objectMapper, tempDir);
        service.createDesign("t1", "p1", "spark.workflow.demo", "Demo Workflow");

        Map<String, Object> result = service.deleteDesign("t1", "p1", "spark.workflow.demo");

        assertEquals(true, result.get("ok"));
        assertFalse(Files.exists(tempDir.resolve("t1/p1/spark.workflow.demo")));
    }

    @Test
    void createDesign_rejectsUnsafeWorkflowId() {
        WorkflowDesignService service = new WorkflowDesignService(objectMapper, tempDir);

        assertThrows(IllegalArgumentException.class,
                () -> service.createDesign("t1", "p1", "../bad", "Bad"));
    }

    private ObjectNode createDefinition(String workflowId, String validationStatus) {
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
        ObjectNode capability = workflow.putArray("capabilities").addObject();
        capability.put("id", "demo.workflow");
        capability.put("title", "Demo Workflow");
        capability.put("scope", "workflow");
        capability.put("description", "Run demo workflow.");
        capability.putArray("constraints");
        ObjectNode graph = workflow.putObject("graph");
        ArrayNodeBuilder.addNodes(graph);
        ArrayNodeBuilder.addEdges(graph);

        ObjectNode spark = document.putObject("x_spark");
        spark.put("schema", "spark.agent.workflow.definition.v1");
        spark.put("publishedAt", "2026-06-16T00:00:00.000Z");
        ObjectNode validation = spark.putObject("validation");
        validation.put("status", validationStatus);
        validation.putArray("issues");
        return document;
    }

    private static final class ArrayNodeBuilder {
        private ArrayNodeBuilder() {
        }

        static void addNodes(ObjectNode graph) {
            var nodes = graph.putArray("nodes");
            ObjectNode start = nodes.addObject();
            start.put("id", "start");
            start.put("type", "start");
            ObjectNode startData = start.putObject("data");
            startData.put("type", "start");
            startData.put("title", "Start");

            ObjectNode businessNode = nodes.addObject();
            businessNode.put("id", "node.model");
            businessNode.put("type", "node");
            ObjectNode nodeData = businessNode.putObject("data");
            nodeData.put("type", "node");
            nodeData.put("title", "Business Node");
            ObjectNode model = nodeData.putObject("model");
            model.put("rootClassName", "DemoModel");
            model.put("className", "DemoModel");
            model.put("contextPath", "$");
            ObjectNode inputs = nodeData.putObject("inputs");
            inputs.put("prompt", "{{ start.prompt }}");
            ObjectNode outputs = nodeData.putObject("outputs");
            outputs.put("result", "demo.result");
            ObjectNode llm = nodeData.putObject("llm");
            ObjectNode task = llm.putObject("task");
            task.put("goal", "Run demo workflow.");
            task.putObject("requirements");
            task.putObject("contextInputs");
            ObjectNode knowledge = llm.putObject("knowledge");
            knowledge.put("rootClassName", "DemoModel");
            knowledge.put("className", "DemoModel");
            knowledge.putArray("allowedActions").add("validateDemo");
            knowledge.putArray("readableAttributes").add("result");
            ObjectNode functionCalling = llm.putObject("functionCalling");
            functionCalling.put("mode", "freeWithinModelContext");
            functionCalling.putArray("constraints");
            ObjectNode llmOutput = llm.putObject("output");
            llmOutput.putObject("structuredResult");
            llmOutput.put("handoffToValidation", true);
            ObjectNode validation = nodeData.putObject("validation");
            ObjectNode action = validation.putObject("action");
            action.put("className", "DemoModel");
            action.put("actionName", "validateDemo");
            action.putObject("inputProjection");
            action.putObject("expectedResult");
            validation.put("status", "draft");
            validation.putArray("issues");
            ObjectNode capability = nodeData.putArray("capabilities").addObject();
            capability.put("id", "demo.execute");
            capability.put("title", "Execute Demo");
            capability.put("scope", "node");
            capability.put("description", "Execute demo module.");
            capability.putArray("constraints");

            ObjectNode output = nodes.addObject();
            output.put("id", "output");
            output.put("type", "output");
            ObjectNode outputData = output.putObject("data");
            outputData.put("type", "output");
            outputData.put("title", "Output");
            outputData.putObject("outputs");
            outputData.putArray("capabilities");
        }

        static void addEdges(ObjectNode graph) {
            var edges = graph.putArray("edges");
            ObjectNode first = edges.addObject();
            first.put("id", "edge.start.node");
            first.put("source", "start");
            first.put("target", "node.model");

            ObjectNode second = edges.addObject();
            second.put("id", "edge.node.output");
            second.put("source", "node.model");
            second.put("target", "output");
        }
    }
}
