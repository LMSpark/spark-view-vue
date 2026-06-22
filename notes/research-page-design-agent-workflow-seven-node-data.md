# Research: Page Design Agent Workflow Seven Node Runtime

## Confirmed User Goal

The user confirmed the target is a real executable seven-node workflow, not design-only documentation.

The active `agent.workflow.pageDesign` definition must replace the current single middle business node with seven connected business nodes. Runtime support must be updated together with `definition.json`. The runtime must remain generic: it should interpret `definition.json` and must not contain pageDesign-specific business branching.

The user further clarified that the key priority is to sink the deleted 100-step page design knowledge into workflow design data. The two current workflows are only examples; the intended architecture must scale to thousands of workflow definitions. In the final direction, user intent will be matched by an LLM to a registered workflow, then the selected workflow executes through the registration system. The registration unit is the workflow definition itself: `definition.json` represents one workflow, and the workflow designer's left list is the workflow registration/list data.

Correction after user feedback:

- Do not treat a business node's runtime binding as the registration unit.
- Do not move the discussion into runtime-binding placement unless it is strictly necessary for the definition to pass existing activation.
- The core design object is `definition.json` as a workflow. The seven nodes are workflow-internal contract nodes.
- Runtime changes are only to remove the current single-business-node bottleneck and interpret the workflow definition generically; they are not the conceptual center of this task.

The user also clarified the intended node granularity. Each workflow node should only declare the contract-level execution data:

- which model or models the node works on,
- its input parameters,
- its output parameters,
- how completion is validated.

The node should not embed the detailed implementation of the 100 steps. The detailed execution remains the LLM's responsibility: it uses the existing knowledge system and function-calling/orchestration capability to perform the concrete work. This task should not implement that inner LLM execution engine.

The user chose to replace the single-node `model` contract with a multi-model `models` contract. `llm.knowledge.models` must not be used for this because `llm.knowledge` belongs to runtime/execution knowledge, not workflow design contract data.

## Source Of The 100-Step Workflow

The latest deleted 100-step document found in Git is:

- `docs/ai/dataset-page-design-ai-flow-100-steps-zh.md`
- Deleted by commit `1d9fd0f3876a8cc694bacf0953c97baf7f7ea2f8`

The 100 steps map to these major phases:

- 1-10: entry and task intake
- 11-20: current file and model inventory
- 21-30: data planning
- 31-40: minimal DataTable model
- 41-50: tableRelations
- 51-60: page planning
- 61-70: data usage
- 71-80: DataViews
- 81-88: viewDependencies
- 89-92: structure
- 93-95: behavior/script
- 96: style
- 97-98: cross-check
- 99: preview fix
- 100: closeout

The old Git workflow stage data supplies the seven-node skeleton:

1. `PD1.scope-inventory` - source steps `1-20`
2. `PD2.data-model` - source steps `21-40`
3. `PD3.table-relations` - source steps `41-50`
4. `PD4.page-data-use` - source steps `51-70`
5. `PD5.views-dependencies` - source steps `71-88`
6. `PD6.structure-behavior-style` - source steps `89-96`
7. `PD7.verify-deliver` - source steps `97-100`

Therefore the intended graph shape is:

`start -> PD1 -> PD2 -> PD3 -> PD4 -> PD5 -> PD6 -> PD7 -> output`

This is nine graph nodes total: start, seven business nodes, output.

## Current Workflow Shape

Current active files:

- `spark-ai-server/data/workflow-designs/lmspark/homepage/agent.workflow.pageDesign/design.json`
- `spark-ai-server/data/workflow-designs/lmspark/homepage/agent.workflow.pageDesign/definition.json`

Both currently express a three-node graph:

1. `start`
2. `node.pageDesign`
3. `output`

The single business node contains `runtimeBinding.registration` with:

- `alias = pageDesign`
- `moduleId = ProjectModel/ProjectModel`
- `businessId = pageDesign`

The current edges are:

- `start.outputs -> node.pageDesign.inputs`
- `node.pageDesign.outputs -> output.inputs`

## Runtime Constraints

Relevant files:

- `packages/spark-ai/src/agent/workflow/agent-workflow-definition.ts`
- `packages/spark-ai/src/agent/workflow/agent-workflow-runtime.ts`
- `packages/spark-ai/src/agent/workflow/agent-workflow-validation.ts`
- `packages/spark-ai/src/agent/business/ai-host.ts`
- `packages/spark-ai/src/agent/business/business-task.ts`
- `packages/spark-ai/src/agent/business/business-session.ts`

Current facts:

- Workflow node types are `start`, `node`, and `output`.
- Validation accepts the node schema but currently requires `runtimeBinding` on each `type: "node"` business node.
- `agent-workflow-runtime.ts` currently calls `findSingleBusinessNode()` and fails unless there is exactly one business node.
- Runtime activation creates one `AiAgentRegistration` using `ClassModelAgentAdapter.createRegistration()`.
- `AiBusinessHost` registers one `AiAgentRegistration` per alias and runs one task/session per call.
- The current host API does not schedule seven independent LLM sessions or persist per-node output state.

Confirmed implication:

- The practical executable path is to make the runtime interpret the multi-node definition generically and compile the ordered business-node chain into one executable agent orchestration.
- The runtime should not hard-code pageDesign stages. It should derive the stage sequence, stage instructions, input/output labels, validation text, and edge flow from `definition.json`.
- A larger seven-session workflow scheduler would be a different architecture and is not present in the current runtime.

## DataSet, Table Relation, And View Facts

Relevant files:

- `packages/spark-data/src/types.ts`
- `packages/spark-data/src/dataset.ts`
- `packages/spark-data/src/core/utils.ts`
- `packages/spark-data/src/strategies/cascade-delegate.ts`
- `packages/spark-data/src/dataset-crud-tool.ts`
- `src/services/project-model-artifacts/page-data-designer.ts`

Current facts:

- `DataSetMetadata` contains `tables`, `tableRelations`, and `viewDependencies`.
- `TableRelation` is a pure data relationship between parent and child tables. It does not describe UI linkage.
- `ViewDependency` describes how a child table default view responds to parent table default view state.
- Internal `DataRelation` combines table relation and view dependency for runtime cascade handling.
- `deriveViewDependencies()` currently auto-derives default dependencies from table relations unless `viewDependencies` is explicitly an empty array.
- `expandRelations()` currently creates default-view relations with `parentViewId = "default"` and `childViewId = "default"`.
- `createView()` refuses to create the `default` view; updating `default` uses `updateView()`.

Important correction from the deleted 100-step file:

- "Do not rush DataTable" means do not jump straight to `r-table` UI. It does not mean skipping the spark-data `DataTable` model.
- UI consumption should be based on `DataView`, not raw `DataTable`.
- `dataViewKey` locates the view; field access uses `field`, `dataMember`, and `dataField`.
- `$[fieldName]` reads from the current `DATA_ROW` context.

## Data Binding Facts

Relevant files:

- `packages/spark-data/src/core/data-view-key.ts`
- `packages/spark-component/src/components/containers/data-views/view-data-source.ts`
- `packages/spark-component/src/core/useSparkComponent.ts`

Current facts:

- `DataViewKey` identifies a table/view pair such as `tableName@viewId`.
- `dataMember` chooses the member to consume from a view result.
- `dataField` reads a field inside an object result.
- `view-data-source` resolves data source priority from explicit external source, `dataViewKey`, context capability, then inherited source.
- `$[fieldName]` placeholder resolution happens against `DATA_ROW` and preserves original type for a pure placeholder.

## Generated ClassModel Projection Facts

The user explicitly required checking the compiled ClassModel projection JSON instead of relying on assumptions. Relevant generated files read:

- `generated/dts-class-model/manifest.json`
- `generated/dts-class-model/.dts-manifest.json`
- `generated/dts-class-model/files/packages/spark-project-model/src/project/project-model.ts.json`
- `generated/dts-class-model/files/packages/spark-project-model/src/page/config-page.ts.json`
- `generated/dts-class-model/files/packages/spark-project-model/src/page/content/dataset-file.ts.json`
- `generated/dts-class-model/files/packages/spark-project-model/src/page/content/rule-file.ts.json`
- `generated/dts-class-model/files/packages/spark-project-model/src/page/content/text-file.ts.json`
- `generated/dts-class-model/files/packages/spark-data/src/dataset.ts.json`
- `generated/dts-class-model/files/packages/spark-data/src/data-view.ts.json`
- `generated/dts-class-model/files/packages/spark-data/src/dataset-crud-tool.ts.json`
- `generated/dts-class-model/files/packages/spark-data/src/types.ts.json`
- `generated/dts-class-model/files/packages/spark-ai/src/agent/workflow/agent-workflow-definition.ts.json`

Projection structure:

- `manifest.json` has top-level `classIndex`, `files`, `componentIndex`, and `duplicates`.
- Runtime lookup uses `classIndex[className]` to find the shard file.
- Each shard has `models` and `$defs`; the source projection is not a `classes/types` flat list.
- The compiled workflow definition projection currently declares `AgentWorkflowBusinessNodeData.model`, not `models`. Therefore changing to multi-model node contracts requires changing the TypeScript definition, validation, publish normalization, generated workflow data, and tests; changing JSON alone would break the contract.

Runtime lookup chain:

- `DtsClassModelBundleLoader.ensureClassName(className)` throws if the class name is not in `manifest.classIndex`.
- `DtsBundleClassModelKnowledgeService.loadForInput(kind)` first ensures the root reachable closure, then ensures the requested `kind` if provided.
- The runtime root for pageDesign remains `ProjectModel` through `modelProjectionRef.rootClassName`.
- The ClassModel tool set is protocol-level: `model_query`, `model_class_guide`, `model_attribute_guide`, `model_action_guide`, `model_script`, `human_question`, `agent_complete`.
- `llm.knowledge` is runtime/execution knowledge. It must not be used as the workflow design node model contract.

Verified classIndex entries:

- `ProjectModel` exists.
- `ConfigPageNode` exists.
- `PageDataSetFile` exists.
- `PageRuleFile` exists.
- `PageTextFile` exists.
- `DataSet` exists.
- `DataView` exists.
- `DataSetCrudTool` exists.
- `DataSetMetadata`, `TableMetadata`, `ViewMetadata`, `TableRelation`, and `ViewDependency` exist.
- `PageScriptFile` and `PageStyleFile` do not exist. Script and style share `PageTextFile`, with `fileName` limited to `script.js` or `style.css`.

Verified ProjectModel action chain from projection:

- `ProjectModel.openPageDesign(pageId: string): ConfigPageNode`
- `ProjectModel.getDataSetTool(): DataSetCrudTool | null`
- `ProjectModel.editDataSet(run: (tool: DataSetCrudTool) => void | Promise<void>): Promise<void>`
- `ProjectModel.getNodeTree(): SparkNodeTreeModel | null`
- `ProjectModel.editNodeTree(run: (tree: SparkNodeTreeModel) => void | Promise<void>): Promise<void>`

Verified ConfigPageNode contract from projection:

- Properties:
  - `rule -> PageRuleFile`
  - `dataSet -> PageDataSetFile`
  - `style -> PageTextFile`
  - `script -> PageTextFile`
  - `pageId -> string`
- Actions:
  - `getFileText(name: PageNodeFileName): string`
  - `setFileText(name: PageNodeFileName, text: string): void`
  - `getNodeTree(): SparkNodeTreeModel`
  - `editNodeTree(run: (tree: SparkNodeTreeModel) => void | Promise<void>): Promise<void>`
  - `getDataSetTool(): DataSetCrudTool`
  - `editDataSet(run: (tool: DataSetCrudTool) => void | Promise<void>): Promise<void>`
  - `toRenderConfig(): PageNodeRenderConfig`

Verified DataSet/DataView/DataSetCrudTool chain from projection:

- `DataSet` properties include `tables`, `tableRelations`, `viewDependencies`, and `_resolvedRelations`.
- `DataView` exists as a first-class class with rows/current/selection/filter/sort/page/aggregate state and row mutation methods.
- `DataSetCrudTool` has direct actions for:
  - tables: `createTable`, `updateTable`, `renameTable`, `deleteTable`
  - columns: `createColumn`, `updateColumn`, `renameColumn`, `deleteColumn`
  - views: `createView`, `updateView`, `deleteView`
  - relations: `createRelation`, `updateRelation`
  - dependencies: `createDependency`, `updateDependency`
- `DataSetCrudTool.createView` returns `DataView`.
- `DataSetCrudTool.createRelation` returns `TableRelation`.
- `DataSetCrudTool.createDependency` returns `ViewDependency`.

Reachability check:

- From root `ProjectModel`, the computed loader-style reachable closure includes `ProjectModel`, `ConfigPageNode`, `DataSetCrudTool`, `DataSet`, `DataView`, `DataSetMetadata`, `TableMetadata`, `ViewMetadata`, `TableRelation`, and `ViewDependency`.
- `PageRuleFile`, `PageDataSetFile`, and `PageTextFile` are present in `classIndex` but were not reached by the closure calculation because `ConfigPageNode` attributes in `models.ConfigPageNode.classDecl.members.attributes` do not carry schema. The JSON schema `$defs.ConfigPageNode.properties` does carry the refs, but the runtime closure algorithm uses model members, method types, return schemas, and parameter schemas.
- Practical consequence: workflow node `models[]` can mention these file classes as design contract facts only if validation checks `classIndex` existence, not only root-closure reachability. For runtime LLM execution, the reliable action chain is through `ConfigPageNode.getFileText/setFileText/editNodeTree/editDataSet`.

Attribute-chain correction:

- The user corrected that the workflow design model chain must be followed downward through attributes/properties.
- The user further clarified that node splitting at design time itself must follow the attribute chain downward. The seven nodes should not be arbitrary chronological prompt stages with models attached afterwards. The design decomposition should start from the model/property/action chain and then map the 100-step responsibilities into the corresponding nodes.
- The user clarified that "seven nodes" is an approximate phase granularity, not a hard shape to force against the model. The final workflow decomposition must be decided by the actual model/property/action chain. If the model chain proves a boundary should be merged or split, model truth wins over a mechanical seven-node count.
- Confirmed decision: use model-chain-driven decomposition and allow roughly 6-9 business nodes. Aim around seven nodes, but do not force the graph to exactly seven if the ClassModel property/action chain proves a different natural boundary.
- Therefore the design contract should distinguish two checks:
  - runtime knowledge/execution reachability from `ProjectModel`;
  - workflow design attribute-chain validity from compiled `$defs.*.properties`.
- Along `$defs` properties, `ConfigPageNode` is the page design context that owns the four file submodels:
  - `ConfigPageNode.rule -> PageRuleFile`
  - `ConfigPageNode.dataSet -> PageDataSetFile`
  - `ConfigPageNode.style -> PageTextFile`
  - `ConfigPageNode.script -> PageTextFile`
  - `ConfigPageNode.pageId -> string`
- `PageDataSetFile.value -> DataSet`.
- `DataSet` properties include:
  - `tables`
  - `tableRelations -> TableRelation`
  - `viewDependencies -> ViewDependency`
  - `_resolvedRelations -> DataRelation`
- `DataSetMetadata` properties include:
  - `tables`
  - `tableRelations -> TableRelation`
  - `viewDependencies -> ViewDependency`
  - `layout -> DataSetLayoutMetadata`
- `TableMetadata` properties include:
  - `columns -> DataColumn`
  - `views`
- `ViewMetadata` properties include:
  - `rows -> DataRow`
  - `filterExpression -> FilterExpression`
  - `sortExpression -> SortExpression`
  - `treeConfig -> TreeConfig`
  - `aggregates`
- `PageRuleFile.tree` is typed as title `SparkNodeTreeModel` in schema, but `SparkNodeTreeModel` is not present in `manifest.classIndex`.
- The actual serializable node shape is available as `SparkNode`, and `PageNodeRenderConfig.rule` is `SparkNode[]`.
- `PageNodeRenderConfig` is the render output contract:
  - `pageId -> string`
  - `navigation -> ProjectNodeData | null`
  - `rule -> SparkNode[]`
  - `data -> DataSet`
  - `script -> string`
  - `css -> string`
- `ProjectModel.design -> ProjectDesign`, but `ProjectDesign` has no property schema in the projection; its connection to pages is through actions such as `openPageDesign(pageId): ConfigPageNode`, `findConfigPageByPageId(pageId): ConfigPageNode | null`, and `readPlanningProjection(): ProjectPageNodeSummary[]`.
- Practical consequence: the workflow node `models[]` should support model references that include an attribute path or action-derived context path, for example `ProjectModel.openPageDesign(pageId) -> ConfigPageNode` followed by `ConfigPageNode.dataSet.value -> DataSet`.
- Confirmed decision for model references: each node model entry should be contract data like `{ rootClassName, className, sourceRef, via, role }`, carried to model level rather than runtime `llm.knowledge`.
- Confirmed design-data boundary: each node must declare a model method as its completion validation, but dependency scheduling/start eligibility belongs to runtime. This task should not implement or redesign runtime dependency gating. The bracketed runtime meaning from the user is conceptual context only.
- Confirmed completion expression: the completion method should live on the relevant `models[]` entry, not as a separate node-level runtime scheduler field. This keeps completion tied to the model that owns the node responsibility.
- Confirmed completion member rule: the completion validator should be selected from the projected model/module members. Prefer a no-argument member/method. Its return semantics should be boolean-like: `true` means the node can end; `false` or a structured false result should carry the reason why the node cannot end.
- Confirmed missing-member rule: if no suitable projected completion member exists, leave the completion binding empty in the design data. The workflow/node should then be treated as draft/unpublishable by design-time validation. The designer should warn during workflow design, and the publish action should give a detailed missing-completion report.
- Confirmed model contract migration: replace the single `model` contract with `models[]` as the standard workflow design contract for all workflows, including the current `pageDesign` and `projectPlanning` examples. Do not keep old `model` as the primary path. The design must remain generic and ClassModel-projection-oriented, not shaped around one business workflow.
- Confirmed source-of-truth rule: ClassModel projection is the truth for workflow design data. Node model chains, property/member links, and completion members must be expressible against generated ClassModel data. Business prose can explain intent, but it must not be the structural source of truth.
- Practical consequence for seven-node design:
  - Node boundaries should be justified by model-chain boundaries.
  - Data nodes should follow `ConfigPageNode.dataSet.value -> DataSet -> tables/tableRelations/viewDependencies`.
  - Structure nodes should follow `ConfigPageNode.rule -> PageRuleFile -> PageNodeRenderConfig.rule -> SparkNode[]`.
  - Script/style nodes should follow `ConfigPageNode.script/style -> PageTextFile`.
  - Delivery/verification should follow `ConfigPageNode.toRenderConfig() -> PageNodeRenderConfig`.

Completion chain:

- `agent_complete` is a protocol tool, not a DTS model action.
- `ProjectModel` projection contains `completeProjectPlanning`, but there is no `completePageDesign` projection.
- If `agentCompleteMethodName` is omitted, `ClassModelAgentAdapter` accepts `agent_complete({ summary })` protocol-level completion unless the business instance implements one of the default methods (`agentComplete`, `completeAgent`, `completeAiAgent`).
- Therefore pageDesign node validation must not pretend there is a `completePageDesign` domain method unless a separate planned change adds it.

Current workflow validation/dry-run behavior:

- `AgentWorkflowBusinessNodeData.validation.action` already has `className`, `actionName`, `inputProjection`, and `expectedResult`.
- Current definition validation only checks that those fields are non-empty/object-shaped. It does not verify that `actionName` exists in generated ClassModel projection.
- Current runtime does not execute `validation.action` as a node completion gate.
- Current dry-run resolves a workflow binding by `workflowId` and activates a host registration.
- Runtime dependency scheduling is out of scope for the current design-data task. The definition should expose enough contract data for runtime to use, without implementing that runtime behavior here.
- The chosen design-data expression is to put completion validation metadata on the relevant `models[]` item, for example a model entry can declare the model method used to verify the node's output.
- The completion metadata must point to a member from the model projection rather than inventing an arbitrary action name. Prefer no-argument methods whose return contract is `true` or a false/reason shape.
- If there is no such projected member, do not invent one in `definition.json`. Leave the binding empty and surface the issue as a draft/publish-readiness failure in the designer/publish validation path.
- Current edge projection data is only `sourceRef` and `targetRef`, usually defaulting to whole-node references like `source.outputs` -> `target.inputs`. To support model-chain-driven decomposition, the design needs an explicit decision about whether edges remain whole-object projections or become property/member-level links.
- ClassModel truth implies that property-level workflow connections should not be free-form natural language. Their structural representation must carry enough class/member reference data to be checked against the generated `dts-class-model` bundle.
- Confirmed connection entity rule: property/member links should be represented as independent workflow connection entities. They must not be hidden inside node prose or LLM prompts. This matches workflow design semantics and gives publish validation a concrete object to check against ClassModel projection data.
- Confirmed no-edge terminology/shape rule: the workflow design should be expressed as nodes and connection lines, not as abstract edges plus separate projection data. The old edge `source`/`target`/projection meaning should be folded into the two endpoints of the line entity.
- Confirmed line endpoint granularity: each line endpoint should reference `nodeId + modelId + memberName`. The `modelId` resolves to the node's `models[]` entry, and `memberName` is checked against that model's ClassModel projection. For visual layout, endpoints may also carry fixed node dock points numbered clockwise around the node.
- Confirmed line cardinality: one line represents exactly one ClassModel member connection. Multiple property/member flows between the same two nodes should be represented as multiple line entities, not grouped into one line.
- Confirmed boundary endpoint rule: `start` and `output` endpoints use the reserved model id `$workflow`; `memberName` points to workflow variables or workflow outputs instead of a business ClassModel member.

Candidate existing validation methods from compiled projection:

- `ConfigPageNode.toRenderConfig(): PageNodeRenderConfig`
- `ConfigPageNode.isDirty(): boolean`
- `ConfigPageNode.getDirtyFileNames(): PageNodeFileName[]`
- `ConfigPageNode.getNodeTree(): SparkNodeTreeModel`
- `ConfigPageNode.getDataSetTool(): DataSetCrudTool`
- `PageDataSetFile.getTool(): DataSetCrudTool`
- `PageDataSetFile.getText(): string`
- `PageRuleFile.getTree(): SparkNodeTreeModel`
- `PageRuleFile.getText(): string`
- `PageTextFile.getText(): string`
- `DataSet.toJson(): DataSetMetadata`
- `DataSetCrudTool.toJson(): DataSetMetadata`
- `DataSetCrudTool.listTables()`
- `DataSetCrudTool.listRelations()`
- `DataSetCrudTool.listDependencies()`
- `DataSetCrudTool.listViews(...)`

## Definition And Verifier Impact

Relevant files:

- `tools/verify-workflow-designs.mjs`
- `tests/services/workflow-designs.test.ts`
- `tests/views/workflow-designs.test.ts`
- `packages/spark-ai/src/tests/agent-workflow-definition.test.ts`

Current facts:

- `tools/verify-workflow-designs.mjs` currently requires required workflows to have exactly three nodes and two edges.
- It verifies the middle node's `runtimeBinding`.
- That verifier must be changed so pageDesign can have start plus seven business nodes plus output.
- ProjectPlanning can remain a three-node workflow unless the definition format is generalized enough to cover both.
- Existing service and view tests already support multiple graph nodes at the design layer, but runtime tests assume the single-business-node interpreter.

## Expected Implementation Shape

The likely implementation should:

1. Update pageDesign `design.json` and `definition.json` to the nine-node graph.
2. Use seven `type: "node"` business nodes based on the confirmed PD1-PD7 stage data.
3. Connect nodes through explicit edges using `sourceRef` and `targetRef`.
4. Keep runtime behavior generic by interpreting the definition's node chain and compiling it into an orchestration prompt/readonly steps.
5. Select or validate one activation `runtimeBinding` for the executable registration.
6. Update validation so multi-node executable definitions are accepted without allowing legacy `tool` fields.
7. Update verifier and tests to prove pageDesign is a real seven-node executable workflow and projectPlanning still works.

## Open Technical Decisions For Stage 2

These decisions must be confirmed before coding:

1. Whether every business node should carry the same `runtimeBinding`, whether exactly one node should be the activation node and the others omit it, or whether the binding should move to workflow-level registration. The user's latest clarification strongly points to workflow-level registration as the right long-term model.
2. Whether the runtime should require a strict single linear chain from start to output, or support branching DAGs now.
3. How node outputs should be represented in `definition.json`: the user clarified that each node should expose contract-level model/input/output/completion-validation data, while detailed step execution stays in the LLM knowledge/function orchestration layer.
4. The business node model contract should move from a single `model` object to a `models` array. The `llm.knowledge` object is runtime-side and must not be used as the workflow design model contract.
5. The single `model` contract should not remain as the primary contract for example workflows. All workflows should use `models[]` so the design schema aligns with generated ClassModel projection data.
6. Whether `design.json` should be edited manually in parallel with `definition.json`, or regenerated by the existing workflow design tooling after editing source data.
7. Which verification commands should be considered mandatory for this change set.
