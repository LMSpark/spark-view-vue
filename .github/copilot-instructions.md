# SPARK Workspace Instructions

Purpose: repo-wide defaults for AI coding agents. Keep this file short, actionable, and link-oriented. Prefer linking to docs instead of copying them here.

## Quick Start

- Runtime: Node >= 20, pnpm >= 10. JDK 17+ is required only for Java backend work, `pnpm run dev`, or full builds.
- Day-to-day commands:
  - `pnpm run dev` — full stack: Java backend + Vite frontend
  - `pnpm run dev:fe` — frontend only
  - `pnpm run build` — full pipeline
  - `pnpm run build:check` — catalog + typecheck + frontend build
  - `pnpm run typecheck`
  - `pnpm run lint`
  - `pnpm run test` or `pnpm run test -- -t "name"`
  - `cd spark-ai-server && mvn test` — backend tests
- Husky pre-commit runs `lint` + `typecheck`.
- Commit scopes are restricted to: `deps`, `docs`, `scripts`, `spark-data`, `spark-app`, `spark-ai`, `spark-component`, `spark-utils`, `spark-page-config`.

## Repos Map

- `packages/spark-utils` — pure TypeScript primitives: capability keys, logger, HTTP, sandbox helpers.
- `packages/spark-data` — pure TypeScript data space: `DataSet`, `DataTable`, `DataView`, `TreeManager`, `data-key`.
- `packages/spark-page-config` — pure TypeScript page-config parsing, script context types, config loading.
- `packages/spark-component` — Vue renderer, component registry, capability wiring, rule binding.
- `packages/spark-app` — app shell, router, auth, plugins, bootstrap.
- `spark-ai-server` — Spring Boot backend for AI chat, page-config persistence, scoped APIs, SSE debug flows.
- Live page configs are stored under `spark-ai-server/data/pages-config/`. Do not treat `public/pages-config/` as the source of truth for new work.

High-value entry points:

- `packages/spark-component/src/core/useSparkComponent.ts`
- `packages/spark-component/src/page/usePageDataSet.ts`
- `packages/spark-component/src/page/binding/bindRules.ts`
- `packages/spark-component/src/components/SparkComponentRenderer.vue`
- `packages/spark-data/src/core/data-key.ts`
- `packages/spark-utils/src/capability.ts`

## Non-Negotiable Rules

- **UI 组装强制 SOP**（AI Tool 调用规范）：
  1. 需要构造组件时，先调用 `catalog.query({})` 或 `catalog.query({ category: 'container' })` 查全量/分类列表。
  2. 选定组件类型（如 r-table）后，必定调用 `catalog.guide({ type: 'r-table' })` 拉取该型 props schema (配置规格)。
  3. 基于拉取到的合法规格在本地拼接 SparkNode (`{ type, props, children }`)。
  4. 最后调用 `sparkNodeTree.addNode` 或 `sparkNodeTree.addNodes` 实施写入。**绝对禁止不看 specs 凭空构造 props！**
- Config-first: prefer `rule.json`, `pagedata.json`, view metadata, and existing renderer capabilities. Use `script.js` only when config cannot express the behavior.
- Single DataSet pipeline: `pagedata.json` -> `parsePageData()` -> `DataSet` -> `usePageDataSet()` -> `PAGE_DATASET` -> `DataKey` -> `DataView` -> UI. Do not reintroduce renderer-side raw JSON normalization, `pageData`, or `$data` side channels.
- `clearDataSet()` only releases the reference. Never call `DataSet.destroy()` there. `DataSet` instances are cached and reused across navigations.
- Package boundaries are strict and acyclic: `spark-utils` <- `spark-data` <- `spark-page-config` <- `spark-component` <- `spark-app`.
- Never use relative imports across package boundaries. Use `@spark-view/*` package names.
- `spark-utils`, `spark-data`, and `spark-page-config` must stay framework-free. Do not import `vue`, `vue-router`, `element-plus`, or other UI frameworks there.
- SPARK capability DI is not Vue DI. Use `sparkProvide` / `sparkConsume` for business capabilities. Vue `provide/inject` is only for infrastructure, mainly the registry.
- Renderer containers are DataView-first. `r-table`, `r-form`, `r-detail`, and `r-tree` resolve data through `DataKey` and provide `DATA_SOURCE` to descendants.
- Avoid slot wrappers that break direct `el-table` -> `el-table-column` relationships. Container children should flow through `SparkComponentRenderer`.
- Prefer fail-fast behavior. Do not add silent fallbacks that mask missing APIs, invalid config, or inconsistent runtime state.
- API-first when touching page config, navigation, generic CRUD, AI generation, or SSE debugging. Prefer existing tenant/project-scoped endpoints and frontend integration before changing Spring controllers or services.

## High-Value Conventions

- Component `type` values use kebab-case and register through `Spark.register()`.
- Components rendered directly under `el-table` must be registered synchronously. Do not use `defineAsyncComponent` for table-column style components.
- DataKey format is `@`-based: `table@field` or `table@viewId@field`. Cross-page bindings use `#scope@table@...`. Do not restore legacy dot-notation keys.
- `script.js` sandbox code should prefer `$page`, `$route`, `$dataSet`, `$query`, `SparkData`, and `h`.
- In `script.js`, do not use `$data`, ESM `import`, `window.xxx` globals, direct `ElMessage` / `ElMessageBox`, or direct Vue Router imports.
- `computeExpression` rules:
  - single expressions are auto-returned
  - multi-statement bodies must `return` on every path
- Every `el-table` needing current-row highlight must declare `props.highlightCurrentRow = true` itself.
- Production code under `packages/**` follows strict TypeScript rules. Do not introduce explicit `any`.
- `spark-ai-server/data/pages-config/**/script.js` is sandbox code, not normal module code. Do not convert it to standard app-module patterns.

## Docs First

Use the existing docs as the canonical source before expanding this file.

- [docs/README.md](../docs/README.md) — documentation index and reading order
- [docs/guides/QUICKSTART.md](../docs/guides/QUICKSTART.md) — local setup and startup flow
- [docs/guides/DATA_MANAGEMENT.md](../docs/guides/DATA_MANAGEMENT.md) — `DataSet`, `DataView`, relations, computed columns, aggregates
- [docs/guides/CONFIG_SYSTEM.md](../docs/guides/CONFIG_SYSTEM.md) — page config, script boundaries, runtime config behavior
- [docs/guides/COMPONENT_DEVELOPMENT.md](../docs/guides/COMPONENT_DEVELOPMENT.md) — component patterns, registration, renderer usage
- [docs/guides/PLUGIN_CONFIGURATION.md](../docs/guides/PLUGIN_CONFIGURATION.md) — plugin system and integration
- [docs/guides/TESTING_BEST_PRACTICES.md](../docs/guides/TESTING_BEST_PRACTICES.md) — testing approach and expectations
- [docs/architecture/DATAFLOW_ARCHITECTURE.md](../docs/architecture/DATAFLOW_ARCHITECTURE.md) — runtime dataflow and ownership boundaries
- [docs/architecture/PERMISSION_SYSTEM.md](../docs/architecture/PERMISSION_SYSTEM.md) — canonical permission model
- [docs/architecture/PLATFORM_TENANT_ROUTING.md](../docs/architecture/PLATFORM_TENANT_ROUTING.md) — tenant/project route and API scoping
- [docs/ai/README.md](../docs/ai/README.md) — AI governance, prompt system, stills-related docs
- [packages/README.md](../packages/README.md) — package-level entry points
- [tests/README.md](../tests/README.md) — root test scope and conventions
- [spark-ai-server/README.md](../spark-ai-server/README.md) — backend, API, and SSE-debug context
- [README.md](../README.md) and [CONTRIBUTING.md](../CONTRIBUTING.md) — project overview and contribution rules

## Common Workflow Hints

- Renderer or component behavior: start from `packages/spark-component`, then read the component guide.
- Data binding or relation issues: inspect `data-key.ts`, `data-view.ts`, `bindRules.ts`, then read the data guide.
- Page config or AI integration issues: prefer scoped backend APIs and existing SSE debug flows before inventing new plumbing.
- Frontend-only changes usually validate with `pnpm run typecheck`, `pnpm run lint`, and a focused Vitest run.
- Backend changes need `cd spark-ai-server && mvn test`.

If a topic already has a doc, link to the doc instead of expanding this file.
