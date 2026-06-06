# src 目录约定

```text
index.ts              唯一公开入口
navigation/           ProjectNode 基类、非配置页 kind、树投影/查找、编辑草稿（不依赖 page）
page/                 ConfigPageNode、四文件、实例化入口 instantiate-project-node
  content/            rule / dataset / script / style 子 class
project/              ProjectModel、ProjectDesign、ProjectSession、ProjectWorkspace
serialization/        rule/pagedata 解析与规范化
io/                   HTTP、NavigationClient、PageFileApi、PageContentLoader、ProjectReferenceClient
```

## 依赖方向

```text
navigation          （纯领域，仅依赖 spark-utils / spark-data）
page                → navigation
serialization       → spark-data
project             → { navigation, page }
io                  → { navigation, page }
project-workspace   → { project, navigation, page, io }
```

**禁止：**
- `navigation → page` / `navigation → io`
- `page → io`
- `project` / `navigation` / `page` → `io`

配置页节点实例化在 `page/instantiate-project-node.ts`：`page → navigation-kinds`，由 `project-design` 调用。

## 消费层

| 层 | 创建 |
|---|---|
| spark-app 运行态 | `PageContentLoader` + `createRuntimePageNode` |
| DevSystem / AI | `new ProjectWorkspace` |
| 纯内存 | `new ProjectModel({ projectId })` |

存储真源：DB navigation + 四文件（rule / pagedata / script / style）。
