# SPARK Component System - AI Coding Agent Instructions

Purpose: Quick, actionable guidance to make an AI coding agent productive in this mono-repo (apps share the SPARK component architecture).

## Quick facts ✅
- Dev: `pnpm run dev` or `npm run dev` (Vite, preview on port 5173)
- Build: `pnpm run build` (runs `vue-tsc` then `vite build`)
- Typecheck: `pnpm run typecheck` (uses `tsconfig.typecheck.json`)
- Tests: `pnpm run test` (Vitest + jsdom + @vue/test-utils); run a single test: `pnpm run test -- -t "capability-late-binding"`
- Lint & hooks: `pnpm run lint`; Husky pre-commit runs `lint` + `typecheck`

## Where to look (high value files) 🔎
- Architecture docs: `docs/SPARK_ARCHITECTURE.md` (big-picture + rationale)
- **Packages**:
  - `packages/spark-core/` — 组件系统（API docs: `packages/spark-core/API.md`）
  - `packages/spark-data/` — 数据空间（DataSet, TreeManager, BindingContext）
- Example components: `features/spark/components/ej2/SparkEJ2Grid.vue`, `features/spark/components/ej2/SparkEJ2Column.vue`
- Key composable: `packages/spark-core/src/composables/useSparkComponent.ts`
- Tests: `tests/` (look for `capability-late-binding.test.ts`, `provider-listener.test.ts`)

## Project conventions & patterns 📌
- Component `type` uses **kebab-case** (e.g., `spark-ej2-grid`) and is registered with `Spark.registerSparkComponent()`.
- App installs the manager via plugin: `app.use(Spark.createVuePlugin({ manager, registry }))` (Symbol-based DI).
- Inside components use `useSparkComponent(config)` to access `{ context, provide, consume, use, whenAvailable, logger }`.
- Capability system uses provider/consumer pattern; common helpers: `whenProviderAvailable('name')`, `getOrCreateNoopProvider()` for tests.
- `GetProvider(name, ctx?)` behavior: if `ctx` provided, search only that scope; otherwise walk parent chain (documented in `docs/SPARK_ARCHITECTURE.md`).

## Testing & common pitfalls 🧪
- Tests run with Vitest + jsdom; external EJ2 (custom tags `e-*`) should be stubbed/mocked in unit tests.
- Provide `sparkManager` in test mounts: `mount(MyComp, { global: { provide: { sparkManager: Spark.manager() } } })`.
- Common runtime error: `registerCustomComponents is not defined` → ensure `import { registerCustomComponents } from './components'` is present in `app/main.ts`.
- Network-dependent CSS (Syncfusion CDN) can break styling in offline tests; mock or vendor styles locally for tests.

## Integration & build notes 🔧
- Vite recognizes `e-*` custom elements; SSR uses `ssr.noExternal` for `element-plus` (check `vite.config.ts` for SSR quirks).
- TypeScript path aliases:
  - `@spark-view/spark-core` → `./packages/spark-core/src`
  - `@spark-view/spark-data` → `./packages/spark-data/src`

## Package structure 📦
```
packages/
├── spark-core/          # 组件系统（Spark namespace, 能力系统, 插件）
│   ├── src/
│   │   ├── spark-namespace.ts
│   │   ├── composables/
│   │   ├── utils/
│   │   └── vue/
│   └── API.md
└── spark-data/          # 数据空间（DataSet, TreeManager, BindingContext）
    ├── src/
   Package usage examples 📚

### Using spark-core (组件系统)
```ts
import { Spark, useSparkComponent } from '@spark-view/spark-core'

// Create manager and registry
const manager = Spark.createComponentManager()
const registry = Spark.createComponentRegistry()

// Install plugin
app.use(Spark.createVuePlugin({ manager, registry }))
```

### Using spark-data (数据空间)
```ts
import { SparkData } from '@spark-view/spark-data'
import type { IDataSet, DataRow } from '@spark-view/spark-data'

// 推荐：使用命名空间 API
const dataSet = SparkData.createDataSet({
  dataSetName: 'MyData',
  tables: { Users: { tableName: 'Users', columns: [], rows: [] } }
})

const treeManager = SparkData.createTreeManager({
  idField: 'id',
  parentIdField: 'parentId'
})

// 向后兼容：直接导入类
import { DataSetManager, TreeManager } from '@spark-view/spark-data'
const ds = DataSetManager.create({ ... })
const tree = new TreeManager({ ... })
```
  provide('columnManager', { implementation: { addColumn() { ... } } })
  ```

- Test mount with manager:

  ```ts
  mount(Component, { global: { provide: { sparkManager: Spark.manager() } } })
  ```

---
## Repository re-org notice 🔁
We are simplifying `e:\spark-view` by moving shared/core logic into `packages/spark-core`.
- What moved so far: `shared/utils/componentRegistry.ts` has been re-exported from `@spark-view/spark-core`, and a new package scaffold was created at `packages/spark-core/src`.
- Local TS paths updated to resolve `@spark-view/spark-core` to `./packages/spark-core/src` (see `tsconfig.json`).

Next steps I can do for you (pick one):
1. Move `shared/composables` into `packages/spark-core` and replace with re-exports (recommended next step).
2. Move manager/capability system (`useSparkComponent`, `SparkComponentManager`) into the package and update feature imports.
3. Add build & typecheck steps for the package, CI integration, and tests for package code.

Reply with 1, 2, or 3 to continue.</content>
<parameter name="filePath">e:\form-create-ssr-app\apps\spark-view\.github\copilot-instructions.md