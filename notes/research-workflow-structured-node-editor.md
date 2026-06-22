# Workflow Structured Node Editor Research

## User Goal

Replace the business node `data JSON` editor in Workflow Designs with a fully structured node properties panel, modeled after Coze/Dify-style node settings. The user explicitly requested no JSON editing UI for node properties.

## Files And Responsibilities

- `src/views/app/WorkflowDesigns.vue`
  - Owns the Workflow Designs visual editor.
  - Renders the right-side Properties panel.
  - Currently has structured sections for node info, basic fields, position, loop config, line editing, and ClassModel binding.
  - Business nodes still expose a raw `节点配置 JSON` textarea bound to `modelJsonText`.
  - Save flow calls `applySelectedDraft()`, which currently calls `applyEditorToSelected()` for business nodes before model binding.
- `src/services/workflow-designs.ts`
  - Defines `WorkflowDesignNodeData`, graph/node/line types, definition publish normalization, and publish readiness checks.
  - Business node publish data uses `data.models`, `inputs`, `outputs`, `llm`, `validation`, `state`, `result`, and `capabilities`.
  - Publish rejects legacy `data.model` and requires `models[0].rootClassName`, `models[0].className`, and `models[0].completion.memberName`.
- `tests/views/workflow-designs.test.ts`
  - Current view test edits `textarea.model-json-input` and clicks `应用节点配置`.
  - This test must be rewritten to edit structured controls instead.

## Current Data Flow

1. Selecting a node triggers `syncEditorFromSelected()`.
2. For business nodes, `modelJsonText` is populated with `formatJson(view.node.data ?? {})`.
3. The raw textarea edits arbitrary `data`.
4. `applyEditorToSelected()` parses JSON and merges it into `view.node.data`.
5. `applyBusinessModelEditorToSelected()` then updates only the primary `models[0]` root/class/completion fields.
6. `saveCurrentDesign()` calls `applySelectedDraft({ silent: true })`, then `saveWorkflowDesign()`.

## Constraints

- The requested UI must not use JSON for node properties.
- Existing graph, line, definition, save, publish, and auto-layout behavior should remain unchanged.
- `models[]` is the current non-legacy model binding shape; `model` is legacy and publish-invalid.
- The frontend uses Element Plus and Vue 3 Composition API.
- Tests must stop depending on `textarea.model-json-input`.

## Impact

- The raw JSON section and JSON parse error state can be removed or bypassed for business nodes.
- A structured editor must produce the same persisted `data` shape currently accepted by `createAgentWorkflowDefinitionFromDesign()`.
- Scope should stay inside `WorkflowDesigns.vue` and its view test unless a reusable helper becomes clearly necessary.
