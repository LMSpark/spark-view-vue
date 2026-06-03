# spark-project-model 代理说明

这些规则适用于 `packages/spark-project-model/` 下的修改。

## 目标方向

`ProjectModel` 是软件设计 + 运行一体化的根模型。后续修改代码时，以 `ProjectModel` 为模型主语；`ProjectEditor` 是 AI + DevSystem 共用的编辑协同层，不是单个 UI 的私有适配器。

目标结构：

```text
ProjectModel
  design
  runtime
  editor
```

- `design` 承载导航设计、页面设计、DataSet 设计、脚本/样式设计和 AI design context。
- `runtime` 承载框架无关运行态：导航投影、路由投影、页面运行实例、DataSet/DataView live state、模块上下文、权限投影、运行错误。
- `editor` 承载 DevSystem/AI 编辑会话：selected、active page、drafts、dirty/save state、detached pages。

## 当前结构优先

当前运行源码仍使用：

```text
core/    当前领域模型、节点、导航编辑 DTO、配置页四文件模型
infra/   文件/导航/引用/内容加载设施
editor/  AI + DevSystem 共享 ProjectEditor facade 与 PageNodeFactory
design/  data/rule/json-document artifact
ai/      page-design AI 注册
vcm/     generated metadata
```

`src/MODEL-HIERARCHY.md` 是目标模型契约。`docs/unified-model-refactor-plan.md` 是未来目录迁移计划，不是当前源码地图。除非任务明确要求目录迁移，否则不要把 `entity/`、`service/`、`contract/` 等计划路径写进测试、工具或 import。

## 边界文化

- 持久化真源仍然只有 DB navigation + page files。
- ProjectModel 可以持有完整 headless runtime state，但运行态必须能反向定位到设计真源。
- ProjectModel 不得直接持有 Vue component instance、DOM、Vue Router instance、Element Plus API 或浏览器全局对象作为状态。
- `ProjectEditor` 是 AI + DevSystem 共用的项目编辑协同层，用同一套 edit/CRUD/save/diagnostics 流程服务人工设计和 AI page-design。
- `ProjectEditor` 不成为模型主语；它负责把 DevSystem 交互、AI tool 调用和外部 I/O 编排成 ProjectModel 的 design/editor 命令。
- `ConfigPageNode` 后续应被理解为 ProjectModel 下的 page design + page runtime 节点，而不是孤立页面文件模型。
- 缺失 API、无效配置、未加载页面、状态不一致必须 fail-fast。

## 公共出口

跨包消费只能使用：

```text
@spark-appworks/spark-project-model
@spark-appworks/spark-project-model/projectDevSystem
@spark-appworks/spark-project-model/ai
@spark-appworks/spark-project-model/json-document
```

包外不要相对导入本包 `src/*`。包内测试可以测内部函数，但必须引用当前真实路径，例如 `../src/core/navigation-edit`。

## AI / VCM

- page-design 的模型根是 `ProjectModel`。
- page-design metadata 的源码根是 `src/core/project.ts`、`src/core/config-page.ts` 加 `spark-data` 的 DataSet / node-tree 能力。
- metadata 输出在 `src/vcm/page-design/page-design-vcm-metadata.generated.json`。
- `AiModule` metadata 不得承诺未注册的函数、属性或子模块。
- LLM 可见能力说明优先写在 class/function 首次声明处。

## 验证

文档改动至少做计划中约定的静态核对，确保没有把 ProjectModel 限定回窄模型，也没有把 ProjectEditor 写成模型主语。

实现改动后至少运行：

```bash
pnpm --dir packages/spark-project-model run typecheck
```

触及编辑器、导航、四文件模型、AI metadata 时继续运行：

```bash
pnpm --dir packages/spark-project-model run test:run
```
