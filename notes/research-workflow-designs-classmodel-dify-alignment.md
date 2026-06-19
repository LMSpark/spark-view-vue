# Workflow Designs ClassModel/Dify Alignment Research

## Scope

- `src/services/workflow-designs.ts` owns design JSON parsing, node creation, and publishing `design.json` to `definition.json`.
- `src/views/app/WorkflowDesigns.vue` owns the visual editor and edits node `data` as JSON for tool/chatflow/workflow nodes.
- `spark-ai-server/src/main/java/com/spark/ai/service/WorkflowDesignService.java` owns file persistence and structural validation.
- `spark-ai-server/data/workflow-designs/lmspark/homepage/*` contains the two built-in workflow designs currently shown on `/workflow-designs`.

## Findings

- Generated ClassModel data already contains the relevant source of truth: `generated/dts-class-model/manifest.json` points to per-file shards, and hydrated shards expose method/member metadata plus `$defs` schema references.
- Workflow design publishing currently normalizes node data too aggressively: tool nodes keep only title/provider/toolName/toolParameters/outputMapping and drop `data.type`, `desc`, `model`, `outputs`, and `x_spark`.
- Java validation requires `node.data.type` to equal `node.type`, so definitions produced by the current publisher can be less valid than hand-written definitions.
- Existing data for `表单设计` and `项目策划` uses working new node types but still relies on manually invented `toolParameters` and stage strings rather than ClassModel shard/action/schema references.
- The repository authority file keeps SPARK top-level as `workflow definition`, not Dify `app`; Dify alignment should be expressed through workflow graph, node data, variable schema, and Tool Node semantics, while old `factory/process/process-stage` remain forbidden.

## Implementation Direction

- Preserve Dify-like node data and SPARK `x_spark.classModel` metadata when publishing.
- Add a structured `classModel` metadata shape under `node.data.x_spark` that points to generated shard paths, root class names, action names, and schema `$ref`s.
- Add workflow variables and start-node `data.variables` schemas using generated shard references rather than untyped manual variable declarations.
- Keep JSON readable and runnable in the current design page; this task does not implement runtime execution of multi-step workflow graphs.
