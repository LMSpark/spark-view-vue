package com.spark.ai.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.spark.ai.config.WorkflowDesignProperties;
import com.spark.ai.security.AccessGuardService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

@Service
public class WorkflowDesignService {

    public static final String DESIGN_FILENAME = "design.json";

    private static final Pattern SAFE_SCOPE_ID = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,127}");
    private static final String DESIGN_KIND = "agent.workflow.design";
    private static final String GRAPH_NODE_TYPE = "custom";
    private static final String SINGLE_MODEL_EDIT_TOOL_NAME = "single_model_edit";
    private static final String SINGLE_MODEL_EDIT_PROVIDER = "spark.model-editor";

    private final ObjectMapper objectMapper;
    private final Path root;
    private final AccessGuardService accessGuard;

    @Autowired
    public WorkflowDesignService(ObjectMapper objectMapper,
                                 WorkflowDesignProperties properties,
                                 AccessGuardService accessGuard) {
        this(objectMapper, Path.of(properties.getStorageDir()), accessGuard);
    }

    public WorkflowDesignService(ObjectMapper objectMapper, Path root) {
        this(objectMapper, root, null);
    }

    public WorkflowDesignService(ObjectMapper objectMapper, Path root, AccessGuardService accessGuard) {
        this.objectMapper = objectMapper;
        this.root = root;
        this.accessGuard = accessGuard;
    }

    public List<Map<String, Object>> listDesigns(String tenantId, String projectId) {
        guardProject(tenantId, projectId);
        Path projectDir = projectDir(tenantId, projectId);
        if (!Files.isDirectory(projectDir)) {
            return List.of();
        }

        List<Map<String, Object>> result = new ArrayList<>();
        try (var stream = Files.list(projectDir)) {
            for (Path child : stream
                    .filter(Files::isDirectory)
                    .sorted(Comparator.comparing(path -> path.getFileName().toString()))
                    .toList()) {
                Path designFile = child.resolve(DESIGN_FILENAME);
                if (!Files.isRegularFile(designFile)) {
                    continue;
                }
                String workflowId = child.getFileName().toString();
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("workflowId", workflowId);
                item.put("filename", DESIGN_FILENAME);
                item.put("timestamp", String.valueOf(Files.getLastModifiedTime(designFile).toMillis()));
                addDesignSummary(item, designFile);
                result.add(item);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return result;
    }

    public Map<String, Object> createDesign(String tenantId, String projectId,
                                            String workflowId, String title) throws IOException {
        guardProject(tenantId, projectId);
        validateScopeId("workflowId", workflowId);
        Path file = designFile(tenantId, projectId, workflowId);
        if (Files.exists(file)) {
            throw new IllegalArgumentException("workflow design already exists: " + workflowId);
        }

        ObjectNode document = createScaffoldDesign(workflowId, title);
        writeDocument(file, document);
        return resultWithTimestamp(workflowId, file);
    }

    public Map<String, Object> readDesign(String tenantId, String projectId,
                                          String workflowId, String clientTimestamp) throws IOException {
        guardProject(tenantId, projectId);
        validateScopeId("workflowId", workflowId);
        Path file = designFile(tenantId, projectId, workflowId);
        if (!Files.isRegularFile(file)) {
            throw new NoSuchFileException(workflowId + "/" + DESIGN_FILENAME);
        }

        String timestamp = String.valueOf(Files.getLastModifiedTime(file).toMillis());
        if (clientTimestamp != null && clientTimestamp.equals(timestamp)) {
            Map<String, Object> notModified = new LinkedHashMap<>();
            notModified.put("notModified", true);
            notModified.put("workflowId", workflowId);
            notModified.put("filename", DESIGN_FILENAME);
            notModified.put("timestamp", timestamp);
            return notModified;
        }

        JsonNode document = objectMapper.readTree(file.toFile());
        validateDesignDocument(workflowId, document);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("workflowId", workflowId);
        result.put("filename", DESIGN_FILENAME);
        result.put("timestamp", timestamp);
        result.put("document", document);
        return result;
    }

    public Map<String, Object> writeDesign(String tenantId, String projectId,
                                           String workflowId, JsonNode document) throws IOException {
        guardProject(tenantId, projectId);
        validateScopeId("workflowId", workflowId);
        validateDesignDocument(workflowId, document);

        Path file = designFile(tenantId, projectId, workflowId);
        writeDocument(file, document);
        return resultWithTimestamp(workflowId, file);
    }

    public Map<String, Object> deleteDesign(String tenantId, String projectId,
                                            String workflowId) throws IOException {
        guardProject(tenantId, projectId);
        validateScopeId("workflowId", workflowId);
        Path dir = workflowDir(tenantId, projectId, workflowId);
        List<String> deleted = new ArrayList<>();
        if (!Files.isDirectory(dir)) {
            return Map.of("ok", true, "workflowId", workflowId, "deleted", deleted);
        }

        try (var walk = Files.walk(dir)) {
            walk.sorted(Comparator.reverseOrder()).forEach(path -> {
                if (!path.equals(dir)) {
                    deleted.add(dir.relativize(path).toString().replace('\\', '/'));
                }
                try {
                    Files.deleteIfExists(path);
                } catch (IOException e) {
                    throw new UncheckedIOException(e);
                }
            });
        } catch (UncheckedIOException e) {
            throw e.getCause();
        }
        return Map.of("ok", true, "workflowId", workflowId, "deleted", deleted);
    }

    private ObjectNode createScaffoldDesign(String workflowId, String title) {
        String resolvedTitle = title != null && !title.isBlank() ? title.trim() : workflowId;
        ObjectNode document = objectMapper.createObjectNode();
        document.put("kind", DESIGN_KIND);
        document.put("version", 1);
        document.put("id", workflowId);

        ObjectNode app = document.putObject("app");
        app.put("id", workflowId);
        app.put("name", resolvedTitle);
        app.put("mode", "workflow");
        app.put("description", "");
        app.put("icon", "spark");
        app.put("icon_background", "#0f766e");

        ObjectNode workflow = document.putObject("workflow");
        workflow.put("id", workflowId);
        workflow.put("version", 1);
        workflow.set("graph", createDefaultWorkflowGraph(workflowId, resolvedTitle));

        ObjectNode spark = document.putObject("x_spark");
        spark.put("schema", "spark.agent.workflow.design.v1");
        spark.put("businessFactory", true);
        spark.put("phaseModel", "F0-F9");

        ObjectNode draft = spark.putObject("draft");
        draft.put("status", "draft");
        draft.putArray("dirtyPaths");

        ObjectNode validation = spark.putObject("validation");
        validation.put("status", "unknown");
        validation.putArray("issues");

        ObjectNode history = spark.putObject("history");
        history.putArray("commands");
        return document;
    }

    private ObjectNode createDefaultWorkflowGraph(String workflowId, String title) {
        ObjectNode graph = objectMapper.createObjectNode();
        ArrayNode nodes = objectMapper.createArrayNode();
        addStartNode(nodes);
        addBusinessFactoryLoopNode(nodes, workflowId, title);
        addEndNode(nodes);

        ArrayNode edges = objectMapper.createArrayNode();
        addGraphEdge(edges, "edge.start.loop", "start", "loop.business-factory", "source", "target");
        addGraphEdge(edges, "edge.loop.end", "loop.business-factory", "end", "source", "target");

        graph.set("nodes", nodes);
        graph.set("edges", edges);
        ObjectNode viewport = graph.putObject("viewport");
        viewport.put("x", 0);
        viewport.put("y", 0);
        viewport.put("zoom", 1);
        return graph;
    }

    private void addStartNode(ArrayNode nodes) {
        ObjectNode node = nodes.addObject();
        node.put("id", "start");
        node.put("type", GRAPH_NODE_TYPE);
        ObjectNode position = node.putObject("position");
        position.put("x", 0);
        position.put("y", 160);
        ObjectNode data = node.putObject("data");
        data.put("type", "start");
        data.put("title", "Start");
        data.put("desc", "Workflow design entry");
        data.putArray("variables");
    }

    private void addBusinessFactoryLoopNode(ArrayNode nodes, String workflowId, String title) {
        ObjectNode node = nodes.addObject();
        node.put("id", "loop.business-factory");
        node.put("type", GRAPH_NODE_TYPE);
        ObjectNode position = node.putObject("position");
        position.put("x", 280);
        position.put("y", 40);
        ObjectNode data = node.putObject("data");
        data.put("type", "loop");
        data.put("title", title + " phase loop");
        data.put("desc", "Edit F0-F9 business factory phases as a loop sub-graph");

        ObjectNode loop = data.putObject("loop");
        loop.put("mode", "progressive");
        loop.put("maxLoopCount", 10);
        loop.put("exitNodeId", "loop.exit");

        ArrayNode variables = loop.putArray("variables");
        addLoopVariable(variables, "phaseIndex", "number", 0);
        addLoopVariable(variables, "phaseId", "string", "F0");
        addLoopVariable(variables, "completedPhaseIds", "array", null);

        ArrayNode conditions = loop.putArray("terminationConditions");
        ObjectNode condition = conditions.addObject();
        condition.put("id", "all-phases-complete");
        condition.put("type", "expression");
        condition.put("expression", "phaseIndex >= 10");

        loop.set("subGraph", createBusinessFactoryPhaseSubGraph(workflowId));
    }

    private void addEndNode(ArrayNode nodes) {
        ObjectNode node = nodes.addObject();
        node.put("id", "end");
        node.put("type", GRAPH_NODE_TYPE);
        ObjectNode position = node.putObject("position");
        position.put("x", 740);
        position.put("y", 160);
        ObjectNode data = node.putObject("data");
        data.put("type", "end");
        data.put("title", "End");
        data.put("desc", "Workflow design saved as JSON");
        data.putArray("outputs");
    }

    private void addLoopVariable(ArrayNode variables, String name, String valueType, Object initialValue) {
        ObjectNode variable = variables.addObject();
        variable.put("name", name);
        variable.put("valueType", valueType);
        if (initialValue instanceof Integer number) {
            variable.put("initialValue", number);
        } else if (initialValue instanceof String text) {
            variable.put("initialValue", text);
        } else {
            variable.set("initialValue", objectMapper.createArrayNode());
        }
    }

    private ObjectNode createBusinessFactoryPhaseSubGraph(String workflowId) {
        ObjectNode graph = objectMapper.createObjectNode();
        ArrayNode nodes = objectMapper.createArrayNode();
        addSingleModelEditToolNode(nodes, "phase.F0", "F0", "factory.identity", "Edit identity", 0, 0);
        addSingleModelEditToolNode(nodes, "phase.F1", "F1", "factory.materials", "Edit materials", 260, 0);
        addSingleModelEditToolNode(nodes, "phase.F2", "F2", "factory.knowledge", "Edit knowledge", 520, 0);
        addSingleModelEditToolNode(nodes, "phase.F3", "F3", "factory.contract", "Edit contract", 780, 0);
        addSingleModelEditToolNode(nodes, "phase.F4", "F4", "factory.runtime", "Edit runtime", 1040, 0);
        addSingleModelEditToolNode(nodes, "phase.F5", "F5", "factory.governance", "Edit governance", 1040, 240);
        addSingleModelEditToolNode(nodes, "phase.F6", "F6", "factory.acceptance", "Edit acceptance", 780, 240);
        addSingleModelEditToolNode(nodes, "phase.F7", "F7", "factory.activation", "Edit activation", 520, 240);
        addSingleModelEditToolNode(nodes, "phase.F8", "F8", "factory.workOrder", "Edit work order", 260, 240);
        addSingleModelEditToolNode(nodes, "phase.F9", "F9", "factory.delivery", "Edit delivery", 0, 240);
        addExitLoopNode(nodes);

        ArrayNode edges = objectMapper.createArrayNode();
        addGraphEdge(edges, "edge.F0.F1", "phase.F0", "phase.F1", "source", "target");
        addGraphEdge(edges, "edge.F1.F2", "phase.F1", "phase.F2", "source", "target");
        addGraphEdge(edges, "edge.F2.F3", "phase.F2", "phase.F3", "source", "target");
        addGraphEdge(edges, "edge.F3.F4", "phase.F3", "phase.F4", "source", "target");
        addGraphEdge(edges, "edge.F4.F5", "phase.F4", "phase.F5", "source", "target");
        addGraphEdge(edges, "edge.F5.F6", "phase.F5", "phase.F6", "source", "target");
        addGraphEdge(edges, "edge.F6.F7", "phase.F6", "phase.F7", "source", "target");
        addGraphEdge(edges, "edge.F7.F8", "phase.F7", "phase.F8", "source", "target");
        addGraphEdge(edges, "edge.F8.F9", "phase.F8", "phase.F9", "source", "target");
        addGraphEdge(edges, "edge.F9.exit", "phase.F9", "loop.exit", "source", "target");

        graph.put("id", workflowId + ".factory-phases");
        graph.set("nodes", nodes);
        graph.set("edges", edges);
        return graph;
    }

    private void addSingleModelEditToolNode(ArrayNode nodes, String id, String phaseId, String sectionPath,
                                            String title, int x, int y) {
        ObjectNode node = nodes.addObject();
        node.put("id", id);
        node.put("type", GRAPH_NODE_TYPE);
        ObjectNode position = node.putObject("position");
        position.put("x", x);
        position.put("y", y);
        ObjectNode data = node.putObject("data");
        data.put("type", "tool");
        data.put("title", title);
        data.put("desc", "Single-model edit tool node for " + sectionPath);
        data.put("provider_id", SINGLE_MODEL_EDIT_PROVIDER);
        data.put("provider_type", "builtin");
        data.put("tool_name", SINGLE_MODEL_EDIT_TOOL_NAME);
        data.put("tool_label", "Single Model Edit");

        ObjectNode toolConfig = data.putObject("tool_config");
        toolConfig.put("target", "node.data.model");
        toolConfig.put("operation", "replace-model");
        toolConfig.put("outputVariable", "updated_model");

        ObjectNode toolParameters = data.putObject("tool_parameters");
        toolParameters.put("document_id", "{{#sys.workflow_id#}}");
        toolParameters.put("node_id", id);
        toolParameters.put("section_path", sectionPath);
        toolParameters.put("patch", "{}");

        ObjectNode outputs = data.putObject("outputs");
        outputs.put("updated_model", "object");
        outputs.put("validation_issues", "array[object]");

        data.set("model", createDefaultPhaseModel(phaseId, sectionPath));

        ObjectNode spark = data.putObject("x_spark");
        spark.put("nodeRole", "single-model-edit");
        spark.put("phaseId", phaseId);
        spark.put("sectionPath", sectionPath);
        spark.put("modelPath", "workflow.graph.nodes." + id + ".data.model");
        spark.put("publishPath", "workflow.factory." + sectionPath.substring("factory.".length()));
    }

    private ObjectNode createDefaultPhaseModel(String phaseId, String sectionPath) {
        ObjectNode model = objectMapper.createObjectNode();
        model.put("phaseId", phaseId);
        model.put("sectionPath", sectionPath);
        model.putObject("value");
        return model;
    }

    private void addExitLoopNode(ArrayNode nodes) {
        ObjectNode node = nodes.addObject();
        node.put("id", "loop.exit");
        node.put("type", GRAPH_NODE_TYPE);
        ObjectNode position = node.putObject("position");
        position.put("x", 260);
        position.put("y", 480);
        ObjectNode data = node.putObject("data");
        data.put("type", "exit-loop");
        data.put("title", "Exit Loop");
        data.put("desc", "Leave the business factory phase loop");
    }

    private void addGraphEdge(ArrayNode edges, String id, String source, String target,
                              String sourceHandle, String targetHandle) {
        ObjectNode edge = edges.addObject();
        edge.put("id", id);
        edge.put("source", source);
        edge.put("target", target);
        edge.put("sourceHandle", sourceHandle);
        edge.put("targetHandle", targetHandle);
        edge.put("type", GRAPH_NODE_TYPE);
        ObjectNode data = edge.putObject("data");
        data.put("relation", "sequence");
    }

    private void validateDesignDocument(String workflowId, JsonNode document) {
        if (document == null || !document.isObject()) {
            throw new IllegalArgumentException("workflow design document must be a JSON object");
        }
        requireText(document, "kind", DESIGN_KIND);
        requireInt(document, "version", 1);
        String documentId = requireNonBlankText(document, "id");
        if (!workflowId.equals(documentId)) {
            throw new IllegalArgumentException("workflowId mismatch: path=" + workflowId
                    + ", document=" + documentId);
        }
        requiredObject(document, "app");

        JsonNode workflow = requiredObject(document, "workflow");
        requireInt(workflow, "version", 1);
        String documentWorkflowId = requireNonBlankText(workflow, "id");
        if (!workflowId.equals(documentWorkflowId)) {
            throw new IllegalArgumentException("workflowId mismatch: path=" + workflowId
                    + ", document=" + documentWorkflowId);
        }

        JsonNode graph = requiredObject(workflow, "graph");
        requireArray(graph, "nodes");
        requireArray(graph, "edges");
        requiredObject(graph, "viewport");

        if (!containsSingleModelEditTool(graph)) {
            throw new IllegalArgumentException("workflow graph must contain single_model_edit tool nodes");
        }

        JsonNode spark = requiredObject(document, "x_spark");
        requiredObject(spark, "draft");
        requiredObject(spark, "validation");
    }

    private boolean containsSingleModelEditTool(JsonNode graph) {
        JsonNode nodes = graph.path("nodes");
        if (nodes.isArray()) {
            for (JsonNode node : nodes) {
                JsonNode data = node.path("data");
                if ("tool".equals(data.path("type").asText())
                        && SINGLE_MODEL_EDIT_TOOL_NAME.equals(data.path("tool_name").asText())) {
                    return true;
                }
                JsonNode subGraph = data.path("loop").path("subGraph");
                if (subGraph.isObject() && containsSingleModelEditTool(subGraph)) {
                    return true;
                }
                JsonNode iterationSubGraph = data.path("iteration").path("subGraph");
                if (iterationSubGraph.isObject() && containsSingleModelEditTool(iterationSubGraph)) {
                    return true;
                }
            }
        }
        return false;
    }

    private JsonNode requiredObject(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isObject()) {
            throw new IllegalArgumentException("missing object field: " + field);
        }
        return value;
    }

    private void requireObject(JsonNode node, String field) {
        requiredObject(node, field);
    }

    private void requireArray(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isArray()) {
            throw new IllegalArgumentException("missing array field: " + field);
        }
    }

    private void requireText(JsonNode node, String field, String expected) {
        String actual = requireNonBlankText(node, field);
        if (!expected.equals(actual)) {
            throw new IllegalArgumentException("invalid " + field + ": " + actual);
        }
    }

    private void requireInt(JsonNode node, String field, int expected) {
        JsonNode value = node.get(field);
        if (value == null || !value.isInt() || value.asInt() != expected) {
            throw new IllegalArgumentException("invalid " + field + ": expected " + expected);
        }
    }

    private String requireNonBlankText(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isTextual() || value.asText().isBlank()) {
            throw new IllegalArgumentException("missing text field: " + field);
        }
        return value.asText();
    }

    private void addDesignSummary(Map<String, Object> item, Path designFile) {
        try {
            JsonNode document = objectMapper.readTree(designFile.toFile());
            JsonNode app = document.path("app");
            JsonNode workflow = document.path("workflow");
            JsonNode draft = document.path("x_spark").path("draft");
            if (app.path("name").isTextual()) {
                item.put("title", app.path("name").asText());
            }
            if (workflow.path("version").isInt()) {
                item.put("version", workflow.path("version").asInt());
            }
            if (draft.path("status").isTextual()) {
                item.put("status", draft.path("status").asText());
            }
        } catch (IOException e) {
            item.put("status", "unreadable");
            item.put("error", e.getMessage());
        }
    }

    private Map<String, Object> resultWithTimestamp(String workflowId, Path file) throws IOException {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("workflowId", workflowId);
        result.put("filename", DESIGN_FILENAME);
        result.put("timestamp", String.valueOf(Files.getLastModifiedTime(file).toMillis()));
        return result;
    }

    private void writeDocument(Path file, JsonNode document) throws IOException {
        Files.createDirectories(file.getParent());
        String json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(document);
        Files.writeString(file, json + "\n", StandardCharsets.UTF_8);
    }

    private Path projectDir(String tenantId, String projectId) {
        return root.resolve(tenantId).resolve(projectId);
    }

    private Path workflowDir(String tenantId, String projectId, String workflowId) {
        return projectDir(tenantId, projectId).resolve(workflowId);
    }

    private Path designFile(String tenantId, String projectId, String workflowId) {
        return workflowDir(tenantId, projectId, workflowId).resolve(DESIGN_FILENAME);
    }

    private void guardProject(String tenantId, String projectId) {
        validateScopeId("tenantId", tenantId);
        validateScopeId("projectId", projectId);
        if (accessGuard != null) {
            accessGuard.requireProjectAccess(tenantId, projectId);
        }
    }

    private void validateScopeId(String label, String value) {
        if (value == null || value.isBlank()
                || value.contains("..") || value.contains("/") || value.contains("\\")
                || !SAFE_SCOPE_ID.matcher(value).matches()) {
            throw new IllegalArgumentException("invalid " + label + ": " + value);
        }
    }
}
