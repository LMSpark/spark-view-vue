---
description: "Use when editing SPARK frontend Vue code, Spark renderer components, fields, containers, component registration, or root src UI integration. Covers DataView-first containers, Spark capability wiring, transparent table-column rendering, and focused frontend validation."
name: "SPARK Frontend Renderer Guidelines"
applyTo: "packages/spark-component/**, src/components/**, src/composables/**, src/features/**, src/layout/**, src/views/**, src/App.vue, src/main.ts, src/style.css"
---

# SPARK Frontend Guidelines

Use this instruction for Vue renderer work under `packages/spark-component/**` and root frontend integration under `src/**`.

## Keep The Existing Frontend Shape

- Prefer extending the nearest existing container, field, or renderer pattern instead of inventing a new wiring path.
- Keep changes config-first. If behavior can be expressed through `rule.json`, `pagedata.json`, metadata, or existing capabilities, do that before adding `script.js` or new imperative code.
- Fail fast on missing component types, invalid `dataKey`, missing capabilities, or inconsistent runtime state. Do not add silent fallback branches.

## Renderer And Dataflow Rules

- Containers are DataView-first. `r-table`, `r-form`, `r-detail`, and `r-tree` should resolve `dataKey` to `DataView` and provide `DATA_SOURCE` downward.
- Do not reintroduce raw page-data normalization, renderer-side JSON parsing, `pageData`, or `$data`-style side channels in frontend code.
- Use the current `@`-based DataKey format only: `table@field`, `table@viewId@field`, or `#scope@table@...`.
- `clearDataSet()` must only release the reference. Never call `DataSet.destroy()` from renderer lifecycle cleanup.

## Capability And Component Boundaries

- `sparkProvide` / `sparkConsume` are the business DI path. Vue `provide/inject` is infrastructure-only, mainly for the registry.
- Keep `useSparkComponent()` at the top level of `<script setup>` and use it as the default way to access visibility, disabled state, logger, and capabilities.
- Do not import Vue or Element Plus into `spark-utils`, `spark-data`, or `spark-page-config` when frontend work reaches across package boundaries.
- Never use relative imports across workspace package boundaries; always import through `@spark-view/*`.

## Table And Renderer Specific Gotchas

- Anything rendered directly under `el-table` must preserve direct `el-table` -> `el-table-column` structure. Do not add wrapper layers that break column discovery.
- Container children should flow through `props.children` and `SparkComponentRenderer`, not through extra slot wrappers that alter the DOM/component parentage.
- Column-style or table-direct components must be synchronously registered. Do not use `defineAsyncComponent` in that path.
- If registration code is generated or centralized, route async loaders through `Spark.register(...)`, not raw registry async definitions.
- Every table that needs current-row highlight must set `props.highlightCurrentRow = true` itself.

## Practical Editing Defaults

- Component `type` values stay kebab-case.
- Prefer typed props and existing capability/data-source types. Do not introduce explicit `any` in production frontend code.
- For `script.js` sandbox-facing work, prefer `$page`, `$route`, `$dataSet`, `$query`, `SparkData`, and `h`; do not add direct framework globals or ESM imports.
- When adjusting renderer recursion or field value flow, check whether the owning abstraction is `SparkComponentRenderer`, a container component, `bindRules.ts`, or `useSparkComponent.ts` before widening scope.

## Validation

- Frontend changes should usually validate with `pnpm run typecheck`.
- Run a focused Vitest case when the touched behavior already has nearby coverage.
- Use `pnpm run lint` when the edit touches shared frontend code paths or introduces new TS/Vue logic.

## Docs

- `docs/guides/COMPONENT_DEVELOPMENT.md` — component registration, `useSparkComponent`, capability usage
- `docs/guides/DATA_MANAGEMENT.md` — `DataSet`, `DataView`, relations, computed columns
- `docs/guides/CONFIG_SYSTEM.md` — config/script boundaries
- `docs/architecture/DATAFLOW_ARCHITECTURE.md` — renderer/runtime ownership boundaries
- `tests/README.md` — root frontend/integration test scope