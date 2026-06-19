# Agent Workflow Dify Module Capabilities Plan

## Task Goal

Switch Agent Workflow definitions to a breaking Dify-like module tool contract with `output`, `inputs`, `outputs`, and layered `capabilities`.

## Scope

- `packages/spark-ai/src/agent/workflow/agent-workflow-definition.ts`: update workflow public types and node contracts.
- `packages/spark-ai/src/agent/workflow/agent-workflow-validation.ts`: validate new graph and tool contracts.
- `packages/spark-ai/src/agent/workflow/index.ts`: update explicit exports.
- `packages/spark-ai/src/agent/index.ts`: update explicit exports.
- `src/services/ai/spark-ai-agent-bindings.ts`: update re-exported workflow types.
- `src/services/workflow-designs.ts`: update designer defaults, publish conversion, and normalization.
- `src/views/app/WorkflowDesigns.vue`: align UI labels/defaults with new node and field names.
- `spark-ai-server/src/main/java/com/spark/ai/service/WorkflowDesignService.java`: update scaffold and validation.
- `src/services/page-design/page-design-business.ts`: publish module-level `pageDesign` workflow definition.
- `src/services/project-planning/project-planning-business.ts`: publish module-level `projectPlanning` workflow definition.
- `spark-ai-server/data/workflow-designs/**/*.json`: rewrite repository workflow design/definition JSON to the new contract.
- Related TS/Java tests: align expectations with the new breaking contract.

## Technical Steps

1. Update `spark-ai` workflow types and validation as the first minimal closure.
2. Update frontend workflow design conversion and view-level expectations.
3. Update Java scaffold/validation.
4. Update built-in pageDesign/projectPlanning definitions.
5. Rewrite repository workflow JSON data.
6. Update tests.
7. Run typecheck and focused test suites, then expand validation if failures indicate wider impact.

## Compatibility

- This is a breaking change.
- No old `end`, `toolParameters`, `outputMapping`, or `x_spark.classModel` compatibility path should remain in published definition validation.
- Repository data files are rewritten instead of migrated at runtime.

## Verification

- Baseline already run before implementation: `pnpm run typecheck`.
- After each minimal closure, run the smallest relevant tests.
- Final verification should include `pnpm run typecheck` and focused TS/Java tests touched by this change.

## Risks

- Existing working-tree changes may conflict with the new direction, especially the previous `x_spark.classModel` validation path.
- Public type changes can affect consumers outside the direct files listed above; `rg` and typecheck must be used to find missed references.
- Data JSON rewrites are mechanical but large; inspect diffs to avoid changing unrelated files.
