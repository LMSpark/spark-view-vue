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
        assertEquals("spark.workflow.demo", document.path("workflow").path("id").asText());
        assertEquals("Demo Workflow", document.path("app").path("name").asText());
        assertEquals(3, document.path("workflow").path("graph").path("nodes").size());
        JsonNode loopNode = document.path("workflow").path("graph").path("nodes").get(1);
        assertEquals("loop", loopNode.path("data").path("type").asText());
        JsonNode phaseNodes = loopNode.path("data").path("loop").path("subGraph").path("nodes");
        assertEquals(11, phaseNodes.size());
        assertEquals("tool", phaseNodes.get(0).path("data").path("type").asText());
        assertEquals("single_model_edit", phaseNodes.get(0).path("data").path("tool_name").asText());
        assertEquals("factory.identity", phaseNodes.get(0).path("data").path("x_spark").path("sectionPath").asText());
        assertEquals("factory.identity", phaseNodes.get(0).path("data").path("model").path("sectionPath").asText());
        assertEquals("node.data.model", phaseNodes.get(0).path("data").path("tool_config").path("target").asText());
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
        ObjectNode app = (ObjectNode) copy.path("app");
        app.put("name", "Updated Workflow");

        service.writeDesign("t1", "p1", "spark.workflow.demo", copy);

        JsonNode saved = objectMapper.readTree(tempDir.resolve("t1/p1/spark.workflow.demo/design.json").toFile());
        assertEquals("Updated Workflow", saved.path("app").path("name").asText());
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
        assertEquals("workflow.factory.activation",
                saved.path("factory").path("activation").path("publishPath").asText());
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
        validation.put("status", validationStatus);
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
}
