# 快速开始

> 先跑起来，再理解模型：ProjectModel -> ConfigPageNode -> Renderer。

## 安装与验证

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
```

模型包单独验证：

```bash
pnpm --filter @spark-appworks/spark-project-model typecheck
pnpm --filter @spark-appworks/spark-project-model test:run
```

## 运行态创建页面节点

```ts
import { createPageNodeFactory } from '@spark-appworks/spark-project-model'

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
import { createProjectEditor } from '@spark-appworks/spark-project-model/project'

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
  ├── design: ProjectDesign
  │   ├── navigation: NavigationDesign
  │   └── pages → ConfigPageNode*
  └── runtime: ProjectRuntime

ProjectNode 子类
  ├── ModuleNode / SystemPageNode / SystemActionNode
  ├── LinkNode / RefNode
  └── ConfigPageNode (page / sub-page)
```

策划与 `pageFeatures` 经 `ProjectEditor.readSnapshot()` 读取，不再使用独立的 `ProjectPlanningModel`。

`description` 是节点功能描述，也是用户需求。父级和本级描述共同约束当前页面生成。
