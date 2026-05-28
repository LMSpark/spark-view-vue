# spark-page-config 架构

`spark-page-config` 负责框架无关的页面模型与页面配置边界。它不能导入 Vue、Vue Router 或 Element Plus；渲染器和应用层只能通过包根入口、`./editor`、`./ai` 和 `./json-document` 消费它。

新的主心智是 `PageEditor -> PageModel`。四文件仍然是运行态 page config 的持久化资产和编译输入，但不是完整页面模型；页面导航、上下文、脏状态、undo/redo、AI live edit 都必须回到 `PageModel` 子模型上理解。

## 公共分层

```text
root PageModel 工厂 -> editor 页面编辑聚合 -> ai 业务注册 -> json-document 公共辅助能力
```

- `@spark-view/spark-page-config` 是运行态唯一公开入口：只暴露 `PageModel` / `PageModelFactory` / `createPageModelFactory` 以及少量独立公共能力。应用路由和渲染器都只能消费 `PageModel`。
- `@spark-view/spark-page-config/editor` 是编辑态唯一入口：`PageEditor` 管理已打开的 `PageModel` 缓存，并协调页面生命周期、导航绑定、预览配置、保存和版本恢复。
- `@spark-view/spark-page-config/ai` 是公开的 pageDesign / leave-request AI 业务注册入口。它只暴露注册 helper、kind 常量和诊断能力，不导出 tool module 内部实现。
- `@spark-view/spark-page-config/json-document` 是通用 JSON 树编辑模型。

包根入口必须保持收敛：不要重新导出 loader、compiler、file-api、workspace、子模型或旧的 `config`、`node-tree`、`navigation`、`runtime`、`design`、`page/*`、`capabilities/*`、`registrations` 子路径。

## 页面模型主线

```text
PageEditor
  -> openPages: Map<pageId, PageModel>
  -> activePageId / target pageId
  -> PageModel
      -> navigation: NavigationDraftModel
      -> rule: PageRuleModel
      -> dataSet: PageDataSetModel
      -> style: PageTextModel
      -> script: PageTextModel
```

`PageModel` 是页面编辑态聚合模型，组合 navigation、rule、dataSet、style、script 五个子模型。`PageEditor` 只暴露面向 DevSystem、AI 和预览的编辑网关；外部不直接操作 workspace、lifecycle、navigation client 或底层 document primitive。

`PageModel` 负责 dirty 聚合、load/save 生命周期协调和订阅冒泡。每个子模型负责自己的领域状态、undo/redo、文本投影和持久化恢复：

- `navigation` 是页面导航属性和上下文模型，由 `NavigationDraftModel` 持有，保存时通过 `NavigationConfigClient` 更新导航树。它不属于四文件。
- `rule` 是节点树模型，由 `PageRuleModel` 持有 `SparkNodeTree`，文本投影和持久化资产是 `rule.json`。
- `dataSet` 是数据集模型，由 `PageDataSetModel` 持有 `DataSetCrudTool`，文本投影和持久化资产是 `pagedata.json`。
- `style` 是样式文本模型，由 `PageTextModel` 持有，持久化资产是 `style.css`。
- `script` 是脚本文本模型，由 `PageTextModel` 持有，持久化资产是 `script.js`。

## 持久化与运行态投影

```text
PageEditor
  -> PageModel.save()
      -> navigation -> NavigationConfigClient
      -> rule       -> PageConfigFileApi(rule.json)
      -> dataSet    -> PageConfigFileApi(pagedata.json)
      -> style      -> PageConfigFileApi(style.css)
      -> script     -> PageConfigFileApi(script.js)

运行态加载
  -> PageModelFactory.create(pageId)
  -> PageModel.load()
  -> PageModel.toRenderConfig()
  -> SparkPageRenderer
```

四文件是 `rule.json`、`pagedata.json`、`script.js` 和 `style.css`。它们是运行态 page config 的资产集合，不是完整 PageModel。必需文件语义由 `PageConfigFileRegistry` 维护；loader 行为应从 descriptor 推导，不要再维护独立的文件名数组。

运行态渲染只消费 `PageModel` 内存投影。`PageConfigLoader`、compiler 和 file-api 是 `PageModel` 内部依赖，不允许应用层、渲染层或 AI 层直接创建或调用。编辑态和 AI 不应直接把四文件当作事实源修改；它们只能修改 `PageModel`，再由 `PageModel.save()` 持久化。

`rule.json` 会编译为归一化的 `SparkNode` children。`pagedata.json` 会通过 `spark-data` 编译为 `DataSet`。`script.js` 和 `style.css` 在运行态保持文本资产，由渲染层按现有沙箱和样式注入规则消费。

## AI 分层

- AI 平台层位于 `@spark-view/spark-ai/*`：host、session、runtime、传输回调，以及固定的 `module_*` 协议。
- 业务注册层位于 `@spark-view/spark-page-config/ai`：`ensurePageDesignBusiness`、注册定义、kind 常量和诊断能力。
- 业务实现层保持框架无关，位于 `@spark-view/spark-page-config/editor` 和内部 design services：包括 PageModel live edit host 和 PageDesignService。
- UI 层只能调用应用侧 service adapter；不能手写 tool schema、重复业务注册逻辑，也不能绕过 PageEditor 直接修改页面文件。

pageDesign AI 的编辑链路是：

```text
AI Agent Host
  -> pageDesign business registration
  -> PageDesignService
  -> PageEditor.createPageDesignEditHost({ pageId })
  -> PageModel 子模型
```

AI session 必须绑定目标 `pageId`，不能跟随 UI 当前 active page。AI 写入只进入内存 `PageModel` 并标 dirty，不自动保存、不创建版本、不刷新路由。导航写入只允许已挂载导航节点的页面；未挂载页面必须 fail-fast。

## 导入规则

只使用包根入口和明确开放的 editor / ai / json-document 子路径：

```ts
import { createPageModelFactory } from '@spark-view/spark-page-config'
import { createPageEditor } from '@spark-view/spark-page-config/editor'
import { ensurePageDesignBusiness } from '@spark-view/spark-page-config/ai'
import { PAGE_RUNTIME_SERVICES } from '@spark-view/spark-component'
```

不要导入或重新暴露 loader、compiler、file-api，也不要从已移除的 spark-page-config 子路径导入，例如 config、node-tree、navigation、runtime、design、page/loading、capabilities/page-file-document 或 registrations。
