# spark-project-model

`ProjectModel` = 设计 + 编辑会话根 class。模型 = class + API（事件）；谁 `new` 谁负责生命周期。

## 出口

| 包路径 | 内容 |
|---|---|
| `@spark-appworks/spark-project-model` | ProjectModel、导航/page 类型、compiler、运行态 PageContentLoader/createRuntimePageNode |
| `@spark-appworks/spark-project-model/project` | ProjectWorkspace、workspace options、version/reference 类型 |

## 目录

```text
model/project|navigation|page|serialization/
io/                 PageContentLoader、NavigationClient、PageFileApi、runtime-page
project-workspace.ts   ProjectWorkspace：持有 .project 并提交 IO
project.ts / index.ts 公共出口
```

## 三消费层

| 层 | 创建 |
|---|---|
| spark-app 运行态 | `new PageContentLoader` + `createRuntimePageNode` |
| DevSystem / AI | `new ProjectWorkspace` 或 APP `getAppProjectWorkspace(scope)` |
| 纯内存 | `new ProjectModel({ projectId })` |

存储真源：DB navigation + 四文件（rule / pagedata / script / style）。

详见 `src/STRUCTURE.md`、`src/MODEL-HIERARCHY.md`。
