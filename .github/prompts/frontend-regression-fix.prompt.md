---
description: "Fix a SPARK frontend regression in renderer, field, container, data binding, or component registration code. Use when diagnosing broken UI behavior, DataKey wiring, missing table columns, or capability-chain regressions."
name: "Frontend Regression Fix"
argument-hint: "描述回归现象、相关文件、失败测试或页面路径"
agent: "agent"
---

Use [frontend-spark.instructions.md](../instructions/frontend-spark.instructions.md) and [tests-and-validation.instructions.md](../instructions/tests-and-validation.instructions.md).

Fix the SPARK frontend regression described below.

Inputs may include:

- a broken page or route
- a component type or symbol
- a failing test or error message
- a suspected file or code path

Workflow:

1. Start from the most concrete local anchor available: failing file, symbol, behavior, or test.
2. Check the nearest controlling frontend path before widening scope. Typical hotspots are:
   - `SparkComponentRenderer.vue`
   - container children forwarding
   - `bindRules.ts`
   - `useSparkComponent.ts`
   - `data-key.ts`
   - component registration paths
3. Explicitly check whether the regression is caused by one of these SPARK-specific mistakes:
   - broken `el-table` -> `el-table-column` direct structure
   - async registration in a table-direct component path
   - lost `DATA_SOURCE` / `PAGE_DATASET` capability wiring
   - invalid `@`-based `dataKey`
   - reintroduced raw page-data or side-channel data flow
4. Make the smallest plausible fix at the owning abstraction.
5. Run the cheapest focused validation first: nearby test, targeted typecheck signal, or other narrow executable check.
6. Report the root cause, the fix, and what you validated.

Output expectations:

- root cause
- changed files
- validation run
- remaining risk or missing coverage

Request:

{{input}}