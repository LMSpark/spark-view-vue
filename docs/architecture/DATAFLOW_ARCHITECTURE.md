# SPARK 数据流架构

> 本文档基于实际源码描述 SPARK 从应用启动到 UI 渲染的完整数据流。

## 核心层级

```
App / main.ts
  ↓  app.use(Spark.createPlugin())
SparkPlugin
  ↓  Vue DI: SPARK_REGISTRY_KEY, internal root capability context
PageRenderer (SparkPageRenderer + useRendererSetup)
  ↓  sparkProvide(APP_SERVICES, ...)    SPARK 能力系统
  ↓  sparkProvide(PAGE_DATASET, ...)
Table容器 (e.g. r-table)
  ↓  sparkConsume(PAGE_DATASET) → DataSet
  ↓  resolveDataViewKey(config.dataViewKey, dataSet) → DataView
  ↓  sparkProvide(DATA_SOURCE, dataView)
  ↓  sparkProvide(SELECTION, ...)
Row组件 (e.g. r-row)
  ↓  sparkConsume(DATA_SOURCE) → DataView
  ↓  sparkConsume(SELECTION) → 选择状态
```

---

## 1. 应用启动（SparkPlugin）

```typescript
// main.ts
import { Spark } from '@spark-view/spark-component'
import App from './App.vue'

const app = createApp(App)
app.use(Spark.createPlugin())    // 唯一 Vue 插件，极简，只做 DI
app.mount('#app')
```

`SparkPlugin.install()` 只做两件事（见 `packages/spark-component/src/plugin.ts`）：

| 操作 | 机制 | 内容 |
|------|------|------|
| `app.provide(SPARK_REGISTRY_KEY, registry)` | Vue DI | 组件注册表（全局单例）|
| `sparkBindContextOwner(owner, context)` / `sparkBindPageRootContext(pageRoot, context)` | 运行时锚点表 | owner 链 + pageRoot DOM 锚点（WeakMap）|

> **注意**：`SparkPlugin` 不提供任何业务能力（如路由、logger）。根上下文通过运行时实例锚点表（非 Vue provide/inject）向子组件传递。这些由应用层的 `PageRenderer` 填充。

---

## 2. 组件注册

```typescript
import { defineAsyncComponent } from 'vue'
import { Spark } from '@spark-view/spark-component'

// 单个注册（同步）
Spark.register('my-grid', MyGrid)

// 单个注册（懒加载，推荐生产环境）
Spark.register('my-grid', defineAsyncComponent(() => import('./MyGrid.vue')))

// 批量注册
Spark.registerAll({
  'r-table': RendererTable,
  'r-form': RendererForm,
})
```

---

## 3. 页面渲染层（PageRenderer）

`PageRenderer` 通过 `useRendererSetup` composable 完成页面级协调
（见 `packages/spark-component/src/page/useRendererSetup.ts`）：

```typescript
// SparkPageRenderer 内部（简化）
const { provideCapability } = useRendererSetup('page-renderer', pageLogger)

// 1. 注入应用服务（路由、logger、租户等）
provideCapability(APP_SERVICES, buildAppServices(router, pageLogger))

// 2. 加载页面配置并创建 DataSet
const dataSet = SparkData.createDataSet(pageConfig.dataset)

// 3. 向下提供 PAGE_DATASET
provideCapability(PAGE_DATASET, dataSet)
```

所有子组件都可通过 `sparkConsume(APP_SERVICES)` 和 `sparkConsume(PAGE_DATASET)` 获取这两个关键能力。

---

## 4. 数据层（DataSet / DataTable / DataView）

### 架构图

```
DataSet（数据空间协调器）
  ├── DataTable（表，含列定义和原始数据）
  │   ├── DataView "default"        ← 每表至少一个 DataView
  │   ├── DataView "grid"
  │   └── DataView "form"
  └── tableRelations + viewDependencies ← 表关系 + 父子表 default 视图联动协议
```

**引用链**（单向，子持有父引用）：
```
DataView → DataTable → DataSet
```
DataSet 不持有 DataView 引用，不直接操控 DataView 状态。

### DataViewKey 数据视图键

DataViewKey 只负责定位 DataView，不包含成员名或业务字段。

统一格式（无 scope，SPA 单 DataSet）：`tableName@viewId`
跨 scope 格式：`#scope@tableName@viewId`

```typescript
// DataViewKey：容器定位 DataView
'Users@grid'
// 读取 DataView 输出时额外声明 dataMember 和 dataField
{ dataViewKey: 'Users@grid', dataMember: 'currentRow', dataField: 'name' }
```

| 段 | 含义 | 示例 |
|----|------|------|
| `scope` | 可选 DataSet scope | `#Shared` |
| `tableName` | DataTable 的键名 | `Users` |
| `viewId` | DataView 的 viewId | `grid`、`default` |

```typescript
import { DataMember, SparkData } from '@spark-view/spark-data'

// 容器解析 DataView
const dataView = SparkData.resolveDataViewKey('Users@grid', dataSet)

// 展示/动作读取 DataView 成员
const binding = SparkData.resolveDataViewMemberBinding({
  dataViewKey: 'Users@grid',
  dataMember: DataMember.Rows,
}, dataSet)
const rows = binding?.value ?? []

// 构建
const key = SparkData.buildDataViewKey('Users', 'grid')
// → 'Users@grid'
```

### DataView 请求状态机

```
Idle ──requestData()──▶ Preparing ──loadFromServer()──▶ Loading
                                                               │
                                               ┌──────────────┴──────────────┐
                                             Loaded                        Failed
```

`requestData()` 的调用是**幂等**的：当 `requestState !== Idle` 时直接返回，无需额外保护。

### 级联加载

子视图订阅父视图的领域事件（子依赖父，父不知子）：

```typescript
// DataView 内部（setupCascade）
parentView.events.on('currentRowChanged', () => this.requestData())
parentView.events.on('rowsChanged', () => this.requestData())
```

---

## 5. 表容器（Table Container）

表容器组件（如 `RendererTable`）建立数据层与 UI 层的桥接：

```typescript
// RendererTable.vue setup（简化）
const { sparkConsume, sparkProvide } = useSparkComponent(props.config)

// 消费页面级 DataSet
const dataSet = sparkConsume(PAGE_DATASET)

// 解析 dataViewKey → DataView
const dataView = SparkData.resolveDataViewKey(props.config.dataViewKey, dataSet)

// 向子组件提供数据源和选择能力
sparkProvide(DATA_SOURCE, dataView)
sparkProvide(SELECTION, {
  getSelected: () => dataView?.selectedRows ?? [],
  setSelected: (rows) => { if (dataView) dataView.selectedRows = rows }
})
```

---

## 6. 能力传递链

所有能力通过 **SPARK 能力系统**（基于 `SparkCapabilityContext.capabilities` Map + 向上查找链）传递，而非 Vue DI。

```
rootContext (SparkPlugin 创建)
  capabilities = Map { }     ← 空，应用服务由 PageRenderer 填充
    ↓
PageRenderer context
  capabilities = Map {
    APP_SERVICES → { router, logger }
    PAGE_DATASET → DataSet
  }
    ↓
r-table context
  capabilities = Map {
    DATA_SOURCE  → DataView
    SELECTION    → { getSelected, setSelected }
  }
    ↓
r-row 或 r-cell context
  capabilities = Map { }      ← 叶节点，向上 lookup
```

`sparkConsume(KEY)` 沿 `parent` 链向上查找，直到根节点。返回 `null` 是正常情况（延迟绑定），不是错误。

---

## 7. 能力键一览

| 键 | 定义包 | 类型 | 提供者 | 消费者 |
|---|---|---|---|---|
| `APP_SERVICES` | `spark-component` | `IAppServicesCapability` | PageRenderer | 任意业务组件 |
| `PAGE_SERVICE` | `spark-component` | `IPageServiceCapability` | — | — |
| `PAGE_DATASET` | `spark-component` | `IDataSet` | PageRenderer | 表容器 |
| `DATA_SOURCE` | `spark-component` | `IDataSource` | 表容器 | 行/单元格 |

> `useSparkComponent` 返回的 `logger` 统一来自页面层 `APP_SERVICES.logger`；未提供时回退到 `console`。

---

## 8. Logger 体系

```typescript
import { APP_SERVICES } from '@spark-view/spark-component'

// 应用层统一 logger（PageRenderer 已自动注入）
sparkProvide(APP_SERVICES, { logger: appLogger, router })
```

每个组件调用 `logger.info()` 时，`useSparkComponent` 内部的代理只解析页面层 `APP_SERVICES.logger`，无需手动消费。

---

## 9. Vue DI vs SPARK 能力系统

| 机制 | 实现 | 用途 |
|------|------|------|
| **SPARK 能力系统** | `ctx.capabilities` Map + `lookup()` 向上查找 | 所有业务能力 |
| **Vue DI（仅基础设施）** | `app.provide()` / `inject()` | 仅 `SPARK_REGISTRY_KEY`（注册表）和内部根能力上下文 |

`useSparkComponent` 的 `sparkProvide()` / `sparkConsume()` 是 SPARK 能力系统，**不是** Vue 的 `provide/inject`。

---

## 10. 数据加载完整时序

```mermaid
sequenceDiagram
  participant App as main.ts
  participant Page as PageRenderer
  participant DS as DataSet
  participant DV as DataView

  App->>Page: 路由导航
  Page->>Page: loadPageConfig()
  Page->>DS: SparkData.createDataSet(config.dataset)
  Page->>Page: sparkProvide(PAGE_DATASET, dataSet)
  Page->>DV: dataView.requestData()
  DV->>DV: requestState = Preparing
  DV->>DV: loadFromServer()
  DV->>DV: requestState = Loading
  Note over DV: 向后端发起请求
  DV-->>DV: rows = responseData
  DV->>DV: requestState = Loaded
  DV->>DV: emit rowsChanged/requestStateChanged
  Note over DV: 级联子视图自动更新
```
