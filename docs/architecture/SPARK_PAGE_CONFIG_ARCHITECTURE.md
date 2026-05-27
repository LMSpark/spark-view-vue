# spark-page-config 架构

`spark-page-config` 负责框架无关的页面配置边界。它不能导入 Vue、Vue Router 或 Element Plus；渲染器和应用层只能通过包根入口、`./editor`、`./ai` 和 `./json-document` 消费它。

## 公共分层

```text
root 配置运行时 -> editor 编辑聚合 -> ai 业务注册 -> json-document 公共辅助能力
```

- `@spark-view/spark-page-config` 是运行态四文件协议入口：loader、compiler 和页面配置文件 API。
- `@spark-view/spark-page-config/editor` 是 DevSystem 编辑态 SSOT：`PageEditor` 持有已打开的 `PageModel` 实例、生命周期、导航、`SparkNodeTree`、`DataSetCrudTool` 和预览配置构建能力。
- `@spark-view/spark-page-config/ai` 是公开的 pageDesign / leave-request AI 业务注册入口。它只暴露注册 helper、kind 常量和诊断能力，不导出 tool module 内部实现。
- `@spark-view/spark-page-config/json-document` 是通用 JSON 树编辑模型。

包根入口必须保持收敛：它只导出配置运行时能力。不要重新引入旧的 `config`、`node-tree`、`navigation`、`runtime`、`design`、`page/*`、`capabilities/*` 或 `registrations` 子路径。

## 运行时流程

```text
原始四文件
  -> PageConfigFileRegistry
  -> PageConfigLoader
  -> PageConfigCompiler
  -> PageConfig
  -> SparkPageRenderer
```

标准四文件是 `rule.json`、`pagedata.json`、`script.js` 和 `style.css`。必需文件语义由 `PageConfigFileRegistry` 维护；loader 行为应从 descriptor 推导，不要再维护独立的文件名数组。

`rule.json` 会编译为归一化的 `SparkNode` children。`pagedata.json` 会通过 `spark-data` 编译为 `DataSet`。`script.js` 和 `style.css` 在这一层保持文本模型。

## 设计态流程

```text
PageEditor
  -> PageModel 缓存
  -> PageConfigFileLifecycle
  -> NavigationEditSession / NavigationConfigClient
  -> SparkNodeTree / DataSetCrudTool / PageTextModel
```

设计态编辑以 `PageModel` 子模型作为唯一事实源：

- `rule.json` 由 `SparkNodeTree` 提供模型支撑。
- `pagedata.json` 由 `DataSetCrudTool` 提供模型支撑。
- `script.js` 和 `style.css` 由带 snapshot history 的文本模型支撑。
- pageDesign AI 通过 `PageEditor.createPageDesignEditHost({ pageId })` 写入，因此 AI session 绑定的是 session pageId，而不是 UI 当前激活的页面。

`PageEditor` 是公开编辑入口。更底层的 workspace、lifecycle、navigation 和 document primitive 都是内部实现细节；DevSystem 不应直接导入或操作它们。

## AI 分层

- AI 平台层位于 `@spark-view/spark-ai/*`：host、session、runtime、传输回调，以及固定的 `module_*` 协议。
- 业务注册层位于 `@spark-view/spark-page-config/ai`：`ensurePageDesignBusiness`、注册定义、kind 常量和诊断能力。
- 业务实现层保持框架无关，位于 `@spark-view/spark-page-config/editor` 和内部 design services：包括 PageModel live edit host 和 PageDesignService。
- UI 层只能调用应用侧 service adapter；不能手写 tool schema、重复业务注册逻辑，也不能绕过 PageEditor 直接修改页面文件。

## 导入规则

只使用包根入口和明确开放的 editor / ai / json-document 子路径：

```ts
import { createConfigLoader } from '@spark-view/spark-page-config'
import { PageEditor } from '@spark-view/spark-page-config/editor'
import { ensurePageDesignBusiness } from '@spark-view/spark-page-config/ai'
import { PAGE_RUNTIME_SERVICES } from '@spark-view/spark-component'
```

不要从已移除的 spark-page-config 子路径导入，例如 config、node-tree、navigation、runtime、design、page/loading、capabilities/page-file-document 或 registrations。
