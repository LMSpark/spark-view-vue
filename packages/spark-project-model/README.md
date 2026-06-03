# @spark-appworks/spark-project-model

`spark-project-model` 是 SPARK View 的软件模型核心。它的目标不是只管理项目树或配置页文件，而是让 `ProjectModel` 成为软件设计态、运行态、AI 设计能力和 DevSystem 编辑能力的一体化根模型。

本包的文化：软件只有一个模型根。设计修改、运行投影、运行诊断和编辑会话都应该能回到同一个 `ProjectModel`，但这个模型必须保持框架无关。

## 这个包负责什么

- 软件项目根模型：`ProjectModel` 是设计 + 运行 + 编辑会话的统一入口。
- 设计态：导航设计、页面组件树、DataSet 设计、脚本/样式设计、AI design context。
- 运行态：导航运行投影、路由投影、页面运行实例、DataSet/DataView live state、模块上下文、权限投影、运行错误。
- 共享编辑协同：`ProjectEditor` 作为 AI + DevSystem 共用 façade，把人工交互和 AI tool 调用转换为 ProjectModel 命令。
- AI page-design：把 `ProjectModel` 暴露给 AI，使设计修改能定位到项目、页面、数据和运行诊断。
- 独立 artifact：rule schema、DataSet 设计器投影、JSON document runtime。

## 它不负责什么

- 不直接持有 Vue component instance、DOM、Vue Router instance 或 Element Plus API。
- 不把浏览器全局对象当作模型状态。
- 不直接渲染页面 UI；渲染由 `spark-component` 物化 ProjectModel 的运行投影。
- 不新增第三份可恢复业务真源；持久化真源仍然只能落到 DB navigation 或 page files。
- 不用 `script.js` 旁路替代配置可表达的 `rule.json` / `pagedata.json` 行为。

## 当前源码分层

```text
src/
├── core/      # 当前领域模型与稳定数据形状：ProjectModel、ProjectNode、ConfigPageNode、四文件内容模型
├── infra/     # I/O 与加载设施：file API/cache、navigation client、content loader、reference client
├── editor/    # 当前 AI + DevSystem 共享 facade 与 PageNodeFactory 装配
├── design/    # 设计器 artifact：data/rule schema、json-document runtime
├── ai/        # AI-facing registration
├── vcm/       # generated VCM metadata
└── *.ts       # public entry barrels
```

`src/MODEL-HIERARCHY.md` 定义目标模型。当前实现尚未完全达到该形态，后续重构应向 `ProjectModel.design/runtime/editor` 三子域收敛。

## 真源与运行态

- DB navigation 是项目结构、模块、路由入口、权限和上下文设计的持久化真源。
- Page files 是页面设计的持久化真源：`rule.json`、`pagedata.json`、`script.js`、`style.css`。
- ProjectModel runtime 可以持有完整框架无关 live state，例如页面加载态、DataSet 当前态、模块上下文、权限投影和运行错误。
- 运行态不是第三份业务真源；它必须能反向定位到 DB navigation 或 page files。
- 设计态与运行态共用同一个模型根：设计修改可以刷新运行投影，运行诊断可以定位设计源。

## 公共入口

- `@spark-appworks/spark-project-model`：软件模型根、设计/运行公共类型、页面工厂兼容出口。
- `@spark-appworks/spark-project-model/project`：AI + DevSystem 共用项目编辑协同层。
- `@spark-appworks/spark-project-model/ai`：page-design AI 对 ProjectModel 的设计入口。
- `@spark-appworks/spark-project-model/json-document`：独立 JSON document runtime。

跨包消费只能走这些入口。包外不要 import `src/core/*`、`src/infra/*`、`src/editor/*`。包内测试可以引用内部文件，但必须引用当前真实路径。

## 目标数据流

```text
DB navigation + page files
  -> ProjectModel.design
  -> ProjectModel.runtime projections
  -> spark-app routing/navigation + spark-component rendering

DevSystem / AI
  -> shared ProjectEditor / AI adapter
  -> ProjectModel.editor/design commands
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
- 新增能力优先归入 `ProjectModel.design`、`ProjectModel.runtime` 或 `ProjectModel.editor` 的语义，而不是散落到 UI 层。
- 保持 fail-fast：缺失 pageId、无效节点、未加载页面、配置不一致要抛错。
- 新增公共能力前先决定出口：root、`/project`、`/ai` 或 `/json-document`。
- VCM/LLM 可见语义写在首次声明处，metadata 不承诺未注册的函数、属性或子模块。

## 快速验证

```bash
pnpm --dir packages/spark-project-model run typecheck
pnpm --dir packages/spark-project-model run lint
pnpm --dir packages/spark-project-model run test:run
```
