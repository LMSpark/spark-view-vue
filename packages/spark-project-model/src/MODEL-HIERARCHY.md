# ProjectModel 统一软件模型

> 本文档定义 `@spark-appworks/spark-project-model` 的目标模型。当前实现尚未完全达到这里描述的形态；后续重构以本文为准。
> `ProjectModel` 是软件设计态与运行态的一体化根模型，范围高于导航树或页面四文件聚合壳。

## 根模型定位

`ProjectModel` 代表一个可设计、可运行、可诊断、可由 AI 修改的软件项目。

它统一承载三类状态：

- `design`：软件设计态，描述项目想成为什么。
- `runtime`：框架无关运行态，描述项目正在如何运行。
- `editor`：设计工具/DevSystem 的编辑会话态，描述当前如何修改这个项目。

目标结构：

```text
ProjectModel
  design
    navigationDesign
    pageDesigns
    dataDesigns
    scriptStyleDesigns
    aiDesignContext
  runtime
    navigationRuntime
    routeRuntime
    pageRuntimeInstances
    dataSetRuntime
    moduleContextRuntime
    permissionRuntime
    runtimeErrors
  editor
    devSystemWorkspace
    drafts
    dirtySaveState
```

## design 子域

`design` 是项目的设计真源投影，来源仍然是 DB + page files：

- DB navigation 描述项目结构、模块、页面入口、权限、上下文和路由意图。
- `rule.json` 描述页面组件树。
- `pagedata.json` 描述 DataSet、DataTable、DataView 和字段关系。
- `script.js` / `style.css` 描述配置无法表达的页面行为和样式补充。
- AI design context 描述 page-design 运行时需要看到的项目目标、节点描述、页面概要和能力边界。

设计态修改必须能定位到明确真源：DB 节点字段或页面四文件。禁止新增第三份可恢复业务设计状态。

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

## editor 子域

`editor` 是 DevSystem 和 AI 编辑的会话态，属于 ProjectModel 的工具子域，而不是独立模型主语。

允许持有：

- `selectedNodeId`
- `activePageId`
- detached / draft page registrations
- navigation edit drafts
- file edit drafts
- dirty/save state
- autosave state
- tool approval / AI design session pointers

这些状态不直接落盘，但它们属于“软件正在被设计”的一部分，可以放在 ProjectModel 的 `editor` 子域中统一编排。

## ProjectEditor 定位

`ProjectEditor` 是 AI + DevSystem 共用的项目编辑协同层。它放在本包中，是为了让人工设计和 AI page-design 使用同一套 edit/CRUD/save/diagnostics 流程，而不是各自维护一套项目编辑状态。

目标职责：

- 接入 HTTP、文件 API、导航 API、DevSystem 事件和 AI tool 调用。
- 把用户交互与 AI 操作统一转换为 ProjectModel 的 design/editor 命令。
- 暴露兼容快照给现有 Vue DevSystem，并向 AI 暴露稳定、可诊断的编辑上下文。
- 保证 AI 与 DevSystem 看到同一个 active project、page、draft、dirty/save 和 diagnostics 语义。

非目标职责：

- 不另起一套项目状态。
- 不把 selected/active/dirty 作为 ProjectModel 外部的第二份事实。
- 不让 DevSystem 或 AI 直接写穿领域节点对象。

## ConfigPageNode 定位

`ConfigPageNode` 的目标定位不是孤立页面文件模型，而是 ProjectModel 下的 page design + page runtime 节点。

它可以暂时保留现有 API，但后续语义应收敛为：

- page design：rule/data/script/style 的设计态。
- page runtime：加载态、渲染配置、DataSet live state、运行错误。
- page diagnostics：从运行态回到设计源的定位信息。

`ConfigPageNode` 不应长期继承导航节点编辑态；导航节点设计属于 `design.navigationDesign`，页面设计属于 `design.pageDesigns`，二者通过 pageId/nodeId 建立关系。

## 依赖方向

目标依赖方向：

```text
ProjectModel
  -> design 子域
  -> runtime 子域
  -> editor 子域

ProjectEditor / DevSystem / AI adapters
  -> ProjectModel

spark-app / spark-component runtime
  -> ProjectModel runtime projections
```

禁止反向依赖到 Vue、Router、Element Plus 或 DOM。ProjectModel 可以服务运行，但不能变成 UI 框架对象。

## 公共入口意图

| 入口 | 目标语义 |
|---|---|
| `@spark-appworks/spark-project-model` | 软件模型根、设计/运行公共类型、页面工厂兼容出口 |
| `@spark-appworks/spark-project-model/project` | AI + DevSystem 共用项目编辑协同层 |
| app service page-design business | page-design AI 对 ProjectModel 的设计入口 |
| `@spark-appworks/spark-project-model/json-document` | 独立 JSON 文档运行时 |

后续实现中，新的能力优先挂到 ProjectModel 的 design/runtime/editor 子域，而不是继续扩散到 ProjectEditor 或 UI 层。
