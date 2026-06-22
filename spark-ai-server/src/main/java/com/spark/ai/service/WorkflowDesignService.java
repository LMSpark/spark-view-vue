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
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

@Service
public class WorkflowDesignService {

    public static final String DESIGN_FILENAME = "design.json";
    public static final String DEFINITION_FILENAME = "definition.json";

    private static final Pattern SAFE_SCOPE_ID = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,127}");
    private static final String DESIGN_KIND = "agent.workflow.design";
    private static final String DEFINITION_KIND = "agent.workflow";
    private static final String DEFINITION_SCHEMA = "spark.agent.workflow.definition.v1";
    private static final String PLACEHOLDER_MODEL_ROOT_CLASS_NAME = "spark.placeholder.RootModel";
    private static final String PLACEHOLDER_MODEL_CLASS_NAME = "spark.placeholder.Model";
    private static final String PLACEHOLDER_RUNTIME_ID = "spark.placeholder.workflow";

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
                addDesignSummary(item, workflowId, designFile);
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

    public Map<String, Object> readDefinition(String tenantId, String projectId,
                                              String workflowId, String clientTimestamp) throws IOException {
        guardProject(tenantId, projectId);
        validateScopeId("workflowId", workflowId);
        Path file = definitionFile(tenantId, projectId, workflowId);
        if (!Files.isRegularFile(file)) {
            throw new NoSuchFileException(workflowId + "/" + DEFINITION_FILENAME);
        }

        String timestamp = String.valueOf(Files.getLastModifiedTime(file).toMillis());
        if (clientTimestamp != null && clientTimestamp.equals(timestamp)) {
            Map<String, Object> notModified = new LinkedHashMap<>();
            notModified.put("notModified", true);
            notModified.put("workflowId", workflowId);
            notModified.put("filename", DEFINITION_FILENAME);
            notModified.put("timestamp", timestamp);
            return notModified;
        }

        JsonNode definition = objectMapper.readTree(file.toFile());
        validateDefinitionDocument(workflowId, definition, true);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("workflowId", workflowId);
        result.put("filename", DEFINITION_FILENAME);
        result.put("timestamp", timestamp);
        result.put("definition", definition);
        return result;
    }

    public Map<String, Object> writeDefinition(String tenantId, String projectId,
                                               String workflowId, JsonNode definition) throws IOException {
        guardProject(tenantId, projectId);
        validateScopeId("workflowId", workflowId);
        Path design = designFile(tenantId, projectId, workflowId);
        if (!Files.isRegularFile(design)) {
            throw new NoSuchFileException(workflowId + "/" + DESIGN_FILENAME);
        }
        validateDefinitionDocument(workflowId, definition, false);

        Path file = definitionFile(tenantId, projectId, workflowId);
        writeDocument(file, definition);
        return resultWithTimestamp(workflowId, file);
    }

    public Map<String, Object> publishDefinition(String tenantId, String projectId,
                                                 String workflowId, JsonNode definition) throws IOException {
        guardProject(tenantId, projectId);
        validateScopeId("workflowId", workflowId);
        Path design = designFile(tenantId, projectId, workflowId);
        if (!Files.isRegularFile(design)) {
            throw new NoSuchFileException(workflowId + "/" + DESIGN_FILENAME);
        }
        validateDefinitionDocument(workflowId, definition, false);

        Path file = definitionFile(tenantId, projectId, workflowId);
        writeDocument(file, definition);
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

        ObjectNode workflow = document.putObject("workflow");
        workflow.put("id", workflowId);
        workflow.put("version", 1);
        workflow.putArray("variables");
        workflow.set("runtimeBinding", createPlaceholderRuntimeBinding());
        workflow.putArray("capabilities");
        workflow.set("graph", createDefaultWorkflowGraph(workflowId));

        ObjectNode spark = document.putObject("x_spark");
        spark.put("schema", "spark.agent.workflow.design.v1");
        ObjectNode designer = spark.putObject("designer");
        designer.put("title", resolvedTitle);

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

    private ObjectNode createDefaultWorkflowGraph(String workflowId) {
        ObjectNode graph = objectMapper.createObjectNode();
        graph.put("id", workflowId + ".graph");
        ArrayNode nodes = objectMapper.createArrayNode();
        addStartNode(nodes);
        addBusinessNode(nodes);
        addOutputNode(nodes);
        ArrayNode lines = objectMapper.createArrayNode();
        addGraphLine(lines, "line.start.node", "start", "$workflow", "input",
                "node.model", "node.model.model", "input");
        addGraphLine(lines, "line.node.output", "node.model", "node.model.model", "result",
                "output", "$workflow", "result");

        graph.set("nodes", nodes);
        graph.set("lines", lines);
        ObjectNode viewport = graph.putObject("viewport");
        viewport.put("x", 0);
        viewport.put("y", 0);
        viewport.put("zoom", 1);
        return graph;
    }

    private void addStartNode(ArrayNode nodes) {
        ObjectNode node = nodes.addObject();
        node.put("id", "start");
        node.put("type", "start");
        ObjectNode position = node.putObject("position");
        position.put("x", 0);
        position.put("y", 0);
        ObjectNode data = node.putObject("data");
        data.put("type", "start");
        data.put("title", "Start");
        data.put("desc", "Workflow input");
        data.putObject("inputs");
        data.putObject("projection");
        data.putObject("validation");
        data.putObject("state");
    }

    private void addOutputNode(ArrayNode nodes) {
        ObjectNode node = nodes.addObject();
        node.put("id", "output");
        node.put("type", "output");
        ObjectNode position = node.putObject("position");
        position.put("x", 520);
        position.put("y", 0);
        ObjectNode data = node.putObject("data");
        data.put("type", "output");
        data.put("title", "Output");
        data.put("desc", "Workflow output");
        data.putObject("outputs");
        data.putObject("upstreamValidation");
        data.putObject("validation");
        data.putObject("state");
        data.putObject("result");
        data.putArray("capabilities");
    }

    private void addBusinessNode(ArrayNode nodes) {
        ObjectNode node = nodes.addObject();
        node.put("id", "node.model");
        node.put("type", "node");
        ObjectNode position = node.putObject("position");
        position.put("x", 260);
        position.put("y", 0);
        ObjectNode data = node.putObject("data");
        data.put("type", "node");
        data.put("title", "Business Node");
        data.put("desc", "Bind models, inputs, outputs, and a projected completion member before publishing.");
        ArrayNode models = data.putArray("models");
        ObjectNode model = models.addObject();
        model.put("id", "node.model.model");
        model.put("rootClassName", PLACEHOLDER_MODEL_ROOT_CLASS_NAME);
        model.put("className", PLACEHOLDER_MODEL_CLASS_NAME);
        model.put("sourceRef", "$");
        data.putObject("inputs");
        data.putObject("outputs");
        ObjectNode llm = data.putObject("llm");
        ObjectNode task = llm.putObject("task");
        task.put("goal", "");
        task.putObject("requirements");
        task.putObject("contextInputs");
        ObjectNode knowledge = llm.putObject("knowledge");
        knowledge.put("rootClassName", PLACEHOLDER_MODEL_ROOT_CLASS_NAME);
        knowledge.put("className", PLACEHOLDER_MODEL_CLASS_NAME);
        knowledge.putArray("allowedActions");
        knowledge.putArray("readableAttributes");
        ObjectNode functionCalling = llm.putObject("functionCalling");
        functionCalling.put("mode", "freeWithinModelContext");
        functionCalling.putArray("constraints");
        ObjectNode output = llm.putObject("output");
        output.putObject("structuredResult");
        output.put("handoffToValidation", true);
        data.putObject("validation");
        data.putObject("state");
        data.putObject("result");
        data.putArray("capabilities");
    }

    private void addGraphLine(ArrayNode lines, String id,
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
        line.put("type", "custom");
        ObjectNode data = line.putObject("data");
        data.put("relation", "sequence");
        ObjectNode branch = data.putObject("branch");
        branch.put("label", "default");
        branch.put("default", true);
        data.putObject("validation");
    }

    private ObjectNode createPlaceholderRuntimeBinding() {
        ObjectNode binding = objectMapper.createObjectNode();
        ObjectNode registration = binding.putObject("registration");
        registration.put("alias", PLACEHOLDER_RUNTIME_ID);
        registration.put("moduleId", PLACEHOLDER_RUNTIME_ID);
        registration.put("businessId", PLACEHOLDER_RUNTIME_ID);

        ObjectNode inputContract = binding.putObject("inputContract");
        inputContract.put("identityField", "input");
        inputContract.put("messageField", "input");
        ObjectNode paramsSchema = inputContract.putObject("paramsSchema");
        paramsSchema.put("type", "object");
        paramsSchema.putObject("properties");
        paramsSchema.put("additionalProperties", false);
        inputContract.putArray("readonlySteps");

        ObjectNode systemPrompt = binding.putObject("systemPrompt");
        systemPrompt.put("template", "spark.placeholder.prompt");
        systemPrompt.putArray("conditionalHints");

        ObjectNode projectionRef = binding.putObject("modelProjectionRef");
        projectionRef.put("kind", "dts-class-model");
        projectionRef.put("rootClassName", PLACEHOLDER_MODEL_ROOT_CLASS_NAME);
        projectionRef.put("manifestUrlRef", "dts-class-model");

        ObjectNode executableRef = binding.putObject("executableRef");
        executableRef.put("kind", "js-module");
        executableRef.put("moduleSpecifier", "spark.placeholder.module");
        executableRef.put("exportName", PLACEHOLDER_MODEL_CLASS_NAME);

        ObjectNode resolveInstance = binding.putObject("resolveInstance");
        resolveInstance.put("editorSource", PLACEHOLDER_RUNTIME_ID);
        resolveInstance.put("identityField", "input");
        return binding;
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
        rejectField(document, "app");
        rejectField(document, "factory");
        rejectField(document, "process");

        JsonNode workflow = requiredObject(document, "workflow");
        requireInt(workflow, "version", 1);
        String documentWorkflowId = requireNonBlankText(workflow, "id");
        if (!workflowId.equals(documentWorkflowId)) {
            throw new IllegalArgumentException("workflowId mismatch: path=" + workflowId
                    + ", document=" + documentWorkflowId);
        }

        JsonNode graph = requiredObject(workflow, "graph");
        JsonNode nodes = requireArray(graph, "nodes");
        JsonNode lines = requireArray(graph, "lines");
        rejectField(graph, "edges");
        validateCapabilities(requireArray(workflow, "capabilities"), "workflow.capabilities");
        requiredObject(workflow, "runtimeBinding");
        requiredObject(graph, "viewport");
        validateWorkflowNodes(nodes, true);
        validateWorkflowLines(nodes, lines);

        JsonNode spark = requiredObject(document, "x_spark");
        rejectField(spark, "factory");
        rejectField(spark, "process");
        requiredObject(spark, "draft");
        requiredObject(spark, "validation");
    }

    private void validateDefinitionDocument(String workflowId, JsonNode document, boolean allowInvalidValidationStatus) {
        if (document == null || !document.isObject()) {
            throw new IllegalArgumentException("workflow definition document must be a JSON object");
        }
        requireText(document, "kind", DEFINITION_KIND);
        requireInt(document, "version", 1);
        String documentWorkflowId = requireNonBlankText(document, "workflowId");
        if (!workflowId.equals(documentWorkflowId)) {
            throw new IllegalArgumentException("workflowId mismatch: path=" + workflowId
                    + ", definition=" + documentWorkflowId);
        }

        JsonNode source = requiredObject(document, "source");
        requireText(source, "designKind", DESIGN_KIND);
        String designId = requireNonBlankText(source, "designId");
        if (!workflowId.equals(designId)) {
            throw new IllegalArgumentException("workflowId mismatch: path=" + workflowId
                    + ", definition.source.designId=" + designId);
        }
        requireInt(source, "designVersion", 1);
        rejectField(document, "app");
        rejectField(document, "factory");
        rejectField(document, "process");

        JsonNode workflow = requiredObject(document, "workflow");
        requireArray(workflow, "variables");
        requiredObject(workflow, "runtimeBinding");
        validateCapabilities(requireArray(workflow, "capabilities"), "workflow.capabilities");
        JsonNode graph = requiredObject(workflow, "graph");
        JsonNode nodes = requireArray(graph, "nodes");
        JsonNode lines = requireArray(graph, "lines");
        rejectField(graph, "edges");
        validateWorkflowNodes(nodes, false);
        validateWorkflowLines(nodes, lines);

        JsonNode spark = requiredObject(document, "x_spark");
        requireText(spark, "schema", DEFINITION_SCHEMA);
        requireNonBlankText(spark, "publishedAt");
        JsonNode validation = requiredObject(spark, "validation");
        String status = requireNonBlankText(validation, "status");
        if (!"valid".equals(status) && !"warning".equals(status)
                && (!allowInvalidValidationStatus || !"invalid".equals(status))) {
            throw new IllegalArgumentException("invalid workflow definition validation status: " + status);
        }
        requireArray(validation, "issues");
    }

    private void validateWorkflowNodes(JsonNode nodes, boolean allowPlaceholderModelBinding) {
        boolean hasStart = false;
        boolean hasOutput = false;
        for (JsonNode node : nodes) {
            String id = requireNonBlankText(node, "id");
            String type = requireNonBlankText(node, "type");
            JsonNode data = requiredObject(node, "data");
            JsonNode dataType = data.get("type");
            if (dataType != null && (!dataType.isTextual() || !type.equals(dataType.asText()))) {
                throw new IllegalArgumentException("workflow node type mismatch: " + id);
            }
            rejectLegacyNode(id, data);
            if ("start".equals(type)) {
                hasStart = true;
                validateStartNode(id, data);
            } else if ("output".equals(type)) {
                hasOutput = true;
                validateOutputNode(id, data);
            } else if ("node".equals(type)) {
                validateBusinessNode(id, data, allowPlaceholderModelBinding);
            } else {
                throw new IllegalArgumentException("unsupported workflow node type: " + type);
            }
        }
        if (!hasStart) {
            throw new IllegalArgumentException("workflow graph must contain a start node");
        }
        if (!hasOutput) {
            throw new IllegalArgumentException("workflow graph must contain an output node");
        }
    }

    private void validateStartNode(String id, JsonNode data) {
        requireOptionalObject(data, "inputs");
        requireOptionalObject(data, "projection");
        requireOptionalObject(data, "validation");
        requireOptionalObject(data, "state");
        validateOptionalCapabilities(data.get("capabilities"), "node capabilities: " + id);
    }

    private void validateOutputNode(String id, JsonNode data) {
        requiredObject(data, "outputs");
        requireOptionalObject(data, "upstreamValidation");
        requireOptionalObject(data, "validation");
        requireOptionalObject(data, "state");
        requireOptionalObject(data, "result");
        validateOptionalCapabilities(data.get("capabilities"), "node capabilities: " + id);
    }

    private void validateWorkflowLines(JsonNode nodes, JsonNode lines) {
        List<String> nodeIds = new ArrayList<>();
        List<String> startIds = new ArrayList<>();
        Set<String> outputIds = new HashSet<>();
        for (JsonNode node : nodes) {
            String nodeId = requireNonBlankText(node, "id");
            String nodeType = requireNonBlankText(node, "type");
            nodeIds.add(nodeId);
            if ("start".equals(nodeType)) {
                startIds.add(nodeId);
            } else if ("output".equals(nodeType)) {
                outputIds.add(nodeId);
            }
        }
        Map<String, List<String>> adjacency = new LinkedHashMap<>();
        for (JsonNode line : lines) {
            String lineId = requireNonBlankText(line, "id");
            String source = validateWorkflowLineEndpoint(lineId, requiredObject(line, "from"), "from", nodeIds);
            String target = validateWorkflowLineEndpoint(lineId, requiredObject(line, "to"), "to", nodeIds);
            validateWorkflowLineData(lineId, line.get("data"));
            adjacency.computeIfAbsent(source, ignored -> new ArrayList<>()).add(target);
        }
        if (!startIds.isEmpty() && !outputIds.isEmpty() && !canReachAnyOutput(startIds, outputIds, adjacency)) {
            throw new IllegalArgumentException("workflow graph must contain a path from start to output");
        }
    }

    private String validateWorkflowLineEndpoint(String lineId, JsonNode endpoint, String role, List<String> nodeIds) {
        String nodeId = requireNonBlankText(endpoint, "nodeId");
        requireNonBlankText(endpoint, "modelId");
        requireNonBlankText(endpoint, "memberName");
        requireOptionalObject(endpoint, "dock");
        if (!nodeIds.contains(nodeId)) {
            throw new IllegalArgumentException("workflow line " + role + " node missing: " + nodeId + " in " + lineId);
        }
        return nodeId;
    }

    private boolean canReachAnyOutput(List<String> startIds, Set<String> outputIds,
                                      Map<String, List<String>> adjacency) {
        Set<String> visited = new HashSet<>();
        ArrayDeque<String> queue = new ArrayDeque<>(startIds);
        while (!queue.isEmpty()) {
            String nodeId = queue.removeFirst();
            if (!visited.add(nodeId)) {
                continue;
            }
            if (outputIds.contains(nodeId)) {
                return true;
            }
            for (String next : adjacency.getOrDefault(nodeId, List.of())) {
                if (!visited.contains(next)) {
                    queue.addLast(next);
                }
            }
        }
        return false;
    }

    private void validateWorkflowLineData(String lineId, JsonNode data) {
        if (data == null) {
            return;
        }
        if (!data.isObject()) {
            throw new IllegalArgumentException("workflow line data must be an object: " + lineId);
        }
        JsonNode relation = data.get("relation");
        if (relation != null && (!relation.isTextual() || relation.asText().isBlank())) {
            throw new IllegalArgumentException("workflow line relation must be non-empty when provided: " + lineId);
        }
        JsonNode branch = data.get("branch");
        if (branch != null) {
            if (!branch.isObject()) {
                throw new IllegalArgumentException("workflow line branch must be an object: " + lineId);
            }
            JsonNode condition = branch.get("condition");
            if (condition != null && (!condition.isTextual() || condition.asText().isBlank())) {
                throw new IllegalArgumentException("workflow line branch.condition must be non-empty when provided: " + lineId);
            }
            JsonNode label = branch.get("label");
            if (label != null && (!label.isTextual() || label.asText().isBlank())) {
                throw new IllegalArgumentException("workflow line branch.label must be non-empty when provided: " + lineId);
            }
            JsonNode priority = branch.get("priority");
            if (priority != null && !priority.isNumber()) {
                throw new IllegalArgumentException("workflow line branch.priority must be a number: " + lineId);
            }
            JsonNode defaultValue = branch.get("default");
            if (defaultValue != null && !defaultValue.isBoolean()) {
                throw new IllegalArgumentException("workflow line branch.default must be a boolean: " + lineId);
            }
        }
        requireOptionalObject(data, "validation");
    }

    private void validateBusinessNode(String id, JsonNode data, boolean allowPlaceholderModelBinding) {
        validateBusinessNodeModels(id, requireArray(data, "models"), allowPlaceholderModelBinding);
        requiredObject(data, "inputs");
        requiredObject(data, "outputs");
        JsonNode llm = data.get("llm");
        if (llm != null) {
            validateLlmNodeData(id, llm);
        }
        requireOptionalObject(data, "validation");
        requireOptionalObject(data, "state");
        requireOptionalObject(data, "result");
        validateOptionalCapabilities(data.get("capabilities"), "node capabilities: " + id);
    }

    private void validateLlmNodeData(String id, JsonNode llm) {
        if (!llm.isObject()) {
            throw new IllegalArgumentException("workflow node llm must be an object: " + id);
        }
        requireOptionalObject(llm, "task");
        requireOptionalObject(llm, "knowledge");
        requireOptionalObject(llm, "functionCalling");
        requireOptionalObject(llm, "output");
    }

    private void validateBusinessNodeModels(String id, JsonNode models, boolean allowPlaceholderModelBinding) {
        if (models.size() == 0) {
            throw new IllegalArgumentException("workflow business node must bind at least one model: " + id);
        }
        int index = 0;
        for (JsonNode model : models) {
            if (!model.isObject()) {
                throw new IllegalArgumentException("workflow business node model must be an object: " + id + "[" + index + "]");
            }
            requireNonBlankText(model, "id");
            String rootClassName = requireNonBlankText(model, "rootClassName");
            String className = requireNonBlankText(model, "className");
            requireOptionalNonBlankText(model, "sourceRef");
            requireOptionalNonBlankText(model, "role");
            validateOptionalModelVia(model.get("via"), id, index);
            validateOptionalModelCompletion(model.get("completion"), id, index);
            if (!allowPlaceholderModelBinding
                    && (PLACEHOLDER_MODEL_ROOT_CLASS_NAME.equals(rootClassName)
                    || PLACEHOLDER_MODEL_CLASS_NAME.equals(className))) {
                throw new IllegalArgumentException("workflow business node must bind a real model: " + id);
            }
            index += 1;
        }
    }

    private void validateOptionalModelVia(JsonNode via, String id, int modelIndex) {
        if (via == null) {
            return;
        }
        if (!via.isArray()) {
            throw new IllegalArgumentException("workflow business node model.via must be an array: " + id + "[" + modelIndex + "]");
        }
        int index = 0;
        for (JsonNode item : via) {
            if (!item.isObject()) {
                throw new IllegalArgumentException("workflow business node model.via entry must be an object: "
                        + id + "[" + modelIndex + "][" + index + "]");
            }
            requireNonBlankText(item, "memberName");
            requireOptionalNonBlankText(item, "kind");
            requireOptionalNonBlankText(item, "sourceRef");
            index += 1;
        }
    }

    private void validateOptionalModelCompletion(JsonNode completion, String id, int modelIndex) {
        if (completion == null) {
            return;
        }
        if (!completion.isObject()) {
            throw new IllegalArgumentException("workflow business node completion must be an object: " + id + "[" + modelIndex + "]");
        }
        requireNonBlankText(completion, "memberName");
        requireOptionalNonBlankText(completion, "returnContract");
    }

    private void rejectLegacyNode(String id, JsonNode data) {
        if (data.has("tool_name") || "single_model_edit".equals(data.path("toolName").asText())) {
            throw new IllegalArgumentException("legacy single_model_edit node is not allowed: " + id);
        }
        if ("process-step".equals(data.path("type").asText())
                || "process-stage".equals(data.path("x_spark").path("nodeRole").asText())) {
            throw new IllegalArgumentException("legacy process-stage node is not allowed: " + id);
        }
        if (data.has("provider") || data.has("toolName") || data.has("workflowRef")
                || data.has("toolParameters") || data.has("inputMapping") || data.has("outputMapping")) {
            throw new IllegalArgumentException("legacy workflow node fields are not allowed: " + id);
        }
        if (data.has("model")) {
            throw new IllegalArgumentException("legacy workflow node model field is not allowed: " + id);
        }
        if (data.path("x_spark").has("classModel")) {
            throw new IllegalArgumentException("legacy classModel node metadata is not allowed: " + id);
        }
    }

    private void validateOptionalCapabilities(JsonNode capabilities, String path) {
        if (capabilities == null) {
            return;
        }
        if (!capabilities.isArray()) {
            throw new IllegalArgumentException("missing array field: " + path);
        }
        validateCapabilities(capabilities, path);
    }

    private void validateCapabilities(JsonNode capabilities, String path) {
        if (!capabilities.isArray()) {
            throw new IllegalArgumentException("missing array field: " + path);
        }
        int index = 0;
        for (JsonNode capability : capabilities) {
            if (!capability.isObject()) {
                throw new IllegalArgumentException("workflow capability must be an object: " + path + "[" + index + "]");
            }
            requireNonBlankText(capability, "id");
            requireNonBlankText(capability, "title");
            requireNonBlankText(capability, "scope");
            requireNonBlankText(capability, "description");
            requireOptionalObject(capability, "inputs");
            requireOptionalObject(capability, "outputs");
            validateOptionalStringArray(capability.get("constraints"), path + "[" + index + "].constraints");
            index += 1;
        }
    }

    private void requireOptionalObject(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value != null && !value.isObject()) {
            throw new IllegalArgumentException("invalid object field: " + field);
        }
    }

    private void validateOptionalStringArray(JsonNode value, String path) {
        if (value == null) {
            return;
        }
        if (!value.isArray()) {
            throw new IllegalArgumentException("missing array field: " + path);
        }
        for (JsonNode item : value) {
            if (!item.isTextual() || item.asText().isBlank()) {
                throw new IllegalArgumentException("invalid text field: " + path);
            }
        }
    }

    private void rejectField(JsonNode node, String field) {
        if (node.has(field)) {
            throw new IllegalArgumentException("forbidden field: " + field);
        }
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

    private JsonNode requireArray(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isArray()) {
            throw new IllegalArgumentException("missing array field: " + field);
        }
        return value;
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

    private void requireOptionalNonBlankText(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value != null && (!value.isTextual() || value.asText().isBlank())) {
            throw new IllegalArgumentException("invalid text field: " + field);
        }
    }

    private void addDesignSummary(Map<String, Object> item, String workflowId, Path designFile) {
        try {
            JsonNode document = objectMapper.readTree(designFile.toFile());
            JsonNode workflow = document.path("workflow");
            JsonNode designer = document.path("x_spark").path("designer");
            JsonNode draft = document.path("x_spark").path("draft");
            if (designer.path("title").isTextual()) {
                item.put("title", designer.path("title").asText());
            }
            if (workflow.path("version").isInt()) {
                item.put("version", workflow.path("version").asInt());
            }
            if (draft.path("status").isTextual()) {
                item.put("status", draft.path("status").asText());
            }
            validateDesignDocument(workflowId, document);
        } catch (IOException | IllegalArgumentException e) {
            item.put("status", "unreadable");
            item.put("error", e.getMessage());
        }
    }

    private Map<String, Object> resultWithTimestamp(String workflowId, Path file) throws IOException {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("workflowId", workflowId);
        result.put("filename", file.getFileName().toString());
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

    private Path definitionFile(String tenantId, String projectId, String workflowId) {
        return workflowDir(tenantId, projectId, workflowId).resolve(DEFINITION_FILENAME);
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
