# SPARK Component System - AI Coding Agent Instructions

Purpose: Quick, actionable guidance to make an AI coding agent productive in this mono-repo.

## Quick facts ✅
- Dev: `pnpm run dev` (Vite, port 5173)
- Build: `pnpm run build` (runs `vue-tsc` then `vite build`)
- Typecheck: `pnpm run typecheck` (uses `tsconfig.typecheck.json`)
- Tests: `pnpm run test` (Vitest + jsdom + @vue/test-utils); single test: `pnpm run test -- -t "capability-late-binding"`
- Lint & hooks: `pnpm run lint`; Husky pre-commit runs `lint` + `typecheck`
- Commit scope 必须是: `deps, docs, scripts, spark-data, spark-app, spark-component, spark-utils, spark-renderer, spark-page-config`

## Where to look (high value files) 🔎
- **Packages**:
  - `packages/spark-component/` — 组件系统（API docs: `packages/spark-component/API.md`）
  - `packages/spark-data/` — 数据空间（DataSet, DataTable, DataView, TreeManager）
  - `packages/spark-utils/` — 能力系统基础设施 + Logger（`src/capability/symbols.ts`）
  - `packages/spark-app/` — 应用层（start, bootstrap, logger, auth, plugins）
- **Pages config**: `public/pages-config/` — 页面配置（rule.json, pagedata.json, script.js）
- **Example components**: `features/spark-ej2/components/SparkEJ2Grid.vue`, `features/spark-ej2/components/SparkEJ2Column.vue`
- **Key composable**: `packages/spark-component/src/composables/useSparkComponent.ts`
- **DataKey parser**: `packages/spark-data/src/core/data-key.ts`
- **Capability keys**: `packages/spark-utils/src/capability/symbols.ts` (APP_SERVICES, LOGGER 等), `packages/spark-data/src/capability-keys.ts` (PAGE_DATASET, DATA_SOURCE)
- **Tests**: `tests/` (重要: `capability-late-binding.test.ts`, `capability-system.test.ts`, `data-key.test.ts`)

## Project conventions & patterns 📌
- Component `type` 使用 **kebab-case**（如 `spark-ej2-grid`），通过 `Spark.register()` 注册
- **Dynamic Import** ⚡: `Spark.register('type', () => import('./Component.vue'))` 懒加载
- **批量注册**: `Spark.createRegister(import.meta.glob('./*.vue')).registerAll({ 'type': './Comp.vue' })`
- App 安装插件: `app.use(Spark.createPlugin())`（Symbol-based DI，自动创建 rootContext）
- 组件内使用 `useSparkComponent(config)` 获取 SPARK 上下文

## useSparkComponent 返回值接口

```typescript
const {
  context,          // ComponentContext — 当前组件上下文（响应式）
  isVisible,        // ComputedRef<boolean> — 基于 config.visible
  isDisabled,       // ComputedRef<boolean> — 基于 config.disabled
  provide,          // (name, impl) => void — 写入 ctx.capabilities（SPARK 能力，非 Vue DI）
  provideEvents,    // (name?) => IEventEmitter — 提供事件总线
  getProvider,      // (name) => unknown — 仅查找本组件 capabilities（不走 parent 链）
  consume,          // <T>(name) => T | null — 沿 parent 链向上查找能力
  consumeEvents,    // (name, handlers) => IEventEmitter | null — 消费并绑定事件
  initialize,       // () => void — onMounted 自动调用
  destroy,          // () => void — onUnmounted 自动调用（清理 children + capabilities）
  logger,           // LoggerApi — 带优先级的日志代理（见下方说明）
  getComponent,     // (type) => unknown — 从注册表获取组件（markRaw 包装）
  isComponentRegistered, // (type) => boolean
} = useSparkComponent(props.config)
```

**logger 优先级**（无需手动 consume，代理自动解析）：
1. `LOGGER` 能力键（最近祖先 `provide(LOGGER, impl)`）
2. `APP_SERVICES.logger`（应用层统一提供）
3. fallback console

## Spark 命名空间 API

```typescript
// 批量注册（推荐）
const reg = Spark.createRegister(import.meta.glob('./*.vue'))
reg.register('user-grid', './UserGrid.vue')
reg.registerAll({ 'user-grid': './UserGrid.vue', 'user-row': './UserRow.vue' })

// 单个注册
Spark.register('my-comp', MyComp)                         // 同步组件
Spark.register('my-comp', () => import('./MyComp.vue'))   // 懒加载

// 批量注册（无 glob 绑定）
Spark.registerAll({ 'my-comp': MyComp }, modules?)

// 插件 & 注册表
app.use(Spark.createPlugin())                 // 使用全局 registry
app.use(Spark.createPlugin({ registry }))    // 使用自定义 registry
Spark.getRegistry()                           // 获取全局注册表
Spark.createRegistry()                        // 创建隔离注册表（测试用）
Spark.createSystem()                          // 测试专用: { registry, rootContext, createContext }
```

## DataKey 数据绑定键 🔗
统一格式（`@` 分隔符）：`{scope}@{tableName}@{viewId}@{field}`

| 段数 | 格式 | 示例 |
|------|------|------|
| 4 段 | `scope@table@viewId@field` | `UserDS@Users@grid@rows` |
| 3 段 | `scope@table@field`（viewId 默认 `default`） | `UserDS@Users@rows` |

- `field` 可选值：`rows`、`currentRow`、`selectedRows`
- ⚠️ 旧格式 `dataset.tables.X.rows` **已移除**，不再支持
- API（`packages/spark-data/src/core/data-key.ts`）：
  - `isDataKey(key)` — 格式校验
  - `parseDataKey(key)` — 解析为 `DataKeyDescriptor`
  - `resolveDataKey(descriptor, dataSet)` — 解析数据值
  - `resolveDataKeyBinding(key, dataSet)` — 返回 `DataKeyBinding` 判别联合（渲染层首选）
  - `buildDataKey(scope, table, field, viewId?)` — 构建 key 字符串

```json
// rule.json 示例
{ "dataKey": "UserOrderDataSet@Users@default@rows" }
```

## 能力体系 🔧

### DI 双轨（严格区分）

| 机制 | 实现 | 用途 |
|------|------|------|
| **SPARK 能力系统** | `ctx.capabilities` Map + `lookup()` 走 parent 链 | 所有业务能力 |
| **Vue DI（仅基础设施）** | `app.provide()` / `inject()` | 仅 `SPARK_REGISTRY_KEY`（注册表）+ `SPARK_PARENT_CONTEXT_KEY`（根上下文） |

**重要**：`useSparkComponent` 的 `provide()` / `consume()` 是 **SPARK 能力系统**，不是 Vue 的 `provide/inject`。

### 能力键一览

| 键 | 定义包 | 类型 | 用途 |
|---|---|---|---|
| `APP_SERVICES` | spark-utils | `IAppServicesCapability` | 路由、logger、租户等应用服务 |
| `LOGGER` | spark-utils | `LoggerApi` | 组件级自定义 logger 覆盖 |
| `PAGE_SERVICE` | spark-utils | `IPageServiceCapability` | UI 消息、确认框、导航 |
| `SELECTION` | spark-utils | `ISelectionCapability` | 选择状态管理 |
| `CURRENT_ROW` | spark-utils | `ICurrentRowCapability` | 当前行管理 |
| `ROW_DATA` | spark-utils | `IRowDataCapability` | 行数据访问 |
| `GRID_EVENTS` | spark-utils | `IEventEmitter` | 表格事件总线 |
| `ROW_EVENTS` | spark-utils | `IEventEmitter` | 行事件总线 |
| `PAGE_DATASET` | spark-data | `IDataSet` | 页面级 DataSet（PageRenderer provide） |
| `DATA_SOURCE` | spark-data | `IDataSource` | 组件级数据视图（容器组件 provide） |

### 标准调用链

```
SparkPlugin.install()
  rootContext.capabilities = Map(空)         ← 应用层通过 APP_SERVICES 填充
  Vue DI: SPARK_REGISTRY_KEY, SPARK_PARENT_CONTEXT_KEY
    ↓
PageRenderer
  provide(APP_SERVICES, { router, logger })   ← SPARK 能力，不是 Vue DI
  provide(PAGE_DATASET, dataSet)
    ↓
r-table / r-tree
  consume(PAGE_DATASET) → 解析 dataKey → DataView
  provide(DATA_SOURCE, dataView)
  provide(SELECTION, {...})
    ↓
r-row / r-cell
  consume(DATA_SOURCE)  → DataView (IDataSource)
  consume(SELECTION)
```

### 新增自定义能力

```typescript
// spark-utils/capability/symbols.ts 中添加（或在项目中本地定义）
import { defineCapability } from '@spark-view/spark-utils'
export const MY_CAP = defineCapability<{ doSomething(): void }>('app:my-capability')

// Provider
const { provide } = useSparkComponent({ type: 'provider' })
provide(MY_CAP, { doSomething() { ... } })

// Consumer（任意深度子孙）
const { consume } = useSparkComponent({ type: 'consumer' })
const cap = consume(MY_CAP)  // T | null，类型自动推断
```

## Package structure 📦
```
packages/
├── spark-app/           # 应用层基础设施
│   └── src/
│       ├── auth/        # AuthService, TokenManager
│       ├── bootstrap/   # bootstrap()
│       ├── logger/      # createLogger, createAppLogger
│       ├── plugins/     # PluginRegistry, PluginManager
│       ├── namespace.ts # SparkApp 命名空间
│       └── start.ts     # start() 高级 API
├── spark-component/     # 组件系统（Spark 命名空间、能力系统）
│   └── src/
│       ├── spark.ts          # Spark 命名空间（唯一入口）
│       ├── core/types.ts     # ComponentConfig, ComponentContext, ComponentRegistry
│       ├── registry/         # ComponentRegistry 实现
│       ├── composables/      # useSparkComponent
│       ├── plugins/          # SparkPlugin (Vue plugin)
│       └── renderer/
│           ├── composables/  # usePageRenderer, useJsonRenderer, useRuleBinding, useCssScope
│           └── utils/        # bindRules, createSandbox, provideAppServices, scopeCSS
├── spark-data/          # 数据空间
│   └── src/
│       ├── core/data-key.ts  # DataKey 解析（resolveDataKeyBinding 等）
│       ├── capability-keys.ts # PAGE_DATASET, DATA_SOURCE
│       ├── spark-data.ts     # SparkData 命名空间（推荐 API）
│       ├── dataset.ts        # DataSet（事件驱动协调器）
│       ├── data-table.ts     # DataTable
│       ├── data-view.ts      # DataView（IDataSource 实现）
│       ├── tree-manager.ts   # TreeManager
│       └── sync-helpers.ts   # createTableSyncHandlers（UI↔DataSet 桥接）
├── spark-page-config/   # 页面配置加载器（ConfigLoader, SparkPageConfig）
└── spark-utils/         # 共享基础设施
    └── src/
        ├── capability/symbols.ts  # 所有能力键定义 + provide/lookup/defineCapability
        ├── logger.ts              # Logger 工厂
        ├── http/                  # Request, FileLoader
        └── lazy-loader.ts        # useSyncfusionLoader, useLazyLoader
```

## Plugin System (插件配置系统) 🔌

```typescript
import { PluginRegistry, PluginManager, registerBuiltinPlugins } from '@spark-view/spark-app'

registerBuiltinPlugins()  // 注册内置: element-plus, vxe-table, form-create
const plugins = await PluginManager.loadPlugins(appConfig.plugins)
```

插件配置（支持简单布尔值或详细对象）：
```json
{
  "plugins": {
    "element-plus": true,
    "vxe-table": { "enabled": true, "options": { "size": "large" } }
  }
}
```

详细文档: `docs/guides/PLUGIN_CONFIGURATION.md`

## Package usage examples 📚

### spark-component（组件系统）
```ts
import { Spark, useSparkComponent } from '@spark-view/spark-component'
import { APP_SERVICES, LOGGER } from '@spark-view/spark-utils'

app.use(Spark.createPlugin())

const reg = Spark.createRegister(import.meta.glob('./*.vue'))
reg.registerAll({ 'user-grid': './UserGrid.vue' })

// 组件 setup 内
const { consume, provide, logger } = useSparkComponent(props.config)
const services = consume(APP_SERVICES)
services?.router?.push('/home')
// logger 自动感知 APP_SERVICES.logger，无需手动 consume

// 覆盖当前子树的 logger
provide(LOGGER, myCustomLogger)
```

### spark-data（数据空间）
```ts
import { SparkData } from '@spark-view/spark-data'
import type { IDataSet, IDataRow } from '@spark-view/spark-data'

const dataSet = SparkData.createDataSet({
  dataSetName: 'MyData',
  tables: { Users: { tableName: 'Users', columns: [], rows: [] } }
})

const treeManager = SparkData.createTreeManager({ idField: 'id', parentIdField: 'parentId' })
const dataView = SparkData.createDataView({ tableName: 'Users', viewId: 'grid' })

// DataKey 绑定解析（渲染层）
const binding = SparkData.resolveDataKeyBinding('MyData@Users@rows', dataSet)
if (binding?.kind === 'view') { /* binding.source: IDataSource */ }
```

### spark-utils（工具集）
```ts
import { Logger, defineCapability, APP_SERVICES, LOGGER } from '@spark-view/spark-utils'

const logger = Logger('MyModule')
logger.info('initialized')

// 定义自定义能力键
const MY_CAP = defineCapability<{ foo(): void }>('app:my-capability')
```

## Testing & common pitfalls 🧪
- 测试使用 Vitest + jsdom；外部 EJ2（`e-*` 标签）需在单元测试中 stub/mock
- 测试挂载时通过 `Spark.createPlugin()` 注入 `sparkManager`
- 常见运行时错误：`Component not found` → 确认组件注册发生在使用之前
- 能力 `consume` 返回 null 是正常情况（late-binding），不是错误
- Network-dependent CSS（Syncfusion CDN）在离线测试中会破坏样式，建议 mock 或本地化

## Integration & build notes 🔧
- Vite 识别 `e-*` 为自定义元素；SSR 通过 `ssr.noExternal` 处理 element-plus
- TypeScript path aliases（根 `tsconfig.json`）:
  - `@spark-view/spark-component` → `./packages/spark-component/src`
  - `@spark-view/spark-data` → `./packages/spark-data/src`
  - `@spark-view/spark-utils` → `./packages/spark-utils/src`
- 每个子包 `tsconfig.json` 独立声明 `paths`（相对于包目录），IDE 类型解析正确
