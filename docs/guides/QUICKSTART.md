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
import { ProjectWorkspace } from '@spark-appworks/spark-project-model'

const workspace = new ProjectWorkspace({
  projectId: 'homepage',
  http,
  getPageFilesApi: () => '/api/pages-config',
  getNavigationApi: () => '/api/navigation',
})

await workspace.loadNavigation()
const planning = workspace.project.readPlanningProjection()
```

DevSystem 与 AI runner 共用同一 `ProjectWorkspace.project`（`ProjectModel`），手动编辑与 AI mutation 落在同一内存实例。

## 模型速记

```text
ProjectWorkspace（IO 编排，非领域根）
  └── project: ProjectModel
        ├── design: ProjectDesign（nodesById + configPagesByPageId）
        └── session: ProjectSession（选中 / dirty，不落盘）

节点 class（按 nodeKind 实例化，非一 kind 一子类文件）：
  ├── ProjectNode（module / link / ref / system-page / …）
  └── ConfigPageNode（page；嵌套子页 = hidden + 无 path → 四文件）
```

策划投影经 `project.readPlanningProjection()` 读取；`domain-model/`（`ProjectRootModel` 等）已删除，勿再引入第二套领域根。

`description` 是节点功能描述，也是 AI 策划与 pageDesign 的共同输入约束。
