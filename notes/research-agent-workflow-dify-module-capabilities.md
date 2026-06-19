# Agent Workflow Dify Module Capabilities Research

## Confirmed Direction

- Workflow definition should follow a Dify-like structure: nodes, tool identity, inputs, outputs, edges, and explicit workflow/node capabilities.
- Tool nodes should name module-level business capabilities. `toolName` maps to a module such as `pageDesign` or `projectPlanning`, not to protocol tools such as `model_script`.
- LLM tool-loop details, ClassModel knowledge lookup, prompt guidance, script generation, and concrete function routing stay in runtime binding.
- The change is intentionally breaking. Old `end`, `toolParameters`, `outputMapping`, and `x_spark.classModel` definition contracts should not remain as compatibility paths.
- New published graphs use `output` as the terminal node type. It carries final outputs and is used for reachability validation.
- Capabilities are layered:
  - `workflow.capabilities` describes workflow-level ability boundaries, phases, quality gates, and constraints.
  - `node.data.capabilities` describes node-local composable abilities.
- Capability shape starts as an array of objects: `{ id, title, scope, description, inputs?, outputs?, constraints? }`.
- Node top-level `inputs` and `outputs` are the runtime contract. Capability-local `inputs` and `outputs` are explanatory/local to that ability.

## Current Code Shape

- `packages/spark-ai/src/agent/workflow/agent-workflow-definition.ts` defines graph node types and still models tool nodes as `provider/toolName/toolParameters/outputMapping` with an `end` terminal node.
- `packages/spark-ai/src/agent/workflow/agent-workflow-validation.ts` validates at least one `start`, at least one `end`, `start -> end` reachability, and descriptor-driven required tool parameters.
- `src/services/workflow-designs.ts` converts designer JSON into definitions and still normalizes tool nodes around `toolParameters` and `outputMapping`.
- `src/views/app/WorkflowDesigns.vue` is mostly a generic designer shell and JSON editor; it depends on service helpers for node defaults and publish conversion.
- `spark-ai-server/src/main/java/com/spark/ai/service/WorkflowDesignService.java` scaffolds and validates persisted workflow design/definition JSON. Current working-tree changes also include stricter `x_spark.classModel` checks, which conflict with the confirmed direction.
- `src/services/page-design/page-design-business.ts` and `src/services/project-planning/project-planning-business.ts` create built-in workflow definitions that currently expose `model_script` as the tool name. Those definitions should expose module names instead.

## Impact Surface

- Public TypeScript workflow types and validation.
- Frontend workflow designer data conversion and node defaults.
- Java workflow design service scaffold and validation.
- Built-in pageDesign/projectPlanning workflow definitions.
- Repository workflow data files under `spark-ai-server/data/workflow-designs`.
- Unit/integration tests for workflow definitions, workflow design services, views, and Java service validation.

## Baseline

- `pnpm run typecheck` passed before implementation on 2026-06-20.
- Worktree already had unrelated or previous-session changes before implementation; implementation must work with the current files and not revert unrelated changes.
