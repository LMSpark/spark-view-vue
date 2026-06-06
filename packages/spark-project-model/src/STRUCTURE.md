# src 目录约定

```text
index.ts              唯一公开入口（禁止新增子入口 barrel）
project/              ProjectModel、ProjectDesign、ProjectSession、ProjectWorkspace
navigation/           ProjectNode 子类、树投影/查找、导航编辑草稿
page/                 ConfigPageNode、四文件模型、runtime-page
  content/            rule / dataset / script / style 子 class
serialization/        rule/pagedata 解析与规范化
io/                   HTTP、NavigationClient、PageFileApi、PageContentLoader、ProjectReferenceClient
```

## 依赖方向

```text
project-workspace → { project, navigation, page, io }
io → { navigation, page }
page → { navigation, serialization }
navigation → （纯领域，不依赖 io）
project → { navigation, page }
```

**禁止 `navigation` / `page` / `project` → `io`。**

## 消费层

| 层 | 创建 |
|---|---|
| spark-app 运行态 | `PageContentLoader` + `createRuntimePageNode` |
| DevSystem / AI | `new ProjectWorkspace` |
| 纯内存 | `new ProjectModel({ projectId })` |

存储真源：DB navigation + 四文件（rule / pagedata / script / style）。
