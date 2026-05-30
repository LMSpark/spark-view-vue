# Quickstart

> 先跑起来，再理解模型：ProjectModel -> ProjectNodeCollection -> PageNode -> Renderer。

## 安装与验证

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
```

模型包单独验证：

```bash
pnpm --filter @spark-view/spark-page-config typecheck
pnpm --filter @spark-view/spark-page-config test:run
```

## 运行态创建页面节点

```ts
import { createPageNodeFactory } from '@spark-view/spark-page-config'

const factory = createPageNodeFactory({
  fileStorage: 'localStorage',
})

const pageNode = factory.create('orders')
await pageNode.load()

const renderConfig = pageNode.toRenderConfig()
```

`SparkPageRenderer` 消费 `pageNode`，不直接读取四文件。

## 设计态编辑项目

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

DevSystem 只能通过 `ProjectEditor` 进入项目节点、页面文件、版本和跨项目引用。

## 模型速记

```text
ProjectModel
  ├── nodes: ProjectNodeCollection(flat)
  └── planning: ProjectPlanningModel

ProjectNodeModel
  ├── module
  ├── page/sub-page -> ProjectConfigPageNodeModel
  ├── system-page   -> ProjectVuePageNodeModel
  ├── system-action
  ├── link
  └── ref
```

`description` 是节点功能描述，也是用户需求。父级和本级描述共同约束当前页面生成。
