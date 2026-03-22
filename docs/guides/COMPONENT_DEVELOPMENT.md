# 组件开发指南

> 使用 SPARK 框架创建符合架构规范的自定义组件

---

## 目录

1. [快速开始](#1-快速开始)
2. [组件注册](#2-组件注册)
3. [useSparkComponent 完整 API](#3-usesparkcomponent-完整-api)
4. [能力系统（Capability）](#4-能力系统capability)
5. [数据绑定](#5-数据绑定)
6. [DataView 交互](#6-dataview-交互)
7. [事件系统](#7-事件系统)
8. [日志与调试](#8-日志与调试)
9. [样式隔离](#9-样式隔离)
10. [测试](#10-测试)
11. [最佳实践与规范](#11-最佳实践与规范)
12. [使用 Plop 脚手架](#12-使用-plop-脚手架)
13. [附录：完整示例——主从表组件](#13-附录完整示例主从表组件)

---

## 1. 快速开始

### 最小组件模板

```vue
<!-- packages/spark-component/src/components/MyWidget.vue -->
<template>
  <div v-if="isVisible" :class="['my-widget', { 'my-widget--disabled': isDisabled }]">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { useSparkComponent } from '@spark-view/spark-component'
import type { SparkNode } from '@spark-view/spark-component'

// 1. 扩展 SparkNode，声明组件专属配置
interface MyWidgetConfig extends SparkNode {
  title?: string
  theme?: 'light' | 'dark'
}

const props = defineProps<{ config: MyWidgetConfig }>()

// 2. 获取 SPARK 上下文
const {
  isVisible,    // ComputedRef<boolean>  基于 config.visible
  isDisabled,   // ComputedRef<boolean>  基于 config.disabled
  logger,       // 带优先级的日志代理
} = useSparkComponent(props.config)

logger.info('MyWidget initialized', { title: props.config.title })
</script>
```

> `useSparkComponent` 必须在 `<script setup>` 的**顶层**调用（Vue 组合式函数规则）。

---

## 2. 组件注册

`type` 使用 **kebab-case**，与 JSON 配置中的 `"type"` 字段一一对应。

### 方式一：单个注册（同步 / 懒加载）

```typescript
import { Spark } from '@spark-view/spark-component'
import MyWidget from './MyWidget.vue'

// 同步（直接引用，不做代码分割）
Spark.register('my-widget', MyWidget)

// 懒加载（推荐——自动代码分割）
Spark.register('my-widget', () => import('./MyWidget.vue'))
```

### 方式二：批量注册（`createRegister` + glob，推荐）

```typescript
// features/my-app/index.ts
import { Spark } from '@spark-view/spark-component'

const reg = Spark.createRegister(import.meta.glob('./components/*.vue'))

reg.registerAll({
  'my-widget':      './components/MyWidget.vue',
  'my-grid':        './components/MyGrid.vue',
  'my-detail-form': './components/MyDetailForm.vue',
})
```

### 方式三：一次性批量（无 glob 绑定，适合内置组件）

```typescript
import { Spark } from '@spark-view/spark-component'
import WidgetA from './WidgetA.vue'
import WidgetB from './WidgetB.vue'

Spark.registerAll({
  'widget-a': WidgetA,
  'widget-b': WidgetB,
})
```

### 安装 Vue 插件

```typescript
// main.ts
import { createApp } from 'vue'
import { Spark } from '@spark-view/spark-component'
import App from './App.vue'

const app = createApp(App)
app.use(Spark.createPlugin())   // 建立 rootContext + Symbol-based DI
app.mount('#app')
```

---

## 3. useSparkComponent 完整 API

```typescript
const {
  context,              // ComponentContext — 当前组件上下文（响应式）
  isVisible,            // ComputedRef<boolean> — 基于 config.visible
  isDisabled,           // ComputedRef<boolean> — 基于 config.disabled

  provide,              // (capabilityKey, impl) => void — 写入本组件能力
  provideEvents,        // (name?) => IEventEmitter — 提供事件总线
  getProvider,          // (capabilityKey) => unknown — 仅查本组件能力（不走 parent 链）
  consume,              // <T>(capabilityKey) => T | null — 沿 parent 链向上查找
  consumeEvents,        // (name, handlers) => IEventEmitter | null — 消费并绑定事件

  initialize,           // () => void — onMounted 自动调用
  destroy,              // () => void — onUnmounted 自动调用

  logger,               // LoggerApi — 带优先级的日志代理
  getComponent,         // (type) => unknown — 从注册表获取组件（markRaw 包装）
  isComponentRegistered,// (type) => boolean
} = useSparkComponent(props.config)
```

**关键规则**：

| 规则 | 说明 |
|------|------|
| `consume()` 返回 `T \| null` | `null` 是正常情况（延迟绑定），不是错误 |
| `provide()` / `consume()` 是 SPARK 能力系统 | ≠ Vue 的 `provide/inject` |
| `logger` 自动解析 | 无需 `consume(LOGGER)`，代理自动查找最近祖先 |
| `initialize` / `destroy` 自动调用 | `onMounted` / `onUnmounted` 内自动触发 |

---

## 4. 能力系统（Capability）

SPARK 能力系统通过 **Symbol 键** 实现组件间的松耦合通信，沿 parent 链向上查找（就近原则）。

### 4.1 内置能力键

| 能力键 | 定义包 | 类型 | 典型提供者 |
|---|---|---|---|
| `APP_SERVICES` | `spark-utils` | `IAppServicesCapability` — router、logger、租户 | 应用层 |
| `LOGGER` | `spark-utils` | `LoggerApi` — 自定义日志覆盖 | 任意祖先 |
| `PAGE_SERVICE` | `spark-utils` | `IPageServiceCapability` — 弹框、导航、消息 | PageRenderer |
| `SELECTION` | `spark-utils` | `ISelectionCapability` — 选择状态管理 | 容器组件 |
| `CURRENT_ROW` | `spark-utils` | `ICurrentRowCapability` — 当前行管理 | 容器组件 |
| `ROW_DATA` | `spark-utils` | `IRowDataCapability` — 行数据访问 | 行组件 |
| `GRID_EVENTS` | `spark-utils` | `IEventEmitter` — 表格事件总线 | 表格组件 |
| `ROW_EVENTS` | `spark-utils` | `IEventEmitter` — 行事件总线 | 行组件 |
| `PAGE_DATASET` | `spark-component` | `IDataSet` — 页面级 DataSet | PageRenderer |
| `DATA_SOURCE` | `spark-component` | `IDataSource` — 组件级数据视图 | 容器组件 |

### 4.2 消费内置能力

```typescript
import { useSparkComponent } from '@spark-view/spark-component'
import { APP_SERVICES, PAGE_SERVICE, SELECTION } from '@spark-view/spark-utils'
import { PAGE_DATASET } from '@spark-view/spark-component'

const { consume } = useSparkComponent(props.config)

// 路由跳转
consume(APP_SERVICES)?.router?.push('/detail/1')

// 弹出确认框
consume(PAGE_SERVICE)?.confirm('确认删除？').then(ok => { if (ok) doDelete() })

// 读取当前选择
const selectedIds = consume(SELECTION)?.getSelectedIds() ?? []

// 获取页面 DataSet
const dataSet = consume(PAGE_DATASET)
```

### 4.3 定义并提供自定义能力

```typescript
// capability.ts
import { defineCapability } from '@spark-view/spark-utils'

export interface IMySearchCapability {
  search(keyword: string): void
  getKeyword(): string
}

export const MY_SEARCH = defineCapability<IMySearchCapability>('app:my-search')
```

```typescript
// SearchBar.vue（Provider）
import { MY_SEARCH } from './capability'
const { provide } = useSparkComponent(props.config)
const keyword = ref('')

provide(MY_SEARCH, {
  search: (kw) => { keyword.value = kw },
  getKeyword: () => keyword.value,
})
```

```typescript
// ResultList.vue（Consumer，任意深度子孙）
import { MY_SEARCH } from './capability'
const { consume } = useSparkComponent(props.config)
const search = consume(MY_SEARCH)   // IMySearchCapability | null，类型自动推断

function handleSearch() {
  search?.search('keyword')
}
```

### 4.4 能力查找链示意

```
APP (provide APP_SERVICES)
 └─ PageRenderer (provide PAGE_DATASET, PAGE_SERVICE)
      └─ 容器组件   (provide DATA_SOURCE, SELECTION)
           └─ 行组件 (provide ROW_DATA)
                └─ 子组件 → consume(DATA_SOURCE) ✅ 向上找到容器组件
                          → consume(APP_SERVICES) ✅ 向上找到 APP
```

---

## 5. 数据绑定

### 5.1 DataKey 格式

SPARK 以统一的 DataKey 字符串描述数据来源：

```
{scope}@{tableName}@{viewId}@{field}
```

| 段数 | 示例 | 说明 |
|------|------|------|
| 4 段 | `UserDS@Users@grid@rows` | 完整格式 |
| 3 段 | `UserDS@Users@rows` | viewId 默认 `default` |

`field` 可选值：`rows`、`currentRow`、`selectedRows`。

### 5.2 解析 DataKey → 数据视图

```typescript
import { PAGE_DATASET } from '@spark-view/spark-component'
import { SparkData } from '@spark-view/spark-data'

const { consume } = useSparkComponent(props.config)
const dataSet = consume(PAGE_DATASET)

// resolveDataKeyBinding 返回判别联合（渲染层首选）
const binding = props.config.dataKey
  ? SparkData.resolveDataKeyBinding(props.config.dataKey, dataSet)
  : null

// kind === 'view' 时，source 是 IDataSource（DataView 的公开接口）
const dataSource = binding?.kind === 'view' ? binding.source : null

// 响应式读取行数据
const rows = computed(() => dataSource?.rows ?? [])
const currentRow = computed(() => dataSource?.currentRow ?? null)
```

### 5.3 订阅数据变化

DataView 通过独立事件通知所有订阅者：

```typescript
import { onMounted, onUnmounted } from 'vue'

onMounted(() => {
  dataSource?.events.on('currentRowChanged', handleCurrentRowChanged)
  dataSource?.events.on('selectedRowsChanged', handleSelectedRowsChanged)
  dataSource?.events.on('cleared', handleCleared)
})
onUnmounted(() => {
  dataSource?.events.off('currentRowChanged', handleCurrentRowChanged)
  dataSource?.events.off('selectedRowsChanged', handleSelectedRowsChanged)
  dataSource?.events.off('cleared', handleCleared)
})

function handleCurrentRowChanged(currentRow: IDataRow | null, originatorId?: string) {
  console.log('当前行:', currentRow)
  updateCurrentRowUI(currentRow)
}

function handleSelectedRowsChanged(selectedRows: IDataRow[], originatorId?: string) {
  console.log('选中行:', selectedRows)
  updateSelectedRowsUI(selectedRows)
}

function handleCleared() {
  updateCurrentRowUI(null)
  updateSelectedRowsUI([])
}
```

`rowsChanged` 有 16ms 防抖（批量合并），其余事件立即触发。
每个事件只携带自身相关的参数，无需 `switch` 或 `changeType` 判断。

### 5.4 提供 DATA_SOURCE（容器组件模式）

容器组件（如表格）解析 DataKey 后将 `DataView` 向下提供，子组件通过 `consume(DATA_SOURCE)` 获取：

```typescript
import { DATA_SOURCE, PAGE_DATASET } from '@spark-view/spark-component'
import { SparkData } from '@spark-view/spark-data'

const { provide, consume } = useSparkComponent(props.config)

const dataSet = consume(PAGE_DATASET)
const binding = SparkData.resolveDataKeyBinding(props.config.dataKey, dataSet)
const dataView = binding?.kind === 'view' ? binding.source : null

if (dataView) {
  provide(DATA_SOURCE, dataView)   // 子组件通过 consume(DATA_SOURCE) 获取
}
```

---

## 6. DataView 交互

`IDataSource` 是 `DataView` 的公开接口，组件通过 `consume(DATA_SOURCE)` 获得它。
DataView 内部通过委托层（`SelectionDelegate` / `LocalMutationDelegate` / `CrudDelegate`）处理各类操作，组件无需感知委托细节，直接调用 `DataView` 的公开方法即可。

### 6.1 只读状态

```typescript
const ds = consume(DATA_SOURCE)

const allRows    = ds?.rows              // IDataRow[]
const total      = ds?.total            // 服务端总记录数
const page       = ds?.page
const pageSize   = ds?.pageSize
const current    = ds?.currentRow       // IDataRow | null
const selected   = ds?.selectedRows     // IDataRow[]
const state      = ds?.requestState     // RequestState 枚举
const isLoading  = ds?.mutating         // CRUD 请求中
const err        = ds?.loadingError     // Error | null
```

### 6.2 选中状态管理

```typescript
const ds = consume(DATA_SOURCE)

// 当前行
ds?.setCurrentRow(row)
ds?.setCurrentRowById(123)         // returns boolean（是否找到）

// 多选
ds?.setSelectedRows([row1, row2])
ds?.setSelectedRowsById([1, 2, 3]) // returns 成功匹配数
ds?.clearSelectedRows()
ds?.addSelectedRows([newRow])
ds?.removeSelectedRows([oldRow])
ds?.addSelectedRowsById([4, 5])
ds?.removeSelectedRowsById([1])

// 传入 EventContext（可选，用于追踪操作来源）
import { createEventContext } from '@spark-view/spark-data'
const ctx = createEventContext('user', { tableName: 'Users', viewId: 'grid' })
ds?.setCurrentRow(row, ctx)
```

### 6.3 本地内存变更

本地变更不触发网络请求，但会同步 `currentRow` / `selectedRows` 引用，并发射对应 `stateChanged` 事件：

```typescript
const ds = consume(DATA_SOURCE)

ds?.appendRow({ id: 999, name: 'New Row' })        // 追加行
ds?.updateRowById(1, { name: 'Updated Name' })     // returns boolean
ds?.deleteRowById(1)                               // returns boolean，自动清理选中
ds?.replaceRows(newRowArray)                       // 整批替换，清理失效引用
```

> **不要直接修改 `ds?.rows`**——绕过委托层会导致 `selectedRows` 等状态不一致。

### 6.4 网络请求操作

```typescript
ds?.requestData()                                  // 上行（幂等）
await ds?.refresh()                                // 下行（强制重新加载）
await ds?.loadFromServer({ page: 2, pageSize: 20 }) // 直接加载（跳过父依赖检查）

await ds?.createRecord({ name: 'Alice' })
await ds?.updateRecord(1, { name: 'Alice M.' })
await ds?.deleteRecord(1)
await ds?.batchCreateRecords([...])
await ds?.batchUpdateRecords([...])
await ds?.batchDeleteRecords([1, 2, 3])
```

---

## 7. 事件系统

### 7.1 提供事件总线

```typescript
import { GRID_EVENTS } from '@spark-view/spark-utils'

const { provideEvents } = useSparkComponent(props.config)

const gridEvents = provideEvents(GRID_EVENTS)

// 触发事件（内部使用）
gridEvents.emit('rowClick', { row, index })
gridEvents.emit('pageChange', { page: 2 })
```

### 7.2 消费事件总线

```typescript
import { GRID_EVENTS } from '@spark-view/spark-utils'

const { consumeEvents } = useSparkComponent(props.config)

// 自动处理挂载/卸载
consumeEvents(GRID_EVENTS, {
  rowClick: ({ row }) => console.log('row clicked:', row),
  pageChange: ({ page }) => console.log('page:', page),
})
```

### 7.3 手动管理生命周期

```typescript
const gridEvents = consume(GRID_EVENTS)
const onRowClick = (payload: RowClickPayload) => { /* ... */ }

onMounted(() => gridEvents?.on('rowClick', onRowClick))
onUnmounted(() => gridEvents?.off('rowClick', onRowClick))
```

---

## 8. 日志与调试

`useSparkComponent` 返回的 `logger` 自动按以下优先级解析：
1. 最近祖先 `provide(LOGGER, impl)` 覆盖
2. `APP_SERVICES.logger`（应用层统一提供）
3. Fallback console

```typescript
const { logger } = useSparkComponent(props.config)

logger.debug('详细调试信息', { state })
logger.info('初始化完成', { count: rows.length })
logger.warn('数据源未连接，降级展示空状态')
logger.error('请求失败', { error })
```

### 自定义 Logger（子树覆盖）

```typescript
import { LOGGER } from '@spark-view/spark-utils'
import { createLogger } from '@spark-view/spark-app'

const { provide } = useSparkComponent(props.config)

// 提供后，所有子孙组件的 logger 将使用此实现
provide(LOGGER, createLogger({ prefix: '[MySection]', level: 'warn' }))
```

---

## 9. 样式隔离

使用 `<style scoped>` + BEM 命名：

```vue
<template>
  <div
    v-if="isVisible"
    :class="[
      'spark-my-widget',
      `spark-my-widget--${props.config.theme ?? 'light'}`,
      { 'spark-my-widget--disabled': isDisabled }
    ]"
  >
    <div class="spark-my-widget__header">{{ props.config.title }}</div>
    <div class="spark-my-widget__body"><slot /></div>
  </div>
</template>

<style scoped>
.spark-my-widget { display: flex; flex-direction: column; }
.spark-my-widget--disabled { pointer-events: none; opacity: 0.5; }
.spark-my-widget__header { font-weight: bold; padding: 8px 12px; }
.spark-my-widget__body { flex: 1; overflow: auto; }
</style>
```

---

## 10. 测试

### 10.1 基础挂载

```typescript
// tests/MyWidget.test.ts
import { mount } from '@vue/test-utils'
import { createApp } from 'vue'
import { describe, it, expect } from 'vitest'
import { Spark } from '@spark-view/spark-component'
import MyWidget from '../components/MyWidget.vue'

describe('MyWidget', () => {
  it('renders correctly', () => {
    const wrapper = mount(MyWidget, {
      global: { plugins: [Spark.createPlugin()] },  // 必须：提供 ComponentContext 基础设施
      props: {
        config: { type: 'my-widget', title: 'Test Widget' }
      }
    })

    expect(wrapper.find('.spark-my-widget__header').text()).toBe('Test Widget')
  })
})
```

### 10.2 能力系统测试

```typescript
import { Spark } from '@spark-view/spark-component'
import { MY_SEARCH } from '../capability'

it('provides and consumes capability', () => {
  const { createContext } = Spark.createSystem()   // 隔离注册表（测试专用）

  const rootCtx = createContext(null, { type: 'root' })
  const providerCtx = createContext(rootCtx, { type: 'provider' })
  const consumerCtx = createContext(providerCtx, { type: 'consumer' })

  // 模拟 provide
  const searchImpl = { search: vi.fn(), getKeyword: () => 'test' }
  providerCtx.capabilities.set(MY_SEARCH.key, searchImpl)

  // 验证 consume 沿 parent 链查找
  const found = consumerCtx.capabilities.lookup(MY_SEARCH.key)
  expect(found).toBe(searchImpl)
  expect(found?.getKeyword()).toBe('test')
})
```

### 10.3 DataView 数据绑定测试

```typescript
import { SparkData } from '@spark-view/spark-data'

it('resolves DataKey to rows', () => {
  const dataSet = SparkData.createDataSet({
    dataSetName: 'Test',
    tables: {
      Items: {
        tableName: 'Items',
        columns: [{ name: 'id', type: 'number', primaryKey: true }],
        rows: [{ id: 1 }, { id: 2 }]
      }
    }
  })

  const binding = SparkData.resolveDataKeyBinding('Test@Items@rows', dataSet)
  expect(binding?.kind).toBe('view')
  if (binding?.kind === 'view') {
    expect(binding.source.rows).toHaveLength(2)
  }
})
```

---

## 11. 最佳实践与规范

### 11.1 组件 type 命名

```typescript
// ✅ 必须 kebab-case
Spark.register('user-detail-form', ...)\nSpark.register('r-table', ...)", "oldString": "Spark.register('user-detail-form', ...)\nSpark.register('spark-ej2-grid', ...)

// ❌ 禁止
Spark.register('UserDetailForm', ...)
Spark.register('userDetailForm', ...)
```

### 11.2 Config 接口设计

```typescript
// ✅ 继承 SparkNode，只声明本组件需要的字段
interface MyGridConfig extends SparkNode {
  dataKey?: string          // DataKey 字符串
  pageSize?: number
  showPagination?: boolean
}

// ✅ 组件内提供默认值
const pageSize = computed(() => props.config.pageSize ?? 20)
```

### 11.3 consume 空值安全

```typescript
// ✅ 延迟绑定：在 onMounted 后使用
onMounted(() => consume(COLUMN_MANAGER)?.addColumn({ id: props.id, field: props.field }))

// ✅ 空值安全：用 ?. 链式调用
const rows = computed(() => consume(DATA_SOURCE)?.rows ?? [])

// ❌ 非空断言——可能为 null
const mgr = consume(COLUMN_MANAGER)!   // 危险
```

### 11.4 行数据变更通过 DataView 方法（不要直接改 rows）

```typescript
// ✅ 使用受控方法（SelectionDelegate / LocalMutationDelegate 保证一致性）
dataView.appendRow({ id: newId, name: 'Alice' })
dataView.updateRowById(1, { name: 'Alice M.' })
dataView.deleteRowById(1)
dataView.replaceRows(newRowArray)

// ❌ 直接修改 rows 绕过委托层，selectedRows 等状态会不一致
dataView.rows.push({ id: newId, name: 'Alice' })   // 禁止
dataView.rows.splice(0, 1)                          // 禁止
```

### 11.5 避免组件间直接实例引用

```typescript
// ✅ 通过能力系统通信
consume(SELECTION)?.selectAll()

// ❌ 通过 ref 直接耦合另一组件实例
gridRef.value?.selectAll()
```

### 11.6 Commit scope 规范

| 修改范围 | scope |
|---------|-------|
| `packages/spark-component/` | `spark-component` |
| `packages/spark-data/` | `spark-data` |
| `packages/spark-utils/` | `spark-utils` |
| `packages/spark-app/` | `spark-app` |
| `packages/spark-page-config/` | `spark-page-config` |
| `docs/` / `scripts/` / 构建配置 | `docs` / `scripts` |

---

## 12. 使用 Plop 脚手架

项目提供 Plop 模板快速创建符合规范的组件骨架：

```bash
pnpm run plop
# 选择 "component" 模板，按提示输入组件名称
# 自动生成：
#   src/components/MyComponent/MyComponent.vue
#   src/components/MyComponent/MyComponent.test.ts
#   src/components/MyComponent/MyComponent.stories.ts
```

生成的文件已包含：
- 正确的 `SparkNode` 继承
- `useSparkComponent` 调用骨架
- Vitest 测试文件（含 `Spark.createPlugin()` 挂载模板）
- 基础 JSDoc 注释

---

## 13. 附录：完整示例——主从表组件

展示 DataView 选中驱动子视图级联的完整模式。

### 配置（rule.json）

```json
{
  "type": "panel",
  "children": [
    {
      "type": "master-grid",
      "dataKey": "PageDS@Orders@grid@rows"
    },
    {
      "type": "detail-grid",
      "dataKey": "PageDS@OrderItems@detail@rows"
    }
  ]
}
```

```json
// DataSet relations 配置
{
  "relations": [{
    "name": "OrderItems",
    "parentTable": "Orders",
    "childTable": "OrderItems",
    "parentViewId": "grid",
    "childViewId": "detail",
    "dependencyType": "currentRow",
    "parentField": "id",
    "childField": "orderId"
  }]
}
```

### 主表组件

```vue
<!-- MasterGrid.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useSparkComponent } from '@spark-view/spark-component'
import { PAGE_DATASET, DATA_SOURCE } from '@spark-view/spark-data'
import { SparkData } from '@spark-view/spark-data'
import type { SparkNode } from '@spark-view/spark-component'

interface MasterGridConfig extends SparkNode {
  dataKey: string
}

const props = defineProps<{ config: MasterGridConfig }>()
const { consume, provide, logger } = useSparkComponent(props.config)

const dataSet = consume(PAGE_DATASET)
const binding = SparkData.resolveDataKeyBinding(props.config.dataKey, dataSet)
const ds = binding?.kind === 'view' ? binding.source : null

// 向子组件提供数据源
if (ds) provide(DATA_SOURCE, ds)

const rows = computed(() => ds?.rows ?? [])

function onRowClick(row: any) {
  ds?.setCurrentRow(row)    // SelectionDelegate 处理，自动发射 stateChanged('currentRow')
  logger.info('currentRow changed', { id: row.id })
}
</script>
```

### 明细表组件

```vue
<!-- DetailGrid.vue -->
<!-- 级联由 DataSet relation 驱动（CascadeDelegate 自动订阅父表 stateChanged('currentRow')） -->
<!-- 无需手动订阅——只需在 DataSet.relations 中正确配置 dependencyType: 'currentRow' -->
<script setup lang="ts">
import { computed } from 'vue'
import { useSparkComponent } from '@spark-view/spark-component'
import { PAGE_DATASET } from '@spark-view/spark-component'
import { SparkData } from '@spark-view/spark-data'
import type { SparkNode } from '@spark-view/spark-component'

interface DetailGridConfig extends SparkNode {
  dataKey: string
}

const props = defineProps<{ config: DetailGridConfig }>()
const { consume } = useSparkComponent(props.config)

const dataSet = consume(PAGE_DATASET)
const binding = SparkData.resolveDataKeyBinding(props.config.dataKey, dataSet)
const ds = binding?.kind === 'view' ? binding.source : null

// 父表 currentRow 变化时 CascadeDelegate 自动触发 refresh()
const rows = computed(() => ds?.rows ?? [])
</script>
```

---

## 相关文档

- [数据管理指南](DATA_MANAGEMENT.md) — DataSet / DataView / CRUD / 主键生成器
- [数据加载与绑定](DATA_LOADING_AND_BINDING.md) — DataKey 解析、视图绑定
- [插件配置](PLUGIN_CONFIGURATION.md) — element-plus / vxe-table 集成
- [配置系统](CONFIG_SYSTEM.md) — 多租户与远程配置加载
- [测试最佳实践](TESTING_BEST_PRACTICES.md) — Vitest + @vue/test-utils 完整规范
- [快速开始](QUICKSTART.md) — 应用级初始化流程
