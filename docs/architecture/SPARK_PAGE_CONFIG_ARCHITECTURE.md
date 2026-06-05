# spark-project-model 架构

> 更新基准：2026-06-05。`spark-project-model` 是 SPARK 的软件设计模型包，不引入 Vue、Vue Router、Element Plus 或应用层 service。

权威细节以包内文档为准：

- [`packages/spark-project-model/README.md`](../../packages/spark-project-model/README.md) — 包职责与公共入口
- [`packages/spark-project-model/src/MODEL-HIERARCHY.md`](../../packages/spark-project-model/src/MODEL-HIERARCHY.md) — class 层级契约
- [`packages/spark-project-model/src/STRUCTURE.md`](../../packages/spark-project-model/src/STRUCTURE.md) — 目录与依赖规则

## 治理顺序

```text
理念 > 逻辑 > AI 生成代码规则 > SSOT || SOLID > 该删则删 || 该合则合 || 该拆则拆 > 兼容
```

## 核心模型（当前实现）

**设计即编辑**：改树、改页面、选中、dirty、保存是同一语义。

```text
ProjectModel                          # 项目根
├── design: ProjectDesign
│   ├── navigation: NavigationDesign  # nodesById + NavigationIndex
│   └── pages → ConfigPageNode*
├── runtime: ProjectRuntime           # 已加载页渲染快照等
└── ProjectNode 子类树
    ├── ModuleNode / LinkNode / RefNode / SystemPageNode / SystemActionNode
    └── ConfigPageNode
        ├── design: PageDesign        # rule / dataSet / script / style
        └── runtime: PageRuntime

ProjectEditor                         # 设计门面（薄编排）
  EditorSession                       # 选中 / dirty / working DTO / revision
  NavigationEditor / PageFileEditor / PageLifecycle / …
```

`ProjectNodeData`、`ProjectModelData` 等 type 仅用于 API 载荷与落盘映射；包内主语是 class 实例树。

## 存储与模型

| 层 | 职责 |
|---|---|
| 存储真源 | DB navigation + page 四文件（commit 唯一去向） |
| 领域模型 | 树、索引、派生 summary；形状不必与存储同构 |
| 设计门面 | `ProjectEditor` load/save 映射到 `nodeId` / `pageId` / 文件锚点 |

## 配置页四文件

`ConfigPageNode` 聚合页面设计与运行投影：

| 子域 | 持久化 |
|---|---|
| `rule` | `rule.json` |
| `dataSet` | `pagedata.json` |
| `script` | `script.js` |
| `style` | `style.css` |

导航元数据属于节点基类，不是四文件之一。

## 公共入口

运行态：

```ts
import {
  createPageNodeFactory,
  ProjectModel,
  ConfigPageNode,
  type PageNodeLike,
  type PageNodeRenderConfig,
} from '@spark-appworks/spark-project-model'
```

设计态：

```ts
import {
  createProjectEditor,
  type ProjectEditor,
} from '@spark-appworks/spark-project-model/project'
```

包外不要 deep import `src/model/*`、`src/io/*`、`src/facade/*`。

## 源码目录

```text
src/
├── index.ts              # 领域模型 + PageNodeFactory + compiler
├── project.ts            # ProjectEditor + artifact 制品
├── model/                # project / navigation / page / serialization
├── facade/               # ProjectEditor 协作者 + EditorSession
├── factory/              # PageNodeFactory
└── io/                   # file / navigation / loader / reference / http
```

依赖：`facade → {model, io}`、`io → model`、`factory → {model, io}`。**禁止 `model → io`**。DevSystem 设计器制品在 `src/services/project-model-artifacts/`。

## 验证

```bash
pnpm --filter @spark-appworks/spark-project-model typecheck
pnpm --filter @spark-appworks/spark-project-model test:run
pnpm --filter @spark-appworks/spark-project-model build
```
