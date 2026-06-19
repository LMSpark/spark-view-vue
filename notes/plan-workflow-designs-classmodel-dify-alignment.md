# Workflow Designs ClassModel/Dify Alignment Plan

## Task Goal

Make the built-in workflow designs use generated ClassModel JSON references for workflow and node properties, while keeping the WorkflowDesigns page runnable.

## Impact Scope

- `src/services/workflow-designs.ts`: preserve typed node data and `x_spark` metadata when publishing definitions.
- `spark-ai-server/src/main/java/com/spark/ai/service/WorkflowDesignService.java`: validate Dify-like start variables and ClassModel schema references without rejecting valid metadata.
- `tests/views/workflow-designs.test.ts`: cover publish preservation of `data.type` and `x_spark.classModel`.
- `spark-ai-server/src/test/java/com/spark/ai/service/WorkflowDesignServiceTest.java`: cover ClassModel metadata validation.
- `spark-ai-server/data/workflow-designs/lmspark/homepage/...`: rewrite `表单设计` and `项目策划` data to include generated shard/action/schema refs.

## Technical Plan

1. Fix publisher normalization so definition nodes retain `type`, `desc`, `inputMapping`, `outputMapping`, `outputs`, `model`, and `x_spark`.
2. Keep legacy blockers for `factory/process/process-stage/single_model_edit`, but allow new ClassModel metadata under `x_spark.classModel`.
3. Add Java validation for `data.x_spark.classModel`: `rootClassName`, `sourcePath`, and `manifestPath` are required; action refs require `actionName`; schema refs require `$ref`.
4. Rewrite the two workflow JSON pairs with workflow-level variables and node-level ClassModel refs into `generated/dts-class-model`.
5. Run typecheck, targeted Vitest, Java service test with JDK 17, and browser verification.

## Compatibility

- Old `factory/process/process-stage/single_model_edit` remains unreadable.
- Existing simple tool nodes without `x_spark.classModel` remain allowed.
- No new dependencies and no lockfile changes.

## Validation

- `pnpm run typecheck`
- `pnpm exec vitest run tests/views/workflow-designs.test.ts`
- `mvn -Dtest=WorkflowDesignServiceTest test` using JDK 17
- Browser reload of `/t/lmspark/homepage/workflow-designs`, open both workflows, check console health.
