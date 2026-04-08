# SPARK Component System - AI Coding Agent Instructions

Purpose: Quick, actionable guidance to make an AI coding agent productive in this mono-repo.

## Quick facts ✅
- Dev: `pnpm run dev`（`scripts/start-dev.mjs`：自动启动 Java 后端 + Vite 前端）; `pnpm run dev:fe`（仅 Vite）
- Build: `pnpm run build`（完整构建：JAR → Java 启动 → Vite → 元数据上传 → Java 关闭）; `pnpm run build:check` (含 `vue-tsc` + `vite build`)
- Build variants: `pnpm run build:fe`（仅前端）; `pnpm run build:java`（仅 JAR）; `pnpm run build:no-upload`（跳过元数据上传）
- Typecheck: `pnpm run typecheck` (uses `tsconfig.typecheck.json`)
- Tests (前端): `pnpm run test` (Vitest + jsdom + @vue/test-utils); single test: `pnpm run test -- -t "capability-late-binding"`
- Tests (后端): `cd spark-ai-server && mvn test`（75 tests, JUnit 5 + MockMvc）
- Lint & hooks: `pnpm run lint`; Husky pre-commit runs `lint` + `typecheck`
- Commit scope 必须是: `deps, docs, scripts, spark-data, spark-app, spark-component, spark-utils, spark-page-config`
- Java: 需要 JDK 17+（JAVA_HOME 指向 JDK 17 安装目录）

## Where to look (high value files) 🔎
- **Packages**:
  - `packages/spark-component/` — 组件系统（API docs: `packages/spark-component/API.md`）
  - `packages/spark-data/` — 数据空间（DataSet, DataTable, DataView, TreeManager）
  - `packages/spark-utils/` — 能力系统基础设施 + Logger（`src/capability/`）
  - `packages/spark-app/` — 应用层（start, bootstrap, logger, auth, plugins）
- **Pages config**: `spark-ai-server/data/pages-config/` — 页面配置（rule.json, pagedata.json, script.js）⚠️ 已从 `public/pages-config/` 迁移到 Java 后端管理
- **AI Server**: `spark-ai-server/` — Spring Boot 3.2.5 后端（AI 对话 + 页面配置文件管理 + 组件元数据）
  - `src/main/java/com/spark/ai/controller/` — REST 控制器（AiChat, PageConfig, AppConfig）
  - `src/main/java/com/spark/ai/service/` — 核心服务（AiPage, PageConfig, ComponentMetadata, SSE）
  - `src/main/resources/prompts/system-prompt.txt` — AI 生成页面配置的系统提示词
  - `data/pages-config/` — 页面配置文件存储（git-tracked）
  - `data/component-metadata.json` — 组件元数据持久化（构建时自动生成）
- **Build scripts**: `scripts/build-all.mjs`（完整构建管道）, `scripts/start-dev.mjs`（一键开发启动）
- **Renderer containers**: `packages/spark-component/src/components/containers/` — RendererTable / RendererForm / RendererDetail（DataView-first 容器）
- **Renderer capability keys**: `packages/spark-component/src/core/capabilities.ts`（FIELD_CONTEXT, CONTEXT_DATA）
- **bindRules（规则绑定引擎）**: `packages/spark-component/src/page/binding/bindRules.ts`
- **SparkComponentRenderer**: `packages/spark-component/src/components/SparkComponentRenderer.vue`
- **Key composable**: `packages/spark-component/src/core/useSparkComponent.ts`
- **DataSet 生命周期**: `packages/spark-component/src/page/usePageDataSet.ts`（仅存储 DataSet，不转换）
- **DataKey parser**: `packages/spark-data/src/core/data-key.ts`
- **Capability keys**: `packages/spark-utils/src/capability.ts` (APP_SERVICES, LOGGER 等), `packages/spark-component/src/core/capabilities.ts` (PAGE_DATASET, DATA_SOURCE)
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

- Component `type` 使用 **kebab-case**（如 `r-table`），通过 `Spark.register()` 注册（注册 API 详见下方“Spark 命名空间 API”章节）
- App 安装插件: `app.use(Spark.createPlugin())`，组件内使用 `useSparkComponent(config)` 获取 SPARK 上下文

### ❗ 单一 DataSet 框架（核心约束）

**所有页面数据必须且只能通过 DataSet 流转**，禁止在渲染层对原始 JSON 做归一化/类型判断。

```
pagedata.json (JSON 字符串)
  ↓ parsePageData()         ← spark-page-config：唯一转换点
  DataSet 实例               ← ⚠️ 被 FileLoader memCache 缓存，同 pageId 复用同一实例
  ↓ initDataSet(ds)          ← usePageDataSet：仅存储引用，不转换，不 destroy
  ↓ sparkProvide(PAGE_DATASET, ds)
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
sparkProvide(PAGE_DATASET, dataSet!)     // 向子组件暴露 DataSet
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
  context,          // SparkCapabilityContext — 当前能力上下文（响应式）
  isVisible,        // ComputedRef<boolean> — 基于 config.visible
  isDisabled,       // ComputedRef<boolean> — 基于 config.disabled
  sparkProvide,     // (name, impl) => void — 写入 ctx.capabilities（SPARK 能力，非 Vue DI）
                    // 重载：sparkProvide<K extends keyof CapabilityTypeMap>(name: K, impl: CapabilityTypeMap[K])
  provideEvents,    // (name?) => IEventEmitter — 提供事件总线
  getProvider,      // (name) => unknown — 仅查找本组件 capabilities（不走 parent 链）
  sparkConsume,     // <T>(name) => T | null — 沿 parent 链向上查找能力
                    // 重载：sparkConsume<K extends keyof CapabilityTypeMap>(name: K): CapabilityTypeMap[K] | null
  consumeEvents,    // (name, handlers) => IEventEmitter | null — 消费并绑定事件
  initialize,       // () => void — onMounted 自动调用
  destroy,          // () => void — onUnmounted 自动调用（清理 children + capabilities）
  logger,           // LoggerApi — 页面层日志代理（见下方说明）
  getComponent,     // (type) => unknown — 从注册表获取组件（markRaw 包装）
  isComponentRegistered, // (type) => boolean
} = useSparkComponent(props.config)
```

**logger 解析**（无需手动 consume，代理自动解析）：
1. `APP_SERVICES.logger`（页面 / 应用层统一提供）
2. fallback console

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
- ⚗️ 旧点号格式 `dataset.tables.X.rows` **已移除**，不再支持
- ⚗️ 旧 4 段格式 `scope@table@viewId@field` **已移除**，不再支持
- API（`packages/spark-data/src/core/data-key.ts`）：
  - `isDataKey(key)` — 格式校验
  - `parseDataKey(key)` — 解析为 `DataKeyDescriptor`
  - `resolveDataKey(descriptor, dataSet)` — 解析数据值
  - `resolveDataKeyBinding(key, dataSet)` — 返回 `DataKeyBinding` 判别联合（渲染层首选）
  - `buildDataKey(table, field, viewId?, scope?)` — 构建 key 字符串（传 scope 时输出 `#scope@...`）

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

- 业务脚本只能看到 `IScriptContext` 定义的**框架无关抽象接口**（`$page / $route / $dataSet`）
- 底层实现（Vue Router / Element Plus）由**渲染层**注入，业务脚本不感知
- 同一份 `script.js` 理论上可在任何实现了 `IScriptContext` 的渲染层上运行

这是 `$page` 替代 `ElMessage`、`$route` 替代 Vue Router 的根本原因——**接口是契约，实现可替换**。

---

`public/pages-config/**/script.js` 在 `with (__ctx)` 沙箱内执行，**可直接使用**以下注入变量：

| 变量 | 类型 | 说明 |
|------|------|------|
| `$route` | `IPageRoute` | 当前路由快照（`path, params, query, name`），框架无关接口 |
| `$el` | `() => HTMLElement \| null` | 页面容器元素 |
| `$query` | `(sel) => HTMLElement \| null` | DOM 单元素查询 |
| `$queryAll` | `(sel) => NodeListOf<Element>` | DOM 多元素查询 |
| `$dataSet` | `IDataSet \| null` | **页面级 DataSet**（数据唯一入口） |
| `$refreshData` | `(key?) => Promise<void>` | 刷新数据（可选指定表名） |
| `$page` | `IPageServiceCapability` | ✅ **推荐** UI 消息、确认、输入、导航、加载遮罩、弹层、文件浏览、文件上传（框架无关） |
| `permission` | 权限 helper 命名空间 | `isPermittedAction`、`resolveFieldPermissionState`、`formatPermissionAwareFieldValue` 等 |
| `SparkData` | SparkData 命名空间 | `createTreeManager` 等工具 |
| `h` | Vue `h` 函数 | 渲染函数专用（`Render*` 函数内使用） |

### ❗ 脚本禁止事项

| 禁止 | 原因 | 替代方案 |
|------|------|---------|
| `$data` | 已移除 | `$dataSet`（数据）/ `_pageState`（UI 状态） |
| `window.xxx = function` | 沙箱内变量无需挂 window | 直接用 `function xxx() {}` 声明 |
| `window.Vue` | `h` 已直接注入 | 直接用 `h(...)` |
| `ElMessage.xxx(...)` | **已从沙箱移除** | `$page.showMessage / showConfirm / showPrompt / showAlert / showDialog / selectEntities` |
| `ElMessageBox.xxx(...)` | **已从沙箱移除** | `$page.showConfirm / showPrompt / showAlert / showDialog / selectEntities` |
| Vue Router 直接 import | 沙箱不支持 ESM | `$route`（IPageRoute）已注入 |
| `import` 语句 | 沙箱不支持 ESM | 所有依赖通过沙箱注入 |
| `view.setCurrentRow(row)` 在 `currentChange` 回调中 | `injectTableEvents`（bindRules.ts）已在回调后通过 PK 查干净行并调用 | 只写业务逻辑，DataView 同步由框架负责 |

### `__init__` 页面加载事件 🚀

`__init__` 是页面脚本的**入口函数**，相当于页面的 `onLoad` 事件。框架在渲染器挂载完成后自动调用。

**执行时序**：
```
applyConfig（async）
  ├─ executeScript()        ← 编译脚本，生成 pageFunctions
  ├─ registerRenderComponents() ← 注册 Render* Vue 组件
  ├─ initDataSet(config.data) ← DataSet 直接初始化（wrapInstance 在 SparkPlugin.install 时已设定）
  ├─ sparkProvide(PAGE_DATASET)  ← 向子组件暴露 DataSet
  ├─ await nextTick()
  └─ rebindRules()          ← dataKey 解析到真实数据
       ↓
loading = false → 渲染器开始挂载
       ↓
渲染器 mounted 钩子
  ├─ __init__()             ← 页面脚本入口（$dataSet 已就绪）
  └─ initAutoSelection()    ← 触发初始选中事件
```

> **设计要点**：DataSet 在 `rebindRules()` 之前初始化，使 dataKey 一次绑定即解析到真实数据，无需先空绑再二次绑定。

**`__init__` 内可用资源**：
- `$dataSet`：DataSet 已初始化，可订阅事件、操作数据
- `$route`：路由参数可用
- `$page`：UI 服务可用
- `permission`：权限 helper 可用，可直接做动作/字段权限判断

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
  const panel = $query('[name="advancedPanel"]')
  if (panel) panel.style.display = 'none'
}
```

**注意事项**：
- `__init__` 只执行一次（页面首次加载时），页面内导航不会重复执行
- 数据订阅应在 `__init__` 中注册，确保能收到 `initAutoSelection()` 触发的初始事件

### UI 状态存储模式

脚本需要跨函数共享的 UI 状态（非 DataSet 数据）用**模块级闭包变量**代替原来的 `$data`：

```javascript
// ✅ 正确：模块顶部声明闭包状态
let _pageState = { currentUser: '', tableData: [], selectedNode: null }

function handleSelect(node) {
  _pageState.selectedNode = node     // 写入闭包变量
  // 如果渲染函数读取该状态，通过 DOM 直写更新 UI
}

// 渲染函数通过 _pageState 读值（初次挂载时执行，之后靠 DOM 直写）
function RenderNodeInfo() {
  const node = _pageState.selectedNode
  return h('div', node?.name ?? '未选择')
}
```

> **注意**：`_pageState` 是普通 JS 对象，**不具备 Vue 响应式**。变更后若需 UI 刷新，
> 可通过 DOM 直写（`$query` + `innerHTML`），或通过 `$dataSet` 的 DataView
> 方法（如 `view.replaceRows()`）驱动——DataView 事件会自动更新订阅了该视图的组件。

### UI 更新模式（树页面必读）🌲

**核心原则**：凡是页面包含 `r-tree` / el-tree，任何交互都应通过 **DataView + DOM 直写** 更新 UI，保持树节点展开状态。

**模式 A — 纯 UI 状态（非 DataSet）→ DOM 直写**

适用于节点信息面板、统计数字等只读展示区域：

```javascript
// rule.json 中给容器加 id/class：
// { "type": "div", "class": "node-info", ... }

// script.js 中直接写 innerHTML，不触发规则重建
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
| 节点点击 → 更新右侧面板 | 直接操作 DOM 外层 | `_flushXxxDOM()` |
| 添加/删除节点 → 更新树 | 手动重建规则 | `view.replaceRows(nestedTree)` |
| 子表数据联动 | 手动触发全量重绑 | `childView.replaceRows(rows)` |
| 渲染函数 `Render*` 初次渲染 | — | 正常，仅初次挂载时执行，之后靠 DOM 直写 |

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

// ✅ 操作数据（DataView 事件自动刷新 UI）
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
  "tableRelations": [
    {
      "parentTable": "Orders",
      "childTable":  "OrderItems",
      "parentField": "id",         "childField": "orderId"
    }
  ]
  // viewDependencies 可省略（默认从 tableRelations 推导，dependencyType: "currentRow"）
  // 仅需非默认级联行为时显式声明 viewDependencies
}
```

### 🚧 script-api（长期规划任务）

`script.js` 沙箱当前通过 `__ctx` 直接注入变量（见上表）。**`script-api`** 是规划中的长期架构任务，旨在将所有沙箱注入变量规范化为类型化接口，提供自动补全、类型检查与版本兼容性保障。

- ⚠️ **当前阶段不实现**：任何以 `script-api` 命名的接口、类、模块或**文件**均属未来规划，**禁止**在功能开发中以 `script-api` 作为实现依据
- ⚠️ **禁止创建 `script-api.ts`**：当前沙箱上下文类型声明位于 `spark-page-config/src/script-context-types.ts`——该文件是合法的类型声明文件，**不是** script-api 的实现，**禁止**将其改名为 `script-api.ts`
- 现阶段脚本对接唯一规范来源是本文档的**沙箱注入变量表** + **禁止事项表**
- 待 script-api 正式立项后，本节将替换为具体接口定义与迁移指南

## 权限架构（统一后端验证 + 前端权限渲染）🔐

权限体系的唯一正式说明文档是 [docs/architecture/PERMISSION_SYSTEM.md](../docs/architecture/PERMISSION_SYSTEM.md)。如涉及权限相关实现、Prompt、示例页、测试或文档，先以该文档为准，再改代码；本提示词不再维护第二套权限说明。

## 能力体系 🔧

### DI 双轨（严格区分）

| 机制 | 实现 | 用途 |
|------|------|------|
| **SPARK 能力系统** | `ctx.capabilities` Map + `lookup()` 走 parent 链 | 所有业务能力 |
| **Vue DI（仅基础设施）** | `app.provide()` / `inject()` | 仅 `SPARK_REGISTRY_KEY`（注册表） |

**重要**：`useSparkComponent` 的 `sparkProvide()` / `sparkConsume()` 是 **SPARK 能力系统**，不是 Vue 的 `provide/inject`。

### 能力键类型扩展（CapabilityTypeMap）

能力键支持两种形式：
- **Symbol 键**（向后兼容）：`import { DATA_SOURCE } from '@spark-view/spark-component'`
- **字符串键**（可扩展）：`sparkConsume('spark:capability:page-dataset')` — 通过 `CapabilityTypeMap` 声明合并提供类型推断

`normalizeKey(name)` 内部将字符串转换为 `Symbol.for(name)`，与 Symbol 键等价。扩展自定义能力键的完整示例见下方「新增自定义能力 → 方式二」章节。

### 能力键一览

| 键 | 定义包 | 类型 | 用途 |
|---|---|---|---|
| `APP_SERVICES` | spark-utils | `IAppServicesCapability` | 路由、logger、租户等应用服务 |
| `LOGGER` | spark-utils | `LoggerApi` | 组件级自定义 logger 覆盖 |
| `PAGE_SERVICE` | spark-utils | `IPageServiceCapability` | UI 消息、确认框、导航 |
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
  Vue DI: SPARK_REGISTRY_KEY
    ↓
PageRenderer
  sparkProvide(APP_SERVICES, { router, logger })   ← SPARK 能力，不是 Vue DI
  sparkProvide(PAGE_DATASET, dataSet)
    ↓
r-table / r-tree
  sparkConsume(PAGE_DATASET) → 解析 dataKey → DataView
  sparkProvide(DATA_SOURCE, dataView)
  sparkProvide(SELECTION, {...})
    ↓
r-row / r-cell
  sparkConsume(DATA_SOURCE)  → DataView (IDataSource)
  sparkConsume(SELECTION)
```

## Renderer 容器组件架构（DataView-first + h(type,props,children) 模型）🏗️

### 核心模型：SparkNode ≈ h(type, props, children)

SparkNode 严格对齐 Vue `h(type, props, children)` 三段式，**仅保留 3 个根级字段**：
- **type** → 渲染什么组件
- **props** → 组件接收的全部属性（id / dataKey / field / label / on / visible / disabled … 统统在此）
- **children** → 嵌套子节点

rule.json 允许将 dataKey / field / id / on / visible / disabled 等写在根级（便于阅读），绑定阶段（`bindSparkRuleEvents`）会**全部收入 `props`**，组件代码只需关心 `props`。

```typescript
// SparkNode — 严格对齐 h(type, props, children)
interface SparkNode {
  type: string                    // ← h() 第一参数
  props?: Record<string, unknown> // ← h() 第二参数（id/on/visible/disabled 均在此）
  children?: SparkNode[]          // ← h() 第三参数
}

// 工具函数：安全读取 props 中的 id
import { nodeId } from '@spark-view/spark-component'
nodeId(node) // → string | undefined
```

### 数据流：DataView-first

所有 `r-*` 容器组件（`r-table` / `r-form` / `r-detail`）遵循统一的 **DataView-first** 模式——DataView 是容器与子组件之间**唯一的数据中介**：

```
rule.json
  { type: "r-table", dataKey: "Users@rows", children: [...] }
    ↓ bindSparkRuleEvents()        ← 根级 dataKey/field 收入 props
    ↓ SparkComponentRenderer       ← v-bind="config.props" + children
    ↓
RendererTable.vue
  props.dataKey → sparkConsume(PAGE_DATASET) → DataView
  sparkProvide(DATA_SOURCE, dataView)   ← 子组件通过 sparkConsume 获取
  sparkProvide(FIELD_CONTEXT, 'table')  ← 子组件感知父容器类型
    ↓
子组件（r-text / r-number / el-table-column 等）
  sparkConsume(DATA_SOURCE)  → DataView
  sparkConsume(FIELD_CONTEXT) → 'table' | 'form' | 'detail'
```

### ❗ children 直传机制（关键，必读）

**问题**：如果父组件通过 slot 包装层渲染子元素，会破坏 `el-table` 对 `el-table-column` 的**直接子级检测**。

**解决方案**：容器组件通过 `props.children`（SparkNode.children 由 SparkComponentRenderer 直接转发）接收子节点，自行用 `SparkComponentRenderer` 递归渲染：

```vue
<template>
  <el-table :data="tableData" v-bind="$attrs">
    <SparkComponentRenderer
      v-for="(child, i) in configChildren"
      :key="child.id ?? `r-table-child-${i}`"
      :config="child"
    />
  </el-table>
</template>

<script setup>
const { configChildren } = useContainerInput({
  dataKey: computed(() => props.dataKey),
  children: computed(() => props.children),
})
</script>
```

**为什么不用 slot？**
- slot 包装层破坏 el-table → el-table-column 的父子关系
- `SparkComponentRenderer` 直接在 `<el-table>` 内部渲染，el-table-column 成为直接子级
- 渲染器是**透明路由层**（不创建自己的 SparkCapabilityContext 节点），能力链不受影响

### ❗ 自解析组件（Self-Resolving）

`isSelfResolvingType()` 判断组件是否自行解析 dataKey：
- `r-table`、`r-form`、`r-detail`、`r-tree` 默认为自解析
- 组件注册时可声明 `meta: { dataKey: 'self-resolve' }` 标记
- 自解析组件：bindRules 透传 `dataKey` 到 props，由组件自行 `sparkConsume(PAGE_DATASET)` 解析
- 非自解析组件：bindRules 在规则绑定阶段直接解析 dataKey 并注入数据

### ❗ 属性规范化（根级 → props）

`bindSparkRuleEvents` 以结构键黑名单（`type/props/children`）实现规范化：所有非结构根级字段（包括 `id/on/visible/disabled/dataKey/field` 等）一律收入 `props`。因此：

- rule.json 中 `dataKey` / `field` / `label` / `optionKey` 写在根级或 props 内均可，最终都在 props 内
- **组件代码一律通过 `defineProps` 接收属性，不读 SparkNode 根级**

```jsonc
// rule.json —— 两种写法等价，绑定后统一在 props 内
{ "type": "r-text", "field": "name", "props": { "label": "姓名" } }
{ "type": "r-text", "props": { "field": "name", "label": "姓名" } }
```

### ❗ SparkComponentRenderer 的悕传机制

`SparkComponentRenderer` 对已注册组件传递 `v-bind="config.props"` + `children`：

```vue
<!-- SparkComponentRenderer.vue -->
<component :is="resolvedComponent" v-bind="componentProps" />
```

`componentProps` = `config.props`（含事件合并）+ `config.children`（仅传给已注册组件）。
绑定阶段已将 dataKey/field/label 等收入 props，组件通过 `defineProps` 直接接收：

```typescript
// 容器组件
const props = defineProps<{ dataKey?: string; children?: SparkNode[]; ... }>()

// 字段组件
const props = defineProps<{ field?: string; label?: string; ... }>()
```

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
| `FIELD_CONTEXT` | `packages/spark-component/src/core/capabilities.ts` | r-table / r-form / r-detail | 字段组件 | 渲染上下文：`'table' \| 'form' \| 'detail' \| 'tree'` |
| `CONTEXT_DATA` | `packages/spark-component/src/core/capabilities.ts` | r-form / r-detail | 字段组件 | 可写响应式数据对象（`reactive({})` 同步自 currentRow） |
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
| el-table 列不显示 | slot 包装破坏父子关系 | 容器组件通过 `props.children` 接收，用 SparkComponentRenderer 渲染 |
| `Table xxx has no API configuration` | tryAutoLoad 未判断 api 存在 | `if (!view.dataTable?.api) return` |
| 字段组件读不到 field | 根级 field 未规范化到 props | 绑定阶段已统一收入 props，组件通过 `defineProps` 接收 |
| 子组件 sparkConsume(DATA_SOURCE) 返回 null | 父容器未 sparkProvide | 确认 r-table/form/detail 的 `watch(resolvedView)` 正确 `sparkProvide(DATA_SOURCE, view)` |
| 表格渲染但无数据 | dataKey 写错 / pageDataSet 为 null | 检查 pagedata.json 表名、rule.json dataKey 格式、PageRenderer 是否 sparkProvide(PAGE_DATASET) |
| `console.error` 调试日志泄漏到生产 | 忘记删除或忘加 `import.meta.env.DEV` 守卫 | 所有诊断日志必须包裹 `if (import.meta.env.DEV)` |
| 同步注册问题（el-table 找不到列组件） | `defineAsyncComponent` 异步加载 | el-table 内的列组件必须**同步注册**（`Spark.register('r-col', Component)` 而非懒加载） |

### 新增自定义能力

**方式一：Symbol 键（适合跨包共享）**
```typescript
// 用 defineCapability 创建具名 symbol
import { defineCapability } from '@spark-view/spark-utils'
export const MY_CAP = defineCapability<{ doSomething(): void }>('app:my-capability')

const { sparkProvide } = useSparkComponent(props.config)
sparkProvide(MY_CAP, { doSomething() { ... } })

const { sparkConsume } = useSparkComponent(props.config)
const cap = sparkConsume(MY_CAP)  // { doSomething(): void } | null
```

**方式二：字符串键 + CapabilityTypeMap（推荐，可扩展）**
```typescript
// packages/spark-component/src/core/capabilities.ts
import type { MyServiceCapability } from './types'

declare module '@spark-view/spark-utils' {
  interface CapabilityTypeMap {
    'app:my-service': MyServiceCapability
  }
}

// 直接用字符串，类型从 CapabilityTypeMap 自动推断
sparkProvide('app:my-service', myImpl)   // impl 类型必须匹配 MyServiceCapability
const cap = sparkConsume('app:my-service') // MyServiceCapability | null
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
│       ├── bootstrap.ts # bootstrap()
│       ├── config/      # ConfigLoader, loadConfig
│       ├── logger/      # createLogger, createAppLogger
│       ├── navigation/  # useNavigation, useTabPages, useColorScheme
│       ├── page-ui/     # AppPageUiHost, pageUiService
│       ├── plugins/     # PluginRegistry, PluginManager
│       ├── router/      # DynamicRouter, guards
│       ├── theme/       # createThemeService, useTheme
│       ├── namespace.ts # SparkApp 命名空间
│       ├── start.ts     # start() 高级 API
│       ├── types.ts     # AppContext, AppConfig, UserInfo 等类型
│       ├── constants.ts # ErrorCodes, Environments, DefaultConfig
│       └── error-handler.ts # setupErrorHandler, createErrorBoundary
├── spark-component/     # 组件系统（Spark 命名空间、能力系统）
│   └── src/
│       ├── permission/     # 权限渲染 API（PermissionChecker / Resolver / Filter / FieldRenderHelper）
│       ├── spark.ts          # Spark 命名空间（唯一入口）
│       ├── capabilities.ts    # PAGE_DATASET, DATA_SOURCE 等能力键与类型
│       ├── types.ts          # SparkNode, SparkCapabilityContext, ComponentRegistry
│       ├── registry.ts       # ComponentRegistry 实现
│       ├── useSparkComponent.ts # 核心 Composable
│       ├── plugin.ts         # SparkPlugin (Vue plugin)
│       └── renderer/
│           ├── SparkPageRenderer.vue   # 页面渲染器
│           ├── SparkComponentRenderer.vue # 递归组件渲染器
│           ├── usePageDataSet.ts  # DataSet 引用管理
│           ├── useRendererSetup.ts # 共享基础设施
│           ├── useCssScope.ts     # CSS 作用域隔离
│           ├── binding/      # 规则绑定管线（bindRules, bind-*-delegate）
│           ├── page/         # 页面基础设施（buildPageContext, createSandbox, scopeCSS）
│           ├── containers/   # 容器组件（RendererTable, RendererForm 等）
│           └── fields/       # 字段组件（FieldText, FieldSelect 等）
├── spark-data/          # 数据空间
│   └── src/
│       ├── core/data-key.ts  # DataKey 解析（resolveDataKeyBinding 等）
│       ├── spark-data.ts     # SparkData 命名空间（推荐 API）
│       ├── dataset.ts        # DataSet（事件驱动协调器）
│       ├── data-table.ts     # DataTable
│       ├── data-view.ts      # DataView（IDataSource 实现）
│       ├── tree-manager.ts   # TreeManager
│       └── permission/       # 权限快照类型与权限令牌集成（数据模型）
├── spark-page-config/   # 页面配置加载器（ConfigLoader, SparkPageConfig）
│   └── src/
│       ├── namespace.ts          # SparkPageConfig 命名空间
│       ├── script-context-types.ts # 沙箱上下文类型声明（IPageRoute/IScriptContext 等）
│       │                           # ⚠️ 禁止改名为 script-api.ts → 见「script-api 规划任务」节
│       └── tests/
└── spark-utils/         # 共享基础设施
    └── src/
        ├── capability.ts      # 所有能力键定义 + provide/lookup/defineCapability
        ├── nav-types.ts       # 导航模型类型（NavNode, AppNavRoot 等）
        ├── sandbox.ts         # 统一沙箱代理（SANDBOX_BLOCKED_KEYS / createSafeProxy）
        ├── logger.ts          # Logger 工厂
        ├── http/              # Request, FetchClient, FileLoader
        └── tests/
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
import { APP_SERVICES } from '../../../spark-utils/src/capability'
```
相对路径跨包引用会绕过 pnpm workspace 解析，破坏 dist 构建的类型声明链，导致发布后消费方出现类型错误。

### ⚠️ 框架隔离约束（纯 JS 包）

**`spark-utils`、`spark-data`、`spark-page-config`** 三个包**零前端框架依赖**（Vue / React / Element Plus 等均不引入），属于纯 TypeScript/JavaScript 库：

- **禁止**在这三个包中 `import` 任何 Vue composable、Vue 响应式 API（`ref / reactive / computed`）、Vue 组件或任何 UI 框架模块
- **禁止**将 `vue`、`vue-router`、`element-plus` 加入这三个包的 `dependencies` 或 `peerDependencies`
- 如需在 `spark-data` 中注入框架响应式（如 `reactive()`），必须通过**静态钩子**（`DataView.wrapInstance`）由外部框架层注入，不能在包内直接 import Vue
- 违反此约束将污染依赖图，导致下游 SSR / 非 Vue 环境无法使用这三个包

框架依赖只允许存在于 `spark-component`（peerDep: vue, element-plus 等）和 `spark-app`（peerDep: vue, vue-router）。

## Plugin System (插件配置系统) 🔌

```typescript
import { PluginRegistry, PluginManager, registerBuiltinPlugins } from '@spark-view/spark-app'

registerBuiltinPlugins()  // 注册内置: element-plus, vxe-table
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
const { sparkConsume, sparkProvide, logger } = useSparkComponent(props.config)
const services = sparkConsume(APP_SERVICES)
services?.router?.push('/home')
// logger 自动感知 APP_SERVICES.logger，无需手动 consume
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

### 测试文件放宽规则

`*.test.ts` / `tests/` 目录中以下规则关闭：
- `no-explicit-any` / `no-unsafe-*` / `no-non-null-assertion` — 测试 mock 需要灵活类型
- `no-shadow` / `no-dynamic-delete` / `no-confusing-void-expression` / `no-self-compare`
- `strict-boolean-expressions` / `no-unnecessary-condition` / `no-unnecessary-type-assertion`
- `require-await` / `consistent-type-imports` / `consistent-type-exports`
- `prefer-optional-chain` / `prefer-nullish-coalescing` / `no-floating-promises` / `no-misused-promises`

### 业务脚本（script.js）ESLint 豁免

`public/pages-config/**/script.js` 在 ESLint `ignores` 中**整体排除**，不参与任何规则检查。原因：
- 运行在 `with(__ctx)` 沙箱中，所有变量（`$dataSet`, `$page` 等）由沙箱注入，ESLint 无法识别
- 不支持 ES Module（`import`/`export`），无法通过 `sourceType: 'module'` 解析
- 非构建源码——Vite 不编译、不打包这些文件

## Testing & common pitfalls 🧪
- 测试使用 Vitest + jsdom
- 测试挂载时通过 `app.use(Spark.createPlugin())` 注入 SPARK 注册表与根上下文
- 常见运行时错误：`Component not found` → 确认组件注册发生在使用之前
- 能力 `consume` 返回 null 是正常情况（late-binding），不是错误

## Integration & build notes 🔧
- SSR 通过 `ssr.noExternal` 处理 element-plus
- TypeScript path aliases（`tsconfig.typecheck.json`，类型检查时解析到源码）:
  - `@spark-view/spark-utils` → `./packages/spark-utils/src`
  - `@spark-view/spark-data` → `./packages/spark-data/src`
  - `@spark-view/spark-component` → `./packages/spark-component/src`
  - `@spark-view/spark-page-config` → `./packages/spark-page-config/src`
  - `@spark-view/spark-app` → `./packages/spark-app/src`
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

### ⚠️ Vite `manualChunks` 必须与包依赖方向一致

`vite.config.ts` 中的 `manualChunks` 为每个 SPARK 子包分配了独立 chunk。**所有子包必须分配独立 chunk，尤其是共享底层包**：

```typescript
// ⚠️ spark-utils 必须在 spark-data / spark-component 之前匹配
// 否则 Rollup 可能将 spark-utils 模块分入上层 chunk，导致虚假循环依赖
if (id.includes('packages/spark-utils'))      return 'spark-utils'
if (id.includes('packages/spark-component'))  return 'spark-component'
if (id.includes('packages/spark-data'))       return 'spark-data'
if (id.includes('packages/spark-app'))        return 'spark-app'
if (id.includes('packages/spark-page-config'))return 'spark-config'
```

**规则**：
- 每个 SPARK 子包 **必须** 有对应的 `manualChunks` 规则，**禁止遗漏**
- 匹配顺序必须**底层包优先**（`spark-utils` → `spark-data` → 其他），确保共享模块分入正确的底层 chunk
- 新增 SPARK 子包时**必须同步添加** `manualChunks` 规则
- 构建后 `Circular chunk` 警告视为 **CI 阻断级错误**，必须修复后才能合并

**反例**（已修复）：`spark-utils` 未分配独立 chunk → Rollup 将其代码分入 `spark-component` chunk → `spark-data` chunk 为获取共享代码反向引用 `spark-component` chunk → 出现 `Circular chunk: spark-data -> spark-component -> spark-data` 虚假警告。

## npm 发布规范 📦

发布使用 `node scripts/publish-packages.mjs`（自动按依赖顺序构建 + 发布所有子包）。

### Token 配置（首次 / token 过期时执行）⚠️

**必须使用 Granular Access Token**，缺少任一条件都会导致发布失败：

| 必须满足 | 不满足时的报错 |
|---------|--------------|
| ✅ 勾选 **Bypass 2FA** | `EOTP` 或 auth 失败 |
| ✅ `@spark-view` org **Read and write** | `E404 Not Found - not have permission` |

**创建步骤**：npmjs.com → Settings → Access Tokens → Generate New Token → **Granular Access Token**
- Name: `spark_view_MMDD`（日期命名，如 `spark_view_0307`）
- 勾选 **Bypass two-factor authentication (2FA)**（必须！）
- Organizations → spark-view → **Read and write**

**写入配置**：
```powershell
npm config set //registry.npmjs.org/:_authToken <新token>
npm config set auth-type legacy
```

> ⚠️ **禁止用 `npm login`**：web 登录获取的 session token 没有 org 写权限，发布必报 E404。
> ⚠️ **`npm whoami` 返回 401 属正常**：Granular token 不支持 whoami，不代表 token 无效，直接发布验证。
> ⚠️ **不要把 token 提交 git**：GitHub secret scanning 会自动检测并吊销泄露的 token。

### 完整发布流程（照做即可）

```powershell
# ── Step 1: 确保 lint / typecheck / test 通过 ──
pnpm run lint && pnpm run typecheck && pnpm run test

# ── Step 2: 升版本号（所有 5 个包统一升 patch） ──
Get-ChildItem packages -Directory | ForEach-Object {
  $f = "packages\$($_.Name)\package.json"
  $j = Get-Content $f -Raw | ConvertFrom-Json
  $v = [version]$j.version
  $j.version = "$($v.Major).$($v.Minor).$($v.Build + 1)"
  $j | ConvertTo-Json -Depth 10 | Set-Content $f -Encoding UTF8
  Write-Host "$($j.name) -> $($j.version)"
}

# ── Step 3: 发布（自动构建 + 跳过已发版的包） ──
# 无需 npm whoami（Granular token 返回 401 属正常，不影响发布）
node scripts/publish-packages.mjs

# ── Step 4: 验证发布结果 ──
@('spark-utils','spark-data','spark-page-config','spark-component','spark-app') |
  ForEach-Object { $v = npm view "@spark-view/$_" version --registry https://registry.npmjs.org 2>$null; Write-Host "$_ = $v" }

# ── Step 5: 提交 + 推送 ──
$ver = (Get-Content "packages\spark-utils\package.json" | ConvertFrom-Json).version
git add -A
git commit -m "chore: bump all packages to v$ver"
git push
```

### 常见问题速查

| 症状 | 原因 | 解决 |
|------|------|------|
| `E401 Unauthorized` | Token 被吊销（如曾提交到 git）或已过期 | 重新生成 Granular Token（见上方步骤） |
| `E404 Not found - not have permission` | Token 无 org 写权限，或用了 web-login token | 重新生成 Granular Token，确认勾选 org Read and Write |
| `EOTP` / 弹浏览器认证 | Token 未勾选 Bypass 2FA | 重新生成 Granular Token，**必须勾选 Bypass 2FA** |
| `npm whoami` 返回 401 | Granular token 不支持 whoami | **正常**，忽略，直接执行发布 |
| `You cannot publish over previously published versions` | 版本已存在 | 脚本自动跳过，不影响后续包 |
| commit 被 pre-commit 阻断 | lint/typecheck 有错误 | 修复错误后重新 commit，**不要用 `--no-verify`** |

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

## AI Server (spark-ai-server) 🤖

### 概述
Spring Boot 3.2.5 后端，端口 8080。负责 AI 驱动的页面生成、页面配置文件 CRUD、组件元数据存储。

- **技术栈**: Java 17+ / Spring Boot 3.2.5 / Maven / H2 嵌入式数据库（版本元数据）+ 文件系统（页面配置内容）
- **入口**: `spark-ai-server/src/main/java/com/spark/ai/SparkAiApplication.java`
- **75 个测试**: `cd spark-ai-server && mvn test`

### API-first 提示词（前端优先，禁止默认改后端）

当需求涉及页面配置、路由同步、导航、项目、数据 CRUD、缓存清理、日志、AI 生成时，**先判定是否可通过现有 API 完成**：

1. 若 API 已覆盖场景：**只改前端调用链，不改后端 Controller/Service**。
2. 若需迁移历史数据：**由前端显式调用 API 触发**，禁止恢复后端启动期隐式迁移。
3. 多租户请求优先使用 `/api/tenants/{tenantId}/projects/{projectId}/...`；
  仅在兼容场景使用扁平 `/api/pages-config/**`，并确保请求头包含 `X-Tenant-Id`、`X-Project-Id`。
4. 失败必须显式暴露（fail-fast），禁止静默兜底掩盖根因。

### 后端完整 API 清单（按 Controller，2026-04-05 校验）

#### 1) AI 对话与页面生成（AiChatController）

| Method | Path | 说明 |
|---|---|---|
| `POST` | `/api/ai/chat` | 页面生成（generate/iterate，非流式） |
| `POST` | `/api/ai/chat/stream-page` | 页面生成流式 SSE（phase/delta/reasoning/result/done/error） |
| `POST` | `/api/ai/chat/stream` | 通用对话流式 SSE |
| `POST` | `/api/ai/upload` | 上传聊天附件（multipart/form-data） |
| `POST` | `/api/ai/component-metadata` | 上传组件元数据 |
| `GET` | `/api/ai/component-metadata` | 查询组件元数据状态 |
| `POST` | `/api/ai/debug/route-request` | 触发前端 SSE 路由跳转请求（调试） |
| `POST` | `/api/ai/debug/route-result` | 前端上报路由跳转回执并广播 SSE（调试） |
| `POST` | `/api/ai/debug/screenshot-request` | 触发前端 SSE 截图请求（调试） |
| `POST` | `/api/ai/debug/screenshot-result` | 前端上报截图回执并广播 SSE（调试） |

#### 2) 页面配置（PageConfigController）

| Method | Path | 说明 |
|---|---|---|
| `GET` | `/api/events` | 统一 SSE 事件流 |
| `GET` | `/api/tenants/{tenantId}/projects/{projectId}/pages-config/__list` | 页面列表 |
| `POST` | `/api/tenants/{tenantId}/projects/{projectId}/pages-config/__create` | 创建页面 |
| `DELETE` | `/api/tenants/{tenantId}/projects/{projectId}/pages-config/{pageId}` | 删除页面 |
| `POST` | `/api/tenants/{tenantId}/projects/{projectId}/pages-config/__sync-routes` | 同步 routes |
| `GET` | `/api/tenants/{tenantId}/projects/{projectId}/pages-config/routes.json` | 读取 routes.json |
| `GET` | `/api/tenants/{tenantId}/projects/{projectId}/pages-config/{pageId}/{filename}` | 读取页面文件 |
| `PUT` | `/api/tenants/{tenantId}/projects/{projectId}/pages-config/{pageId}/{filename}` | 写入单文件（只写磁盘，不自动升版） |
| `GET` | `/api/tenants/{tenantId}/projects/{projectId}/pages-config/{pageId}/__versions` | 查询页面全部文件的版本列表 |
| `POST` | `/api/tenants/{tenantId}/projects/{projectId}/pages-config/{pageId}/{filename}/__versions` | 创建文件版本快照（手动升版） |
| `GET` | `/api/tenants/{tenantId}/projects/{projectId}/pages-config/{pageId}/{filename}/__versions` | 查询某文件版本列表 |
| `GET` | `/api/tenants/{tenantId}/projects/{projectId}/pages-config/{pageId}/{filename}/__versions/{version}` | 读取指定版本内容 |
| `POST` | `/api/tenants/{tenantId}/projects/{projectId}/pages-config/{pageId}/{filename}/__versions/{version}/__restore` | 恢复指定版本 |
| `DELETE` | `/api/tenants/{tenantId}/projects/{projectId}/pages-config/{pageId}/{filename}/__versions/{version}` | 删除指定版本 |
| `POST` | `/api/tenants/{tenantId}/projects/{projectId}/pages-config/{pageId}/{filename}/__versions/__prune` | 修剪旧版本 |

**兼容接口（扁平路径，需头部上下文）**

| Method | Path |
|---|---|
| `POST` | `/api/pages-config/__sync-routes` |
| `GET` | `/api/pages-config/routes.json` |
| `GET` | `/api/pages-config/{pageId}/{filename}` |
| `PUT` | `/api/pages-config/{pageId}/{filename}` |
| `GET` | `/api/pages-config/__list` |
| `GET` | `/api/pages-config/__health` |
| `POST` | `/api/pages-config/__create` |
| `DELETE` | `/api/pages-config/{pageId}` |
| `GET` | `/api/pages-config/{pageId}/__versions` |
| `POST` | `/api/pages-config/{pageId}/{filename}/__versions` |
| `GET` | `/api/pages-config/{pageId}/{filename}/__versions` |
| `GET` | `/api/pages-config/{pageId}/{filename}/__versions/{version}` |
| `POST` | `/api/pages-config/{pageId}/{filename}/__versions/{version}/__restore` |
| `DELETE` | `/api/pages-config/{pageId}/{filename}/__versions/{version}` |
| `POST` | `/api/pages-config/{pageId}/{filename}/__versions/__prune` |

#### 3) 导航管理（NavigationController，多租户）

| Method | Path |
|---|---|
| `GET` | `/api/tenants/{tenantId}/projects/{projectId}/navigation` |
| `PUT` | `/api/tenants/{tenantId}/projects/{projectId}/navigation` |
| `GET` | `/api/tenants/{tenantId}/projects/{projectId}/navigation/nodes` |
| `POST` | `/api/tenants/{tenantId}/projects/{projectId}/navigation/nodes` |
| `PUT` | `/api/tenants/{tenantId}/projects/{projectId}/navigation/nodes/{id}` |
| `DELETE` | `/api/tenants/{tenantId}/projects/{projectId}/navigation/nodes/{id}` |
| `PUT` | `/api/tenants/{tenantId}/projects/{projectId}/navigation/nodes/{id}/move` |
| `POST` | `/api/tenants/{tenantId}/projects/{projectId}/navigation/link-probe` |

#### 4) 项目管理（ProjectController，多租户）

| Method | Path |
|---|---|
| `GET` | `/api/tenants/{tenantId}/projects` |
| `POST` | `/api/tenants/{tenantId}/projects` |
| `GET` | `/api/tenants/{tenantId}/projects/{projectId}` |
| `PUT` | `/api/tenants/{tenantId}/projects/{projectId}` |
| `DELETE` | `/api/tenants/{tenantId}/projects/{projectId}` |

#### 5) 通用数据 CRUD（GenericTableController，多租户）

| Method | Path |
|---|---|
| `GET` | `/api/tenants/{tenantId}/projects/{projectId}/data` |
| `GET` | `/api/tenants/{tenantId}/projects/{projectId}/data/{tableName}` |
| `GET` | `/api/tenants/{tenantId}/projects/{projectId}/data/{tableName}/{id}` |
| `POST` | `/api/tenants/{tenantId}/projects/{projectId}/data/{tableName}` |
| `PUT` | `/api/tenants/{tenantId}/projects/{projectId}/data/{tableName}/{id}` |
| `PATCH` | `/api/tenants/{tenantId}/projects/{projectId}/data/{tableName}/{id}` |
| `DELETE` | `/api/tenants/{tenantId}/projects/{projectId}/data/{tableName}/{id}` |
| `DELETE` | `/api/tenants/{tenantId}/projects/{projectId}/data/{tableName}` |
| `POST` | `/api/tenants/{tenantId}/projects/{projectId}/data/{tableName}/__batch` |

#### 6) 表 DDL（TableDdlController）

| Method | Path |
|---|---|
| `GET` | `/api/tables` |
| `POST` | `/api/tables` |
| `GET` | `/api/tables/{tableName}` |
| `DELETE` | `/api/tables/{tableName}` |
| `POST` | `/api/tables/{tableName}/columns` |
| `PUT` | `/api/tables/{tableName}/columns/{columnName}` |
| `DELETE` | `/api/tables/{tableName}/columns/{columnName}` |

#### 7) 认证（AuthController）

| Method | Path |
|---|---|
| `POST` | `/api/auth/login` |
| `POST` | `/api/auth/register` |
| `POST` | `/api/auth/register-tenant` |
| `GET` | `/api/auth/me` |

#### 8) 应用配置（AppConfigController）

| Method | Path |
|---|---|
| `GET` | `/api/config/default` |
| `GET` | `/api/config/tenant/{tenantId}` |
| `POST` | `/api/config/tenant/{tenantId}` |
| `DELETE` | `/api/config/tenant/{tenantId}` |
| `GET` | `/api/tenants` |
| `GET` | `/health` |

#### 9) 缓存（CacheController）

| Method | Path |
|---|---|
| `GET` | `/api/cache/stats` |
| `POST` | `/api/cache/clear-metadata` |

#### 10) 日志（LogsController）

| Method | Path |
|---|---|
| `POST` | `/api/logs` |

#### 11) Stills（StillsController）

| Method | Path | 说明 |
|---|---|---|
| `POST` | `/api/stills/chat` | Stills AI 对话 |
| `POST` | `/api/stills/execute` | 执行 Stills 协议（`text/plain`） |
| `POST` | `/api/stills/session` | 创建 Stills 会话 |
| `POST` | `/api/stills/turn` | 执行一轮 LLM 对话 |
| `POST` | `/api/stills/append` | 向会话追加消息 |
| `POST` | `/api/stills/conversation` | 获取完整对话记录 |
| `POST` | `/api/stills/destroy` | 销毁会话 |
| `POST` | `/api/stills/destroy-batch` | 批量销毁会话 |

### SSE 调试通道（强制优先）

当用户要求“远程调试页面跳转 / 截图 / 联动链路”时，必须优先走 **后端触发 → SSE 下发 → 前端执行 → 结果回执**，不要只给静态建议。

标准流程：
1. 调用调试触发接口（`/api/ai/debug/route-request` 或 `/api/ai/debug/screenshot-request`）。
2. 监听 `/api/events`，确认至少收到对应 `debug-*-request`。
3. 以 `debug-route-result` / `debug-screenshot-result` 判断执行是否成功（仅收到 request 事件不算成功）。
4. 回报时必须带 `requestId`，用于一次链路串联定位。

无文件模型诊断策略：
- 若模型不支持读取上传文件，优先使用 `debug-screenshot-result` 的文本字段诊断：`status`、`message`、`textDigest`、`resolvedSelector`、`url`、`title`、`viewport`。
- 不要要求用户先下载图片再开始第一轮诊断；先依据回执文本定位问题，再决定是否需要二次截图。

### 数据存储

| 数据 | 位置 | 持久化 |
|------|------|--------|
| 页面配置（工作文件） | `spark-ai-server/data/pages-config/` | ✅ 文件系统（git-tracked） |
| 页面配置（版本快照） | `spark-ai-server/data/pages-config/{tenant}/{project}/{page}/{version}__{filename}` | ✅ 文件系统（扁平命名） |
| 版本元数据 | H2 嵌入式数据库 `file_version` 表 | ✅ H2 file-based（`data/sparkdb`） |
| 组件元数据 | `spark-ai-server/data/component-metadata.json` | ✅ 文件（构建时写入，启动时加载） |
| 租户配置 | 内存 `ConcurrentHashMap` | ❌ 重启丢失 |

### 环境变量

| 变量 | 用途 | 默认值 |
|------|------|--------|
| `OPENAI_API_KEY` | LLM API Key | 必填 |
| `OPENAI_BASE_URL` | LLM 端点 | `https://api.openai.com` |
| `AI_MODEL` | 模型名 | `gpt-4o` |
| `PAGES_CONFIG_DIR` | 页面配置目录 | `data/pages-config` |

### 构建管道（scripts/build-all.mjs）

```
Step 1: mvn clean package -DskipTests     → JAR
Step 2: 启动 Java 后端（后台）              → 等待就绪
Step 3: vite build                          → dist/ + spark-component-metadata.json
Step 4: POST 元数据到 /api/ai/component-metadata → 服务端持久化
Step 5: taskkill /PID /T /F                → 关闭 Java
```

**⚠️ Windows 进程树**: `shell: true` spawn 创建 `cmd → mvn → java` 进程树，`process.kill()` 只杀顶层。必须用 `taskkill /PID /T /F`。

### 开发启动（scripts/start-dev.mjs）

`pnpm run dev` → 自动检测 JAVA_HOME → 启动 Java → 等待 8080 就绪 → 启动 Vite

### ⚠️ 注意事项

- `spark-ai-server/` 是独立 Maven 项目，**不是** pnpm workspace 成员
- 页面配置已从 `public/pages-config/` 完全迁移到 `spark-ai-server/data/pages-config/`
- `ComponentMetadataService` 启动时从 `data/component-metadata.json` 自动加载，无需每次构建
- Vite `SparkComponentsPlugin`（`tools/vite-plugin-spark-components.ts`）构建时提取组件元数据到 `dist/spark-component-metadata.json`

## Performance notes ⚡
- **`spark-data` 无框架依赖**——DataView 通过 `DataView.wrapInstance` 静态钩子让框架层注入包装（SparkPlugin 中设为 `shallowReactive()`，仅追踪顶层属性）
- `useSparkComponent` 使用 `shallowReactive`（顶层响应式）+ `markRaw(capabilities)`、`markRaw(children)`，大幅减少 Vue 响应系统开销
- logger 统一解析页面层 `APP_SERVICES.logger`，缺失时回退到 console
- 组件 ID 使用全局单调计数器（`spark-${++_idCounter}`），比 `Date.now()+random` 更快且 SSR 友好
- `getAll()` 直接返回内部 Map 引用（`ReadonlyMap`）：O(1)，无拷贝
- `SparkComponentRenderer` 不再调用 `useSparkComponent()`，直接 `inject(SPARK_REGISTRY_KEY)`，消除渲染器中间 context 节点（上下文链：`root → business`，而非 `root → renderer → business`）
- 调试日志全部包裹在 `import.meta.env.DEV` 守卫内，生产包无调试输出
