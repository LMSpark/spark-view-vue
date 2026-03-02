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
- **DataSet 生命周期**: `packages/spark-component/src/renderer/composables/usePageDataSet.ts`（仅存储 DataSet，不转换）
- **DataKey parser**: `packages/spark-data/src/core/data-key.ts`
- **Capability keys**: `packages/spark-utils/src/capability/symbols.ts` (APP_SERVICES, LOGGER 等), `packages/spark-component/src/capability-keys.ts` (PAGE_DATASET, DATA_SOURCE)
- **Tests**: `tests/` (重要: `capability-late-binding.test.ts`, `capability-system.test.ts`, `data-key.test.ts`)
- **Computed column tests**: `packages/spark-data/src/tests/computed-columns.test.ts`（13 sections, 214+ cases）
- **Expression compiler**: `packages/spark-data/src/strategies/computed-column-delegate.ts`

## Project conventions & patterns 📌

### 🎯 长期使命：配置驱动，零代码，降低门槛

SPARK 的核心设计目标是**让业务需求尽量通过配置表达，最大程度压缩 `script.js` 业务代码量**。

| 层次 | 目标 | 实现路径 |
|------|------|----------|
| **数据绑定** | 零代码连接数据源 | `dataKey` → DataView → UI 自动双向 |
| **派生字段** | 零代码计算列 | `computeExpression` 表达式列（纯配置） |
| **汇总聚合** | 零代码汇总行 | `aggregates` 视图级配置 |
| **父子级联** | 零代码联动 | `DataRelation` + 内存/API 自动路由 |
| **权限渲染** | 零代码权限控制 | `_perm` 快照驱动字段可见/可编辑 |
| **交互逻辑** | 最小化脚本量 | 仅事件响应/业务分支保留在 `script.js` |

**指导原则**：
- 优先通过 `rule.json` / `pagedata.json` 配置解决需求，配置无法表达时才写 `script.js`
- `script.js` 只写**业务分支逻辑**（条件判断、数据变换、UI 反馈），不写框架/数据管理样板代码
- 新增能力优先设计为**配置项**（而非命令式 API），降低使用门槛
- **减少配置噪音**：合理设定默认值，让最常见场景"零配置即可工作"
- 任何让 `script.js` 变得更短、或把样板代码移入框架的 PR，都符合本项目长期方向

- Component `type` 使用 **kebab-case**（如 `spark-ej2-grid`），通过 `Spark.register()` 注册（注册 API 详见 [Spark 命名空间 API](#spark-命名空间-api)）
- App 安装插件: `app.use(Spark.createPlugin())`，组件内使用 `useSparkComponent(config)` 获取 SPARK 上下文

### ❗ 单一 DataSet 框架（核心约束）

**所有页面数据必须且只能通过 DataSet 流转**，禁止在渲染层对原始 JSON 做归一化/类型判断。

```
pagedata.json (JSON 字符串)
  ↓ parsePageData()         ← spark-page-config：唯一转换点
  DataSet 实例
  ↓ initDataSet(ds)          ← usePageDataSet：仅存储，不转换
  ↓ provide(PAGE_DATASET, ds)
  ↓ DataKey 解析 → DataView → UI
```

- `PageDataConfig = DataSet`（不再联合 `Record<string, unknown>`）
- `usePageDataSet.initDataSet()` 只接受 `DataSet` 实例，不做任何归一化
- **`pageData` / `$data` 已删除**——所有数据必须通过 DataSet 流转，渲染层不再保留 `reactive({})` 旁路
- **禁止在任何新代码中对 `initDataSet` 添加字符串检测、元数据嵌套、版本缓存等多分支逻辑**

### usePageDataSet API

```typescript
// 选项
interface UsePageDataSetOptions {
  enableDataSet?: boolean  // 默认 true；false 时 initDataSet 无效（用于条件禁用）
}

// 返回值
interface UsePageDataSetReturn {
  readonly dataSet: DataSet | null  // 非响应式 getter，每次访问返回最新值
  initDataSet(ds: DataSet): void    // 写入实例；enableDataSet=false 时为空操作
  clearDataSet(): void              // 清空实例（onUnmounted 自动调用）
}

// 使用示例
const { dataSet, initDataSet } = usePageDataSet({ enableDataSet: true })
initDataSet(compiledDataSet)        // compiledDataSet 须来自 parsePageData()
provide(PAGE_DATASET, dataSet!)     // 向子组件暴露 DataSet
```

**实现说明**：`dataSet` 以闭包变量（`let dataSet: DataSet | null`）存储，**不** 包裹 Vue `ref`/`reactive`——DataSet 自身通过事件总线驱动 UI 更新，响应式包装反而会引入不必要的代理开销。

## useSparkComponent 返回值接口

```typescript
const {
  context,          // ComponentContext — 当前组件上下文（响应式）
  isVisible,        // ComputedRef<boolean> — 基于 config.visible
  isDisabled,       // ComputedRef<boolean> — 基于 config.disabled
  provide,          // (name, impl) => void — 写入 ctx.capabilities（SPARK 能力，非 Vue DI）
                    // 重载：provide<K extends keyof CapabilityTypeMap>(name: K, impl: CapabilityTypeMap[K])
  provideEvents,    // (name?) => IEventEmitter — 提供事件总线
  getProvider,      // (name) => unknown — 仅查找本组件 capabilities（不走 parent 链）
  consume,          // <T>(name) => T | null — 沿 parent 链向上查找能力
                    // 重载：consume<K extends keyof CapabilityTypeMap>(name: K): CapabilityTypeMap[K] | null
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

- `field` 可选值：`rows`、`currentRow`、`selectedRows`、`summaryRow`、`selectionSummaryRow`
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

### el-table rule.json 配置规范 📋

el-table 的常用 props 必须在 rule.json 中**显式声明**，框架不提供默认值：

| prop | 说明 | 默认 |
|------|------|------|
| `highlightCurrentRow` | **当前行高亮背景**（必须显式加才会生效） | 无（不高亮） |
| `stripe` | 斑马纹 | false |
| `border` | 边框 | false |

```json
{
  "type": "el-table",
  "dataKey": "DS@Orders@default@rows",
  "props": {
    "border": true,
    "stripe": true,
    "highlightCurrentRow": true
  }
}
```

> ⚠️ **常见漏洞**：父表加了 `highlightCurrentRow`，子表/孙表忘加 → 级联切换后子表无高亮。**每个**需要高亮的 el-table 都要单独声明。

## 页面脚本 (script.js) 沙箱规范 📜

`public/pages-config/**/script.js` 在 `with (__ctx)` 沙箱内执行，**可直接使用**以下注入变量：

| 变量 | 类型 | 说明 |
|------|------|------|
| `$api` | `IFormAPI \| null` | 表单操作（`getValue / setValue / hidden / disabled` 等），框架无关接口 |
| `$route` | `IPageRoute` | 当前路由快照（`path, params, query, name`），框架无关接口 |
| `$el` | `() => HTMLElement \| null` | 页面容器元素 |
| `$query` | `(sel) => HTMLElement \| null` | DOM 单元素查询 |
| `$queryAll` | `(sel) => NodeListOf<Element>` | DOM 多元素查询 |
| `$dataSet` | `IDataSet \| null` | **页面级 DataSet**（数据唯一入口） |
| `$rebindRules` | `() => void` | 触发 form-create **完整重建**规则（⚠️ **高危**：会折叠所有树节点、重置输入框、丢失滚动位置，尽量避免） |
| `$refreshData` | `(key?) => Promise<void>` | 刷新数据（可选指定表名） |
| `$page` | `IPageServiceCapability` | ✅ **推荐** UI 消息、确认、输入、导航（框架无关） |
| `SparkData` | SparkData 命名空间 | `createTreeManager` 等工具 |
| `h` | Vue `h` 函数 | 渲染函数专用（`Render*` 函数内使用） |

### ❗ 脚本禁止事项

| 禁止 | 原因 | 替代方案 |
|------|------|---------|
| `$data` | 已移除 | `$dataSet`（数据）/ `_pageState`（UI 状态） |
| `window.xxx = function` | 沙箱内变量无需挂 window | 直接用 `function xxx() {}` 声明 |
| `window.Vue` | `h` 已直接注入 | 直接用 `h(...)` |
| `ElMessage.xxx(...)` | **已从沙箱移除** | `$page.showMessage / showConfirm / showPrompt / showAlert` |
| `ElMessageBox.xxx(...)` | **已从沙箱移除** | `$page.showConfirm / showPrompt / showAlert` |
| Vue Router / FormCreate 直接 import | 沙箱不支持 ESM | `$route`（IPageRoute）/ `$api`（IFormAPI）已注入 |
| `import` 语句 | 沙箱不支持 ESM | 所有依赖通过沙箱注入 |
| `view.setCurrentRow(row)` 在 `currentChange` 回调中 | `injectTableEvents`（bindRules.ts）已在回调后通过 PK 查干净行并调用；回调里的 row 被 form-create 污染（含 `$f/api/rule` 属性），直接传入会触发 `[WARN] 行缺少主键` | 只写业务逻辑，DataView 同步由框架负责 |
| 在树节点事件（`onNodeClick` 等）内调用 `$rebindRules()` | 重建规则会折叠所有已展开节点，UX 破坏 | 用 `DataView.replaceRows()` + DOM 直写（见下方「避免 `$rebindRules()` 破坏树展开」）|

### UI 状态存储模式

脚本需要跨函数共享的 UI 状态（非 DataSet 数据）用**模块级闭包变量**代替原来的 `$data`：

```javascript
// ✅ 正确：模块顶部声明闭包状态
let _pageState = { currentUser: '', tableData: [], selectedNode: null }

function handleSelect(node) {
  _pageState.selectedNode = node     // 写入闭包变量
  $rebindRules()                     // 如果渲染函数读取该状态，需手动触发重绑
}

// 渲染函数通过 _pageState 读值（每次 $rebindRules() 时重新执行）
function RenderNodeInfo() {
  const node = _pageState.selectedNode
  return h('div', node?.name ?? '未选择')
}
```

> **注意**：`_pageState` 是普通 JS 对象，**不具备 Vue 响应式**。变更后若需 UI 刷新，
> 必须调用 `$rebindRules()`（form-create 重建规则），或通过 `$dataSet` 的 DataView
> 方法（如 `view.replaceRows()`）驱动——DataView 事件会自动更新订阅了该视图的组件，
> 无需 `$rebindRules()`。

### 避免 `$rebindRules()` 破坏树展开状态 🌲

**核心原则**：凡是页面包含 `r-tree` / el-tree，任何交互都**不得**调用 `$rebindRules()`，否则树节点全部折叠。用以下两种模式替代：

**模式 A — 纯 UI 状态（非 DataSet）→ DOM 直写**

适用于节点信息面板、统计数字等只读展示区域：

```javascript
// rule.json 中给容器加 id/class：
// { "type": "div", "class": "node-info", ... }

// script.js 中直接写 innerHTML，不触发 form-create 规则重建
function _flushNodeInfoDOM() {
  const container = $query('.node-info')   // 或 $query('#my-panel')
  if (!container) return
  const node = _pageState.selectedNode
  if (!node) {
    container.innerHTML = '<p style="color:#909399">请选择节点</p>'
    return
  }
  container.innerHTML = `<p>${node.name}（${node.type}）</p>`
}

function handleNodeClick(nodeData) {
  _pageState.selectedNode = nodeData
  _flushNodeInfoDOM()   // ✅ 不会触发树折叠
}
```

**模式 B — 树数据变更（增/删节点）→ DataView.replaceRows()**

r-tree 通过 DataKey 绑定到 `hierarchicalTreeData` 视图；修改树数据时重建嵌套结构写入 DataView，DataView 变更事件自动刷新树，展开状态由 el-tree 内部维护不受影响：

```javascript
// pagedata.json：声明空表（DataSet 须存在该表才能 getView）
// { "hierarchicalTreeData": [] }

// rule.json：r-tree 使用 DataKey，不要用裸字符串 dataSource
// { "type": "r-tree", "dataKey": "PageDataSet@hierarchicalTreeData@default@rows", ... }

// script.js __init__：初始化时写入
function __init__() {
  const nodes = /* 从 treeData 表读出的扁平节点 */ []
  treeManager = SparkData.createTreeManager({ idField: 'id', parentIdField: 'parentId', textField: 'name' }, nodes)
  const nestedTree = treeManager.buildNestedTree()
  $dataSet?.getView('hierarchicalTreeData', 'default')?.replaceRows(nestedTree)  // 驱动 r-tree
  // ❌ 绝不调用 $rebindRules()
}

// 添加/删除节点后同样用 replaceRows
function handleAddNode() {
  treeManager.addNodesToCache([newNode])
  const nestedTree = treeManager.buildNestedTree()
  $dataSet?.getView('hierarchicalTreeData', 'default')?.replaceRows(nestedTree)  // ✅ 树自动刷新，展开状态保留
}
```

**速查决策表**

| 场景 | 错误做法 | 正确做法 |
|------|---------|----------|
| 节点点击 → 更新右侧面板 | `$rebindRules()` | `_flushXxxDOM()` |
| 添加/删除节点 → 更新树 | `_pageState.xxx = tree; $rebindRules()` | `view.replaceRows(nestedTree)` |
| 子表数据联动 | `$rebindRules()` | `childView.replaceRows(rows)` |
| 渲染函数 `Render*` 初次渲染 | — | 正常，仅首次 form-create 构建时执行，之后靠 DOM 直写 |

### 数据访问模式

```javascript
// ✅ 读取行数据
const rows = $dataSet?.getView('Orders', 'default')?.rows

// ✅ 订阅数据变化（在 __init__ 中注册）
function __init__() {
  const view = $dataSet?.getView('Orders', 'default')
  view?.events.on('rowsChanged', () => {
    console.log(`行数: ${view.rows.length}`)
  })
}

// ✅ 操作数据（无需 $rebindRules）
$dataSet?.getView('Items', 'default')?.replaceRows(newRows)
```

### ❗ 加载事件守卫（内联数据表）

`dataSet.on('loadSuccess')` / `dataSet.on('loadError')` 只会被**有 `api.list` 配置的表**触发。内联数据表和内存级联表**不触发**这两个事件。

```javascript
dataSet.on('loadSuccess', ({ tableName }) => {
  const table = dataSet.getTable(tableName)
  if (!table?.api?.list) return  // 内联数据表跳过
  $page.showMessage(`✅ ${tableName} 加载完成`, 'success')
})
```

### 内存级联（无 API 子表）

当 `DataRelation` 配置了父子关系，但子表**没有 `api` 配置**时，框架自动走内存过滤路径（`applyInMemoryCascade`）：

- 从 `DataTable.rows`（`pagedata.json` 内联静态行）过滤 → 写入 `DataView.rows`（UI 绑定）
- **不**发起网络请求，**不**触发 `loadSuccess`/`loadError`
- 父行切换时自动重新过滤，脚本无需手动触发
- `DataTable.rows`（源数据，级联每次从此过滤）与 `DataView.rows`（当前显示结果，UI 绑定）职责不同

```jsonc
// pagedata.json 配置示例
{
  "dataSetName": "DS",
  "tables": {
    "Orders":     { "rows": [...] },
    "OrderItems": { "rows": [...] }
  },
  "relations": [
    { "parentTable": "Orders", "childTable": "OrderItems",
      "parentField": "id", "childField": "orderId" }
  ]
}
```

### 🚧 script-api（长期规划任务）

`script.js` 沙箱当前通过 `__ctx` 直接注入变量（见上表）。**`script-api`** 是规划中的长期架构任务，旨在将所有沙箱注入变量规范化为类型化接口，提供自动补全、类型检查与版本兼容性保障。

- ⚠️ **当前阶段不实现**：任何以 `script-api` 命名的接口、类或模块均属未来规划，**禁止**在功能开发中以 `script-api` 作为实现依据
- 现阶段脚本对接唯一规范来源是本文档的**沙箱注入变量表** + **禁止事项表**
- 待 script-api 正式立项后，本节将替换为具体接口定义与迁移指南

## 权限架构（统一后端验证 + 前端权限渲染）🔐

SPARK 采用 **统一后端验证** 架构，前端 **不做** 权限判定，仅负责根据服务端下发的权限数据自动渲染 UI。

**核心流程**：
1. 前端从服务端取数据时，响应中携带 **数据权限快照**（`IModelPermission` / `IInstancePermission`）+ **权限 Token**
2. 前端将权限快照存储在 `IDataRow._perm`（行级）和 `IDataSource._modelPerm`（表级）
3. `permission/` 模块根据权限快照自动计算字段可见性、可编辑性、脱敏规则，驱动 UI 渲染
4. 数据回写时将权限 Token 回传服务端，服务端验证 Token 有效性（防篡改）

**模块组成**（`packages/spark-data/src/permission/`）：
- `PermissionChecker` — 模型级 / 实例级 / 字段级权限检查 + 字段脱敏（手机/身份证/邮箱/银行卡）
- `PermissionFilter` — 批量行过滤（可删除行/可编辑行/可见字段）+ 批量脱敏
- `FieldRenderHelper` — 结合字段配置 + 权限快照计算渲染状态（visible/editable/masked）

**⚠️ 重要**：`permission/` 模块当前未被业务代码消费，但属于 **已规划的核心架构**，后续开发会接入。**禁止删除或标记为死代码**。

```typescript
// 权限类型定义见 types.ts
interface IInstancePermission {   // 行级 — 存储在 row._perm
  allowDelete?: boolean
  editableFields?: string[]
  hiddenFields?: string[]
  maskedFields?: string[]
  permissionToken?: string        // 回传服务端校验
}
interface IModelPermission {      // 表级 — 存储在 dataSource._modelPerm
  allowCreate?: boolean
  allowImport?: boolean
  allowExport?: boolean
  permissionToken?: string
}
```

## 能力体系 🔧

### DI 双轨（严格区分）

| 机制 | 实现 | 用途 |
|------|------|------|
| **SPARK 能力系统** | `ctx.capabilities` Map + `lookup()` 走 parent 链 | 所有业务能力 |
| **Vue DI（仅基础设施）** | `app.provide()` / `inject()` | 仅 `SPARK_REGISTRY_KEY`（注册表）+ `SPARK_PARENT_CONTEXT_KEY`（根上下文） |

**重要**：`useSparkComponent` 的 `provide()` / `consume()` 是 **SPARK 能力系统**，不是 Vue 的 `provide/inject`。

### 能力键类型扩展（CapabilityTypeMap）

能力键支持两种形式：
- **Symbol 键**（向后兼容）：`import { DATA_SOURCE } from '@spark-view/spark-component'`
- **字符串键**（可扩展）：`consume('spark:capability:page-dataset')` — 通过 `CapabilityTypeMap` 声明合并提供类型推断

`normalizeKey(name)` 内部将字符串转换为 `Symbol.for(name)`，与 Symbol 键等价。扩展自定义能力键的完整示例见下方「[新增自定义能力 → 方式二](#新增自定义能力)」。

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
| `PAGE_DATASET` | spark-component | `IDataSet` | 页面级 DataSet（PageRenderer provide） |
| `DATA_SOURCE` | spark-component | `IDataSource` | 组件级数据视图（容器组件 provide，DataView 实现此接口） |

### IDataSource 接口（UI 消费契约）

```typescript
interface IDataSource {
  rows?: IDataRow[]              // 当前视图数据行
  currentRow?: IDataRow | null   // 当前聚焦行（UI 高亮 / 级联父行）
  selectedRows?: IDataRow[]      // 当前选中行集合（勾选行 / 级联选中行）
  page?: number                  // 当前页码
  pageSize?: number              // 每页行数
  total?: number                 // 总行数
  summaryRow?: Readonly<IDataRow>          // 全部行聚合汇总（view.aggregates 驱动）
  selectionSummaryRow?: Readonly<IDataRow> // 选中行聚合汇总
  _modelPerm?: IModelPermission  // 模型级权限快照
}
```

> `DataView` 实现 `IDataSource`，通过 `DATA_SOURCE` 能力键向子组件暴露。
> `getParentRows()` / `CascadeDelegate` 等内部机制也依赖此接口，不直接依赖 `DataView` 类型。

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

**方式一：Symbol 键（适合跨包共享）**
```typescript
// 用 defineCapability 创建具名 symbol
import { defineCapability } from '@spark-view/spark-utils'
export const MY_CAP = defineCapability<{ doSomething(): void }>('app:my-capability')

const { provide } = useSparkComponent(props.config)
provide(MY_CAP, { doSomething() { ... } })

const { consume } = useSparkComponent(props.config)
const cap = consume(MY_CAP)  // { doSomething(): void } | null
```

**方式二：字符串键 + CapabilityTypeMap（推荐，可扩展）**
```typescript
// src/components/capability-keys.ts
import type { MyServiceCapability } from './types'

declare module '@spark-view/spark-utils' {
  interface CapabilityTypeMap {
    'app:my-service': MyServiceCapability
  }
}

// 直接用字符串，类型从 CapabilityTypeMap 自动推断
provide('app:my-service', myImpl)   // impl 类型必须匹配 MyServiceCapability
const cap = consume('app:my-service') // MyServiceCapability | null
```

## 计算列 & 聚合（配置驱动，零代码）📊

所有计算逻辑均通过 **列配置** 声明，无需编写组件/脚本代码。

### 计算列（`DataColumn.computeExpression`）

在 `pagedata.json` 列定义中设置 `computeExpression`，编译归 DataTable，求值归 DataView（行操作自动触发）。

**表达式沙箱**——行字段直接引用（`with` 自动解构），还可用 `ctx` 外部上下文：
```jsonc
// 简单算术
{ "name": "total", "type": "number", "computeExpression": "price * qty" }
// 字符串拼接
{ "name": "fullName", "computeExpression": "firstName + ' ' + lastName" }
// ctx 上下文（运行时通过 view.setComputedContext({ taxRate: 0.1 }) 注入）
{ "name": "tax", "type": "number", "computeExpression": "amount * ctx.taxRate" }
// 多语句函数体（含 return）
{ "name": "grade", "computeExpression": "if (score >= 90) return 'A'; if (score >= 60) return 'B'; return 'C';" }
```

**子表聚合函数**（需配置 `DataRelation`）：
```jsonc
"$sum('Items', 'amount')"          // 子行求和
"$count('Items')"                  // 子行计数
"$avg('Items', 'score')"           // 子行均值
"$min('Items', 'price')"           // 子行最小
"$max('Items', 'price')"           // 子行最大
"$list('Items', 'name')"           // 子行字段数组
"$join('Items', 'name', ' | ')"    // 子行字段拼接（默认 ', '）
```

### 视图级聚合（`IViewMetadata.aggregates`）

在视图配置中声明 `aggregates` 即可自动维护 `summaryRow`（全部行）和 `selectionSummaryRow`（选中行）。

**AggregateType**: `'sum' | 'count' | 'avg' | 'min' | 'max' | 'join'`

```jsonc
// pagedata.json 视图配置（IViewMetadata / views.default）
{
  "aggregates": {
    "price":    { "type": "sum" },
    "score":    { "type": "avg" },
    "customer": { "type": "join" },
    "total":    { "type": "sum", "field": "total" }
  }
}
```

> **注意**：聚合通过 `IViewMetadata.aggregates` 配置，而非 `DataColumn` 上的属性。
> 列定义只负责 `computeExpression`（逐行计算），聚合是视图层整列汇总，两者职责分离。

**零代码绑定**：UI 通过 DataKey 直接绑定到聚合行：
```jsonc
{ "dataKey": "OrderDS@Orders@default@summaryRow" }          // 全部行聚合
{ "dataKey": "OrderDS@Orders@default@selectionSummaryRow" } // 选中行聚合
```

**自动重算触发点**：`appendRow`、`updateRowById`、`deleteRowById`、`replaceRows`、`updateFromServer`、`setComputedContext`、`recomputeColumns`、选中行变更（`setSelectedRows` / `clearSelectedRows`）。

### 关键文件
- 表达式编译器：`packages/spark-data/src/strategies/computed-column-delegate.ts`
- DataView 聚合：`packages/spark-data/src/data-view.ts`（`_recomputeSummary` / `_recomputeSelectionSummary`）
- 测试：`packages/spark-data/src/tests/computed-columns.test.ts`（13 个 section，226+ cases）

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
│       ├── capability-keys.ts # PAGE_DATASET, DATA_SOURCE（数据能力键）
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
│       ├── spark-data.ts     # SparkData 命名空间（推荐 API）
│       ├── dataset.ts        # DataSet（事件驱动协调器）
│       ├── data-table.ts     # DataTable
│       ├── data-view.ts      # DataView（IDataSource 实现）
│       ├── tree-manager.ts   # TreeManager
│       └── permission/       # 权限渲染（⚠️ 已规划，禁止删除）
│           ├── PermissionChecker.ts  # 行级/字段级权限检查 + 脱敏
│           ├── PermissionFilter.ts   # 批量行过滤 + 批量脱敏
│           └── FieldRenderHelper.ts  # 字段渲染状态计算
├── spark-page-config/   # 页面配置加载器（ConfigLoader, SparkPageConfig）
└── spark-utils/         # 共享基础设施
    └── src/
        ├── capability/symbols.ts  # 所有能力键定义 + provide/lookup/defineCapability
        ├── logger.ts              # Logger 工厂
        ├── http/                  # Request, FileLoader
        └── lazy-loader.ts        # useSyncfusionLoader, useLazyLoader
```

### 包依赖规则（禁止循环依赖）

依赖方向严格**单向向上**，下层包**禁止**反向依赖上层包：

```
spark-utils          ← 零依赖（基础设施底层，纯 TS）
    ↑
spark-data           ← 仅依赖 spark-utils（纯 TS）
    ↑
spark-page-config    ← 仅依赖 spark-data + spark-utils（纯 TS）
    ↑
spark-component      ← 依赖 spark-data + spark-page-config + spark-utils
                        （+ Vue / Element Plus peerDeps）
    ↑
spark-app            ← 依赖 spark-component + spark-page-config + spark-utils
                        （+ Vue / vue-router peerDeps）
    ↑
主项目 src/          ← 可依赖所有包；features/ / public/pages-config/ 仅供主项目消费
```

**禁止的反向依赖**：
- `spark-utils` 禁止 import `spark-data` / `spark-component` / `spark-app`
- `spark-data` 禁止 import `spark-component` / `spark-app`
- `spark-page-config` 禁止 import `spark-component` / `spark-app`
- `spark-component` 禁止 import `spark-app`
- 任何包禁止 import 主项目 `src/` 路径
- 违反上述规则将引入循环依赖，导致构建失败或运行时初始化顺序错误

**禁止跨包相对路径引用**：包内代码只能通过**包名**引用其他包，禁止使用相对路径穿越 `packages/` 边界：
```typescript
// ✅ 正确：通过包名引用
import { DataSet } from '@spark-view/spark-data'
import { APP_SERVICES } from '@spark-view/spark-utils'

// ❌ 错误：相对路径跨包
import { DataSet } from '../../spark-data/src/dataset'
import { APP_SERVICES } from '../../../spark-utils/src/capability/symbols'
```
相对路径跨包引用会绕过 pnpm workspace 解析，破坏 dist 构建的类型声明链，导致发布后消费方出现类型错误。

### ⚠️ 框架隔离约束（纯 JS 包）

**`spark-utils`、`spark-data`、`spark-page-config`** 三个包**零前端框架依赖**（Vue / React / Element Plus 等均不引入），属于纯 TypeScript/JavaScript 库：

- **禁止**在这三个包中 `import` 任何 Vue composable、Vue 响应式 API（`ref / reactive / computed`）、Vue 组件或任何 UI 框架模块
- **禁止**将 `vue`、`vue-router`、`element-plus`、`@form-create/*` 加入这三个包的 `dependencies` 或 `peerDependencies`
- 如需在 `spark-data` 中注入框架响应式（如 `reactive()`），必须通过**静态钩子**（`DataView.wrapInstance`）由外部框架层注入，不能在包内直接 import Vue
- 违反此约束将污染依赖图，导致下游 SSR / 非 Vue 环境无法使用这三个包

框架依赖只允许存在于 `spark-component`（peerDep: vue, element-plus 等）和 `spark-app`（peerDep: vue, vue-router）。

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

// DataKey 绑定解析（渲染层）
const binding = SparkData.resolveDataKeyBinding('MyData@Users@rows', dataSet)
if (binding?.kind === 'view') { /* binding.source: IDataSource */ }

// summaryRow / selectionSummaryRow 绑定
const summaryBinding = SparkData.resolveDataKeyBinding('MyData@Users@summaryRow', dataSet)
if (summaryBinding?.kind === 'value') { /* summaryBinding.value: IDataRow */ }
```

**计算列 & 聚合（纯配置零代码）**
```ts
const ds = SparkData.createDataSet({
  dataSetName: 'OrderDS',
  tables: {
    Orders: {
      tableName: 'Orders',
      columns: [
        { name: 'price', type: 'number' },
        { name: 'qty', type: 'number' },
        { name: 'total', type: 'number', computeExpression: 'price * qty' },
      ],
      // 视图级聚合配置（IViewMetadata.aggregates）
      aggregates: {
        price: { type: 'sum' },
        total: { type: 'sum' },
      },
      rows: [...],
    },
  },
})

// 自动可用
ds.getView('Orders', 'default')!.summaryRow           // { price: 总和, total: 总和 }
ds.getView('Orders', 'default')!.selectionSummaryRow  // 仅选中行的聚合
```

**树结构（CrudApi extends TreeApi）**
```ts
// DataTable 层：CRUD + 树端点全部平铺在同一个 api 对象（无需 wrapper）
table.setApi({
  list:         { url: '/api/users',              method: 'GET' },
  create:       { url: '/api/users',              method: 'POST' },
  // 树端点直接平铺（来自 TreeApi 继承）
  children:     { url: '/api/tree/children',      method: 'GET' },
  path:         { url: '/api/tree/path',          method: 'GET' },
  subtree:      { url: '/api/tree/subtree',       method: 'GET' },
  nestedSearch: { url: '/api/tree/nested/search', method: 'GET' },
})

// DataView 层：字段映射 + 视图模式（treeMode 存在 treeConfig 内）
view.treeConfig = {
  idField: 'id', parentIdField: 'parentId', textField: 'name',
  treeMode: 'nested'   // 'flat'（默认）| 'nested'
}
// 或通过工厂方法创建时传入
const treeView = SparkData.createDataView({
  tableName: 'Users', viewId: 'tree',
  treeConfig: { idField: 'id', parentIdField: 'parentId', treeMode: 'flat' }
})

// DataView 委托给 TreeManager 的 4 个树方法（懒初始化，自动使用 table.api 的树端点）
await view.loadTreeChildren(null)           // 根节点
await view.loadTreeChildren('node-1')       // 子节点
await view.expandTreeToNode('node-123')     // 差量补齐路径
await view.loadTreePath('node-123')         // 获取祖先链
const results = await view.searchTreeNested('关键词')

// 独立使用 TreeManager（不依赖 DataView）
const treeManager = SparkData.createTreeManager(
  { idField: 'id', parentIdField: 'parentId', textField: 'name', treeMode: 'nested' },
  initialNodes  // 可选：初始节点写入缓存
)
// 本地内存操作（不需要 api）
treeManager.getNode('id-1')
treeManager.getRoots()
treeManager.buildNestedTree()
treeManager.searchNodes('关键词')
```

**TreeManager HTTP 方法 vs 本地方法**
- `fetchChildren / fetchPath / expandToNode / fetchNestedSearch` — 需配置 `api`，调用远端并写缓存
- `getNode / getChildren / getRoots / searchNodes / buildNestedTree / buildSubTree` — 纯内存操作，无需 `api`

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
- ⚠️ **`tsconfig.build.json` 注意**：每个子包的 `tsconfig.build.json` 中 `"paths"` 必须保留依赖包的 dist 路径别名（不能设为 `{}`），否则 `tsc` 无法追踪 pnpm 软链中的 `.js` 重导出链，导致编译时找不到新增导出成员（如 `normalizeKey`、`CapabilityTypeMap`）
- ⚠️ **`PageContext`（renderer/types/index.ts）类型写法**：`SparkData` 是命名空间导出（`export namespace`），**不能直接当类型用**。必须用 `typeof` 和顶层 import alias：
  ```typescript
  import type { h as VueH } from 'vue'
  import type { SparkData } from '@spark-view/spark-data'
  // PageContext 内字段：
  SparkData: typeof SparkData
  h: typeof VueH
  ```

## Performance notes ⚡
- **`spark-data` 无框架依赖**——DataView 通过 `DataView.wrapInstance` 静态钩子让框架层注入包装（SparkPlugin 中设为 `reactive()`）
- `useSparkComponent` 使用 `shallowReactive`（顶层响应式）+ `markRaw(capabilities)`、`markRaw(children)`，大幅减少 Vue 响应系统开销
- logger 解析带缓存（`_loggerCache`），`provide(LOGGER/APP_SERVICES, ...)` 时自动失效
- 组件 ID 使用全局单调计数器（`spark-${++_idCounter}`），比 `Date.now()+random` 更快且 SSR 友好
- `getAll()` 直接返回内部 Map 引用（`ReadonlyMap`）：O(1)，无拷贝
- `SparkComponentRenderer` 不再调用 `useSparkComponent()`，直接 `inject(SPARK_REGISTRY_KEY)`，消除渲染器中间 context 节点（上下文链：`root → business`，而非 `root → renderer → business`）
- 调试日志全部包裹在 `import.meta.env.DEV` 守卫内，生产包无调试输出
