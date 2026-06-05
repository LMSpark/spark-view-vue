# ProjectModel 统一软件模型

> 本文档定义 `@spark-appworks/spark-project-model` 的目标模型。源码目录已与 class 层级对齐：`model/` / `facade/` / `io/`。
> `ProjectModel` 是软件设计与运行的一体化根模型。设计即编辑——改结构、改页面、选中、dirty、保存都是同一语义，不在文档或分层里拆成两套故事。

## 根模型定位

`ProjectModel` 代表一个可设计、可运行、可诊断、可由 AI 修改的软件项目。

它统一承载三类状态：

- `design`：软件正在被塑造的内容（含未落盘的草案、dirty、工作区选择——都属于设计过程，不是另一套「编辑」语义）。
- `runtime`：框架无关运行态，描述项目正在如何运行（与 design 区分的是「跑起来」，不是「改不改」）。

目标结构（逻辑子域，将逐步收成 **class 组合**，而不是散落的 type + Map）：

```text
ProjectModel
  design
    navigationDesign
    pageDesigns
    ...
  runtime
    navigationRuntime
    pageRuntimeInstances
    ...
```

## 类层级（模型主语）

**模型 = 可持有的 class 实例树**；消费方（DevSystem、AI、运行态）应沿类型层级向下访问，而不是把 `ProjectNodeData` JSON 树当作模型本身。

`ProjectNodeData`、`ProjectModelData`、`NavigationNodeEditDto` 等 **type** 只用于：API 载荷、load/save 映射、快照序列化。进入包内后应尽快变成 **class**。

### 当前已实现

```text
ProjectModel                          # 项目根；family = 'project'
├── design: ProjectDesign
│   ├── navigation: NavigationDesign  # 持有 nodesById + NavigationIndex
│   └── pages → ConfigPageNode*
├── runtime: ProjectRuntime           # 已加载页渲染快照等
├── ProjectNode
│   ├── ModuleNode / SystemDirectoryNode / LinkNode / RefNode / VueComponentPageNode / SystemActionNode
│   └── ConfigPageNode / ConfigSubPageNode
│       ├── design: PageDesign        # rule / dataSet / script / style
│       ├── runtime: PageRuntime      # isLoaded、toRenderConfig
│       └── PageRuleFile / PageDataSetFile / PageTextFile ×2
└── NavigationIndex                   # 结构索引

ProjectEditor                         # 薄编排门面
  EditorSession                       # 选中 / dirty / working DTO / revision
  NavigationEditor / PageFileEditor / PageLifecycle / …
```

原则：

- **向下走 class**：`project.findNodeById(id)` → `ConfigPageNode` → `page.rule.tree`，类型系统表达层级。
- **横向不另起字典模型**：避免「一套 class + 一套平行 ProjectNodeData 真源」双主语；DTO 从 class `toNodeData()` 导出，从 DTO `replaceRoot` / `rebind` 灌入 class。
- **子类按领域分，不按存储分**：DB 平铺、四文件是存储形状；class 按 module / config-page / link 等业务分。
- `ProjectEditor` 编排设计与落盘，**不**挤进 `ProjectModel` 继承链。

## 模型与存储：不必同构

**持久化真源**（commit 落点）与 **领域模型**（推理与运行用的内存形状）是两层，不要混为一谈。

| 层 | 职责 | 形状示例 |
|---|---|---|
| 存储 | 可恢复、可 diff、可审计 | DB 平铺行、`rule.json` 四文件 |
| 领域模型 | 便于导航、页面、运行、诊断 | 树、`NavigationIndex`、派生 summary |
| 设计门面 | `ProjectEditor`、loader、repository | 设计操作的 API + 事件；load/save 映射到存储锚点 |

原则：

- 模型**不必**与表结构、文件目录一一对应；允许树索引、派生字段、聚合视图、与 UI 对齐的 DTO。
- 存储**仍是**业务可恢复数据的唯一落点；禁止在模型里再养一份可独立落盘的第二真源。
- 每次持久化必须能映射到明确锚点（`nodeId`、`pageId`、文件名/字段），但模型内部可以先用更适合编辑与运行的结构组织信息。

当前实现：`replaceRoot` 吃树形 DTO，内部用平铺索引加速查询——这是适配层选择，不是“模型必须等于 DB 平铺”的定律。

## design 子域

`design` 就是「正在设计的软件」——包含已加载的导航/页面内容、进行中的属性修改、dirty 与选中焦点。这些都属于设计，不要另起「编辑层」语义。

**从** DB navigation 与 page files **加载**，在内存里可组织成与存储不同的形状：

- 导航：模块树、权限、上下文、路由意图。
- 页面：`rule` / `pagedata` / `script` / `style`（模型侧常为 `ConfigPageNode` 聚合）。
- AI design context：派生上下文，不单独落盘。

落盘时必须能**定位到存储锚点**；保存前内存形状不必等于表/文件。

## runtime 子域

`runtime` 是 ProjectModel 内部的 headless runtime state。它可以持有完整运行态，但必须保持框架无关。

允许持有：

- 当前导航运行投影、区域分组、模块上下文选择。
- 路由运行投影，包括项目内页面、跨项目引用、系统页和外链目标。
- 页面运行实例状态，包括 pageId、加载状态、渲染配置快照、运行错误。
- DataSet / DataView 当前运行态，包括当前行、选择、聚合、加载/请求状态。
- 权限运行投影，包括节点权限、字段权限和 action 可执行状态。
- runtime diagnostics，用于从运行异常反向定位到设计源。

禁止直接持有：

- Vue component instance。
- DOM / HTMLElement。
- Vue Router instance。
- Element Plus API、message box、notification 等 UI 服务。
- 浏览器全局对象作为模型状态。

运行态可以被设计态直接更新。例如 page-design 修改 `rule.json` 后，ProjectModel 可以刷新对应页面运行投影；运行时错误也必须能反查到 pageId、nodeId、dataViewKey 或脚本位置。

## UI 与模型

**单向关系**：UI 不拥有业务真源，只通过模型 API 读写、通过订阅感知变化。

```text
UI（DevSystem / Vue）
  │  调用 ProjectEditor API（selectNode、applyNavigationEditDto、setPageFileText、save…）
  ▼
ProjectEditor → ProjectModel.design / ConfigPageNode
  │  bump() → revision++
  ▼
UI subscribe(revision) → readSnapshot() / getActivePage() → 刷新视图
```

约定：

| 侧 | 职责 |
|---|---|
| **模型** | 持有设计内容与运行投影；变更只经 `ProjectEditor` 方法发生；变更后 `session.bump()` 递增 `revision` |
| **UI** | 不直接改 DB、不绕过门面写四文件；编辑走 API；展示用 `readSnapshot()` 或 `getActivePage()` 投影，不用平行草稿真源 |
| **DevSystem 投影** | `treeData` / `pageList` / `selectedNode` 等为 `readSnapshot()` 的 computed，经 `editor.subscribe` 刷新 |
| **订阅** | `editor.subscribe(listener)` 在 `revision` 变化时回调；UI 在 listener 内读模型并更新响应式状态（如 `pageFilesRevision`） |

### 模型、领域实例、门面实例（勿混）

三者必须分清，文档与命名里不要统称「模型实例」：

| 概念 | 是什么 | 在哪 |
|---|---|---|
| **模型（类型）** | `ProjectModel`、`ProjectEditor`、`ConfigPageNode` 等 **class 定义** | `spark-project-model` 包；**无**全局单例 |
| **领域实例** | `ProjectModel` **对象**，`design` + `runtime` 真源 | 活在 `ProjectEditor.project` 内 |
| **门面实例** | `ProjectEditor` **对象**，编排 API、session、io、落盘 | APP `getAppProjectEditor()` 单例 |

```text
spark-project-model（包）
  class ProjectModel          ← 模型类型
  class ProjectEditor         ← 门面类型
  createProjectEditor()       ← 工厂，每次调用新建一对 facade + domain

APP project-editor-host
  getAppProjectEditor()       ← 门面实例（单例）
    .project                  ← 领域实例（ProjectModel）
    .session                  ← 设计过程态（选中、dirty、revision）
    NavigationEditor / …      ← io 协作者

登录 / refreshRoutes
  → DynamicRouter 导航 DTO
  → syncAppProjectEditorFromNav(getNavTree())
       → editor.ingestNavigationRoot → 写入 editor.project（领域实例）

DevSystem
  → state.editor = getAppProjectEditor()   // 拿门面实例
  → state.editor.selectNode / setPageFileText / save…   // 经门面改领域
  → state.editor.readSnapshot()            // 读投影，不另养平行真源
```

| 层 | 职责 |
|---|---|
| `spark-project-model` | 模型**类型**与门面**类型**；`createProjectEditor` 工厂 |
| APP `project-editor-host` | 当前项目的门面**实例**生命周期；`ingestNavigationRoot` 灌入 `editor.project` |
| **DevSystem** | 当前项目导航设计 UI；只经门面 API 读写，不自建 `ProjectModel` |

**禁止**把 `ProjectEditor` 称作「模型」或「模型实例」——它是门面；**领域真源**是 `editor.project`（`ProjectModel`）。DevSystem 不是第二套文件系统，而是同一领域实例在壳层的 Vue 投影。

**禁止** DevSystem 自建 `createProjectEditor`、禁止平行「文件 API」、禁止直接 `page.rule.setText`。

设计器 schema/投影在 `src/services/project-model-artifacts/`，只读模型、写入仍经 `ProjectEditor`。

## ProjectEditor 定位（设计门面，与 design 同语义）

`ProjectEditor` 不是与「设计」对立的第二层，而是 **设计操作的统一门面**：DevSystem、AI、脚本都通过它改项目。

- **API**：`selectNode`、`selectPage`、`applyNavigationEditDto`、`save`、页面挂载/四文件读写等——都是设计动作。
- **事件**：`subscribe` + `revision`，通知「设计上下文变了」（含选中、dirty、内容变更）。
- **存储映射**：HTTP/导航 client/文件 API，把设计结果 commit 到 DB + file。

`ProjectEditor.session`（选中、活动页、dirty、working DTO）是**设计过程态**，不落盘，但与 `ProjectModel` 里的设计内容同属一条语义；只是实现上放在门面里，避免把 Vue/HTTP 耦进领域类型包。

`ProjectModel` 持有设计内容与运行投影的类型与结构；`ProjectEditor` 持有「怎么对外做设计、怎么落盘」。这是**模块分工**，不是 design / edit 两套业务。

## ConfigPageNode 定位

`ConfigPageNode` 是 ProjectModel 下的页面设计节点 + 页面运行投影，不是孤立的「文件编辑器」。

- 设计侧：rule / data / script / style 的内容与变更。
- 运行侧：加载态、渲染配置、DataSet live state、错误。
- 与导航节点通过 pageId / nodeId 关联；导航设计在树节点，页面设计在 ConfigPageNode。

## 依赖方向

目标依赖方向：

```text
ProjectModel (design + runtime，内存形状 ≠ 存储形状)

DevSystem / AI
  -> ProjectEditor（设计 API + 事件 + load/save）
  -> ProjectModel（设计内容 + runtime）

spark-app / spark-component runtime
  -> ProjectModel runtime projections
```

禁止反向依赖到 Vue、Router、Element Plus 或 DOM。ProjectModel 可以服务运行，但不能变成 UI 框架对象。

## 公共入口意图

| 入口 | 目标语义 |
|---|---|
| `@spark-appworks/spark-project-model` | 设计/运行的领域类型与结构：ProjectModel、导航、ConfigPageNode |
| `@spark-appworks/spark-project-model/project` | 设计门面：ProjectEditor（API、session、subscribe、落盘） |
| app service page-design business | page-design AI 对 ProjectModel 的设计入口 |
| `@spark-appworks/spark-json-document` | 独立 JSON 文档运行时（rule schema 等制品依赖） |

后续实现（见 [`docs/unified-model-refactor-plan.md`](../docs/unified-model-refactor-plan.md) 阶段 5）：

1. 在 `ProjectModel` 上显式暴露 `design` / `runtime` **聚合 class**（`ProjectRuntime.findLoadedPage` 等已起步）。
2. 按 `nodeKind` 补足 `ProjectNode` 子类，与 `ConfigPageNode` 同级，而不是扩 DTO 字段集。
3. 对外设计与落盘走 `ProjectEditor`；勿把 JSON DTO 当模型主语；勿引入「设计 vs 编辑」并列文档。
