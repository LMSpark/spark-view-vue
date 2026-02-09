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
  - `packages/spark-component/` — 组件系统（API docs: `packages/spark-component/API.md`）
  - `packages/spark-data/` — 数据空间（DataSet, TreeManager, BindingContext）
- **Pages config**: `pages-config/` — 页面配置（rule.json, pagedata.json, script.js）
- Example components: `features/spark/components/ej2/SparkEJ2Grid.vue`, `features/spark/components/ej2/SparkEJ2Column.vue`
- Key composable: `packages/spark-component/src/composables/useSparkComponent.ts`
- Tests: `tests/` (look for `capability-late-binding.test.ts`, `provider-listener.test.ts`)

## Project conventions & patterns 📌
- Component `type` uses **kebab-case** (e.g., `spark-ej2-grid`) and is registered with `Spark.register()`.
- **Dynamic Import** ⚡: Use `loader: () => import('./Component.vue')` for lazy loading (首屏提速 70%+).
- **Registration API**: Use `Spark.createRegister(import.meta.glob('./*.vue'))` for path-based registration.
- App installs the plugin: `app.use(Spark.createPlugin())` (Symbol-based DI, manager auto-created).
- Inside components use `useSparkComponent(config)` to access `{ context, provide, consume, use, whenAvailable, logger }`.
- Capability system uses provider/consumer pattern with Symbol-based capability names.
- `GetProvider(name, ctx?)` behavior: if `ctx` provided, search only that scope; otherwise walk parent chain.
- **APP Services**: Use `consume(APP_SERVICES)` to access router/logger in components (类型自动推断).

## DI 架构统一 🔄
项目采用 **单一 DI 管道**（SPARK 能力系统）：

| 机制 | 用途 | 例子 |
|------|------|------|
| **SPARK 能力系统** | `provide()` / `consume()` via `useSparkComponent` | `APP_SERVICES`, `DATA_SOURCE`, `SELECTION` |
| **Vue 原生 DI (仅基础设施)** | `app.provide()` / `inject()` | `SPARK_REGISTRY_KEY`（组件注册表） |

**使用规则**：
1. ✅ **业务能力**：统一使用 `consume(APP_SERVICES)` 获取应用服务（router、logger、auth 等）
2. ✅ **Router**：直接使用 `vue-router` 的 `useRouter()`（无需 DI）
3. ✅ **Logger**：使用 `Logger('module')` 工厂函数（无需 DI）
4. ✅ **新增能力**：使用 `CapabilityKey<T>`（`defineCapability<T>()`），接口定义在 `spark-utils/capability-types.ts`
5. ⚠️ **SPARK 基础设施**：仅 `SPARK_REGISTRY_KEY` 保留 Vue DI（组件系统核心）

**示例代码**：
```typescript
// ✅ 推荐：通过 APP_SERVICES 能力获取服务
const { consume } = useSparkComponent({ type: 'my-comp' })
const services = consume(APP_SERVICES)
services?.router?.push('/home')
services?.logger?.info('Action')

// ✅ 或直接使用标准工具
import { useRouter } from 'vue-router'
import { Logger } from '@spark-view/spark-utils'
const router = useRouter()
const logger = Logger('MyModule')
```

## Testing & common pitfalls 🧪
- Tests run with Vitest + jsdom; external EJ2 (custom tags `e-*`) should be stubbed/mocked in unit tests.
- Provide `sparkManager` in test mounts using `Spark.createPlugin()`.
- Common runtime error: Component not found → ensure component is registered before use.
- Network-dependent CSS (Syncfusion CDN) can break styling in offline tests; mock or vendor styles locally for tests.

## Integration & build notes 🔧
- Vite recognizes `e-*` custom elements; SSR uses `ssr.noExternal` for `element-plus` (check `vite.config.ts` for SSR quirks).
- TypeScript path aliases:
  - `@spark-view/spark-component` → `./packages/spark-component/src`
  - `@spark-view/spark-data` → `./packages/spark-data/src`

## Package structure 📦
```
packages/
├── spark-component/     # 组件系统（Spark namespace, 能力系统, 插件）
│   ├── src/
│   │   ├── spark.ts
│   │   ├── registry/
│   │   ├── capability/
│   │   ├── composables/
│   │   ├── plugins/
│   │   └── core/
│   └── API.md
├── spark-data/          # 数据空间（DataSet, TreeManager, BindingContext）
│   ├── src/
│   └── API.md
└── spark-utils/         # 共享工具（Logger, Capability Symbols）
    ├── src/
    └── API.md
```

## Package usage examples 📚

### Using spark-component (组件系统)
```ts
import { Spark, useSparkComponent } from '@spark-view/spark-component'

// Install plugin (uses global singleton by default)
app.use(Spark.createPlugin())

// Register components with glob patterns
const register = Spark.createRegister(import.meta.glob('./*.vue'))
register.registerAll({
  'user-grid': './UserGrid.vue',
  'user-row': './UserRow.vue'
})

// Or with custom registry for advanced scenarios
const registry = Spark.createRegistry()
app.use(Spark.createPlugin({ registry }))
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

### Using spark-utils (工具集)
```ts
import { Logger, APP_SERVICES, FIELD_METADATA } from '@spark-view/spark-utils'

// 创建 Logger
const logger = Logger('MyComponent')
logger.info('Component initialized')

// 使用 Symbol-based capability names
provide(APP_SERVICES, { router, logger })
const appServices = consume(APP_SERVICES)
```</content>
<parameter name="filePath">e:\form-create-ssr-app\apps\spark-view\.github\copilot-instructions.md