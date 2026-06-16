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
    public static final String DEFINITION_FILENAME = "definition.json";

    private static final Pattern SAFE_SCOPE_ID = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,127}");
    private static final String DESIGN_KIND = "agent.workflow.design";
    private static final String DEFINITION_KIND = "agent.workflow";
    private static final String DEFINITION_SCHEMA = "spark.agent.workflow.definition.v1";
    private static final String GRAPH_NODE_TYPE = "custom";
    private static final String SINGLE_MODEL_EDIT_TOOL_NAME = "single_model_edit";
    private static final String SINGLE_MODEL_EDIT_PROVIDER = "spark.model-editor";
    private static final List<FactoryPhase> FACTORY_PHASES = List.of(
            new FactoryPhase("F0", "identity", "factory.identity", "workflow.factory.identity"),
            new FactoryPhase("F1", "materials", "factory.materials", "workflow.factory.materials"),
            new FactoryPhase("F2", "knowledge", "factory.knowledge", "workflow.factory.knowledge"),
            new FactoryPhase("F3", "contract", "factory.contract", "workflow.factory.contract"),
            new FactoryPhase("F4", "runtime", "factory.runtime", "workflow.factory.runtime"),
            new FactoryPhase("F5", "governance", "factory.governance", "workflow.factory.governance"),
            new FactoryPhase("F6", "acceptance", "factory.acceptance", "workflow.factory.acceptance"),
            new FactoryPhase("F7", "activation", "factory.activation", "workflow.factory.activation"),
            new FactoryPhase("F8", "workOrder", "factory.workOrder", "workflow.factory.workOrder"),
            new FactoryPhase("F9", "delivery", "factory.delivery", "workflow.factory.delivery"));
    private static final List<ProcessStage> PROCESS_STAGES = List.of(
            new ProcessStage("PD1.scope-inventory", "Scope and inventory", "1-20", 0, 0, List.of(
                    new StageConsideration("F0", "Identity boundary", "pageIdResolvedCount", "Resolved pageId count", "gte", 1, "page"),
                    new StageConsideration("F1", "Material inventory", "fileBindingCount", "File binding count", "gte", 4, "file"),
                    new StageConsideration("F6", "Entry acceptance", "bootstrapMissingCapabilityCount", "Missing capability count", "eq", 0, "capability"))),
            new ProcessStage("PD2.data-model", "Data planning and table model", "21-40", 300, 0, List.of(
                    new StageConsideration("F1", "Data material", "businessObjectCount", "Business object count", "gte", 1, "object"),
                    new StageConsideration("F2", "Data knowledge", "uiStateColumnCount", "UI state column count", "eq", 0, "column"),
                    new StageConsideration("F6", "Model acceptance", "dataSetRoundTripErrorCount", "DataSet round-trip error count", "eq", 0, "error"))),
            new ProcessStage("PD3.table-relations", "Table relations", "41-50", 600, 0, List.of(
                    new StageConsideration("F3", "Relation contract", "relationFieldMissingCount", "Missing relation field count", "eq", 0, "field"),
                    new StageConsideration("F5", "Relation governance", "relationWithoutConsumerCount", "Relation without consumer count", "eq", 0, "relation"),
                    new StageConsideration("F6", "Relation acceptance", "missingChildFieldCount", "Missing child field count", "eq", 0, "field"))),
            new ProcessStage("PD4.page-data-use", "Page planning and data use", "51-70", 900, 0, List.of(
                    new StageConsideration("F3", "Consumption contract", "regionMappingCoveragePercent", "Region mapping coverage", "gte", 100, "percent"),
                    new StageConsideration("F5", "Consumption governance", "decorativeDataViewCount", "Decorative DataView count", "eq", 0, "view"),
                    new StageConsideration("F8", "Work order traceability", "consumerTraceabilityPercent", "Consumer traceability", "gte", 100, "percent"))),
            new ProcessStage("PD5.views-dependencies", "Views and dependencies", "71-88", 900, 240, List.of(
                    new StageConsideration("F4", "View workstation", "stateIsolationDecisionCoveragePercent", "State isolation decision coverage", "gte", 100, "percent"),
                    new StageConsideration("F5", "View governance", "viewWithoutConsumerCount", "View without consumer count", "eq", 0, "view"),
                    new StageConsideration("F6", "Dependency acceptance", "circularDependencyCount", "Circular dependency count", "eq", 0, "cycle"))),
            new ProcessStage("PD6.structure-behavior-style", "Structure behavior style", "89-96", 600, 240, List.of(
                    new StageConsideration("F2", "Component knowledge", "componentGuideCoveragePercent", "Component guide coverage", "gte", 100, "percent"),
                    new StageConsideration("F4", "Structure workstation", "nodeTreeMutationCount", "NodeTree mutation count", "gte", 1, "mutation"),
                    new StageConsideration("F6", "Four-file acceptance", "missingHandlerCount", "Missing handler count", "eq", 0, "handler"),
                    new StageConsideration("F9", "Delivery boundary", "outOfArtifactWriteCount", "Out-of-artifact write count", "eq", 0, "write"))),
            new ProcessStage("PD7.verify-deliver", "Verify and deliver", "97-100", 300, 240, List.of(
                    new StageConsideration("F6", "Final acceptance", "previewErrorCount", "Preview error count", "eq", 0, "error"),
                    new StageConsideration("F7", "Design handoff", "executionImplementationStepCount", "Execution implementation step count", "eq", 0, "step"),
                    new StageConsideration("F9", "Delivery closure", "deliveryArtifactCount", "Delivery artifact count", "gte", 4, "file"))));

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
        validateDefinitionDocument(workflowId, definition);

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
        validateDefinitionDocument(workflowId, definition);

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
        validateDefinitionDocument(workflowId, definition);

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
        workflow.set("graph", createDefaultWorkflowGraph(workflowId));

        ObjectNode spark = document.putObject("x_spark");
        spark.put("schema", "spark.agent.workflow.design.v1");
        spark.put("businessFactory", true);
        spark.put("phaseModel", "F0-F9-considerations");
        spark.set("factory", createDefaultFactorySections());
        spark.set("process", createDefaultWorkflowProcess());

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

    private ObjectNode createDefaultFactorySections() {
        ObjectNode factory = objectMapper.createObjectNode();
        for (FactoryPhase phase : FACTORY_PHASES) {
            ObjectNode section = factory.putObject(phase.phase());
            section.put("phaseId", phase.phaseId());
            section.put("phase", phase.phase());
            section.put("sectionPath", phase.sectionPath());
            section.put("publishPath", phase.publishPath());
            section.putObject("value");
        }
        return factory;
    }

    private ObjectNode createDefaultWorkflowProcess() {
        ObjectNode process = objectMapper.createObjectNode();
        process.put("processId", "pageDesign.data-first-100-step-process");
        process.put("title", "Page design seven-stage data-first process");
        process.put("sourceRef", "docs/ai/DATASET_PAGE_DESIGN_AI_FLOW_100_STEPS_ZH.md#10");
        process.put("principle", "The graph contains craft steps; F0-F9 are stage considerations with numeric metrics.");
        ArrayNode knowledgeSources = process.putArray("knowledgeSources");
        addPageDesignProcessDocumentRef(knowledgeSources);
        addGeneratedKnowledgeRef(knowledgeSources, "generated.manifest", "DTS ClassModel bundle manifest",
                "generated/dts-class-model/manifest.json",
                "Locate generated model, component, tool, and script knowledge shards.");
        addGeneratedKnowledgeRef(knowledgeSources, "generated.configPageNode", "ConfigPageNode",
                "generated/dts-class-model/files/packages/spark-project-model/src/page/config-page.ts.json",
                "Confirm four-file memory editing APIs.", "ConfigPageNode");
        addGeneratedKnowledgeRef(knowledgeSources, "generated.dataSetCrudTool", "DataSetCrudTool",
                "generated/dts-class-model/files/packages/spark-data/src/dataset-crud-tool.ts.json",
                "Confirm structured DataSet, relation, view, and dependency mutation parameters.", "DataSetCrudTool");
        ArrayNode stages = process.putArray("stages");
        for (ProcessStage stage : PROCESS_STAGES) {
            ObjectNode stageNode = stages.addObject();
            stageNode.put("stageId", stage.stageId());
            stageNode.put("title", stage.title());
            stageNode.put("sourceSteps", stage.sourceSteps());
            stageNode.put("goal", "Complete source steps " + stage.sourceSteps() + " in the page design craft.");
            addStageKnowledgeRefs(stageNode.putArray("knowledgeRefs"), stage);
            ArrayNode steps = stageNode.putArray("steps");
            ObjectNode step = steps.addObject();
            step.put("stepId", stage.stageId() + ".1");
            step.put("title", stage.title());
            step.put("sourceSteps", stage.sourceSteps());
            step.putArray("actions").add("Follow the source step range.");
            step.putArray("outputs").add("Stage result");
            step.putArray("checks").add("Stage result is closed before moving on.");
            ArrayNode considerations = stageNode.putArray("considerations");
            for (StageConsideration stageConsideration : stage.considerations()) {
                ObjectNode consideration = considerations.addObject();
                consideration.put("phaseId", stageConsideration.phaseId());
                consideration.put("title", stageConsideration.title());
                consideration.putArray("checks").add(stageConsideration.metricTitle());
                ArrayNode metrics = consideration.putArray("metrics");
                ObjectNode metric = metrics.addObject();
                metric.put("metricId", stageConsideration.metricId());
                metric.put("title", stageConsideration.metricTitle());
                metric.put("operator", stageConsideration.operator());
                metric.put("target", stageConsideration.target());
                metric.put("unit", stageConsideration.unit());
            }
        }
        return process;
    }

    private void addStageKnowledgeRefs(ArrayNode knowledgeRefs, ProcessStage stage) {
        addPageDesignProcessDocumentRef(knowledgeRefs);
        switch (stage.stageId()) {
            case "PD1.scope-inventory" -> {
                addGeneratedKnowledgeRef(knowledgeRefs, "generated.projectModel", "ProjectModel",
                        "generated/dts-class-model/files/packages/spark-project-model/src/project/project-model.ts.json",
                        "Confirm pageDesign entry and openPageDesign page model access.", "ProjectModel");
                addGeneratedKnowledgeRef(knowledgeRefs, "generated.configPageNode", "ConfigPageNode",
                        "generated/dts-class-model/files/packages/spark-project-model/src/page/config-page.ts.json",
                        "Confirm four-file memory model and editing API boundaries.", "ConfigPageNode");
            }
            case "PD2.data-model" -> {
                addGeneratedKnowledgeRef(knowledgeRefs, "generated.dataSet", "DataSet",
                        "generated/dts-class-model/files/packages/spark-data/src/dataset.ts.json",
                        "Confirm pagedata root model and serialization boundary.", "DataSet");
                addGeneratedKnowledgeRef(knowledgeRefs, "generated.dataSetCrudTool", "DataSetCrudTool",
                        "generated/dts-class-model/files/packages/spark-data/src/dataset-crud-tool.ts.json",
                        "Confirm structured table creation and update parameters.", "DataSetCrudTool");
            }
            case "PD3.table-relations" -> addGeneratedKnowledgeRef(knowledgeRefs,
                    "generated.dataSetCrudTool", "DataSetCrudTool",
                    "generated/dts-class-model/files/packages/spark-data/src/dataset-crud-tool.ts.json",
                    "Confirm relation selector and relation mutation parameters.", "DataSetCrudTool");
            case "PD4.page-data-use" -> {
                addGeneratedKnowledgeRef(knowledgeRefs, "generated.dataViewKey", "DataViewKey",
                        "generated/dts-class-model/files/packages/spark-data/src/core/data-view-key.ts.json",
                        "Confirm dataViewKey, dataMember, and dataField separation.", "DataViewKeyDescriptor");
                addGeneratedKnowledgeRef(knowledgeRefs, "generated.rendererButton", "RendererButton props",
                        "generated/dts-class-model/files/packages/spark-component/src/components/containers/layout/RendererButton.props.ts.json",
                        "Confirm action scope and dataViewKey parameters.", "RButtonProps");
            }
            case "PD5.views-dependencies" -> addGeneratedKnowledgeRef(knowledgeRefs,
                    "generated.dataView", "DataView",
                    "generated/dts-class-model/files/packages/spark-data/src/data-view.ts.json",
                    "Confirm DataView state isolation and dependency basis.", "DataView");
            case "PD6.structure-behavior-style" -> {
                addGeneratedKnowledgeRef(knowledgeRefs, "generated.sparkNodeTree", "SparkNodeTree",
                        "generated/dts-class-model/files/packages/spark-project-model/src/node-tree/spark-node-tree.ts.json",
                        "Confirm rule node tree mutation rules.", "SparkNodeTree");
                addGeneratedKnowledgeRef(knowledgeRefs, "generated.rendererTable", "RendererTable props",
                        "generated/dts-class-model/files/packages/spark-component/src/components/containers/data-views/RendererTable/RendererTable.props.ts.json",
                        "Confirm table component data source and action props.", "RTableProps");
            }
            case "PD7.verify-deliver" -> {
                addGeneratedKnowledgeRef(knowledgeRefs, "generated.sparkPageRenderer", "SparkPageRenderer",
                        "generated/dts-class-model/files/packages/spark-component/src/page/renderer/SparkPageRenderer.vue.json",
                        "Confirm preview and render error feedback source.", "PageRuntimeErrorPayload");
                addGeneratedKnowledgeRef(knowledgeRefs, "generated.dataViewKey", "DataViewKey",
                        "generated/dts-class-model/files/packages/spark-data/src/core/data-view-key.ts.json",
                        "Confirm final binding closure checks.", "DataViewKeyDescriptor");
            }
            default -> addGeneratedKnowledgeRef(knowledgeRefs, "generated.manifest", "DTS ClassModel bundle manifest",
                    "generated/dts-class-model/manifest.json",
                    "Locate generated model, component, tool, and script knowledge shards.");
        }
    }

    private void addPageDesignProcessDocumentRef(ArrayNode refs) {
        ObjectNode ref = refs.addObject();
        ref.put("refId", "doc.pageDesign100");
        ref.put("title", "Page design 100-step process");
        ref.put("source", "document");
        ref.put("path", "docs/ai/DATASET_PAGE_DESIGN_AI_FLOW_100_STEPS_ZH.md#10");
        ref.put("usage", "Define seven-stage page design craft boundaries and acceptance closure.");
    }

    private void addGeneratedKnowledgeRef(ArrayNode refs, String refId, String title, String path,
                                          String usage, String... symbols) {
        ObjectNode ref = refs.addObject();
        ref.put("refId", refId);
        ref.put("title", title);
        ref.put("source", "generated-dts-class-model");
        ref.put("path", path);
        if (symbols.length > 0) {
            ArrayNode symbolArray = ref.putArray("symbols");
            for (String symbol : symbols) {
                symbolArray.add(symbol);
            }
        }
        ref.put("usage", usage);
    }

    private ObjectNode createDefaultWorkflowGraph(String workflowId) {
        ObjectNode graph = objectMapper.createObjectNode();
        graph.put("id", workflowId + ".factory-process");
        ArrayNode nodes = objectMapper.createArrayNode();
        addStartNode(nodes);
        addProcessStageNodes(nodes);
        addEndNode(nodes);
        ArrayNode edges = objectMapper.createArrayNode();
        addGraphEdge(edges, "edge.start.PD1", "start", "process.PD1.scope-inventory", "source", "target");
        addGraphEdge(edges, "edge.PD1.PD2", "process.PD1.scope-inventory", "process.PD2.data-model", "source", "target");
        addGraphEdge(edges, "edge.PD2.PD3", "process.PD2.data-model", "process.PD3.table-relations", "source", "target");
        addGraphEdge(edges, "edge.PD3.PD4", "process.PD3.table-relations", "process.PD4.page-data-use", "source", "target");
        addGraphEdge(edges, "edge.PD4.PD5", "process.PD4.page-data-use", "process.PD5.views-dependencies", "source", "target");
        addGraphEdge(edges, "edge.PD5.PD6", "process.PD5.views-dependencies", "process.PD6.structure-behavior-style", "source", "target");
        addGraphEdge(edges, "edge.PD6.PD7", "process.PD6.structure-behavior-style", "process.PD7.verify-deliver", "source", "target");
        addGraphEdge(edges, "edge.PD7.end", "process.PD7.verify-deliver", "end", "source", "target");

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
        position.put("x", -260);
        position.put("y", 0);
        ObjectNode data = node.putObject("data");
        data.put("type", "start");
        data.put("title", "Start");
        data.put("desc", "Factory process entry");
        data.putArray("variables");
    }

    private void addProcessStageNodes(ArrayNode nodes) {
        for (ProcessStage stage : PROCESS_STAGES) {
            ObjectNode node = nodes.addObject();
            node.put("id", "process." + stage.stageId());
            node.put("type", GRAPH_NODE_TYPE);
            ObjectNode position = node.putObject("position");
            position.put("x", stage.x());
            position.put("y", stage.y());
            ObjectNode data = node.putObject("data");
            data.put("type", "process-step");
            data.put("title", stage.title());
            data.put("desc", "Source steps " + stage.sourceSteps());
            ObjectNode spark = data.putObject("x_spark");
            spark.put("nodeRole", "process-stage");
            spark.put("stageId", stage.stageId());
            spark.put("sourceSteps", stage.sourceSteps());
            ArrayNode considerations = spark.putArray("factoryConsiderations");
            for (StageConsideration stageConsideration : stage.considerations()) {
                considerations.add(stageConsideration.phaseId());
            }
        }
    }

    private void addEndNode(ArrayNode nodes) {
        ObjectNode node = nodes.addObject();
        node.put("id", "end");
        node.put("type", GRAPH_NODE_TYPE);
        ObjectNode position = node.putObject("position");
        position.put("x", -260);
        position.put("y", 240);
        ObjectNode data = node.putObject("data");
        data.put("type", "end");
        data.put("title", "End");
        data.put("desc", "Factory process completion");
        data.putArray("outputs");
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
        data.put("meaning", "craft-order");
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

        if (!containsSingleModelEditTool(graph) && !containsProcessStageNode(graph)) {
            throw new IllegalArgumentException("workflow graph must contain process-stage or single_model_edit nodes");
        }

        JsonNode spark = requiredObject(document, "x_spark");
        requiredObject(spark, "draft");
        requiredObject(spark, "validation");
    }

    private void validateDefinitionDocument(String workflowId, JsonNode document) {
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

        JsonNode factory = requiredObject(document, "factory");
        for (FactoryPhase phase : FACTORY_PHASES) {
            JsonNode section = requiredObject(factory, phase.phase());
            requireText(section, "phaseId", phase.phaseId());
            requireText(section, "phase", phase.phase());
            requireText(section, "sectionPath", phase.sectionPath());
            requireText(section, "publishPath", phase.publishPath());
            requiredObject(section, "value");
        }

        JsonNode spark = requiredObject(document, "x_spark");
        requireText(spark, "schema", DEFINITION_SCHEMA);
        requireNonBlankText(spark, "publishedAt");
        JsonNode validation = requiredObject(spark, "validation");
        String status = requireNonBlankText(validation, "status");
        if (!"valid".equals(status) && !"warning".equals(status)) {
            throw new IllegalArgumentException("invalid workflow definition validation status: " + status);
        }
        requireArray(validation, "issues");
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

    private boolean containsProcessStageNode(JsonNode graph) {
        JsonNode nodes = graph.path("nodes");
        if (nodes.isArray()) {
            for (JsonNode node : nodes) {
                JsonNode data = node.path("data");
                if ("process-step".equals(data.path("type").asText())
                        && "process-stage".equals(data.path("x_spark").path("nodeRole").asText())) {
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

    private record FactoryPhase(String phaseId, String phase, String sectionPath, String publishPath) {
    }

    private record ProcessStage(String stageId, String title, String sourceSteps, int x, int y,
                                List<StageConsideration> considerations) {
    }

    private record StageConsideration(String phaseId, String title, String metricId, String metricTitle,
                                      String operator, int target, String unit) {
    }
}
