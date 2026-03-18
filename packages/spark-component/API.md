# @spark-view/spark-component — API 文档

> 版本: 0.1.0 | 基于源码生成

## 目录

1. [Spark 命名空间](#spark-命名空间)
2. [useSparkComponent](#usesparkcomponent)
3. [核心类型](#核心类型)
4. [能力系统](#能力系统)
5. [Vue 插件](#vue-插件)
6. [导出列表](#导出列表)

---

## Spark 命名空间

统一 API 入口，所有注册和配置操作通过 `Spark` 完成。

### `Spark.createRegister(modules)` ⭐ 推荐

绑定 `import.meta.glob` 的注册器，用于路径字符串批量注册。

```typescript
const reg = Spark.createRegister(import.meta.glob('./*.vue'))

// 注册单个（路径字符串 → defineAsyncComponent）
reg.register('user-grid', './UserGrid.vue')
reg.register('user-grid', './UserGrid.vue', { category: 'grid' }) // 带 meta

// 批量注册
reg.registerAll({
  'user-grid': './UserGrid.vue',
  'user-row':  './UserRow.vue',
})
```

### `Spark.register(type, component, meta?)`

注册单个组件。支持同步组件对象和动态导入函数，**不支持路径字符串**（路径字符串请用 `createRegister`）。

```typescript
import UserGrid from './UserGrid.vue'

Spark.register('user-grid', UserGrid)                         // 同步
Spark.register('user-grid', () => import('./UserGrid.vue'))   // 懒加载（自动包装 defineAsyncComponent）
```

### `Spark.registerAll(components, modules?)`

批量注册，不绑定 glob。若 `components` 值为路径字符串，需同时提供 `modules`。

```typescript
Spark.registerAll({
  'user-grid': UserGrid,
  'user-chart': () => import('./UserChart.vue'),
})
```

### `Spark.createPlugin(options?)`

创建 Vue 插件，在 `app.use()` 中安装。

```typescript
// 使用全局 registry（推荐，与 Spark.register() 共享）
app.use(Spark.createPlugin())

// 使用自定义 registry（多实例/测试场景）
const registry = Spark.createRegistry()
app.use(Spark.createPlugin({ registry }))
```

安装后效果：
- Vue DI 注入 `SPARK_REGISTRY_KEY`（注册表）
- Vue DI 注入 `SPARK_PARENT_CONTEXT_KEY`（空 `rootContext`）

### `Spark.getRegistry()`

获取全局组件注册表实例。

### `Spark.createRegistry()`

创建一个隔离的注册表实例，不与全局共享。常用于测试。

### `Spark.createSystem()` —— 测试专用

返回一套隔离的测试系统：

```typescript
const { registry, rootContext, createContext } = Spark.createSystem()

// 创建测试上下文
const parentCtx = createContext({ type: 'parent' })
const childCtx  = createContext({ type: 'child' }, parentCtx)
```

---

## useSparkComponent

每个 SPARK 组件在 `setup()` 中调用一次，获得上下文和能力管理接口。

```typescript
import { useSparkComponent } from '@spark-view/spark-component'

const {
  context,
  isVisible,
  isDisabled,
  provide,
  provideEvents,
  getProvider,
  consume,
  consumeEvents,
  initialize,
  destroy,
  logger,
  getComponent,
  isComponentRegistered,
} = useSparkComponent(props.config)
```

### 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `config` | `ComponentConfig` | 组件配置，通常来自 `props.config` |
| `options.registry` | `ComponentRegistry?` | 覆盖注入的注册表（测试用） |
| `options.parentContext` | `ComponentContext?` | 覆盖注入的父上下文（测试用） |

### 返回值

#### `context: ComponentContext`

响应式组件上下文，包含 `id`、`type`、`children`、`capabilities`、`parent` 等。

#### `isVisible: ComputedRef<boolean>`

当 `config.visible !== false` 时为 `true`（默认可见）。

#### `isDisabled: ComputedRef<boolean>`

当 `config.disabled === true` 时为 `true`（默认不禁用）。

#### `provide(name, implementation)`

向当前组件的 `context.capabilities` 写入能力。**这是 SPARK 能力系统，不是 Vue 的 `provide/inject`。**

```typescript
import { SELECTION } from '@spark-view/spark-utils'

provide(SELECTION, {
  select: (id) => { ... },
  deselect: (id) => { ... },
  isSelected: (id) => selectedIds.has(id),
  clearSelection: () => selectedIds.clear(),
  getSelected: () => [...selectedIds],
})
```

支持类型安全的 `CapabilityKey<T>`（自动推断实现类型）和裸字符串/Symbol。

#### `provideEvents(name?): IEventEmitter`

创建事件总线并注册为能力，`name` 默认 `'events'`。

```typescript
const events = provideEvents(GRID_EVENTS)
events.emit('rowClick', row)
```

#### `getProvider(name): unknown`

仅在**当前组件**的 `capabilities` Map 中查找，不向父级追溯。

#### `consume<T>(name): T | null`

沿 `parent` 链向上查找能力（就近原则）。**找不到返回 `null` 是正常情况（late-binding），不应视为错误。**

```typescript
import { APP_SERVICES } from '@spark-view/spark-utils'

const services = consume(APP_SERVICES)
services?.router?.push('/home')
services?.logger?.info('navigated')
```

#### `consumeEvents(name, handlers): IEventEmitter | null`

查找事件总线并批量绑定处理器：

```typescript
consumeEvents(GRID_EVENTS, {
  rowClick: (row) => handleRowClick(row),
  refresh: () => reload(),
})
```

#### `initialize() / destroy()`

生命周期钩子，`onMounted` / `onUnmounted` 自动调用，无需手动调用。  
`destroy()` 会清理 `children` 关联和 `capabilities` Map。

#### `logger: LoggerApi`

带优先级的日志代理。解析顺序（无需手动配置）：
1. 最近祖先 `provide(LOGGER, impl)` 的实现
2. 最近祖先 `provide(APP_SERVICES, { logger: ... })` 的 logger
3. fallback console

#### `getComponent(type): unknown`

从注册表查找已注册组件，返回值经 `markRaw` 包装（避免 Vue 响应式代理）。

#### `isComponentRegistered(type): boolean`

判断组件类型是否已注册。

---

## 核心类型

### `ComponentConfig`

组件的最小输入类型（可序列化，来自 JSON 配置）。

```typescript
interface ComponentConfig {
  type: string          // kebab-case 组件类型，对应注册名
  id?: string           // 实例 ID（默认运行时自动生成）
  props?: Record<string, unknown>
  children?: ComponentConfig[]
  visible?: boolean     // 默认 true
  disabled?: boolean    // 默认 false
}
```

扩展 `ComponentConfig` 定义业务组件配置：

```typescript
interface MyGridConfig extends ComponentConfig {
  type: 'my-grid'
  pageSize?: number
  columns?: ColumnDef[]
}

defineProps<{ config: MyGridConfig }>()
```

### `ComponentContext`

组件的运行时表示，继承 `ICapabilityContext`。

```typescript
interface ComponentContext extends ICapabilityContext {
  props?: Record<string, unknown>
  children?: ComponentContext[]
  parent?: ICapabilityContext
  state: Record<string, unknown>
  logger?: LoggerApi
}

interface ICapabilityContext {
  id: string
  type: string
  parent?: ICapabilityContext
  capabilities: Map<CapabilityName, unknown>
}
```

### `ComponentDefinition`

注册表中存储的组件条目：

```typescript
interface ComponentDefinition {
  type: string
  component: unknown   // Vue 组件对象
  meta?: Record<string, unknown>
}
```

### `ComponentRegistry`

```typescript
interface ComponentRegistry {
  register(type, component, meta?, options?: { silent?: boolean }): void
  registerOnce(type, component, meta?): boolean
  get(type): ComponentDefinition | undefined
  has(type): boolean
  unregister(type): boolean
  getAll(): Map<string, ComponentDefinition>
}
```

---

## 能力系统

### 定义能力键

```typescript
import { defineCapability } from '@spark-view/spark-utils'

export const MY_CAP = defineCapability<{ doWork(): void }>('app:my-cap')
// MY_CAP 类型为 CapabilityKey<{ doWork(): void }>
```

### 提供 / 消费

```typescript
// Provider 组件
const { provide } = useSparkComponent({ type: 'parent' })
provide(MY_CAP, { doWork() { console.log('working') } })

// Consumer 组件（任意深度子孙）
const { consume } = useSparkComponent({ type: 'child' })
const cap = consume(MY_CAP)   // 类型推断为 { doWork(): void } | null
cap?.doWork()
```

### 内置能力键（来自 `@spark-view/spark-utils`）

| 键 | 类型 | 说明 |
|---|---|---|
| `APP_SERVICES` | `IAppServicesCapability` | `{ router?, logger?, tenant?, configLoader?, authService? }` |
| `LOGGER` | `LoggerApi` | 覆盖当前子树的 logger |
| `PAGE_SERVICE` | `IPageServiceCapability` | `showMessage / showConfirm / showLoading / navigate` |
| `SELECTION` | `ISelectionCapability` | `select / deselect / isSelected / clearSelection / getSelected` |
| `CURRENT_ROW` | `ICurrentRowCapability` | `getRow / getIndex / setRow` |
| `ROW_DATA` | `IRowDataCapability` | `getData / getField / isSelected?` |
| `GRID_EVENTS` | `IEventEmitter` | 表格级事件总线 |
| `ROW_EVENTS` | `IEventEmitter` | 行级事件总线 |

来自 `@spark-view/spark-data`：

| 键 | 类型 | 说明 |
|---|---|---|
| `PAGE_DATASET` | `IDataSet` | 页面级 DataSet，由 PageRenderer 提供 |
| `DATA_SOURCE` | `IDataSource` | 组件级 DataView，由容器组件提供 |

---

## Vue 插件

```typescript
import { createSparkPlugin } from '@spark-view/spark-component'

// 等价于 Spark.createPlugin()
const plugin = createSparkPlugin({ registry? })
app.use(plugin)
```

安装时向 Vue DI 注入：
- `SPARK_REGISTRY_KEY` → `ComponentRegistry` 实例
- `SPARK_PARENT_CONTEXT_KEY` → `rootContext`（空能力 Map）

---

## 导出列表

```typescript
// 命名空间
export { Spark }

// 组件开发
export { useSparkComponent }
export type { UseSparkComponentReturn }

// Vue 插件
export { createSparkPlugin }
export type { SparkPluginOptions }

// 注册表
export { createComponentRegistry, getGlobalRegistry }

// 核心类型
export type {
  CapabilityName,
  ComponentConfig,
  ComponentContext,
  ComponentDefinition,
  ComponentRegistry,
  LoggerApi,
}

// DI Keys（Vue DI 用，仅基础设施场景）
export { SPARK_REGISTRY_KEY, SPARK_PARENT_CONTEXT_KEY }

// 页面渲染引擎
export {
  SparkPageRenderer,
  SparkComponentRenderer,
  usePageDataSet,
  bindDataToRules,
}
export type {
  PageContext,
  PageConfig,
  RuleBindingOptions,
}
```
