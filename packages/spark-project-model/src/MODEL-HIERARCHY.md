# ProjectModel 统一软件模型

> `ProjectModel` = 设计 + 编辑会话根 class。模型 = class + API（事件）；谁 `new` 谁负责生命周期。

## 根模型

```text
ProjectModel
  design: ProjectDesign
  session: ProjectSession     # 选中/activePage/dirty，不落盘
```

## 三个消费层

| 消费层 | 创建方式 |
|---|---|
| spark-app 运行态 | `new PageContentLoader` + `createRuntimePageNode` |
| DevSystem / AI | `new ProjectWorkspace` 或 `getAppProjectWorkspace(scope)` |
| 纯内存/测试 | `new ProjectModel({ projectId })` |

## ProjectWorkspace

普通 class：构造时 `new ProjectModel`，装配 IO client，对外 `.project` + save/load。

## 存储

DB navigation 表 + 四文件（rule / pagedata / script / style）。

## 公共出口

| 入口 | 内容 |
|---|---|
| `@spark-appworks/spark-project-model` | ProjectModel、导航/page 类型、compiler、运行态 PageContentLoader/createRuntimePageNode |
| `@spark-appworks/spark-project-model/project` | ProjectWorkspace、workspace options、version/reference 类型 |
