# src 目录约定

```text
model/          领域 class（ProjectModel、导航、ConfigPageNode、四文件、serialization）
io/             PageContentLoader、NavigationClient、PageFileApi、runtime-page
project-workspace.ts  ProjectWorkspace：持有 ProjectModel + IO
project.ts / index.ts 公共出口
```

依赖：`project-workspace → {model, io}`、`io → model`。**禁止 `model → io`**。

**模型 = class + API（事件）**。`ProjectModel` 纯内存；需要 load/save 时消费层 `new ProjectWorkspace` 并访问 `.project`；运行态 `new PageContentLoader` + `createRuntimePageNode`。

存储真源：DB navigation + 四文件。
