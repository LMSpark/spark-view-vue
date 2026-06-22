# Workflow Auto Layout Research

## User Goal

Add automatic layout to the Workflow Designs frontend graph. Layout must respect workflow order: upstream/start nodes first, middle business nodes next, downstream/output nodes last.

## Confirmed Code Facts

- `src/views/app/WorkflowDesigns.vue` renders the workflow graph with `@vue-flow/core`.
- `flowNodesForGraph()` maps each `WorkflowDesignGraphNode` to a Vue Flow node and reads coordinates from `node.position`.
- Existing coordinate write paths:
  - `handleFlowNodeDragStop()` writes dragged node coordinates back to `node.position`, rounded to a 10px grid and clamped to non-negative values.
  - `applyNodePosition()` writes the selected node X/Y from the property panel.
  - `handleFlowViewportChangeEnd()` persists `graph.viewport` separately.
- `src/services/workflow-designs.ts` owns workflow design data helpers.
- `createWorkflowDesignNode()` assigns default positions through `normalizePosition()`, currently `x = 120 + index * 220`, `y = 120`.
- `createAgentWorkflowDefinitionFromDesign()` preserves valid node positions when publishing definition JSON.
- Existing tests:
  - `tests/views/workflow-designs.test.ts` covers drag-to-save coordinates, node creation, edge edits, and publishing.
  - `tests/services/workflow-designs.test.ts` covers helper behavior including node creation and definition projection.

## Current Constraints

- Existing drag and manual X/Y editing behavior must keep working.
- Automatic layout should derive ordering from `graph.lines` using `from.nodeId -> to.nodeId`.
- Nodes in the same derived layer should keep a stable deterministic order, preferably based on current graph node order unless a more specific rule is chosen.
- The implementation should mark the design dirty after changing positions.
- There is no existing `dagre`, `elkjs`, or graph layout dependency in the workspace dependencies.

## Likely Impact

- `src/views/app/WorkflowDesigns.vue`: add UI trigger and call layout behavior for the selected graph scope.
- `src/services/workflow-designs.ts`: likely home for a small deterministic graph layout helper if shared/testable outside the component.
- `tests/views/workflow-designs.test.ts`: add user-flow coverage for clicking auto layout and saving changed positions.
- `tests/services/workflow-designs.test.ts`: add algorithm/helper coverage if the layout helper is implemented in the service layer.
