# @spark-appworks/spark-project-model

`spark-project-model` 是 SPARK 的软件设计模型核心。**设计即编辑**：改树、改页面、选中、dirty、保存是同一语义。

- `ProjectModel`：设计内容 + 运行投影（内存结构）。
- `ProjectEditor`：设计的对外门面（API、事件、落盘），不是与 design 对立的另一层。

本包文化：**模型是 class 层级**（`ProjectModel` → `ProjectNode` / `ConfigPageNode` → 四文件 class）；DTO 只作传输与落盘映射。**模型形状不必与存储同构**；落盘仍只有 DB + file。

## 这个包负责什么

- `ProjectModel`：导航/页面设计内容 + 运行投影。
- `ProjectEditor`：人工与 AI 共用的设计门面（CRUD、四文件、save、`subscribe`）。
- 导航、组件树、DataSet、脚本/样式、AI context 均属设计；运行投影单独在 runtime 子域。
- page-design AI 的业务注册放在 app service 层；本包只提供可被注册消费的项目模型。
- pagedata 规范化在 `model/serialization/page-data`；DevSystem 设计器 schema/投影在应用层 `src/services/project-model-artifacts/`。

## 它不负责什么

- 不直接持有 Vue component instance、DOM、Vue Router instance 或 Element Plus API。
- 不把浏览器全局对象当作模型状态。
- 不直接渲染页面 UI；渲染由 `spark-component` 物化 ProjectModel 的运行投影。
- 不新增第三份可恢复业务真源；持久化真源仍然只能落到 DB navigation 或 page files。
- 不用 `script.js` 旁路替代配置可表达的 `rule.json` / `pagedata.json` 行为。

## 当前源码分层（文件夹 = 语义边界）

```text
src/
├── index.ts              # 领域模型 + PageNodeFactory + compiler
├── project.ts            # ProjectEditor + artifact 制品
├── model/                # 领域 class
│   ├── project/          # ProjectModel、ProjectDesign、NavigationDesign、ProjectRuntime
│   ├── navigation/       # ProjectNode 子类、索引
│   ├── page/             # ConfigPageNode、四文件
│   └── serialization/    # compileRule、parsePageData 等纯函数
├── facade/               # ProjectEditor + 协作者 + EditorSession
├── factory/              # PageNodeFactory（组合根）
└── io/                   # file/navigation/loader/reference/http
```

`src/MODEL-HIERARCHY.md` 是模型契约；`src/STRUCTURE.md` 是目录地图；`docs/unified-model-refactor-plan.md` 是重构执行计划。

## 存储真源、领域模型、运行态

- **存储真源**（落盘）：DB navigation（常为平铺行）、page 四文件。这是 commit 的唯一去向。
- **领域模型**（内存）：`ProjectModel` 可用树、索引、派生 summary 等——**不必**与表/文件一一对应；由 load/save 适配写回 `nodeId` / `pageId` / 文件名锚点。
- **运行态**（内存）：框架无关 live state（加载态、DataSet 当前行、权限投影、错误）。不落盘，但诊断应能指回存储锚点或模型内设计节点。
- 设计态与运行态共用 `ProjectModel` 根；存储变更经 `ProjectEditor` 映射，不要求模型中间态与磁盘格式一致。

## 公共入口

- `@spark-appworks/spark-project-model`：设计/运行的领域类型（ProjectModel、导航、ConfigPageNode）。
- `@spark-appworks/spark-project-model/project`：设计门面（ProjectEditor + 落盘）。

跨包消费只能走 `index` 与 `project` 两个入口。包外不要 import `src/model/*`、`src/io/*`、`src/facade/*`（除文档允许的包内测试路径）。包内测试引用 `src/model/...` 或 `src/io/...`。

## 模型、领域实例、门面实例

| 概念 | 说明 |
|---|---|
| 模型（类型） | 本包 `ProjectModel`、`ProjectEditor` 等 class；无全局单例 |
| 领域实例 | `editor.project`（`ProjectModel`），design + runtime 真源 |
| 门面实例 | APP `getAppProjectEditor()` 返回的 `ProjectEditor`（session + io） |

`createProjectEditor()` 是工厂；谁持有单例由 APP 决定。勿把门面实例称作「模型实例」。

## UI 与模型

- UI 经**门面实例** API 编辑**领域实例**（导航、四文件、选中、保存）；不绕过门面直接操作存储。
- UI 通过 `editor.subscribe()` 感知 `revision` 变化，再 `readSnapshot()` / `getActivePage()` 刷新视图。
- 模型包不 import Vue；DevSystem 设计器制品在 `src/services/project-model-artifacts/`。

## 目标数据流

```text
DB navigation + page files
  -> ProjectModel.design
  -> ProjectModel.runtime projections
  -> spark-app routing/navigation + spark-component rendering

DevSystem / AI
  -> ProjectEditor (selectNode, selectPage, save, subscribe)
  -> ProjectModel (replaceRoot, openConfigPage, …)
  -> DB navigation + page files
  -> runtime projections refresh
```

配置页运行数据仍遵守 SPARK 的 DataSet 单向管线：

```text
pagedata.json -> parsePageData -> DataSet -> usePageDataSet -> PAGE_DATASET -> DataViewKey -> UI
```

## 开发规则

- 保持框架无关：本包不要导入 `vue`、`vue-router`、`element-plus`。
- ProjectModel 可以持有 headless runtime state，但不得持有 UI 框架实例。
- 设计内容与 runtime 在 `ProjectModel`；对外设计 API、事件、I/O 在 `ProjectEditor`，不散落到 Vue。
- 保持 fail-fast：缺失 pageId、无效节点、未加载页面、配置不一致要抛错。
- 新增公共能力前先决定出口：root 或 `/project`。
- LLM 可见语义写在首次声明处，metadata 不承诺未注册的函数、属性或子模块。

## 快速验证

```bash
pnpm --dir packages/spark-project-model run typecheck
pnpm --dir packages/spark-project-model run lint
pnpm --dir packages/spark-project-model run test:run
```
