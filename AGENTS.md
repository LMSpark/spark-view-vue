# SPARK View — Codex Agent Instructions

## Environment Setup

**Required runtimes:**
- Node >= 20 (use `node --version` to verify)
- pnpm >= 10 (`npm install -g pnpm@10` if missing)
- JDK 17+ is required **only** for Java backend tasks (`spark-ai-server/`). Skip for frontend-only work.

**Install dependencies (frontend only — preferred for most tasks):**
```bash
pnpm install --frozen-lockfile
```

**Do NOT run these unless explicitly needed:**
- `pnpm run dev` — starts full stack (Java + Vite), slow to boot
- `cd spark-ai-server && mvn install` — downloads Maven deps, very slow
- `pnpm run build` — full pipeline including Java, avoid unless testing build

**Validation commands (fast, run these after changes):**
```bash
pnpm run typecheck   # TypeScript strict check
pnpm run lint        # ESLint
pnpm run test        # Vitest unit tests
```

## Repository Map

```
packages/
├── spark-utils/        # Pure TS primitives — capability keys, logger, HTTP
├── spark-data/         # DataSet, DataTable, DataView, TreeManager, data-key
├── spark-page-config/  # Page config parsing, script context, config loading
├── spark-component/    # Vue renderer, component registry, capability wiring
├── spark-app/          # App shell, router, auth, plugins, bootstrap
├── spark-ai/           # AI runtime — SSE, Stills execution, tool protocol
├── vite-plugin-spark-catalog/ # Build-time catalog extraction plugin
└── vxe-table/          # VXE Table integration
spark-ai-server/        # Spring Boot backend (Java) — skip unless Java task
src/                    # App entry, views, bootstrap
tests/                  # Root-level Vitest tests
```

**Package dependency order (strict, acyclic):**
`spark-utils` ← `spark-data` ← `spark-page-config` ← `spark-component` ← `spark-app`

## Key Entry Points

- `packages/spark-component/src/core/useSparkComponent.ts` — component hook
- `packages/spark-component/src/page/usePageDataSet.ts` — page data wiring
- `packages/spark-component/src/page/binding/bindRules.ts` — rule binding
- `packages/spark-data/src/core/data-key.ts` — DataKey format
- `packages/spark-utils/src/capability.ts` — capability Symbol keys
- `spark-ai-server/data/pages-config/` — live page configs (source of truth)

## Non-Negotiable Rules

1. **Package boundaries are strict.** Never use relative imports across packages. Use `@spark-view/*` package names only.
2. **`spark-utils`, `spark-data`, `spark-page-config` must stay framework-free.** No `vue`, `vue-router`, or `element-plus` imports in these packages.
3. **Capability DI ≠ Vue DI.** Use `sparkProvide` / `sparkConsume` for business capabilities. Vue `provide/inject` is infrastructure only.
4. **DataSet pipeline is one-way:** `pagedata.json` → `parsePageData()` → `DataSet` → `usePageDataSet()` → `PAGE_DATASET` → `DataKey` → `DataView` → UI. Do not bypass with `pageData` or `$data` side channels.
5. **Never call `DataSet.destroy()` in `clearDataSet()`.** DataSet instances are cached and reused across navigations.
6. **Config-first.** Prefer `rule.json`, `pagedata.json`, and existing renderer capabilities. Use `script.js` only when config cannot express the behavior.
7. **Fail-fast.** No silent fallbacks that mask missing APIs, invalid config, or inconsistent state.
8. **Commit scopes are restricted** to: `deps`, `docs`, `scripts`, `spark-data`, `spark-app`, `spark-ai`, `spark-component`, `spark-utils`, `spark-page-config`.

## DataKey Format

- Standard: `table@field` or `table@viewId@field`
- Cross-page: `#scope@table@...`
- Do NOT use legacy dot-notation keys

## Script Sandbox (`script.js`)

Allowed globals: `$page`, `$route`, `$dataSet`, `$query`, `SparkData`, `h`

Forbidden: `$data`, ESM `import`, `window.xxx` globals, direct `ElMessage` / `ElMessageBox`, direct Vue Router imports

## Large Files — Do Not Modify

These catalog files are large and should not be edited directly:
- `packages/spark-ai/src/catalog/component-catalog.json` (~94MB)
- `spark-ai-server/data/component-metadata.json` (~13MB)

## Commit Message Format

```
<type>(<scope>): <description>
```

Examples:
- `feat(spark-data): add computed column API`
- `fix(spark-component): resolve DataView binding race`
- `refactor(spark-ai): split session orchestrator`
