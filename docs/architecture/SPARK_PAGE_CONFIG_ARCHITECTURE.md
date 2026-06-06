# spark-project-model 架构

> 更新基准：2026-06-06。`spark-project-model` 是 SPARK 的软件设计模型包，不引入 Vue、Vue Router、Element Plus 或应用层 service。

权威细节以包内文档为准：

- [`packages/spark-project-model/README.md`](../../packages/spark-project-model/README.md)
- [`packages/spark-project-model/src/MODEL-HIERARCHY.md`](../../packages/spark-project-model/src/MODEL-HIERARCHY.md)
- [`packages/spark-project-model/src/STRUCTURE.md`](../../packages/spark-project-model/src/STRUCTURE.md)

## 治理顺序

```text
理念 > 逻辑 > AI 生成代码规则 > SSOT || SOLID > 该删则删 || 该合则合 || 该拆则拆 > 兼容
```

## 核心模型

**设计即编辑**；**模型 = class + API（事件）**；谁 `new` 谁负责生命周期。

```text
ProjectModel
├── design: ProjectDesign      # 导航 + ConfigPageNode Map
├── session: ProjectSession    # 选中 / activePage / dirty（不落盘）
└── ProjectNode 子类树
    └── ConfigPageNode         # rule / dataSet / script / style 四文件子 class

ProjectWorkspace                 # 持有 .project + IO
PageContentLoader                # 运行态四文件加载
```

`ProjectNodeData` 等 type 仅用于 API 载荷与落盘映射。

## 存储

| 真源 | 形状 |
|---|---|
| DB | navigation 平铺表 |
| 文件 | rule.json、pagedata.json、script.js、style.css |

## 三消费层

| 层 | 创建 |
|---|---|
| spark-app 运行态 | `new PageContentLoader` + `createRuntimePageNode` |
| DevSystem / AI | `new ProjectWorkspace` 或 APP `getAppProjectWorkspace(scope)` |
| 纯内存 | `new ProjectModel({ projectId })` |

## 公共入口

```ts
import {
  ProjectModel,
  ProjectWorkspace,
  ConfigPageNode,
  PageContentLoader,
  createRuntimePageNode,
  type PageNodeLike,
} from '@spark-appworks/spark-project-model'
```

包外不要 deep import `src/project/*`、`src/navigation/*`、`src/page/*`、`src/io/*`。

## 源码目录

```text
src/
├── index.ts
├── project/
├── navigation/
├── page/
├── serialization/
└── io/
```

依赖：`project-workspace → {project, navigation, page, io}`、`io → model`。**禁止 `model → io`。**

## 验证

```bash
pnpm --filter @spark-appworks/spark-project-model run typecheck
pnpm --filter @spark-appworks/spark-project-model run test:run
```
