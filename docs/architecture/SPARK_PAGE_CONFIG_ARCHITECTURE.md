# spark-page-config 架构

> 更新基准：2026-05-30。`spark-page-config` 是 SPARK View 的纯模型包，定位为软件项目模型。它不引入 Vue、Vue Router、Element Plus 或应用层 service。

## 治理顺序

```text
理念 > 逻辑 > AI 生成代码规则 > SSOT || SOLID > 该删则删 || 该合则合 || 该拆则拆 > 兼容
```

兼容是最后一层。旧命名如果让模型边界变混乱，先删、合、拆，再让消费层跟进。

## 核心模型

```text
ProjectModel
  ├── projectId
  ├── nodes: ProjectNodeCollection
  └── planning: ProjectPlanningModel

ProjectNodeCollection
  ├── flat rows: 与后端 DB/NAVIGATION_NODE_FLAT 同构
  ├── root/children: 由 flat rows 投影出的树形视图
  └── config page cache: 已打开配置页节点缓存
```

`ProjectModel` 是软件项目模型。项目由平铺项目节点组成，树只是投影，不再存在独立模块树聚合或独立页面集合中间层。

## 节点类型

所有节点共享 `ProjectNodeModel` 基类，基础字段来自 navigation/DB 节点：`id`、`pid`、`title`、`description`、`nodeKind`、`path`、`icon` 等。`navigation` 已合并到基类，所有节点都先是项目节点，再按 `nodeKind` 扩展私有字段。

| 节点类 | nodeKind | 说明 |
|---|---|---|
| `ProjectModuleNodeModel` | `module` | 项目功能分组，不持有页面四文件 |
| `ProjectConfigPageNodeModel` | `page` / `sub-page` | 配置页节点；`page` 和 `sub-page` 合并为同一类 |
| `ProjectVuePageNodeModel` | `system-page` | Vue 页面节点；模型只保存路径与节点元数据 |
| `ProjectSystemActionNodeModel` | `system-action` | 项目级动作节点 |
| `ProjectLinkNodeModel` | `link` | 外链节点 |
| `ProjectRefNodeModel` | `ref` | 跨项目引用节点 |

`sub-page` 不是第二套页面节点模型。它只是 `ProjectConfigPageNodeModel.nodeKind` 的一个值；当它没有独立路径时，`pageId` 可由节点 id 派生。

## 父子约束

```text
项目 => 子模块 || 页面
子模块 => 子模块 || 页面
页面 => 子页面 => 子页面
```

约束由 `ProjectNodeTools` 和 `ProjectPlanningModel` 统一解释。消费层不能自行重新定义节点类型关系。

## 功能策划

节点 `description` 就是功能描述，也是用户需求。

```text
项目策划 = 模块策划 + 页面策划
模块策划 = 所属模块下的全子模块 + 页面 + 子页面策划
页面策划 = 页面下的全子页面策划
```

所有父级和本级 `description` 都约束当前节点：

```text
project.description
  + parent module descriptions
  + parent page descriptions
  + current node.description
  => requirementConstraints / effectiveUserRequirement
```

DevSystem、AI 和脚本验证统一读取 `ProjectPlanningModel` 或 `ProjectEditor.readSnapshot().pageFeatures`。

## 配置页节点

`ProjectConfigPageNodeModel` 是配置页事实根。它继承基类 `navigation`，只新增配置页内容子模型：

| 子模型 | 事实 | 持久化 |
|---|---|---|
| `rule` | 页面节点树和布局结构 | `rule.json` |
| `dataSet` | DataSet、表、视图、关系和请求 | `pagedata.json` |
| `script` | 页面脚本沙箱文本 | `script.js` |
| `style` | 页面级样式文本 | `style.css` |

导航也是配置项，但它属于节点基类，不是四文件之一。四文件是内容投影；navigation/DB 节点是页面在项目中的入口投影。

## 单一职责工具

| class | 职责 |
|---|---|
| `PageNodeFileCreator` | 创建页面四文件 |
| `PageNodeFileDeleter` | 删除页面四文件 |
| `PageNodeFileVersions` | 读取、创建、恢复、删除远端文件版本 |
| `PageNodeFileCache` | 按页面和文件失效加载缓存 |
| `PageNodeNavigationOperations` | 挂载、移动、卸载配置页节点 |

创建、删除、版本、缓存和挂载分属不同 class；没有一个对象同时管四类流程。

## 入口边界

运行态入口：

```ts
import {
  createPageNodeFactory,
  type PageNodeLike,
  type PageNodeRenderConfig,
} from '@spark-view/spark-page-config'
```

设计态入口：

```ts
import {
  createProjectEditor,
  ProjectNodeTools,
  ProjectReferenceClient,
} from '@spark-view/spark-page-config/project'
```

内部 loader、compiler、file-api、navigation client 和子模型不从根入口公开。

## 目录

```text
src/
├── index.ts
├── project.ts
├── ai.ts
├── project/
│   ├── project-model.ts
│   ├── project-node-model.ts
│   ├── project-node-collection.ts
│   ├── project-node-tools.ts
│   ├── project-planning-model.ts
│   ├── project-reference-client.ts
│   ├── project-editor.ts
│   └── page-node-factory.ts
├── page-model/
│   ├── model/
│   ├── read/
│   ├── navigation/
│   ├── update/
│   └── ai/
├── json-document/
└── leave-request/
```

`page-model/` 目录保留为页面内容子域目录名；公共语义已经收敛到 PageNode。

## 验证

```bash
pnpm --filter @spark-view/spark-page-config typecheck
pnpm --filter @spark-view/spark-page-config test:run
pnpm --filter @spark-view/spark-page-config lint
```
