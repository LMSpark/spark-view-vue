# Agent Workflow Designer Business Shape Research

## Task

Clean up and iterate the Agent Workflow designer so the workflow-level and node-level business shape can converge.

## Confirmed Direction

- The designer should broadly align with Dify's workflow designer interaction model, but SPARK should not keep a separate Chatflow concept.
- This round only defines the product/designer contract. Runtime internals are out of scope and must not decide the schema shape in this round.
- Generic runtime parameter validation will be added later. This round focuses only on workflow and node semantics.
- Workflow is the top-level logistics-style process definition: name, inputs, outputs, node graph, validation state, observable run state, and final run data shape.
- Node is the executable station in the process. Do not call it F0-F9 or process-stage.
- There is only one business workflow node type: the model context node. `start` and `output` are workflow boundary nodes, with `output` carrying end semantics; they are not business capability node types. Chat, LLM work, workflow invocation, and business steps are node capability configurations, not separate structural node types.
- Persist the single business node as `type: "node"`. Keep `type: "start"` for workflow entry boundary. Keep existing `type: "output"` as the workflow end boundary type for now, with end semantics.
- Every workflow node is ultimately projected into ClassModel execution. ClassModel is the execution projection center for node capabilities.
- Branching is expressed on workflow edges. Branch attributes belong to the step line / edge, not to a separate branch node type.
- Edge is the branch/routing carrier: source node outputs data; edge declares routing condition, branch label, priority, and validation state before handing control to the target node.
- The logistics system does not care what the cargo is. Workflow edges define projection and routing only; they should not be coupled to a specific payload type in this round.
- Chat is a node capability implemented through ClassModel, not a standalone Chatflow top-level or special runtime concept.
- Workflow invocation is also a node capability: name, inputs, outputs, and referenced workflow.
- Model context binding, LLM work content, validation, and runtime state are common properties of every workflow node, not only properties of a ClassModel node or LLM node.
- Node-level ClassModel binding must deeply connect to ClassModel data: available class/model/action/schema/parameter mappings should be discoverable and configurable, not only edited as raw JSON.
- Node-level LLM work content should express prompt/context input/structured output/validation requirements as first-class configuration.
- Workflow and node validation state must be visible and stored. The final valuable result is not the diagram itself, but the data produced by running the workflow.
- Single business node data should use business semantic sections: `title`, `model`, `inputs`, `outputs`, `llm`, `validation`, `state`, `result`, and `x_spark`.
- `validation`, `state`, and `result` are core workflow/node semantics, not `x_spark` private metadata.
- `x_spark` is only for SPARK private extension metadata such as schema marker, designer UI state, compatibility hints, or non-business implementation details.

## ClassModel Definition For This Designer

- ClassModel is the AI-readable and AI-operable projection of business classes, not a standalone workflow node type, not a hand-written registry, and not merely a JSON schema file.
- The semantic source of a ClassModel is the TypeScript business class and its JSDoc. For AI-editable business classes, the class must extend `SparkAIModel`, and `toJson()` is the only mandatory protocol method.
- A ClassModel exposes bounded business knowledge: the current root class, reachable child models, public attributes, public actions/methods, constructor or action parameter schemas, return/result schemas, and JSDoc constraints.
- `generated/dts-class-model/` is a generated query/index/cache layer for that knowledge. It is not the product design center and should not become a second manual truth source.
- In the workflow designer, a node's `model` section should therefore mean "which business model context and capability this node is bound to and how workflow data maps to its inputs/outputs." It should not mean "this node type is ClassModel."
- Chat is not a special workflow mode. If Chat exists as a workflow node behavior, it is a named capability or action selected through the node's ClassModel binding.
- Use `node.model` as the persisted field name for the model context. `ClassModel` remains the knowledge-system/source name, not the node data field name.

## ClassModel Hierarchy

There are two different hierarchies. The workflow designer must use the business model hierarchy, while consuming it through the generated knowledge hierarchy.

### Generated Knowledge Hierarchy

```text
generated/dts-class-model/manifest.json
  -> files[sourcePath]
     -> shard file path and module metadata
  -> classIndex[className]
     -> sourcePath and shard file for a model
  -> componentIndex
     -> component query index only

generated/dts-class-model/files/<source>.json
  -> module
     -> file-level semantic entry, not parent model
  -> $defs[className]
     -> JSON Schema and executable method schema pool
  -> models[className]
     -> DtsTypeDeclarationModel
```

- `module` and `models` are siblings. `module` is not the parent of `models`.
- Raw shard JSON intentionally strips duplicate member schemas. The reader hydrates schemas from top-level `$defs[className]` back into attributes, constructors, and methods.
- The designer should consume hydrated ClassModel knowledge, not hand-parse raw shard JSON as the final shape.

### Business Model Hierarchy

```text
rootClassName
  -> reachable class/model closure
     -> DtsTypeDeclarationModel
        -> declarationKind: class | interface | typeAlias | enum
        -> jsdoc / relations / component profile
        -> classDecl | interfaceDecl | typeAlias | enumDecl
           -> constructorMeta
              -> parameters / paramsSchema
           -> members.attributes[]
              -> name / readable / writable / schema / jsdoc
           -> members.methods[]
              -> name / parameters / paramsSchema / returnSchema / jsdoc / type
```

- Reachability starts from `rootClassName`, not from every exported class in the repository.
- Child model links come from attribute schema, method parameters, method return types, constructor parameters, and declaration relations.
- Action means a public method in `members.methods`. Its stable design-time facts are method name, JSDoc, parameter list, `paramsSchema`, return type, and `returnSchema`.
- Attributes can be understood as node outputs. A workflow node should expose selected readable attributes of its bound model as outgoing parameters, instead of maintaining a separate hand-written output schema.
- Normal work action should not be bound in `node.model`. It belongs to the node's LLM work content and can be selected by the LLM from the current model context.
- Validation action is different: `node.validation` must explicitly bind the model action used for verification, so validation is traceable and not inferred ad hoc.
- Parameter mapping for a bound validation action should map workflow inputs, upstream node results, or current model attributes into that action's `paramsSchema` fields.
- Output mapping for action results should be based on `returnSchema` and result class links, not on a free-form node type.
- Edges should project source node attributes or action results into the target node model context. In other words, the step line is the property/result projection carrier between models.
- More generally, the edge transports arbitrary cargo by reference. The cargo can be a requirement input, model attribute, action result, LLM structured result, validation result, user-provided fact, or child model instance. The edge contract should express where it comes from and where it goes, not hard-code what it is.

### Example

```text
ProjectModel
  -> attributes: design, session
  -> actions:
     -> openPageDesign(pageId: string): ConfigPageNode
     -> replaceNavigationChildren(input): ProjectModelData

ConfigPageNode
  -> attributes: rule, dataSet, style, script, pageId
  -> actions:
     -> editNodeTree(run)
     -> editDataSet(run)

DataSet
  -> actions:
     -> addTable(tableName, columns): DataTable
```

The business node should therefore bind to a model context such as `ProjectModel` or `ConfigPageNode`. LLM work may compose actions such as `openPageDesign` or `editDataSet` inside that model context, while node completion is still gated by the explicitly bound validation action.

## Workflow Designer Contract Draft

### Workflow Level

```text
workflow
  -> name/title
  -> inputs
     -> external input parameters that seed the first model context
  -> outputs
     -> selected final cargo references
  -> graph
     -> nodes: boundary nodes and business model contexts
     -> edges: cargo projections and routing
  -> validation
  -> state
  -> result
```

- Workflow is not a Chatflow/App/factory wrapper. It is a process definition over model contexts.
- Workflow inputs are only the process entry data. They are not a replacement for model attributes.
- Workflow outputs should be selected final cargo references produced by the graph. They are not restricted to attributes or action results in this round.
- `start` and `output` still have workflow boundary semantics and should not be removed in this round.
- `start` carries workflow entry inputs and projects them to the next node.
- `output` collects upstream completion and verifies whether upstream nodes passed validation before workflow completion.
- More detailed start/output behavior is runtime implementation scope; this round only keeps their workflow boundary semantics.
- Start/output are boundary nodes. `output` carries end semantics. They are allowed in the graph but are not business capability node types.

### Node Level

```text
business node
  -> type: node
  -> id/title
  -> model
     -> rootClassName
     -> className
     -> contextPath
  -> inputs
     -> inbound projected cargo for this model context
  -> outputs
     -> selected outgoing cargo references
  -> llm
     -> work instruction over this model context
  -> validation
     -> bound validation action
  -> state
  -> result
  -> x_spark
```

- A business node corresponds to a model context.
- A business node persists as `type: "node"`.
- The business node's output parameters should be understood as model-readable attributes plus optional action result.
- The business node's normal work action is not persisted under `node.model`. It is part of `node.llm` work content and is selected within the current model context.
- The validation action must be persisted under `node.validation` as a bound model action.
- Chat is therefore a model/action capability, not a `chatflow` node type.
- LLM configuration is work instruction over the current model context. It is not a separate LLM node type.
- Semantically, LLM is the node-internal work orchestrator. It consumes business requirements from node inputs and the ClassModel knowledge system, then freely composes allowed function-call actions within the current model context.
- LLM cannot complete a business node by declaration. A business node can only finish through its bound `validation.action`.

`node.validation` shape:

```text
validation
  -> action
     -> className
     -> actionName
     -> inputProjection
     -> expectedResult
  -> status
  -> issues
```

- `validation.action.className` should normally match `node.model.className`, but it is stored explicitly for traceability.
- `validation.action.inputProjection` maps workflow inputs, upstream edge projections, current model attributes, or LLM results into the validation action's `paramsSchema`.
- `validation.action.expectedResult` expresses the acceptance contract for the action result.
- `validation.status/issues` are execution outcomes of the validation definition, not the definition itself.

`node.llm` shape:

```text
llm
  -> task
     -> goal
     -> requirements
     -> contextInputs
  -> knowledge
     -> rootClassName
     -> className
     -> allowedActions
     -> readableAttributes
  -> functionCalling
     -> mode: freeWithinModelContext
     -> constraints
  -> output
     -> structuredResult
     -> handoffToValidation
```

- `llm.task.requirements` are business requirements and incoming parameters for this node.
- `llm.knowledge` points to the ClassModel scope the LLM is allowed to use.
- `llm.functionCalling.mode = freeWithinModelContext` means the LLM may compose FC calls inside the model context instead of binding one normal work action in `node.model`.
- `llm.output` can produce intermediate structured results, but these results do not complete the node.
- `llm.output.handoffToValidation` feeds the bound validation action. Validation remains the only node completion gate.

### Boundary Nodes

```text
start
  -> inputs
  -> projection
  -> state
  -> validation

output
  -> upstreamValidation
  -> outputs
  -> state
  -> result
```

- `start` is the workflow entry boundary. It receives workflow-level inputs and projects them to the first business node through outgoing edges.
- `start` does not represent a business model context and should not carry Chat, LLM, or model action semantics.
- `output` is the workflow completion boundary and carries end semantics. It collects upstream node completion, checks whether upstream business nodes passed their bound validation, and exposes final workflow cargo references.
- `output` does not replace node-level validation. It only gates workflow completion based on upstream validation outcomes.
- Detailed start/output execution is runtime scope. This round keeps only their designer-level workflow boundary semantics.

### Edge Level

```text
edge
  -> id/source/target
  -> projection
     -> sourceRef
     -> targetRef
     -> transform
  -> branch
     -> condition
     -> label
     -> priority
     -> default
  -> validation
```

- The step line is the projection carrier between model contexts.
- The edge projects source cargo into the next node's model context, child context, action parameters, or workflow output by reference.
- The edge should remain cargo-agnostic. It only defines projection and routing; runtime-level generic parameter validation is out of scope for this round.
- `projection.sourceRef` and `projection.targetRef` are references, not payload type declarations. The referenced cargo type is resolved outside this round.
- Branching belongs to the edge because branching is a routing property of the projection line, not a standalone node type.
- The target node's model should be reachable from the source projection or explicitly validated against the selected target class.

## Current Code Facts

- `src/views/app/WorkflowDesigns.vue` is the visual workflow design page. It currently renders a graph and exposes node data mostly through raw JSON editing.
- `src/services/workflow-designs.ts` owns frontend design helpers, `design.json` to `definition.json` conversion, node collection, and legacy-field rejection.
- `packages/spark-ai/src/agent/workflow/agent-workflow-definition.ts` defines the publish-time `AgentWorkflowDefinition` contract.
- `packages/spark-ai/src/agent/workflow/agent-workflow-validation.ts` validates definition structure and rejects legacy fields.
- `spark-ai-server/src/main/java/com/spark/ai/service/WorkflowDesignService.java` owns backend scaffold, file persistence, and Java-side validation.
- Current persisted and test contracts use `inputs` / `outputs`; current code rejects `toolParameters`, `inputMapping`, and `outputMapping` as legacy node fields.
- Pre-implementation observation: the UI exposed multiple node kinds such as `chatflow`, `workflow`, `condition`, `code`, `llm`, and `agent`, plus dedicated branches such as `isChatflowNode`. That conflicted with the confirmed single-node-type direction.
- Pre-implementation observation: `packages/spark-ai/docs/business-factory-workflow-zh-cn.md` described Chatflow as a workflow node and contained `toolParameters`, `inputMapping`, and `outputMapping`. The implementation plan rewrites that document to the `start/node/output` contract.

## Cleanup Targets

Delete or rewrite these concepts because they do not match the model-context design:

| Old concept | Status | Replacement |
| --- | --- | --- |
| `chatflow` node type | Delete as structural node type | Chat as model/action capability |
| `workflow` sub-workflow node type | Delete as structural node type | Workflow invocation as model/action capability or edge projection target |
| `llm` node type | Delete as structural node type | `node.llm` internal orchestrator over requirements and ClassModel knowledge |
| `condition` branch node type | Delete as structural node type | `edge.branch.condition` |
| `tool` / `ClassModel Tool Node` | Rename/reframe | `type: "node"` with `node.model` context + `node.llm` work content; validation action bound in `node.validation` |
| `provider/toolName/toolParameters` | Delete from designer contract | `node.model` + `edge.projection` + action `paramsSchema` |
| `inputMapping/outputMapping` | Keep rejected as legacy | `edge.projection.sourceRef/targetRef` |
| Hand-written node `outputs` as schema | Reframe | selected readable attributes and action result |
| `workflowRef` for Chatflow | Delete from Chat concept | Chat selected through ClassModel capability |

## Open Decisions

- Exact designer/product field schema under node `model`, `llm`, `state`, and `result`.
- Whether validation should support multiple bound actions later; current direction is a single bound `validation.action`.
- Exact edge field schema for branch condition, routing label, priority, fallback/default behavior, and edge validation.
- Whether to preserve existing `chatflow` documents by mapping them to `Chat` capability or to mark them unreadable.
- How much of the first iteration should change schema/contracts versus only UI naming and editing panels.
- Where observable run state and result data shape should be stored in design documents without depending on runtime internals.
