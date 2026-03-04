# SPARK Component System - AI Coding Agent Instructions

Purpose: Quick, actionable guidance to make an AI coding agent productive in this mono-repo.

## Quick facts ✅
- Dev: `pnpm run dev` (Vite, port 5173)
- Build: `pnpm run build` (仅 `vite build`); `pnpm run build:check` (含 `vue-tsc` + `vite build`)
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
- **Renderer containers**: `src/components/renderer-containers/` — RendererTable / RendererForm / RendererDetail（DataView-first 容器）
- **Renderer capability keys**: `src/components/capability-keys.ts`（FIELD_CONTEXT, CONTEXT_DATA）
- **bindRules（规则绑定引擎）**: `packages/spark-component/src/renderer/utils/bindRules.ts`
- **SparkComponentRenderer**: `packages/spark-component/src/renderer/spark/SparkComponentRenderer.vue`
- **Key composable**: `packages/spark-component/src/composables/useSparkComponent.ts`
- **DataSet 生命周期**: `packages/spark-component/src/renderer/composables/usePageDataSet.ts`（仅存储 DataSet，不转换）
- **DataKey parser**: `packages/spark-data/src/core/data-key.ts`
- **Capability keys**: `packages/spark-utils/src/capability/symbols.ts` (APP_SERVICES, LOGGER 等), `packages/spark-component/src/capability-keys.ts` (PAGE_DATASET, DATA_SOURCE)
- **Tests**: `tests/` (重要: `capability-late-binding.test.ts`, `capability-system.test.ts`, `data-key.test.ts`)
- **Computed column tests**: `packages/spark-data/src/tests/computed-columns.test.ts`（13 sections, 87 cases）
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
  DataSet 实例               ← ⚠️ 被 FileLoader memCache 缓存，同 pageId 复用同一实例
  ↓ initDataSet(ds)          ← usePageDataSet：仅存储引用，不转换，不 destroy
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
  clearDataSet(): void              // 仅释放引用（onUnmounted 自动调用）⚠️ 不调用 destroy()
}

// 使用示例
const { dataSet, initDataSet } = usePageDataSet({ enableDataSet: true })
initDataSet(compiledDataSet)        // compiledDataSet 须来自 parsePageData()
provide(PAGE_DATASET, dataSet!)     // 向子组件暴露 DataSet
```

**实现说明**：`dataSet` 以闭包变量（`let dataSet: DataSet | null`）存储，**不** 包裹 Vue `ref`/`reactive`——DataSet 自身通过事件总线驱动 UI 更新，响应式包装反而会引入不必要的代理开销。

> **⚠️ 缓存所有权约束（禁止在 clearDataSet 中调用 destroy）**
>
> DataSet 实例由 `PageConfigLoader` 的 `FileLoader.withTransform(parsePageData)` 创建并缓存于 **memCache**（内存级，`fileName:transform` 键）。同一 `pageId` 的多次进入共享同一个 DataSet 对象。
>
> `clearDataSet()` **仅释放引用**（`dataSet = null`），**禁止调用 `DataSet.destroy()`**。
> 若调用 destroy，所有 DataView 被销毁、事件清空；下次导航回同一页面时 memCache 返回已销毁的 DataSet，导致表格无数据。
>
> DataSet 的真正销毁由缓存策略（`FileLoader.clearCache()`）或页面刷新触发。

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
统一格式（`@` 分隔符，无 scope 前缀，SPA 单 DataSet）：`{tableName}@{viewId}@{field}`

| 段数 | 格式 | 示例 |
|------|------|------|
| 2 段 | `table@field`（viewId 默认 `default`） | `Users@rows` |
| 3 段 | `table@viewId@field` | `Users@grid@rows` |

**跨页面共享数据**（`#scope` 前缀，显式指定 DataSet scope）：

| 段数 | 格式 | 示例 |
|------|------|------|
| `#scope` + 2 段 | `#scope@table@field` | `#SharedDS@Orders@rows` |
| `#scope` + 3 段 | `#scope@table@viewId@field` | `#SharedDS@Orders@grid@rows` |

- `field` 可选值：`rows`、`currentRow`、`selectedRows`、`summaryRow`、`selectionSummaryRow`
- 支持字段路径：`table@field.path`（如 `stats@currentRow.totalUsers`）
- `#scope` 用于跨页面引用其他 DataSet 的数据，`parseDataKey` 返回 `{ scope, crossPage: true }`
- ⚠️ 旧 4 段格式 `scope@table@viewId@field` 仍可解析（向后兼容，scope 保留在描述符中）
- ⚠️ 旧点号格式 `dataset.tables.X.rows` **已移除**，不再支持
- API（`packages/spark-data/src/core/data-key.ts`）：
  - `isDataKey(key)` — 格式校验
  - `parseDataKey(key)` — 解析为 `DataKeyDescriptor`
  - `resolveDataKey(descriptor, dataSet)` — 解析数据值
  - `resolveDataKeyBinding(key, dataSet)` — 返回 `DataKeyBinding` 判别联合（渲染层首选）
  - `buildDataKey(table, field, viewId?, scope?)` — 构建 key 字符串（传 scope 时输出 `#scope@...`）
  - `normalizeDataKey(rawKey)` — 将旧 4 段格式剥离 scope → 新格式；`#scope` 原样保留

```json
// rule.json 示例
{ "dataKey": "Users@rows" }
{ "dataKey": "stats@currentRow.totalUsers" }
{ "dataKey": "Users@grid@rows" }
{ "dataKey": "#SharedDS@Orders@rows" }
```

### 跨页面 `#scope` 共享数据

当页面需要访问其他 DataSet 的数据时，使用 `#scope` 前缀显式指定目标 scope：

```jsonc
// ✅ 页面内数据（99% 场景，无 scope）
{ "type": "el-table",  "dataKey": "Users@rows" }
{ "type": "el-table",  "dataKey": "Orders@rows" }

// ✅ 跨页面共享数据（#scope 前缀）
{ "type": "el-table",  "dataKey": "#SharedDS@GlobalUsers@rows" }
```

`parseDataKey('#SharedDS@Orders@rows')` 返回：
```typescript
{
  scope: 'SharedDS',
  tableName: 'Orders',
  viewId: 'default',
  field: 'rows',
  crossPage: true,
  raw: '#SharedDS@Orders@rows'
}
```

### 旧格式向后兼容

旧 4 段格式（`scope@table@viewId@field`）仍可被 `parseDataKey` 解析，scope 会被保留在描述符中但不影响数据解析。`normalizeDataKey()` 可将旧格式自动剥离 scope。`PageConfigLoader.loadPageConfig()` 在配置加载阶段自动调用 `injectDataKeyScope()` 规范化所有 dataKey；`bindDataToRules` 在规则绑定前再次调用 `normalizeDataKey` 作为安全兜底。

```jsonc
// ⚠️ 旧写法（仍可工作，scope 被自动剥离）
{ "type": "el-table",  "dataKey": "CascadeDemo@Users@default@rows" }
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
  "dataKey": "Orders@rows",
  "props": {
    "border": true,
    "stripe": true,
    "highlightCurrentRow": true
  }
}
```

> ⚠️ **常见漏洞**：父表加了 `highlightCurrentRow`，子表/孙表忘加 → 级联切换后子表无高亮。**每个**需要高亮的 el-table 都要单独声明。

## 页面脚本 (script.js) 沙箱规范 📜

### 设计意图：跨前端框架的业务脚本层

`script.js` 沙箱的核心设计目标是**让业务逻辑与具体前端框架解耦**：

- 业务脚本只能看到 `IScriptContext` 定义的**框架无关抽象接口**（`$page / $api / $route / $dataSet`）
- 底层实现（Vue Router / form-create / Element Plus）由**渲染层**注入，业务脚本不感知
- 同一份 `script.js` 理论上可在任何实现了 `IScriptContext` 的渲染层上运行

这是 `$page` 替代 `ElMessage`、`$route` 替代 Vue Router、`$api` 替代 form-create 直接引用的根本原因——**接口是契约，实现可替换**。

---

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
| `$page` | `IPageServiceCapability` | ✅ **推荐** UI 消息、确认、输入、导航、加载遮罩（框架无关） |
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

### `__init__` 页面加载事件 🚀

`__init__` 是页面脚本的**入口函数**，相当于页面的 `onLoad` 事件。框架在 form-create 挂载完成后自动调用。

**执行时序**：
```
applyConfig（async）
  ├─ executeScript()        ← 编译脚本，生成 pageFunctions
  ├─ registerRenderComponents() ← 注册 Render* Vue 组件
  ├─ initDataSet(config.data) ← DataSet 直接初始化（wrapInstance 在 SparkPlugin.install 时已设定）
  ├─ provide(PAGE_DATASET)  ← 向子组件暴露 DataSet
  ├─ await nextTick()
  └─ rebindRules()          ← dataKey 解析到真实数据
       ↓
loading = false → form-create 开始挂载
       ↓
form-create mounted 钩子
  ├─ __init__()             ← 页面脚本入口（$api / $dataSet 均已就绪）
  └─ initAutoSelection()    ← 触发初始选中事件
```

> **设计要点**：DataSet 在 `rebindRules()` 之前初始化，使 dataKey 一次绑定即解析到真实数据，无需先空绑再二次绑定。`mounted` 每次都会触发（`loading` toggle 导致 form-create 销毁/重建），但其时机晚于 `rebindRules`，不适合放 DataSet 初始化。

**`__init__` 内可用资源**：
- `$api`：form-create API 已就绪，可调用 `getValue / setValue / hidden` 等
- `$dataSet`：DataSet 已初始化，可订阅事件、操作数据
- `$route`：路由参数可用
- `$page`：UI 服务可用

**典型用法**：
```javascript
function __init__() {
  // 1. 订阅数据变化
  const view = $dataSet?.getView('Orders', 'default')
  view?.events.on('currentRowChanged', (row) => {
    console.log('当前行变化:', row)
  })

  // 2. 根据路由参数加载数据
  const orderId = $route.query.id
  if (orderId) {
    view?.loadFromServer({ id: orderId })
  }

  // 3. 初始化 UI 状态
  $api?.hidden('advancedPanel', true)
}
```

**注意事项**：
- `__init__` 只执行一次（页面首次加载时），页面内导航不会重复执行
- 不要在 `__init__` 中调用 `$rebindRules()`——此时规则刚绑定完成
- 数据订阅应在 `__init__` 中注册，确保能收到 `initAutoSelection()` 触发的初始事件

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
// { "type": "r-tree", "dataKey": "hierarchicalTreeData@rows", ... }

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

- ⚠️ **当前阶段不实现**：任何以 `script-api` 命名的接口、类、模块或**文件**均属未来规划，**禁止**在功能开发中以 `script-api` 作为实现依据
- ⚠️ **禁止创建 `script-api.ts`**：当前沙箱上下文类型声明位于 `spark-page-config/src/script-context-types.ts`——该文件是合法的类型声明文件，**不是** script-api 的实现，**禁止**将其改名为 `script-api.ts`
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

`normalizeKey(name)` 内部将字符串转换为 `Symbol.for(name)`，与 Symbol 键等价。扩展自定义能力键的完整示例见下方「新增自定义能力 → 方式二」章节。

### 能力键一览

| 键 | 定义包 | 类型 | 用途 |
|---|---|---|---|
| `APP_SERVICES` | spark-utils | `IAppServicesCapability` | 路由、logger、租户等应用服务 |
| `LOGGER` | spark-utils | `LoggerApi` | 组件级自定义 logger 覆盖 |
| `PAGE_SERVICE` | spark-utils | `IPageServiceCapability` | UI 消息、确认框、导航 |
| `SELECTION` | spark-utils | `ISelectionCapability` | 选择状态管理 ⚠️ `@reserved` 尚无 provider |
| `CURRENT_ROW` | spark-utils | `ICurrentRowCapability` | 当前行管理 ⚠️ `@reserved` 尚无 provider |
| `ROW_DATA` | spark-utils | `IRowDataCapability` | 行数据访问 ⚠️ `@reserved` 尚无 provider |
| `GRID_EVENTS` | spark-utils | `IEventEmitter` | 表格事件总线 ⚠️ `@reserved` 尚无 provider |
| `ROW_EVENTS` | spark-utils | `IEventEmitter` | 行事件总线 ⚠️ `@reserved` 尚无 provider |
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

## Renderer 容器组件架构（DataView-first + sparkChildren）🏗️

### 核心模式：DataView-first

所有 `r-*` 容器组件（`r-table` / `r-form` / `r-detail`）遵循统一的 **DataView-first** 模式——DataView 是容器与子组件之间**唯一的数据中介**：

```
rule.json
  { type: "r-table", dataKey: "Users@rows", children: [...] }
    ↓ bindRules()
  sparkChildren 注入 + dataKey 透传
    ↓
RendererTable.vue
  consume(PAGE_DATASET) → parseDataKey → DataView
  provide(DATA_SOURCE, dataView)   ← 子组件通过 consume 获取
  provide(FIELD_CONTEXT, 'table')  ← 子组件感知父容器类型
    ↓
子组件（r-text / r-number / el-table-column 等）
  consume(DATA_SOURCE)  → DataView
  consume(FIELD_CONTEXT) → 'table' | 'form' | 'detail'
```

### ❗ sparkChildren 注入机制（关键，必读）

**问题**：form-create 的 slot 机制会用内部包装组件包裹子元素，破坏 `el-table` 对 `el-table-column` 的**直接子级检测**。如果让 form-create 自然渲染 `r-table` 的 children，表格列不会出现。

**解决方案**：`bindRules` 将 `r-*` 容器的 `children` 提取到 `props.sparkChildren`，容器组件自行用 `SparkComponentRenderer` 递归渲染：

```typescript
// bindRules.ts 核心逻辑（简化）
if (isSelfResolvingType(ruleType, registry)) {
  const sparkKids = newRule.children.filter(isObject)
  if (sparkKids.length > 0) {
    setRuleProp(newRule, 'sparkChildren', sparkKids)  // 移入 props
    newRule.children = []                              // 清空原 children
  }
}
```

容器组件模板中：
```vue
<template>
  <el-table :data="tableData" v-bind="$attrs">
    <SparkComponentRenderer
      v-for="(child, i) in mergedChildren"
      :key="child.id ?? `r-table-child-${i}`"
      :config="child"
    />
  </el-table>
</template>

<script setup>
const mergedChildren = computed(() =>
  props.config?.children ?? props.sparkChildren ?? []
)
</script>
```

**为什么 sparkChildren 而不是 slot？**
- form-create 的 slot 包装层破坏 el-table → el-table-column 的父子关系
- `SparkComponentRenderer` 直接在 `<el-table>` 内部渲染，el-table-column 成为直接子级
- 渲染器是**透明路由层**（不创建自己的 ComponentContext），能力链不受影响

### ❗ 自解析组件（Self-Resolving）

`isSelfResolvingType()` 判断组件是否自行解析 dataKey：
- `r-table`、`r-form`、`r-detail`、`r-tree` 默认为自解析
- 组件注册时可声明 `meta: { dataKey: 'self-resolve' }` 标记
- 自解析组件：bindRules 透传 `dataKey` 到 props，由组件自行 `consume(PAGE_DATASET)` 解析
- 非自解析组件：bindRules 在规则绑定阶段直接解析 dataKey 并注入数据

### ❗ name 透传（form-create 不自动传）

form-create 的 `rule.name` 是表单字段标识符，**不会**自动作为 Vue prop 传给自定义组件。`bindRules` 显式将 `rule.name` 复制到 `props.name`：

```typescript
// bindRules.ts
if (ruleType.startsWith('r-') && newRule.name !== undefined) {
  setRuleProp(newRule, 'name', newRule.name)
}
```

**name vs label 分离**：
- `config.name`（= `rule.name`）= **字段绑定名**，映射到 DataView 行的字段（如 `"age"`）
- `props.label` = **显示标签**，UI 上展示的文字（如 `"年龄"`）
- 两者**必须分开声明**，不要混用

```jsonc
// rule.json 正确写法
{ "type": "r-text", "name": "userName", "props": { "label": "用户名" } }

// ❌ 错误：name 当 label 用（字段绑定会失败）
{ "type": "r-text", "name": "用户名" }
```

### ❗ SparkComponentRenderer 的 v-bind 展开

`SparkComponentRenderer` 同时传递 `:config="config"` 和 `v-bind="config.props"`，让子组件可以两种方式接收参数：

```vue
<!-- SparkComponentRenderer.vue -->
<component :is="resolvedComponent" :config="config" v-bind="config.props" />
```

- 容器组件通过 `props.config` 读取完整配置（children / dataKey / type 等）
- 字段组件可直接声明 `props: { name, label, sparkChildren }` 按名接收
- 两种方式共存，逐步从 config 包读取迁移到独立 props

### ❗ tryAutoLoad 仅对有 API 配置的表触发

内联数据表（pagedata.json 中直接写 rows）**没有 `api` 配置**，不需要远程加载：

```typescript
function tryAutoLoad(view: DataView | null) {
  if (!view) return
  if (!view.dataTable?.api) return  // ← 关键：跳过内联数据表
  void view.requestData().catch(...)
}
```

**常见错误**：忘加 `api` 判断 → 控制台报 `Table xxx has no API configuration`。

### 容器组件能力键（Renderer 层）

| 能力键 | 定义 | Provider | Consumer | 说明 |
|--------|------|----------|----------|----- |
| `FIELD_CONTEXT` | `src/components/capability-keys.ts` | r-table / r-form / r-detail | 字段组件 | 渲染上下文：`'table' \| 'form' \| 'detail' \| 'tree'` |
| `CONTEXT_DATA` | `src/components/capability-keys.ts` | r-form / r-detail | 字段组件 | 可写响应式数据对象（`reactive({})` 同步自 currentRow） |
| `DATA_SOURCE` | `packages/spark-component` | r-table / r-form / r-detail | 字段组件 | DataView 实例（`IDataSource` 接口） |
| `PAGE_DATASET` | `packages/spark-component` | PageRenderer | 容器组件 | 页面级 DataSet |

### 三种容器的数据策略对比

| 容器 | 主数据源 | 子组件数据 | 特殊行为 |
|------|---------|-----------|----------|
| **r-table** | `DataView.rows` → `el-table :data` | `DATA_SOURCE`（DataView） | `currentChange` / `selectionChange` 同步到 DataView.selection |
| **r-form** | `DataView.currentRow` → `reactive(formModel)` | `CONTEXT_DATA`（formModel） | 字段组件可读写 formModel 实现双向绑定 |
| **r-detail** | `DataView.currentRow` → `reactive(detailData)` | `CONTEXT_DATA`（detailData） | 只读展示，同 form 结构但无写回 |

### 常见踩坑速查 🚨

| 症状 | 原因 | 解决 |
|------|------|------|
| el-table 列不显示 | form-create slot 包装破坏父子关系 | 确保 bindRules 走 sparkChildren 注入，容器用 SparkComponentRenderer 渲染 |
| `Table xxx has no API configuration` | tryAutoLoad 未判断 api 存在 | `if (!view.dataTable?.api) return` |
| 字段组件读不到 name | form-create 不传 rule.name 给自定义组件 | bindRules 已显式 `setRuleProp(newRule, 'name', newRule.name)` |
| 子组件 consume(DATA_SOURCE) 返回 null | 父容器未 provide | 确认 r-table/form/detail 的 `watch(resolvedView)` 正确 `sparkProvide(DATA_SOURCE, view)` |
| 表格渲染但无数据 | dataKey 写错 / pageDataSet 为 null | 检查 pagedata.json 表名、rule.json dataKey 格式、PageRenderer 是否 provide(PAGE_DATASET) |
| `console.error` 调试日志泄漏到生产 | 忘记删除或忘加 `import.meta.env.DEV` 守卫 | 所有诊断日志必须包裹 `if (import.meta.env.DEV)` |
| 同步注册问题（el-table 找不到列组件） | `defineAsyncComponent` 异步加载 | el-table 内的列组件必须**同步注册**（`Spark.register('r-col', Component)` 而非懒加载） |

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
// 简单算术（单表达式，框架自动包裹 return）
{ "name": "total", "type": "number", "computeExpression": "price * qty" }
// 字符串拼接
{ "name": "fullName", "computeExpression": "firstName + ' ' + lastName" }
// ctx 上下文（运行时通过 view.setComputedContext({ taxRate: 0.1 }) 注入）
{ "name": "tax", "type": "number", "computeExpression": "amount * ctx.taxRate" }
// 多语句函数体（含 return）——⚠️ 每条分支最终必须 return
{ "name": "grade", "computeExpression": "if (score >= 90) return 'A'; if (score >= 60) return 'B'; return 'C';" }
```

> **⚠️ 返回值规则（关键）**
>
> - **单表达式**（不含 `return`）：框架自动包裹为 `return (expression)`，无需手写 `return`
> - **多语句函数体**（含 `return`）：编译为 `with(__row) { ...原文... }`，**必须确保所有代码路径都有 `return`**，否则结果为 `undefined`
>
> ```jsonc
> // ✅ 正确：所有分支都 return
> "if (score >= 90) return 'A'; if (score >= 60) return 'B'; return 'C';"
>
> // ❌ 错误：缺少最终 return，score < 60 时结果为 undefined
> "if (score >= 90) return 'A'; if (score >= 60) return 'B';"
> ```

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
{ "dataKey": "Orders@summaryRow" }          // 全部行聚合
{ "dataKey": "Orders@selectionSummaryRow" } // 选中行聚合
```

**自动重算触发点**：`appendRow`、`updateRowById`、`deleteRowById`、`replaceRows`、`updateFromServer`、`setComputedContext`、`recomputeColumns`、选中行变更（`setSelectedRows` / `clearSelectedRows`）。

### 关键文件
- 表达式编译器：`packages/spark-data/src/strategies/computed-column-delegate.ts`
- DataView 聚合：`packages/spark-data/src/data-view.ts`（`_recomputeSummary` / `_recomputeSelectionSummary`）
- 测试：`packages/spark-data/src/tests/computed-columns.test.ts`（13 个 section，87 cases）

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
│   └── src/
│       ├── namespace.ts          # SparkPageConfig 命名空间
│       ├── script-context-types.ts # 沙箱上下文类型声明（IPageRoute/IFormAPI/IScriptContext 等）
│       │                           # ⚠️ 禁止改名为 script-api.ts → 见「script-api 规划任务」节
│       └── tests/
└── spark-utils/         # 共享基础设施
    └── src/
        ├── capability/symbols.ts  # 所有能力键定义 + provide/lookup/defineCapability
        ├── sandbox.ts             # 统一沙箱代理（SANDBOX_BLOCKED_KEYS / createSafeProxy）
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
const binding = SparkData.resolveDataKeyBinding('Users@rows', dataSet)
if (binding?.kind === 'view') { /* binding.source: IDataSource */ }

// summaryRow / selectionSummaryRow 绑定
const summaryBinding = SparkData.resolveDataKeyBinding('Users@summaryRow', dataSet)
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

## 产品级 ESLint & TypeScript 规范 🛡️

### 零 `any` 策略

**生产代码（`packages/**`）中禁止一切 `any`**——ESLint 规则 `@typescript-eslint/no-explicit-any: 'error'` 全局启用。测试文件（`*.test.ts`、`tests/`）例外放宽。

遇到第三方库类型含 `any` 时，优先用以下方式替代：

| 场景 | 禁止写法 | 正确替代 |
|------|---------|---------|
| 未知数据 | `any` | `unknown` + 类型守卫 |
| 回调参数 | `(...args: any[]) => void` | `(...args: unknown[]) => void` |
| 容器/集合 | `Map<string, any>` | `Map<string, unknown>` 或泛型 `<T>` |
| 第三方库返回值 | `const x: any = lib.foo()` | `const x: unknown = lib.foo()` |
| form-create `Rule` | `any[]` | `Rule[]`（`renderer/types`） |
| form-create `Api` | `any` | `FormCreateAPI`（精简接口） |

### ESLint 产品级规则清单

`eslint.config.js` 中对 `**/*.ts` 启用的关键规则（标 ★ 为产品级新增）：

**类型安全**：
- `no-explicit-any` — 禁止 `any`
- `no-unsafe-*`（assignment / member-access / call / return / argument） — 阻止 `any` 传播
- `no-unnecessary-type-assertion` / `no-redundant-type-constituents` / `no-duplicate-type-constituents`
- `strict-boolean-expressions` — 禁止隐式布尔转换（允许 nullable）
- `no-unnecessary-condition` — 禁止恒真/恒假条件
- `switch-exhaustiveness-check` — switch 必须覆盖所有分支
- `prefer-optional-chain` / `prefer-nullish-coalescing` — 强制 `?.` 和 `??`
- `no-floating-promises` / `no-misused-promises` / `await-thenable` / `require-await` — Promise 安全
- `prefer-as-const` — 强制 `as const`

**代码质量** ★：
- `no-shadow` — 禁止变量遮蔽（含 TypeScript 枚举）
- `no-confusing-void-expression` — 禁止在表达式位置使用 void 返回值
- `no-dynamic-delete` — 禁止 `delete obj[key]`（见替代模式）
- `no-import-type-side-effects` — 禁止 type import 副作用
- `unified-signatures` — 合并可选参数签名
- `no-useless-constructor` — 禁止空构造函数
- `no-inferrable-types` — 禁止冗余类型标注（`const x: number = 1`）
- `prefer-for-of` / `prefer-includes` / `prefer-string-starts-ends-with`
- `array-type: array-simple` — 简单类型用 `T[]`，复杂类型用 `Array<T>`

**安全**：
- `no-eval` / `no-implied-eval` / `no-new-wrappers` / `no-return-assign` / `no-sequences`
- `no-self-compare` — 禁止 `x === x`
- `no-template-curly-in-string` (warn) — 疑似模板字面量拼写错误

**风格强制（auto-fix）**：
- `prefer-template` — 字符串拼接用模板字面量
- `object-shorthand` — 对象方法/属性简写
- `no-useless-rename` — 禁止 `const { x: x } = ...`
- `consistent-type-imports` — 强制 `import type { ... }`

### `no-dynamic-delete` 替代模式

```typescript
// ❌ 禁止
delete obj[key]

// ✅ 模式 A：解构移除单个键
const { [key]: _, ...rest } = obj
return rest

// ✅ 模式 B：解构移除多个固定键
const { permField: _, modelField: __, ...sanitized } = data
return sanitized

// ✅ 模式 C：过滤保留（动态多键）
return Object.fromEntries(
  Object.entries(data).filter(([k]) => !keysToRemove.has(k))
)

// ✅ 模式 D：跳过式构建（遍历中跳过不需要的键）
const result: Record<string, unknown> = {}
for (const [k, v] of Object.entries(data)) {
  if (shouldSkip(k)) continue
  result[k] = v
}
```

### ⚠️ FormCreateAPI 精简接口（vue-tsc 类型爆炸规避）

form-create 官方 `Api<OptionAttrs, CreatorAttrs, RuleAttrs, ApiAttrs>` 和 `Rule` 类型包含**深度递归泛型**（Rule → Creator → Rule），直接用于 `Ref<Api>` 会触发 vue-tsc 指数级类型展开（~116KB 错误输出）。

**解决方案**：`renderer/types/index.ts` 中定义精简接口，仅声明项目实际用到的 11 个方法：

```typescript
// ✅ Rule — 使用 interface extends 创建名义类型边界
export interface Rule extends FormCreateRule {}

// ✅ FormCreateAPI — 手写精简接口，不继承原始 Api 泛型
export interface FormCreateAPI {
  el(id: string): unknown
  getValue(field: string): unknown
  setValue(field: string | Record<string, unknown>, value?: unknown): void
  formData(): Record<string, unknown>
  validate(callback: (valid: boolean) => void): void
  resetFields(fields?: string | string[]): void
  clearValidateState(fields?: string | string[]): void
  disabled(disabled: boolean, field?: string | string[]): void
  hidden(hidden: boolean, field?: string | string[]): void
  updateRule(field: string, rule: Record<string, unknown>): void
  on(event: string, callback: (...args: unknown[]) => void): void
}
```

**禁止**：
- `type FormCreateAPI = Api` — 透明别名，vue-tsc 会展开底层泛型
- `interface FormCreateAPI extends Api {}` — 仍触发结构检查
- 在 `Ref<>` 泛型参数中直接使用 `Api` 原始类型

**新增 form-create API 方法时**：在 `FormCreateAPI` 接口中补充签名即可，无需改回原始 `Api` 泛型。

### 测试文件放宽规则

`*.test.ts` / `tests/` 目录中以下规则关闭：
- `no-explicit-any` / `no-unsafe-*` / `no-non-null-assertion` — 测试 mock 需要灵活类型
- `no-shadow` / `no-dynamic-delete` / `no-confusing-void-expression` / `no-self-compare`
- `strict-boolean-expressions` / `no-unnecessary-condition` / `no-unnecessary-type-assertion`
- `require-await` / `consistent-type-imports` / `consistent-type-exports`
- `prefer-optional-chain` / `prefer-nullish-coalescing` / `no-floating-promises` / `no-misused-promises`

### 业务脚本（script.js）ESLint 豁免

`public/pages-config/**/script.js` 在 ESLint `ignores` 中**整体排除**，不参与任何规则检查。原因：
- 运行在 `with(__ctx)` 沙箱中，所有变量（`$api`, `$dataSet`, `$page` 等）由沙箱注入，ESLint 无法识别
- 不支持 ES Module（`import`/`export`），无法通过 `sourceType: 'module'` 解析
- 非构建源码——Vite 不编译、不打包这些文件

## Testing & common pitfalls 🧪
- 测试使用 Vitest + jsdom；外部 EJ2（`e-*` 标签）需在单元测试中 stub/mock
- 测试挂载时通过 `Spark.createPlugin()` 注入 `sparkManager`
- 常见运行时错误：`Component not found` → 确认组件注册发生在使用之前
- 能力 `consume` 返回 null 是正常情况（late-binding），不是错误
- Network-dependent CSS（Syncfusion CDN）在离线测试中会破坏样式，建议 mock 或本地化

## Integration & build notes 🔧
- Vite 识别 `e-*` 为自定义元素；SSR 通过 `ssr.noExternal` 处理 element-plus
- TypeScript path aliases（`tsconfig.typecheck.json`，类型检查时解析到源码）:
  - `@spark-view/spark-utils` → `./packages/spark-utils/src`
  - `@spark-view/spark-data` → `./packages/spark-data/src`
  - `@spark-view/spark-component` → `./packages/spark-component/src`
  - `@spark-view/spark-page-config` → `./packages/spark-page-config/src`
  - `@spark-view/spark-app` → `./packages/spark-app/src`
  - `@spark-view/spark-renderer` → `./packages/spark-component/dist`（别名，等同 spark-component）
- 每个子包 `tsconfig.json` 独立声明 `paths`（相对于包目录），IDE 类型解析正确
- ⚠️ **每个子包 `tsconfig.json` 必须包含 `"baseUrl": "."`**：`paths` 中的相对路径（如 `"../spark-utils/dist/index.d.ts"`）以 `baseUrl` 为基准解析。缺少此字段时，子包会继承根 `tsconfig.json` 的 `baseUrl`（整个 monorepo 根目录），导致 `tsc` 找不到 dist 类型文件并回退到 pnpm 存储的旧版本，产生莫名的"模块无此导出"错误。
- ⚠️ **`tsconfig.build.json` 注意**：每个子包的 `tsconfig.build.json` 中 `"paths"` 必须保留依赖包的 dist 路径别名（不能设为 `{}`），否则 `tsc` 无法追踪 pnpm 软链中的 `.js` 重导出链，导致编译时找不到新增导出成员（如 `normalizeKey`、`CapabilityTypeMap`）
- ⚠️ **`PageContext`（renderer/types/index.ts）类型写法**：`SparkData` 是命名空间导出（`export namespace`），**不能直接当类型用**。必须用 `typeof` 和顶层 import alias：
  ```typescript
  import type { h as VueH } from 'vue'
  import type { SparkData } from '@spark-view/spark-data'
  // PageContext 内字段：
  SparkData: typeof SparkData
  h: typeof VueH
  ```

## npm 发布规范 📦

发布使用 `node scripts/publish-packages.mjs`（自动按依赖顺序构建 + 发布所有子包）。

### 完整发布流程（照做即可）

```powershell
# ── Step 1: 确保测试通过 ──
pnpm run test

# ── Step 2: 升版本号（所有 5 个包统一升 patch） ──
# 手动编辑每个 packages/*/package.json 的 version 字段
# 或用脚本批量升：
Get-ChildItem packages -Directory | ForEach-Object {
  $f = "packages\$($_.Name)\package.json"
  $j = Get-Content $f -Raw | ConvertFrom-Json
  $v = [version]$j.version
  $j.version = "$($v.Major).$($v.Minor).$($v.Build + 1)"
  $j | ConvertTo-Json -Depth 10 | Set-Content $f -Encoding UTF8
  Write-Host "$($j.name) -> $($j.version)"
}

# ── Step 3: 确认 npm 身份（必须是 spark_view） ──
npm whoami --registry https://registry.npmjs.org
# 如未登录或 token 过期：
#   npm login --registry https://registry.npmjs.org

# ── Step 4: 确认 auth-type 为 legacy（避免每次弹浏览器认证） ──
npm config set auth-type legacy

# ── Step 5: 发布（自动构建 + 跳过已发版的包） ──
node scripts/publish-packages.mjs

# ── Step 6: 验证发布结果 ──
@('spark-utils','spark-data','spark-page-config','spark-component','spark-app') |
  ForEach-Object { $v = npm view "@spark-view/$_" version --registry https://registry.npmjs.org 2>$null; Write-Host "$_ = $v" }

# ── Step 7: 提交 + 推送 ──
git add -A
git commit -m "chore(deps): bump all packages to vX.Y.Z"
git push
```

### 常见问题速查

| 症状 | 原因 | 解决 |
|------|------|------|
| `EOTP` / 弹浏览器认证 | `auth-type` 不是 legacy | `npm config set auth-type legacy` |
| `Access token expired or revoked` | token 过期 | `npm login --registry https://registry.npmjs.org` |
| `You cannot publish over previously published versions` | 版本已存在 | 脚本会自动跳过，不影响后续包 |
| 版本检查误判（已发但脚本不跳过） | 走了镜像源，同步延迟 | 脚本已修复：显式查 `registry.npmjs.org` |
| `npm whoami` 返回错误 | 未登录 | `npm login --registry https://registry.npmjs.org` |

> **⚠️ Token 类型说明**：npmjs.com 的 token 分为 **Publish**（每次 publish 需浏览器/OTP 确认）和 **Automation**（免交互）。
> 当前项目使用 Publish token + `auth-type=legacy` 组合，免浏览器弹窗。
> 如需在 CI 中无人值守发布，需到 npmjs.com → Access Tokens → Generate New Token → **Granular Access Token**（选 Automation 权限级别）。

### ⚠️ 内部依赖必须使用 `workspace:*`

所有子包之间的 `@spark-view/*` 依赖**必须**声明为 `workspace:*`，不得使用版本范围（如 `^0.5.1`）：

```jsonc
// ✅ 正确 — pnpm 链接本地副本，publish 时自动替换为实际版本
"dependencies": {
  "@spark-view/spark-utils": "workspace:*"
}

// ❌ 错误 — pnpm 从 npm registry 安装旧版，导致 pnpm-lock.yaml 出现双重版本
"dependencies": {
  "@spark-view/spark-utils": "^0.4.1"
}
```

pnpm 在执行 `pnpm publish` 时会自动将 `workspace:*` 替换为包的实际版本号（由 pnpm-workspace.yaml 解析）。

**验证命令**：

```powershell
Get-ChildItem packages -Directory | ForEach-Object {
  $n=$_.Name; $p=Get-Content "packages\$n\package.json"|ConvertFrom-Json
  $bad = $p.dependencies.PSObject.Properties |
    Where-Object { $_.Name -like '@spark-view/*' -and $_.Value -notmatch '^workspace:' }
  if ($bad) { Write-Host "[WARN] $n has non-workspace @spark-view deps:"; $bad | ForEach-Object { Write-Host "  $($_.Name)=$($_.Value)" } }
}
```

### 发布前必查清单

**1. 跨包依赖范围与实际版本对齐**

`pnpm publish` 将 `workspace:*` 替换为实际版本后，`package.json` 中所记录的版本范围须能被下游正确解析。本地开发使用 `workspace:*`，发布脚本自动转换，无需手动更新版本号。

验证命令（确认所有内部引用均为 `workspace:*`）：

```powershell
Get-ChildItem packages -Directory | ForEach-Object {
  $p = Get-Content "packages\$($_.Name)\package.json" | ConvertFrom-Json
  "$($p.name)@$($p.version)"
  $p.dependencies.PSObject.Properties |
    Where-Object { $_.Name -like '@spark-view/*' } |
    ForEach-Object { "  -> $($_.Name): $($_.Value)" }
}
```

**2. 每个子包 `tsconfig.json` 必须有 `"baseUrl": "."`**

建包或复制配置后立即核查，确保存在此行（参见"Integration & build notes"）。

**3. `@types/node` 版本须满足 vite / vitest peer 要求**

vite 7 和 vitest 4 要求 `@types/node@^20.19.0 || >=22.12.0`。所有子包（及 features/ 目录下的包）中 `@types/node` 须使用 `^20.19.0`（或更高），**禁止**保留 `^18.x`。

```powershell
# 检查所有 @types/node 版本
Get-ChildItem packages -Directory | ForEach-Object {
  $p=Get-Content "packages\$($_.Name)\package.json"|ConvertFrom-Json
  Write-Host "$($_.Name): $($p.devDependencies.'@types/node')"
}
```

**4. Dry-run 验证 workspace:* 替换**

```bash
node scripts/publish-packages.mjs --dry-run
```

`pnpm publish` 会自动将 `workspace:*` 替换为实际解析版本；`npm publish` 不具备此能力，**禁止直接用 `npm publish`**。

---

## Performance notes ⚡
- **`spark-data` 无框架依赖**——DataView 通过 `DataView.wrapInstance` 静态钩子让框架层注入包装（SparkPlugin 中设为 `reactive()`）
- `useSparkComponent` 使用 `shallowReactive`（顶层响应式）+ `markRaw(capabilities)`、`markRaw(children)`，大幅减少 Vue 响应系统开销
- logger 解析带缓存（`_loggerCache`），`provide(LOGGER/APP_SERVICES, ...)` 时自动失效
- 组件 ID 使用全局单调计数器（`spark-${++_idCounter}`），比 `Date.now()+random` 更快且 SSR 友好
- `getAll()` 直接返回内部 Map 引用（`ReadonlyMap`）：O(1)，无拷贝
- `SparkComponentRenderer` 不再调用 `useSparkComponent()`，直接 `inject(SPARK_REGISTRY_KEY)`，消除渲染器中间 context 节点（上下文链：`root → business`，而非 `root → renderer → business`）
- 调试日志全部包裹在 `import.meta.env.DEV` 守卫内，生产包无调试输出
