# SPARK Component System - AI Coding Agent Instructions

Purpose: Quick, actionable guidance to make an AI coding agent productive in this mono-repo (apps share the SPARK component architecture).

## Quick facts ✅
- Dev: `pnpm run dev` or `npm run dev` (Vite, preview on port 5173)
- Build: `pnpm run build` (runs `vue-tsc` then `vite build`)
- Typecheck: `pnpm run typecheck` (uses `tsconfig.typecheck.json`)
- Tests: `pnpm run test` (Vitest + jsdom + @vue/test-utils); run a single test: `pnpm run test -- -t "capability-late-binding"`
- Lint & hooks: `pnpm run lint`; Husky pre-commit runs `lint` + `typecheck`

## Where to look (high value files) 🔎
- Architecture docs: `docs/architecture/DATAFLOW_ARCHITECTURE.md` (data-flow + rationale)
- **Packages**:
  - `packages/spark-component/` — 组件系统（API docs: `packages/spark-component/API.md`）
  - `packages/spark-data/` — 数据空间（DataSet, DataTable, DataView, TreeManager）
- **Pages config**: `pages-config/` — 页面配置（rule.json, pagedata.json, script.js）
- Example components: `features/spark/components/ej2/SparkEJ2Grid.vue`, `features/spark/components/ej2/SparkEJ2Column.vue`
- Key composable: `packages/spark-component/src/composables/useSparkComponent.ts`
- DataKey parser: `packages/spark-data/src/core/data-key.ts`
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

## DataKey 数据绑定键 🔗
统一格式（`@` 分隔符）：`{scope}@{tableName}@{viewId}@{field}`

| 段数 | 格式 | 示例 |
|------|------|------|
| 4 段 | `scope@table@viewId@field` | `UserDS@Users@grid@rows` |
| 3 段 | `scope@table@field`（viewId 默认 `default`） | `UserDS@Users@rows` |

- `field` 可选值：`rows`、`currentRow`、`selectedRows`
- ⚠️ 旧格式 `dataset.tables.X.rows` **已移除**，不再支持
- API：`isDataKey()`, `parseDataKey()`, `resolveDataKey()` — 位于 `packages/spark-data/src/core/data-key.ts`
- 页面配置 `rule.json` 的 `dataKey` 字段必须使用 `@` 格式

```json
// rule.json 示例
{ "dataKey": "UserOrderDataSet@Users@default@rows" }
```

## DI 架构统一 🔄
项目采用 **单一 DI 管道**（SPARK 能力系统）：

| 机制 | 用途 | 例子 |
|------|------|------|
| **SPARK 能力系统** | `provide()` / `consume()` via `useSparkComponent` | `APP_SERVICES`, `DATA_SOURCE`, `SELECTION` |
| **Vue 原生 DI (仅基础设施)** | `app.provide()` / `inject()` | `SPARK_REGISTRY_KEY`（组件注册表） |

**使用规则**：
1. ✅ **业务能力**：统一使用 `consume(APP_SERVICES)` 获取应用服务（router、logger、auth 等）
2. ✅ **Router**：直接使用 `vue-router` 的 `useRouter()`（无需 DI）
3. ✅ **Logger**：从应用层统一提供（通过 `APP_SERVICES` 或直接 `provide('logger', ...)`）
4. ✅ **新增能力**：使用 `CapabilityKey<T>`（`defineCapability<T>()`），接口定义在 `spark-utils/capability-types.ts`
5. ⚠️ **SPARK 基础设施**：仅 `SPARK_REGISTRY_KEY` 保留 Vue DI（組件系统核心）

**示例代码**：
```typescript
// ✅ 推荐：通过 APP_SERVICES 能力获取服务
const { consume, logger } = useSparkComponent({ type: 'my-comp' })
const services = consume(APP_SERVICES)
services?.router?.push('/home')
logger.info('Action')  // 使用应用层提供的 logger

// ✅ 应用层提供全局 logger（在 main.ts 或 bootstrap 中）
import { createLogger } from '@spark-view/spark-app'
const appLogger = createLogger('App')
// 方式 1：通过 APP_SERVICES 提供
const { provide } = useSparkComponent({ type: 'root' })
provide(APP_SERVICES, { 
  router: useRouter(), 
  logger: appLogger 
})
// 方式 2：直接提供 logger 能力
provide('logger', appLogger)
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
├── spark-app/           # 应用层基础设施（✨ 新增 plugins/）
│   ├── src/
│   │   ├── plugins/     # 插件管理系统
│   │   ├── auth/        # 认证模块
│   │   ├── bootstrap/   # 引导模块
│   │   ├── logger/      # 日志模块
│   │   └── router/      # 路由模块
│   └── API.md
├── spark-component/     # 组件系统（Spark namespace, 能力系统）
│   ├── src/
│   │   ├── spark.ts
│   │   ├── registry/
│   │   ├── capability/
│   │   ├── composables/
│   │   ├── plugins/
│   │   └── core/
│   └── API.md
├── spark-data/          # 数据空间（DataSet, DataTable, DataView, TreeManager）
│   ├── src/
│   │   ├── core/        # DataEventHub（统一事件中枢）, utils
│   │   ├── permission/  # 权限系统
│   │   ├── dataset.ts   # DataSet（事件驱动协调器）
│   │   ├── data-table.ts
│   │   ├── data-view.ts # DataView（只发射 view:stateChanged 事件）
│   │   └── tree-manager.ts
│   └── API.md
└── spark-utils/         # 共享工具（Logger, Capability Symbols）
    ├── src/
    └── API.md
```

## Plugin System (插件配置系统) 🔌

### 插件管理在 SparkApp 层
**重要**: 插件管理系统已提升到 `@spark-view/spark-app`，作为应用层基础设施

```typescript
import { 
  PluginRegistry, 
  PluginManager, 
  registerBuiltinPlugins 
} from '@spark-view/spark-app'
```

### 插件配置格式
支持两种格式：简单布尔值或详细配置对象

```json
{
  "plugins": {
    "element-plus": true,  // 简单格式
    "vxe-table": {         // 详细格式
      "enabled": true,
      "options": { "size": "large" },
      "priority": 2
    }
  }
}
```

### 注册自定义插件
```typescript
import { PluginRegistry } from '@spark-view/spark-app'

PluginRegistry.register('my-plugin', {
  name: 'My Plugin',
  module: './plugins/my-plugin',
  loader: () => import('./plugins/my-plugin'),
  defaultOptions: { theme: 'light' }
})
```

### 插件加载
在 `main.ts` 中自动根据配置加载：
```typescript
import { 
  SparkApp,
  PluginManager, 
  registerBuiltinPlugins 
} from '@spark-view/spark-app'

registerBuiltinPlugins()  // 注册内置插件
const plugins = await PluginManager.loadPlugins(appConfig.plugins)
await SparkApp.start({ plugins, ... })
```

**内置插件**: `element-plus`, `vxe-table`, `form-create`

详细文档: `docs/guides/PLUGIN_CONFIGURATION.md`

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
import type { IDataSet, IDataRow } from '@spark-view/spark-data'

// 推荐：使用命名空间 API
const dataSet = SparkData.createDataSet({
  dataSetName: 'MyData',
  tables: { Users: { tableName: 'Users', columns: [], rows: [] } }
})

const treeManager = SparkData.createTreeManager({
  idField: 'id',
  parentIdField: 'parentId'
})

const dataView = SparkData.createDataView({ tableName: 'Users', viewId: 'grid' })

// 直接导入类
import { DataSet, TreeManager, DataTable, DataView } from '@spark-view/spark-data'
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