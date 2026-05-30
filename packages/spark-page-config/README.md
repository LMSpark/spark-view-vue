# @spark-view/spark-page-config

`spark-page-config` 是 SPARK View 的纯 TypeScript 模型包，定位为软件项目模型。

## 模型口径

- `ProjectModel` 是项目级模型。
- `ProjectModel.nodes` 是与后端 DB 同构的平铺项目节点集合。
- 树形导航只是 `nodes` 的投影，不是独立模型。
- `ProjectConfigPageNodeModel` 同时承载 `page` 和 `sub-page`。
- Vue 页面由 `ProjectVuePageNodeModel` 表达，不反向驱动数据结构。
- `navigation` 属于 `ProjectNodeModel` 基类；`rule`、`dataSet`、`script`、`style` 是配置页节点扩展的内容子模型。

```text
ProjectModel
  ├── projectId
  ├── nodes: ProjectNodeCollection
  └── planning: ProjectPlanningModel

ProjectNodeModel
  ├── navigation
  ├── ProjectModuleNodeModel
  ├── ProjectConfigPageNodeModel  nodeKind: page | sub-page
  ├── ProjectVuePageNodeModel     nodeKind: system-page
  ├── ProjectSystemActionNodeModel
  ├── ProjectLinkNodeModel
  └── ProjectRefNodeModel
```

## 项目策划

节点 `description` 就是功能描述和用户需求。所有父级和本级描述都会约束当前节点：

```text
project.description
  + parent module descriptions
  + parent page descriptions
  + current node.description
  => effectiveUserRequirement
```

策划入口统一走 `ProjectPlanningModel` 或 `ProjectEditor.readSnapshot().pageFeatures`。

## 运行态

```ts
import { createPageNodeFactory } from '@spark-view/spark-page-config'

const factory = createPageNodeFactory({ fileStorage: 'localStorage' })
const pageNode = factory.create('orders')
await pageNode.load()

const renderConfig = pageNode.toRenderConfig()
```

## 设计态

```ts
import { createProjectEditor } from '@spark-view/spark-page-config/project'

const editor = createProjectEditor({
  projectId: 'homepage',
  http,
  getPageFilesApi,
  getNavigationApi,
  getProjectsApi,
  getProjectNavigationApi,
  getHeaders,
})

await editor.loadNavigation()
const snapshot = editor.readSnapshot()
```

DevSystem 只能通过 `ProjectEditor` 进入 DB 节点、页面四文件、版本和跨项目引用。

## 公共入口

- `@spark-view/spark-page-config`：运行态 PageNode factory、项目模型和节点模型类型。
- `@spark-view/spark-page-config/project`：设计态 ProjectEditor、ProjectPlanningModel、ProjectNodeTools、ProjectReferenceClient。
- `@spark-view/spark-page-config/ai`：pageDesign 业务注册。
- `@spark-view/spark-page-config/json-document`：通用 JSON 文档树。
- `@spark-view/spark-page-config/leave-request`：独立 AI 业务参考实现。

## 验证

```bash
pnpm --filter @spark-view/spark-page-config typecheck
pnpm --filter @spark-view/spark-page-config test:run
pnpm --filter @spark-view/spark-page-config lint
```
