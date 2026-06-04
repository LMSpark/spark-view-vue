# spark-project-model 统一模型重构计划（修正版）

> 状态说明：本文是未来目录迁移计划，不是当前源码地图。
> 当前运行结构仍是 `core/`、`infra/`、`editor/`、`design/`、`ai/`、`vcm/`，包级协作契约见 `../README.md` 和 `../AGENTS.md`。
> 在目录迁移完整执行前，测试、元数据生成器、工具和消费方不得引用本文中的 `entity/`、`service/`、`contract/` 等计划路径。

## 0. 修正结论

上一版方案把“项目策划”设计成独立子系统，这是错误的。本次修正版明确：

1. **持久化内容实例可以近似视为模型实例**：能从 DB 或 file 独立恢复业务语义的内容，就是模型的耐久状态。
2. **其他行为全部归结为 edit / CRUD**：不存在独立“策划模型层”。增删改查项目树就是编辑项目，增删改查配置页内容就是编辑页面。
3. **pageModel 不是 project-model 包**：`pageModel` 只表示页面配置节点内容模型，即配置页节点上的 `rule.json`、`pagedata.json`、`script.js`、`style.css` 四类内容。
4. **project-model 是项目树模型包**：它管理项目节点树、配置页节点、页面四文件内容、导航编辑 DTO、文件 IO、内容加载、编辑器 façade、AI page-design 编辑宿主契约。
5. **不保留旧别名，不向后兼容**：所有活跃消费方必须改为 `@spark-appworks/spark-project-model` 及其明确子路径。
6. **严格 SSOT / SOLID**：类型契约只放稳定跨层协议；实体持有状态；服务编排 IO 和编辑用例；工厂只做跨层装配；AI 只暴露 page-design 编辑边界。

## 1. 本次范围

### 1.1 包边界

源包名为：

```text
@spark-appworks/spark-project-model
```

允许公共入口：

```text
@spark-appworks/spark-project-model
@spark-appworks/spark-project-model/project
app service page-design business
@spark-appworks/spark-project-model/json-document
```

禁止继续使用：

```text
@spark-appworks/spark-project-model
@spark-appworks/spark-project-model/*
packages/spark-project-model
spark-project-model.bak
```

### 1.2 模型与 edit 归属

持久化内容实例就是模型实例的耐久状态；其他行为全部收敛为 edit / CRUD。不再存在独立策划目录、独立策划模型、独立策划 AI module：

```text
DB AppNavRoot/NavNode = project/navigation model instance
file rule.json/pagedata.json/script.js/style.css = pageModel content instance
ProjectEditor = edit façade over DB + file
AppNavRoot.description = project-level description SSOT, persisted in DB
ProjectNode.description = node-level description SSOT, persisted in DB
ProjectDescriptionContext = derived description context, not persisted independently
ConfigPageNode rule/dataSet/script/style = runtime pageModel editor over four files
PageDesignEditHost = AI page-design edit host
```

因此不得再创建任何独立策划目录、契约、模型、edit host、apply command 或 apply result。

如果后续出现新的“项目策划”需求，也必须先证明它不是对 DB 或 file 模型实例的 CRUD；否则继续进入 ProjectEditor 的 edit 能力，而不是新增独立子系统。

### 1.3 持久化终态

最终真源只能是 DB + file：

```text
DB   = project/navigation edit SSOT
file = pageModel content SSOT
```

DB 负责 project/navigation 模型实例：

- `NavNode.description`：节点级描述即需求 SSOT。
- dev-system 节点属性表单字段：`id`（只读，对应 `NODE_ID`）、`title`、`icon`、`nodeKind`、`description`、`path`、`linkTarget`、`childPlacement`、`hidden`、`disabled`、`dividerAfter`、`permissionMode`、`refId`、`context`。
- `context` 是模块上下文配置，按 `NavigationContextEditDto` 在前端编辑，后端序列化为 JSON 写入 DB `CONTEXT` 列，读取时反序列化回 `NavNode.context`；它不是 pageModel，也不是第三份持久化状态。
- `order` 是 DB `SORT_ORDER` 投影。人工拖拽继续触发 move；AI 不能拖拽，所以 `NavigationNodeEditDto.order` 必须保留，ProjectEditor 保存节点属性时必须通过 `/nodes/{id}` update patch 提交 `order`，后端 `updateNode` 负责按同级顺序重排并落到 `SORT_ORDER`。
- 后端 DB 投影必须通过 ORM entity/repository 表达：`NavigationNodeFlatEntity` 一一映射 `NAVIGATION_NODE_FLAT`，`NavigationNodeFlatRepository` 承载查询与持久化，service 只做 DTO 到实体用例编排，不保留 JDBC CRUD 旁路。
- 父子关系只通过 tree move / CRUD 表达，不进入节点属性 patch。
- 不在 dev-system 编辑逻辑中、且没有 DB 投影闭环的字段不得进入 project-model 编辑契约。`redirect`、`parentPageId` 不属于当前节点属性编辑模型。

file 负责 pageModel 内容实例，也就是配置页节点四件套：

- `rule.json`
- `pagedata.json`
- `script.js`
- `style.css`

`ProjectEditor` 是统一 edit façade，只能协调 DB 与 file 两类模型实例，不允许持有第三份可持久化策划状态。`ProjectDescriptionContext`、`ProjectPageNodeSummary`、`effectiveDescription`、`ProjectEditorSnapshot` 都是从 DB + file 读取后形成的运行时投影，不单独落盘。

后端“ORM 路线”的范围只覆盖 DB 模型实例。组件 metadata JSON、pageModel 四文件、Git/S3/file storage 仍然是文件真源；它们可以被 project-model 读取、投影和同步，但不得为了形式统一伪造 ORM 表模型。

### 1.4 DTO 与仓储映射

前后端项目模型 DTO 必须语义一致：

```text
dev-system form
  -> NavigationEditModel
  -> NavigationNodeEditDto / NavigationContextEditDto
  -> ProjectEditor save
  -> NavigationNodeAddRequestDto / NavigationNodeEditPatchDto / NavigationNodeMoveRequestDto
  -> backend NavigationNodeEditDto / NavigationNodeEditPatchDto / NavigationNodeAddRequest / NavigationNodeMoveRequest
  -> NavigationNodeFlatEntity
  -> NAVIGATION_NODE_FLAT
```

- dev-system 不认识 DB 字段名，也不直接构造仓储命令。
- `ProjectModelDto` 是项目模型 API DTO：`projectId + navigation + pages`，用于表达前后端看到的同一个项目模型投影。
- `ProjectModelDto` 不作为前端编辑保存命令。前端保存必须按节点提交：add/update/move/delete 分别调用节点级 DTO 和节点级 API。
- dev-system 不直接调用后端 API，也不装配后端 URL/HTTP；它只消费 project-model 的 `ProjectEditor` façade。后端整树保存只允许作为初始化/导入能力，不作为前端编辑入口暴露。
- 仓储层负责 DTO 到 DB 列的投影：`id -> NODE_ID`、`order -> SORT_ORDER`、`permissionMode -> PERMISSIONS`、`context -> CONTEXT(JSON)`。
- `id` 只读；新增节点可由后端补 UUID，但更新时不得通过 DTO 改写 `NODE_ID`。
- `order` 可由节点 update patch 更新，也可由拖拽 move 更新；两者必须共用同一套后端重排逻辑，最终只投影到 DB `SORT_ORDER`。除 DB 物理列名外，不再引入第二套排序语义。

## 2. 目标目录结构

`packages/spark-project-model/src` 的顶层目录必须只有 7 个：

```text
ai/
artifact/
contract/
entity/
factory/
service/
standalone/
```

根文件只保留公共 barrel：

```text
ai.ts
index.ts
json-document-public.ts
project.ts
```

### 2.1 contract

```text
contract/
  edit-host.contract.ts
  navigation.contract.ts
  node.contract.ts
  project.contract.ts
```

职责：

- `edit-host.contract.ts`：只放 `PageDesignEditHost`、`PageDesignEditPhase`、`PageDesignNodeTree`。
- `navigation.contract.ts`：导航节点 re-export 与 `NavigationNodeEditDto` / context DTO。
- `node.contract.ts`：项目节点、配置页节点、渲染配置、页面节点工厂契约。
- `project.contract.ts`：ProjectEditor 快照等项目编辑器公开类型。

不得出现独立策划契约。项目编辑相关稳定语义只允许落在：

- `node.contract.ts` 的节点类型、描述上下文、渲染配置；
- `project.contract.ts` 的 ProjectEditor 快照和编辑器类型；
- `edit-host.contract.ts` 的 page-design edit host。

### 2.2 entity

```text
entity/
  project/
    project.entity.ts
    node-collection.entity.ts
  node/
    node-base.entity.ts
    module-node.entity.ts
    config-page.entity.ts
    leaf-nodes.entity.ts
    node-factory.ts
    node-helpers.ts
  content/
    rule.entity.ts
    dataset.entity.ts
    text.entity.ts
  navigation/
    edit.entity.ts
```

职责：

- `project/`：项目聚合根与节点集合。
- `node/`：项目节点类型、配置页节点、节点工厂、纯辅助函数。
- `content/`：配置页四文件内容模型。
  - `rule.entity.ts` 是 `rule.json` 的 SSOT。
  - `dataset.entity.ts` 是 `pagedata.json` 的 SSOT。
  - `text.entity.ts` 是 `script.js` 与 `style.css` 文本内容模型的 SSOT。
- `navigation/`：导航编辑实体，持有 dev-system 同步进来的 `NavigationNodeEditDto` 与 context DTO。

不得出现独立策划实体目录。项目策划状态只能来自项目树实体、节点描述、描述上下文投影和配置页内容实体。

### 2.3 service

```text
service/
  editor/
    project-editor.service.ts
  file/
    file-api.service.ts
    file-cache.service.ts
    file-creator.service.ts
    file-deleter.service.ts
    file-registry.service.ts
    file-restore-command.ts
    file-serialization.ts
    file-versions.service.ts
  content-loader/
    compiler.service.ts
    loader.service.ts
    types.ts
  navigation/
    client.service.ts
    editing.service.ts
    lifecycle.service.ts
    nav-model.ts
    operations.service.ts
    tools.service.ts
  reference/
    reference-client.service.ts
```

职责：

- `editor/`：ProjectEditor façade，消费方通过它操作项目、配置页节点和四文件内容。
- `file/`：页面四文件远端读写、缓存、版本、序列化。
- `content-loader/`：内容加载和编译解析。
- `navigation/`：导航编辑、客户端、生命周期、节点操作工具。
- `reference/`：跨项目引用读取。

不得出现独立策划服务目录。项目策划操作必须由 `service/editor/project-editor.service.ts` 作为编辑用例承载。

### 2.4 ai

```text
ai/
  page-design/
    service.ts
    session.ts
    support.ts
    tool-catalog/
      payload-catalog.ts
    payload/
      component-catalog.json
```

职责：

- `service.ts`：PageDesign service 层结果、上下文和 action binding 类型。
- `session.ts`：PageDesignEditSession 运行态。
- `support.ts`：page-design 诊断和辅助函数。
- `tool-catalog/payload-catalog.ts`：组件 payload catalog 查询和 guide 入口。
- `payload/component-catalog.json`：组件目录 SSOT，必须与后端 `spark-ai-server/data/component-metadata.json` 同步。

不得出现独立策划 AI。page-design AI 只围绕页面配置节点 edit host 工作；如果需要项目级策划 AI，也必须调用 ProjectEditor 的 edit 能力，而不是创建独立 module。

### 2.5 artifact

```text
artifact/
  data.artifact.ts
  rule.artifact.ts
```

职责：

- `data.artifact.ts`：DataSet 设计器投影、规范化、结构化 pagedata 支持。
- `rule.artifact.ts`：rule schema、rule tree policy、rule editor component catalog。

不得为了旧方案补空的：

```text
design-flow.artifact.ts
stage-detection.artifact.ts
script-contract.ts
```

这些没有当前消费方和稳定契约，不属于本次 SSOT。脚本契约如需存在，应服务于 pageModel edit 写入边界，优先并入现有 artifact 或 service，而不是单开空文件。

### 2.6 factory

```text
factory/
  page-node.factory.ts
```

职责：跨层装配 `PageNodeFactory`，集中创建配置页节点所需的 file/content-loader/navigation 依赖。

### 2.7 standalone

```text
standalone/
  internal/
    assert-page-id.ts
  json-document/
    index.ts
  leave-request/
    index.ts
    leave-request.ts
```

职责：

- `internal/`：独立纯工具。
- `json-document/`：JSON 文档运行时。
- `leave-request/`：独立请假示例模块，不与 PageDesign 共享类型或服务。

## 3. 公共 API 规则

### 3.1 root 入口

`src/index.ts` 只导出项目树模型、节点模型、导航编辑 DTO 类型、页面节点工厂和 `PageDesignEditHost` 类型。

root 禁止导出：

```text
ProjectEditor
createProjectEditor
componentCatalog
PAGE_DATA_JSON_SCHEMA
PAGE_NODE_FILE_NAMES
JsonDocumentRuntime
任何 service/file/content-loader/navigation 实现类
```

### 3.2 /project 入口

`src/project.ts` 是编辑器完整入口，允许导出：

```text
ProjectEditor
createProjectEditor
ProjectModel
ProjectNodeCollection
ProjectNode / ModuleNode / ConfigPageNode / PageNode / leaf nodes
PageNodeFactory
PAGE_NODE_FILE_NAMES
PAGE_DATA_JSON_SCHEMA
data artifact / rule artifact 公共函数
NavigationNodeEditDto
PageDesignEditHost
ProjectNodeTools
ProjectReferenceClient 相关公开 DTO
```

禁止导出底层实现：

```text
PageNodeFileApi
PageNodeFileCache
PageNodeFileCreator
PageNodeFileDeleter
PageNodeFileVersions
PageNodeNavigationOperations
NavigationConfigClient
NavigationEditSession
BasePageContentLoader
compileRule / parsePageData / parseScript / parseCss
```

### 3.3 /ai 入口

app service 只导出 page-design 运行所需的稳定协议：

```text
PAGE_DESIGN_MODULE_ID
ensurePageDesignBusiness
PageDesignRunInput
PageDesignEditHost
PageDesignEditSession
pageDesignServiceFailure
page-design support 诊断函数
```

不得导出独立策划 API。

### 3.4 /json-document 入口

`src/json-document-public.ts` 只转导 `standalone/json-document`。

## 4. 迁移映射

| 旧概念 | 新位置 |
|---|---|
| project model 聚合根 | `entity/project/project.entity.ts` |
| project node collection | `entity/project/node-collection.entity.ts` |
| project node base / page node base | `entity/node/node-base.entity.ts` |
| module node | `entity/node/module-node.entity.ts` |
| config page node | `entity/node/config-page.entity.ts` |
| vue/action/link/ref leaf nodes | `entity/node/leaf-nodes.entity.ts` |
| node factory predicates | `entity/node/node-factory.ts` |
| node helper pure functions | `entity/node/node-helpers.ts` |
| rule.json pageModel | `entity/content/rule.entity.ts` |
| pagedata.json pageModel | `entity/content/dataset.entity.ts` |
| script.js/style.css pageModel | `entity/content/text.entity.ts` |
| navigation edit model | `entity/navigation/edit.entity.ts` |
| file services | `service/file/*` |
| content loader | `service/content-loader/*` |
| navigation services | `service/navigation/*` |
| project editor | `service/editor/project-editor.service.ts` |
| project edit / CRUD | `service/editor/project-editor.service.ts` + DB `AppNavRoot` / `NavNode` |
| project reference client | `service/reference/reference-client.service.ts` |
| page-design edit session | `ai/page-design/session.ts` |
| page-design service contracts | `ai/page-design/service.ts` |
| page-design diagnostics/helpers | `ai/page-design/support.ts` |
| payload catalog | `ai/page-design/tool-catalog/payload-catalog.ts` |
| component catalog JSON | `ai/page-design/payload/component-catalog.json` |
| data artifacts | `artifact/data.artifact.ts` |
| rule artifacts | `artifact/rule.artifact.ts` |
| page node factory DI | `factory/page-node.factory.ts` |
| json document | `standalone/json-document/index.ts` |
| leave request | `standalone/leave-request/*` |
| assert page id | `standalone/internal/assert-page-id.ts` |

## 5. 消费方修改范围

必须更新：

```text
src/
tests/
scripts/
packages/spark-app/
packages/spark-component/
packages/vite-plugin-spark-catalog/
tools/
tsconfig*.json
vite*.*
vitest.config.ts
pnpm-lock.yaml
```

目标：

- 所有活跃代码不再引用 `@spark-appworks/spark-project-model`。
- 所有活跃代码不再引用 `packages/spark-project-model`。
- 构建期组件 catalog 输出到 `src/services/page-design/payload/component-catalog.json`。
- backend component metadata 与 project-model payload catalog 保持同步。

## 6. 验收清单

### 6.1 结构验收

必须满足：

```text
src 顶层目录 = ai, artifact, contract, entity, factory, service, standalone
contract 文件数 = 4
entity/content 文件数 = 3
不存在独立策划实体目录
不存在独立策划服务目录
不存在独立策划 AI 目录
不存在 packages/spark-project-model
不存在 spark-project-model.bak
```

### 6.2 引用验收

以下扫描必须无结果：

```bash
rg "@spark-appworks/spark-project-model|packages/spark-project-model|spark-project-model\\.bak" packages src tests scripts tools
```

文档历史和 changelog 可另行清理，不作为运行时阻断；活跃源码、测试、脚本、构建配置必须清零。

### 6.3 类型与测试验收

必须通过：

```bash
pnpm run typecheck
pnpm run lint
pnpm run test:run
pnpm --dir packages/spark-project-model run build
pnpm --dir packages/spark-component run build
pnpm --dir packages/spark-app run build
```

### 6.4 语义验收

- `pageModel` 只指配置页节点内容模型。
- `project-model` 只指包和项目树模型。
- 持久化内容实例可以近似视为模型实例；非持久化运行态只能是 edit/session/projection。
- 最终持久化真源只有 DB + file：DB 管 project/navigation model instance，file 管 pageModel content instance。
- 其他行为全部归结为 edit / CRUD：节点级描述即需求必须来自 `NavNode.description`；配置页内容必须来自四个 pageModel 文件。
- project-model 的导航编辑契约必须按 dev-system 属性表单映射；`order` 作为 AI 无法拖拽的 DB 顺序投影保留；其他不由 dev-system 暴露、且不能由 DB 投影闭环的字段一律删除。
- 不得存在独立持久化策划状态；`ProjectDescriptionContext`、`ProjectPageNodeSummary`、`ProjectEditorSnapshot` 都必须是投影。
- DataSet 管线保持单向：`pagedata.json -> parsePageData -> DataSet -> usePageDataSet -> PAGE_DATASET -> DataViewKey -> UI`。
- `ProjectEditor.createPageDesignEditHost()` 必须显式接收 `pageId`，不得通过当前活动页兜底。
- 缺失 API、无效配置、状态不一致必须 fail-fast，不得静默兼容。

## 7. 执行顺序

按最终目标 DB + file 反推，执行顺序必须从模型实例闭环开始，而不是从目录搬运开始：

1. 冻结模型实例边界：DB 持久化 project/navigation model instance，file 持久化 pageModel content instance。
2. 修正节点级描述即需求：继续使用 `NavNode.description`，保存时必须能覆盖和清空 DB 字段。
3. 修正导航属性编辑契约：按 dev-system 表单字段映射为 `NavigationNodeEditDto`；`id` 只读，人工排序走 tree move，AI 排序通过 DTO `order` 随 `/nodes/{id}` update patch 提交，后端 update 与 move 共用同级重排逻辑；删除 `redirect`、`parentPageId` 等非闭环属性。
4. 修正 pageModel：`ConfigPageNode` 只聚合 `rule.json`、`pagedata.json`、`script.js`、`style.css`，四文件读写、dirty、版本恢复都只走 file API。
5. 修正 edit façade：ProjectEditor 只提供对 DB + file 的 CRUD 编排，不持有第三份可恢复业务语义。
6. 修正运行时投影：`ProjectDescriptionContext`、`ProjectPageNodeSummary`、`ProjectEditorSnapshot` 全部从 DB + file 派生，不增加落盘字段。
7. 按目标目录修正文件多/少问题，删除独立策划目录、契约、AI module。
8. 更新 barrel 和消费方 import，删除旧别名，不向后兼容。
9. 删除备份目录。
10. 跑完整验收清单，并用 `rg` 验证无旧别名、无独立策划实现、无第三份持久化状态。
