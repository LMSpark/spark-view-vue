# spark-page-config 统一模型重构计划（5 轮迭代优化）

## Context

`spark-page-config` 当前将"项目"和"页面"拆成两个目录树 `src/project/` 和 `src/page-model/`，但它们逻辑上是一个整体——项目就是一棵节点树。`ProjectConfigPageNodeModel`（在 project/node/）直接持有 `PageRuleModel`（在 page-model/model/），两目录之间存在密集的交叉 import。

本次重构目标：
1. **打破 project 和 page-model 的人为分离**——统一为一棵项目树
2. **严格四层架构**——契约层 → 实体层 → 服务层 → AI 层
3. **目录结构反映"项目即一棵树"**
4. **遵守所有 CLAUDE.md 门禁**
5. **零回归**——所有 15 个测试通过，public-api-imports.test.ts 全部通过，外部消费者编译通过

---

## 迭代 1：初始结构设计——识别领域边界

### 1.1 代码事实

**当前文件分布（57 源文件）：**

```
src/project/     10 文件（core/3 + node/4 + planning/2 + ai/1）
src/page-model/  39 文件（model/11 + read/3 + navigation/6 + update/9 + ai/10）
src/              5 文件（index, project, ai, json-document-public, internal/assert-page-id）
src/json-document/ 1 文件
src/leave-request/ 2 文件
```

**关键交叉依赖（project/ → page-model/）：**

| 消费者 | 导入的 page-model 符号 | 个数 |
|--------|----------------------|------|
| `project/node/project-node-model.ts` | nav-model, nav-editing, nav-client, content-types, page-file-api, page-file-cache, page-file-registry, navigation-draft-model, page-rule-model, page-data-set-model, page-text-model | 11 |
| `project/node/project-node-collection.ts` | nav-model, nav-editing, page-file-api, page-file-cache, nav-client, content-types | 6 |
| `project/core/project-model.ts` | nav-editing, nav-client, content-types, page-file-api, page-file-cache | 5 |
| `project/core/project-editor.ts` | nav-model, nav-editing, nav-client, content-types, content-loader, page-file-api, page-file-cache, page-file-creator, page-file-deleter, page-file-versions, page-file-registry, page-node-navigation-operations, page-edit-session | 13 |
| `project/planning/project-planning-model.ts` | nav-model | 1 |
| `project/planning/project-planning-edit-host.ts` | nav-model, nav-editing | 2 |
| `project/node/page-node-factory.ts` | content-types, page-file-api, page-file-cache, content-loader, nav-client | 5 |

**反过来（page-model/ → project/）：零。** page-model 不依赖 project。这是好的——说明 page-model 是下层。

### 1.2 初始分层方案

```
contract/   ← 公共类型契约（对外 + 跨模块）
entity/     ← 领域对象（ProjectModel, Node classes, Content models, NavigationDraft, Planning）
service/    ← 用例编排（ProjectEditor, File*, ContentLoader*, Navigation*, PlanningEditHost, ReferenceClient）
ai/         ← AI 子系统（PageDesign, ProjectPlanning 的 AI 注册）
artifact/   ← 设计期静态产出（data/rule schema, design flow）
standalone/ ← 独立子系统（json-document, leave-request）
```

### 1.3 迭代 1 发现的待解决问题

1. **contract/ 边界过大**：哪些类型真正是"契约"？
2. **entity/node/ 9 文件接近上限**：是否需要再拆？
3. **PageNodeFactory 归属**：DI 组装器放 entity/ 还是 factory/？
4. **nav-editing.ts（~500 行）如何拆分**：类型 → contract/，函数 → service/，会话 class → service/？
5. **page-edit-session.ts 拆分**：PageDesignEditHost → contract/，PageDesignEditSession → ai/，其余 → ？

---

## 迭代 2：contract 层边界精化——对照 public-api-imports.test.ts

### 2.1 代码事实

`public-api-imports.test.ts` 明确定义了两组禁止导出名单：

**rootForbidden（主入口不应导出）：**
`ProjectEditor`, `createProjectEditor`, `componentCatalog`, `PAGE_DATA_JSON_SCHEMA`, `PAGE_NODE_FILE_NAMES`, `PageNavigationTools`, `JsonDocumentRuntime`

**implementationForbidden（任何公共入口都不应导出）：**
`BasePageContentLoader`, `PageContentLoader`, `createPageContentLoader`, `PageNodeFileApi`, `PageNodeFileRegistry`, `PageNodeFileCache`, `PageNodeFileCreator`, `PageNodeFileDeleter`, `PageNodeFileVersions`, `PageNodeNavigationOperations`, `compileRule`, `parsePageData`, `parseScript`, `parseCss`, `PageRuleModel`, `PageDataSetModel`, `PageTextModel`, `NavigationConfigClient`, `NavigationEditSession`, `buildNavRoot`, `normalizeNavRoot`, `findNodeById`, `findConfigNodeByPageId`, `createRuleTreePolicy`(等)

**允许在 /project 子路径导出的：**
`ProjectEditor`, `createProjectEditor`, `componentCatalog`, `PAGE_NODE_FILE_NAMES`, `PAGE_DATA_JSON_SCHEMA`, `createRuleTreePolicy`, `createRuleJsonSchema`, data artifact 函数和类型, navigation draft 类型, `PageDesignEditHost` 类型, `ProjectPlanningModel`, planning 类型

### 2.2 迭代 2 决策：contract 层只放"对外公开或跨层使用"的类型

**进入 contract/ 的类型（真正是契约）：**

| 文件 | 内容 | 依据 |
|------|------|------|
| `node.contract.ts` | `ProjectNodeFamily`, `ProjectPlanningNodeKind`, `ProjectPlanningParentKind`, `ProjectRequirementConstraint`, `PageNodeRenderConfig`, `PageNodeLike`, `PageNodeNavigationConfig`, `PageNodeLoadOptions`, `ProjectPageNodeSummary`, `PageNodeFactoryLike`, `PageNodeFactoryOptions`, `PageNodeFileStorage` | 全部在主入口或 /project 公开导出 |
| `navigation.contract.ts` | `NavNode`, `NavNodeKind`, `AppNavRoot`, `NavigationNodeDraft`, `NavigationContextDraft`, `NavigationNodeDraftInput`, `NavigationNodeDraftApplyResult`, `NavNodeLocation` | NavNode 等从 spark-data re-export 但在包内广泛使用；NavigationNodeDraft 在 /project 公开导出 |
| `edit-host.contract.ts` | `PageDesignEditHost`, `ProjectPlanningEditHost` | 跨模块 AI 协议，spark-app 的 page-design-host-run-provider.ts 直接依赖 |
| `planning.contract.ts` | `ProjectPlanningSnapshot`, `ProjectModulePlan`, `ProjectPagePlan`, `ProjectPlannedNode`, `ProjectPlanningApplyCommand`, `ProjectPlanningApplyResult` 等 | 在 /project 公开导出，AI 模块输入/输出格式 |
| `project.contract.ts` | `ProjectModelOptions`, `ProjectModelLike`, `CreateProjectEditorOptions`, `ProjectEditorLoadOptions`, `ProjectEditorSnapshot` | 构造选项和公开快照类型 |

**不进 contract/ 的（保留在实现文件中）：**
- `PageNodeFileApi` 及其方法签名 — 禁止公开导出，只被 entity 层和 service 层内部使用
- `BasePageContentLoader` — 禁止公开导出，抽象类留在 service/content-loader/types.ts
- `PageNodeFileName`, `PAGE_NODE_FILE_NAMES` — 留在 service/file/file-registry.service.ts，虽然 /project 导出，但它是实现细节
- `PageNodeFileVersionSummary` — 留在 service/file/file-api.service.ts
- `ProjectNodeModelOptions`, `ProjectConfigPageNodeModelOptions` — 留在 entity/node/node-base.entity.ts 和 config-page.entity.ts
- `ConfigPageContentPart`, `ProjectConfigPageDirtyPart` — 留在 entity/node/config-page.entity.ts
- `ProjectNavigationFlatNode` — 留在 entity/node/node-helpers.ts

### 2.3 迭代 2 优化后的 contract/ 结构

```
contract/
  node.contract.ts          # 节点类型家族、渲染配置、PageNodeLike、工厂类型
  navigation.contract.ts    # 导航节点类型、草稿类型（从 nav-model + nav-editing 的类型部分提升）
  edit-host.contract.ts     # AI 编辑宿主契约
  planning.contract.ts      # 策划相关类型
  project.contract.ts       # ProjectModel/ProjectEditor 构造选项和快照类型
```

5 个文件，≤10 ✅，每个文件内聚明确。

---

## 迭代 3：实体层和服务层边界精化——对照实际依赖图

### 3.1 代码事实：完整依赖图分析

```
                   ┌──────────────────────────────┐
                   │  @spark-view/spark-data       │
                   │  @spark-view/spark-utils      │
                   │  @spark-view/spark-ai         │
                   └──────────┬───────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
    ┌─────────▼──────┐  ┌─────▼──────┐  ┌─────▼──────┐
    │ nav-model.ts   │  │ page-file- │  │ page-edit-  │
    │ (re-exports)   │  │ api.ts     │  │ session.ts  │
    └───────┬────────┘  └─────┬──────┘  └──────┬──────┘
            │                 │                 │
    ┌───────▼────────┐  ┌─────▼──────┐  ┌──────▼──────┐
    │ nav-editing.ts │  │ file-cache │  │ page-design │
    │ (pure fns)     │  │ .ts        │  │ -service.ts │
    └───────┬────────┘  └─────┬──────┘  └──────┬──────┘
            │                 │                 │
    ┌───────▼────────┐       │                 │
    │ navigation-    │       │                 │
    │ draft-model.ts │       │                 │
    └───────┬────────┘       │                 │
            │                 │                 │
            │    ┌────────────┼────────┐        │
            │    │            │        │        │
    ┌───────▼────▼──┐  ┌──────▼───┐ ┌──▼───────▼──┐
    │ project-node  │  │ page-rule│ │ page-design  │
    │ -model.ts     │  │ -model   │ │ -module.ts   │
    │ (660 lines!)  │  │ .ts      │ │              │
    └───────┬───────┘  └──────┬───┘ └──────┬───────┘
            │                  │             │
    ┌───────▼───────┐  ┌──────▼──────┐     │
    │ project-node  │  │ page-data-  │     │
    │ -collection   │  │ set-model   │     │
    └───────┬───────┘  └──────┬──────┘     │
            │                  │             │
    ┌───────▼───────┐  ┌──────▼──────┐     │
    │ project-model │  │ page-text   │     │
    └───────┬───────┘  │ -model.ts   │     │
            │           └──────┬──────┘     │
    ┌───────▼───────┐          │            │
    │ project-      │          │            │
    │ editor.ts     │◄─────────┼────────────┘
    │ (facade)      │          │
    └───────────────┘          │
            │                  │
    ┌───────▼───────┐  ┌──────▼──────┐
    │ project-      │  │ page-file   │
    │ planning-     │  │ -creator    │
    │ model.ts      │  │ -deleter    │
    └───────────────┘  │ -versions   │
                       │ -registry   │
                       │ -serializ.  │
                       └─────────────┘
```

### 3.2 迭代 3 决策：entity/ 和 service/ 的精确划分

**entity/（状态 + 行为 + 生命周期）——类 class 定义：**

```
entity/
  project/
    project.entity.ts          # ProjectModel（聚合根，持有 nodes + planning）
    node-collection.entity.ts  # ProjectNodeCollection（平铺节点 SSOT，持有所有 node 实例）
  node/
    node-base.entity.ts        # ProjectNodeModel（抽象基类）+ ProjectPageNodeModel（抽象中间类）
    module-node.entity.ts      # ProjectModuleNodeModel
    config-page.entity.ts      # ProjectConfigPageNodeModel
    leaf-nodes.entity.ts       # ProjectVuePageNodeModel + ProjectSystemActionNodeModel + ProjectLinkNodeModel + ProjectRefNodeModel
    node-factory.ts            # createProjectNodeModel() + isConfigNodeKind() + 类型判断函数
    node-helpers.ts            # 纯函数：buildProjectNavigationTree, flattenProjectNavigationRoot, resolvePageNodePageId, readProjectNodeRequirement, formatProjectRequirementConstraints 等
  content/
    rule.entity.ts             # PageRuleModel
    dataset.entity.ts          # PageDataSetModel
    text.entity.ts             # PageTextModel
  navigation/
    draft.entity.ts            # NavigationDraftModel
  planning/
    planning.entity.ts         # ProjectPlanningModel
```

> **迭代 3 关键优化**：`entity/node/` 从 9 文件精简到 6 文件，将 4 个简单的 leaf node 类（VuePage、SystemAction、Link、Ref）合并到 `leaf-nodes.entity.ts`。这四个类都只有 3-5 行的 getter 覆写，没有独立的状态或方法，合并不影响可读性。

**service/（用例编排 + 外部交互）——操作实体但不持有实体状态：**

```
service/
  editor/
    project-editor.service.ts  # ProjectEditor class + createProjectEditor() factory
  file/
    file-api.service.ts        # PageNodeFileApi
    file-cache.service.ts      # PageNodeFileCache
    file-creator.service.ts    # PageNodeFileCreator
    file-deleter.service.ts    # PageNodeFileDeleter
    file-versions.service.ts   # PageNodeFileVersions
    file-registry.service.ts   # PageNodeFileRegistry + PAGE_NODE_FILE_NAMES + PageNodeFileName
    file-serialization.ts      # parseRuleText, serializeRuleTree, parsePageDataText, serializeDataSet
    file-restore-command.ts    # PageFileRestoreCommand
  content-loader/
    loader.service.ts          # createPageContentLoader + 具体实现
    compiler.service.ts        # compileRule, parsePageData, parseScript, parseCss
    types.ts                   # BasePageContentLoader（抽象类）, PageContentLoaderOptions, PageContentLoadResult
  navigation/
    nav-model.ts               # re-exports from @spark-view/spark-data（从 page-model/navigation/nav-model.ts 迁移）
    client.service.ts          # NavigationConfigClient
    editing.service.ts         # nav-editing 纯函数 + NavigationEditSession class
    lifecycle.service.ts       # PageNavigationLifecycle
    operations.service.ts      # PageNodeNavigationOperations
  planning/
    edit-host.service.ts       # applyProjectPlanningCommandToRoot + ProjectPlanningEditHost 实现
  reference/
    reference-client.service.ts # ProjectReferenceClient
```

> **迭代 3 关键优化**：`nav-model.ts` 保留在 service/navigation/ 而非 contract/。原因是：它只是从 spark-data 的 re-export，不定义新类型。NavigationNodeDraft 等草稿类型已经提取到 contract/navigation.contract.ts。nav-model.ts 的存在只是为了减少"从 spark-data 直接导入 NavNode"的跨包耦合——它是一个适配层。

### 3.3 entity/node/ 文件数优化

迭代 1 方案：9 个文件（临界值）
迭代 3 优化：**6 个文件**（合并 4 个简单 leaf node 类为 1 个文件）

```
entity/node/
  node-base.entity.ts      # ProjectNodeModel (abstract) + ProjectPageNodeModel (abstract) + ProjectNavigationFlatNode type
  config-page.entity.ts    # ProjectConfigPageNodeModel + ProjectConfigPageNodeModelOptions + ConfigPageContentPart + ProjectConfigPageDirtyPart
  leaf-nodes.entity.ts     # ProjectModuleNodeModel + ProjectVuePageNodeModel + ProjectSystemActionNodeModel + ProjectLinkNodeModel + ProjectRefNodeModel
  node-factory.ts          # createProjectNodeModel() + isConfigNodeKind() + isProjectConfigPageNodeModel() + isProjectPageNodeModel() 等类型判断
  node-helpers.ts          # 纯函数 25+：tree/flat 转换、pageId 解析、NavNode 创建、constraint 管理
```

等等，这样还是 5 个文件。但是 ProjectModuleNodeModel 也有自己的特点——它是唯一可以有子节点的 branch 节点。把它和 leaf nodes 放在一起不太合适。

重新考虑：
```
entity/node/
  node-base.entity.ts      # ProjectNodeModel (abstract) + ProjectPageNodeModel (abstract) + ProjectNavigationFlatNode
  module-node.entity.ts    # ProjectModuleNodeModel
  config-page.entity.ts    # ProjectConfigPageNodeModel + ConfigPageContentPart + ProjectConfigPageDirtyPart + ProjectConfigPageNodeModelOptions
  leaf-nodes.entity.ts     # ProjectVuePageNodeModel + ProjectSystemActionNodeModel + ProjectLinkNodeModel + ProjectRefNodeModel
  node-factory.ts          # createProjectNodeModel() + 类型判断函数
  node-helpers.ts          # 纯函数 25+
```

6 个文件，符合 ≤10 限制，且逻辑清晰。

---

## 迭代 4：特殊文件归属精化——消除边界模糊

### 4.1 PageNodeFactory（page-node-factory.ts）归属

**代码事实**：`PageNodeFactory` 是一个 DI 容器——它创建 `HttpClientBase`、`BasePageContentLoader`、`PageNodeFileApi`、`PageNodeFileCache`、`NavigationConfigClient`，将它们注入到 `ProjectConfigPageNodeModel` 构造函数。

**问题**：放在 entity/node/ 会违反"实体层不依赖服务层"原则（它需要创建 service 层的对象）。

**迭代 4 决策**：`PageNodeFactory` 放在 `src/factory/` 顶层目录：

```
src/
  factory/
    page-node.factory.ts    # PageNodeFactory class + createPageNodeFactory() + createPageNode()
```

这是合理的——工厂/组装器跨越多个层，不属于任何单一层。

### 4.2 page-edit-session.ts 拆分

**代码事实**（`src/page-model/update/page-edit-session.ts`，~133 行）：

| 符号 | 类型 | 归属 |
|------|------|------|
| `PageDesignEditHost` | type（契约） | `contract/edit-host.contract.ts` |
| `PageDesignEditPhase` | type | `contract/edit-host.contract.ts` |
| `PageDesignEditSession` | class（AI 运行时状态） | `ai/page-design/session.ts` |
| `PageDesignServiceContext` | type | `ai/page-design/service.ts` |
| `PageDesignServiceOptions` | type | `ai/page-design/service.ts` |
| `PageDesignServiceResult<T>` | type | `ai/page-design/service.ts` |
| `PageDesignTextFileKey` | type | `ai/page-design/service.ts` |
| `PageDesignServiceActionBinding<T>` | type | `ai/page-design/service.ts` |
| `pageDesignServiceFailure()` | 函数 | `ai/page-design/service.ts` |
| `PageDesignNodeTree` | type | `ai/page-design/session.ts` |

### 4.3 script-contract.ts 和 page-data-canonicalize.ts 归属

- `script-contract.ts`：脚本.js 的类型契约校验 → 放入 `ai/page-design/` （仅被 PageDesignService 使用）
- `page-data-canonicalize.ts`：DataSet 规范化 → 放入 `artifact/data.artifact.ts`（和 data-artifacts 合并）

### 4.4 internal/assert-page-id.ts 归属

保留在 `src/internal/assert-page-id.ts`。这是纯工具函数，被多處使用。不参与分层。

### 4.5 project-node-tools.ts 归属

**代码事实**：`ProjectNodeTools` 是一个静态方法包装类，所有方法都是对 `nav-editing.ts` 和 `project-node-model.ts` 中已有函数的委托。标记为 `@internal`。

**迭代 4 决策**：放入 `service/navigation/tools.service.ts`，和 editing.service.ts 同目录。这是因为它本质上是导航编辑的工具集合，只是用一个 class 做了静态包装。

```
service/navigation/
  nav-model.ts           # re-exports from spark-data
  client.service.ts      # NavigationConfigClient
  editing.service.ts     # nav-editing 纯函数 + NavigationEditSession
  tools.service.ts       # ProjectNodeTools (@internal)
  lifecycle.service.ts   # PageNavigationLifecycle
  operations.service.ts  # PageNodeNavigationOperations
```

6 个文件，≤10 ✅。

---

## 迭代 5：最终门禁验证与回归检查

### 5.1 最终目录结构

```
src/
├── index.ts                          # 主入口 barrel（不变行为，只改 import 路径）
├── project.ts                        # /project 子路径 barrel
├── ai.ts                             # /ai 子路径 barrel
├── json-document-public.ts           # /json-document 子路径 barrel
│
├── contract/                         # ═══ 契约层（5 文件） ═══
│   ├── node.contract.ts              # 节点家族类型、渲染配置、PageNodeLike/Factory 类型
│   ├── navigation.contract.ts        # NavNode 类型（从 spark-data）、草稿类型、位置类型
│   ├── edit-host.contract.ts         # PageDesignEditHost、ProjectPlanningEditHost、PageDesignEditPhase
│   ├── planning.contract.ts          # 策划 snapshot、plan、command、result 类型
│   └── project.contract.ts           # ProjectModel/ProjectEditor 构造选项和快照类型
│
├── entity/                           # ═══ 实体层 ═══
│   ├── project/
│   │   ├── project.entity.ts         # ProjectModel
│   │   └── node-collection.entity.ts # ProjectNodeCollection
│   ├── node/
│   │   ├── node-base.entity.ts       # ProjectNodeModel (abstract) + ProjectPageNodeModel (abstract)
│   │   ├── module-node.entity.ts     # ProjectModuleNodeModel
│   │   ├── config-page.entity.ts     # ProjectConfigPageNodeModel + 相关选项类型和 dirty part 类型
│   │   ├── leaf-nodes.entity.ts      # ProjectVuePageNodeModel + ProjectSystemActionNodeModel + ProjectLinkNodeModel + ProjectRefNodeModel
│   │   ├── node-factory.ts           # createProjectNodeModel() + 类型判断 predicate 函数
│   │   └── node-helpers.ts           # 纯函数：tree/flat 转换、pageId 解析、constraint 构建、导航节点创建（~25 函数）
│   ├── content/
│   │   ├── rule.entity.ts            # PageRuleModel
│   │   ├── dataset.entity.ts         # PageDataSetModel
│   │   └── text.entity.ts            # PageTextModel
│   ├── navigation/
│   │   └── draft.entity.ts           # NavigationDraftModel
│   └── planning/
│       └── planning.entity.ts        # ProjectPlanningModel
│
├── service/                          # ═══ 服务层 ═══
│   ├── editor/
│   │   └── project-editor.service.ts # ProjectEditor + createProjectEditor()（~1140 行，不拆分）
│   ├── file/
│   │   ├── file-api.service.ts
│   │   ├── file-cache.service.ts
│   │   ├── file-creator.service.ts
│   │   ├── file-deleter.service.ts
│   │   ├── file-versions.service.ts
│   │   ├── file-registry.service.ts
│   │   ├── file-serialization.ts
│   │   └── file-restore-command.ts
│   ├── content-loader/
│   │   ├── loader.service.ts
│   │   ├── compiler.service.ts
│   │   └── types.ts                  # BasePageContentLoader 抽象类 + 相关类型
│   ├── navigation/
│   │   ├── nav-model.ts              # spark-data re-exports
│   │   ├── client.service.ts
│   │   ├── editing.service.ts        # nav-editing 纯函数 + NavigationEditSession
│   │   ├── tools.service.ts          # ProjectNodeTools (@internal)
│   │   ├── lifecycle.service.ts
│   │   └── operations.service.ts
│   ├── planning/
│   │   └── edit-host.service.ts
│   └── reference/
│       └── reference-client.service.ts
│
├── ai/                               # ═══ AI 子系统 ═══
│   ├── page-design/
│   │   ├── module.ts                 # PageDesign AI 注册（主协调器）
│   │   ├── session.ts                # PageDesignEditSession + PageDesignNodeTree
│   │   ├── service.ts                # PageDesignService + 相关类型 + pageDesignServiceFailure
│   │   ├── support.ts                # session-diagnostics + helpers 合并
│   │   ├── kind-ids.ts               # Kind ID 常量
│   │   ├── script-contract.ts        # script.js 契约校验
│   │   ├── tool-catalog/
│   │   │   ├── standard-page.ts
│   │   │   ├── lifecycle.ts
│   │   │   ├── text-model.ts
│   │   │   ├── dataset.ts
│   │   │   ├── node-tree.ts
│   │   │   └── payload-catalog.ts
│   │   └── payload/
│   │       └── component-catalog.json
│   └── project-planning/
│       └── module.ts
│
├── artifact/                         # ═══ 设计期产出 ═══
│   ├── data.artifact.ts              # DataSet 设计器投影 + canonicalize 逻辑
│   ├── rule.artifact.ts              # Rule JSON Schema + tree policy
│   ├── design-flow.artifact.ts       # 100 步页面设计流程
│   └── stage-detection.artifact.ts
│
├── factory/                          # ═══ 跨层组装 ═══
│   └── page-node.factory.ts          # PageNodeFactory DI 容器
│
├── internal/
│   └── assert-page-id.ts             # 纯工具，保持不变
│
└── standalone/
    ├── json-document/
    │   └── index.ts
    └── leave-request/
        ├── index.ts
        └── leave-request.ts
```

### 5.2 目录约束门禁验证表

| 目录 | 文件数 | 子目录数 | 门禁 |
|------|--------|----------|------|
| `src/` | 5 (barrels) | 9 (contract, entity, service, ai, artifact, factory, internal, standalone + json-document) | ❌ 9 > 7! |
| `src/contract/` | 5 | 0 | ✅ |
| `src/entity/` | 0 | 5 (project, node, content, navigation, planning) | ✅ |
| `src/entity/project/` | 2 | 0 | ✅ |
| `src/entity/node/` | 6 | 0 | ✅ |
| `src/entity/content/` | 3 | 0 | ✅ |
| `src/entity/navigation/` | 1 | 0 | ✅ |
| `src/entity/planning/` | 1 | 0 | ✅ |
| `src/service/` | 0 | 6 (editor, file, content-loader, navigation, planning, reference) | ✅ |
| `src/service/editor/` | 1 | 0 | ✅ |
| `src/service/file/` | 8 | 0 | ✅ |
| `src/service/content-loader/` | 3 | 0 | ✅ |
| `src/service/navigation/` | 6 | 0 | ✅ |
| `src/service/planning/` | 1 | 0 | ✅ |
| `src/service/reference/` | 1 | 0 | ✅ |
| `src/ai/` | 0 | 2 | ✅ |
| `src/ai/page-design/` | 7 | 2 (tool-catalog, payload) | ❌ 9 条目 > 7! |
| `src/ai/project-planning/` | 1 | 0 | ✅ |
| `src/artifact/` | 4 | 0 | ✅ |
| `src/factory/` | 1 | 0 | ✅ |
| `src/internal/` | 1 | 0 | ✅ |
| `src/standalone/` | 0 | 2 (json-document, leave-request) | ✅ |

**发现两个门禁违规：**

1. **`src/` 有 9 个子目录**（超过 7）：contract, entity, service, ai, artifact, factory, internal, standalone, json-document
2. **`src/ai/page-design/` 有 9 条目**（7 文件 + 2 子目录，超过 7）

### 5.3 迭代 5：修复门禁违规

**修复 1：`src/` 子目录超过 7 个**

将 `internal/` 合并到 `standalone/` 下（internal 本身也是独立工具），将 `factory/` 提升概念——实际上可以把 `internal/`、`factory/`、`standalone/` 整合：

方案 A：将 `internal/` 和 `factory/` 合并为 `infra/`（基础设施层）
方案 B：将 `internal/` 放入 `standalone/`，将 `factory/` 放入 `entity/` 或保留

选择方案 B：
- `internal/assert-page-id.ts` → `standalone/internal/assert-page-id.ts`
- `factory/page-node.factory.ts` → 保留在 `src/factory/`（它跨越所有层，必须单独存在）
- `standalone/` 下面有：json-document/, leave-request/, internal/

这样 `src/` 子目录：contract, entity, service, ai, artifact, factory, standalone = 7 ✅

**修复 2：`src/ai/page-design/` 超过 7 条目**

当前：module.ts, session.ts, service.ts, support.ts, kind-ids.ts, script-contract.ts, tool-catalog/, payload/ = 7 文件 + 2 子目录

问题在于 `script-contract.ts` 被放入了 ai/page-design/。重新考虑：`script-contract.ts` 是独立的契约校验逻辑，不依赖 AI。放入 `artifact/` 更合适。

修复后：module.ts, session.ts, service.ts, support.ts, kind-ids.ts, tool-catalog/, payload/ = 5 文件 + 2 子目录 = 7 ✅

### 5.4 最终门禁验证（修正后）

| 目录 | 文件数 | 子目录数 | 门禁 |
|------|--------|----------|------|
| `src/` | 5 | 7 (contract, entity, service, ai, artifact, factory, standalone) | ✅ |
| `src/contract/` | 5 | 0 | ✅ |
| `src/entity/` | 0 | 5 | ✅ |
| `src/entity/project/` | 2 | 0 | ✅ |
| `src/entity/node/` | 6 | 0 | ✅ |
| `src/entity/content/` | 3 | 0 | ✅ |
| `src/entity/navigation/` | 1 | 0 | ✅ |
| `src/entity/planning/` | 1 | 0 | ✅ |
| `src/service/` | 0 | 6 | ✅ |
| `src/service/editor/` | 1 | 0 | ✅ |
| `src/service/file/` | 8 | 0 | ✅ |
| `src/service/content-loader/` | 3 | 0 | ✅ |
| `src/service/navigation/` | 6 | 0 | ✅ |
| `src/service/planning/` | 1 | 0 | ✅ |
| `src/service/reference/` | 1 | 0 | ✅ |
| `src/ai/` | 0 | 2 | ✅ |
| `src/ai/page-design/` | 5 | 2 (tool-catalog, payload) | ✅ (5+2=7) |
| `src/ai/project-planning/` | 1 | 0 | ✅ |
| `src/artifact/` | 5 (data, rule, design-flow, stage-detection, script-contract) | 0 | ✅ |
| `src/factory/` | 1 | 0 | ✅ |
| `src/standalone/` | 0 | 3 (json-document, leave-request, internal) | ✅ |

**全部通过！**

### 5.5 完整迁移映射表

从旧路径到新路径的完整映射：

| 旧文件 | 新文件 |
|--------|--------|
| **project/core/project-model.ts** | `entity/project/project.entity.ts` (class) + `contract/project.contract.ts` (types) |
| **project/core/project-editor.ts** | `service/editor/project-editor.service.ts` (class + factory) + `contract/project.contract.ts` (types) |
| **project/core/project-reference-client.ts** | `service/reference/reference-client.service.ts` |
| **project/node/project-node-model.ts** | 拆分为 6 个文件：`entity/node/node-base.entity.ts` + `module-node.entity.ts` + `config-page.entity.ts` + `leaf-nodes.entity.ts` + `node-factory.ts` + `node-helpers.ts`；类型提取到 `contract/node.contract.ts` |
| **project/node/project-node-collection.ts** | `entity/project/node-collection.entity.ts` |
| **project/node/project-node-tools.ts** | `service/navigation/tools.service.ts` |
| **project/node/page-node-factory.ts** | `factory/page-node.factory.ts` + 类型提取到 `contract/node.contract.ts` |
| **project/planning/project-planning-model.ts** | `entity/planning/planning.entity.ts` + 类型提取到 `contract/planning.contract.ts` |
| **project/planning/project-planning-edit-host.ts** | `service/planning/edit-host.service.ts` + 类型提取到 `contract/planning.contract.ts` + `contract/edit-host.contract.ts` |
| **project/ai/project-planning-module.ts** | `ai/project-planning/module.ts` |
| **page-model/model/page-rule-model.ts** | `entity/content/rule.entity.ts` |
| **page-model/model/page-data-set-model.ts** | `entity/content/dataset.entity.ts` |
| **page-model/model/page-text-model.ts** | `entity/content/text.entity.ts` |
| **page-model/model/page-file/*.ts** (8 files) | `service/file/*.ts` (8 files, 一一对应) |
| **page-model/read/page-content-types.ts** | `service/content-loader/types.ts` |
| **page-model/read/page-content-loader.ts** | `service/content-loader/loader.service.ts` |
| **page-model/read/page-content-compiler.ts** | `service/content-loader/compiler.service.ts` |
| **page-model/navigation/nav-model.ts** | `service/navigation/nav-model.ts` (re-exports 不变) |
| **page-model/navigation/nav-editing.ts** | `service/navigation/editing.service.ts` + 类型提取到 `contract/navigation.contract.ts` |
| **page-model/navigation/nav-client.ts** | `service/navigation/client.service.ts` |
| **page-model/navigation/navigation-draft-model.ts** | `entity/navigation/draft.entity.ts` |
| **page-model/navigation/page-navigation-lifecycle.ts** | `service/navigation/lifecycle.service.ts` |
| **page-model/navigation/page-node-navigation-operations.ts** | `service/navigation/operations.service.ts` |
| **page-model/update/page-edit-session.ts** | `ai/page-design/session.ts` (class) + `contract/edit-host.contract.ts` (PageDesignEditHost type) |
| **page-model/update/page-design-service.ts** | `ai/page-design/service.ts` |
| **page-model/update/page-data-canonicalize.ts** | `artifact/data.artifact.ts` (合并到已有文件) |
| **page-model/update/script-contract.ts** | `artifact/script-contract.ts` |
| **page-model/update/artifacts/data-artifacts.ts** | `artifact/data.artifact.ts` |
| **page-model/update/artifacts/rule-artifacts.ts** | `artifact/rule.artifact.ts` |
| **page-model/update/artifacts/design-flow.ts** | `artifact/design-flow.artifact.ts` |
| **page-model/update/artifacts/page-design-stage-detection.ts** | `artifact/stage-detection.artifact.ts` |
| **page-model/ai/page-design-module.ts** | `ai/page-design/module.ts` |
| **page-model/ai/page-design-kind-ids.ts** | `ai/page-design/kind-ids.ts` |
| **page-model/ai/page-design-helpers.ts** | `ai/page-design/support.ts` (合并) |
| **page-model/ai/page-design-session-diagnostics.ts** | `ai/page-design/support.ts` (合并) |
| **page-model/ai/tool-catalogs/*.ts** (6 files) | `ai/page-design/tool-catalog/*.ts` |
| **page-model/ai/payloads/component-catalog.json** | `ai/page-design/payload/component-catalog.json` |
| **json-document/index.ts** | `standalone/json-document/index.ts` |
| **leave-request/index.ts** | `standalone/leave-request/index.ts` |
| **leave-request/leave-request.ts** | `standalone/leave-request/leave-request.ts` |
| **internal/assert-page-id.ts** | `standalone/internal/assert-page-id.ts` |

### 5.6 公共 barrel 更新映射

#### `src/index.ts`（4 条 import 变更）
```
./project/core/project-model → ./entity/project/project.entity + ./contract/project.contract
./project/node/page-node-factory → ./factory/page-node.factory
./project/node/project-node-model → ./entity/node/config-page.entity + ./contract/node.contract
```

#### `src/project.ts`（~20 条 import 变更，最关键）
```
./page-model/ai/payloads/component-catalog.json → ./ai/page-design/payload/component-catalog.json
./project/core/project-editor → ./service/editor/project-editor.service
./project/core/project-model → ./entity/project/project.entity + ./contract/project.contract
./project/core/project-reference-client → ./service/reference/reference-client.service
./project/node/project-node-collection → ./entity/project/node-collection.entity
./project/node/project-node-model → ./entity/node/* + ./contract/node.contract
./project/node/project-node-tools → ./service/navigation/tools.service
./project/planning/project-planning-model → ./entity/planning/planning.entity + ./contract/planning.contract
./project/planning/project-planning-edit-host → ./service/planning/edit-host.service + ./contract/planning.contract
./page-model/model/page-file/page-file-registry → ./service/file/file-registry.service
./page-model/model/page-file/page-file-api → ./service/file/file-api.service
./page-model/navigation/nav-editing → ./contract/navigation.contract
./page-model/update/artifacts/data-artifacts → ./artifact/data.artifact
./page-model/update/artifacts/rule-artifacts → ./artifact/rule.artifact
./page-model/update/page-edit-session → ./contract/edit-host.contract
```

#### `src/ai.ts`（~8 条 import 变更）
```
./project/ai/project-planning-module → ./ai/project-planning/module
./page-model/ai/page-design-module → ./ai/page-design/module
./page-model/ai/page-design-kind-ids → ./ai/page-design/kind-ids
./page-model/ai/page-design-session-diagnostics → ./ai/page-design/support
```

#### `src/json-document-public.ts`
```
./json-document → ./standalone/json-document
```

### 5.7 回归测试检查清单

| 测试文件 | 验证内容 | 风险点 |
|----------|----------|--------|
| `public-api-imports.test.ts` | 5 个 subpath 的 import 不变 | barrel 路径变更 |
| `page-editor.test.ts` | ProjectEditor 功能完整 | editor 内部 import 变更 |
| `devsystem-ssot.test.ts` | 导航规范化 + 设计流程 | nav-editing 移动 |
| `project-planning-model.test.ts` | 策划模型 | planning entity 移动 |
| `project-planning-ai.test.ts` | AI 策划 | AI module 移动 |
| `page-design-business-definition.test.ts` | PageDesign AI 注册 | AI module 移动 |
| `page-design-node-tree-module-semantic.test.ts` | NodeTree AI 语义 | tool-catalog 移动 |
| `page-design-session-diagnostics.test.ts` | Session 诊断 | support.ts 合并 |
| `leave-application-page-design.test.ts` | E2E 页面设计 | 全链路 |
| `leave-request-module.test.ts` | 请假模块 | standalone 独立 |
| `page-content-loader.test.ts` | 内容加载器 | content-loader 移动 |
| `spark-node-tree.test.ts` | 节点树 | 不变（依赖 spark-data） |
| `json-tree-*.test.ts` (2 files) | JSON 树编辑器 | json-document 移动 |
| `helpers/test-utils.ts` | 测试辅助 | 保持不变 |

---

## 实施策略（6 阶段）

### 阶段 0：准备与基线
1. `pnpm run test` — 确保 15 个测试全部通过
2. `pnpm run build` — 确保编译成功
3. `pnpm run verify:rules` — 确保门禁通过
4. 提交当前状态作为基线

### 阶段 1：创建新目录结构 + 契约层
1. 创建所有空目录
2. 提取 `contract/*.ts`（5 个文件）——纯类型定义，无实现
3. 更新所有被提取类型的源文件，改为从 contract/ import
4. 运行测试 → 通过

### 阶段 2：实体层迁移
1. 拆分 `project-node-model.ts` → entity/node/ (6 文件)
2. 迁移 ProjectModel, ProjectNodeCollection, PageRuleModel, PageDataSetModel, PageTextModel, NavigationDraftModel, ProjectPlanningModel
3. 更新所有内部 import
4. 运行测试 → 通过

### 阶段 3：服务层迁移
1. 迁移 service/file/ (8 文件)
2. 迁移 service/content-loader/ (3 文件)
3. 迁移 service/navigation/ (6 文件)
4. 迁移 service/editor/, service/planning/, service/reference/
5. 更新所有内部 import
6. 运行测试 → 通过

### 阶段 4：AI/Artifact/Factory/Standalone 迁移
1. 迁移 AI 子系统（page-design 拆分 + project-planning）
2. 迁移 artifact 文件（含 data-artifacts 与 page-data-canonicalize 合并）
3. 迁移 factory/, standalone/
4. 运行测试 → 通过

### 阶段 5：公共入口更新
1. 更新 5 个 barrel 文件的所有 import 路径
2. 运行 `public-api-imports.test.ts` → 必须通过
3. 运行全部测试 → 必须通过
4. `pnpm run build` → 必须成功
5. `pnpm run verify:rules` → 必须通过

### 阶段 6：消费者验证
1. 检查 `spark-app` 编译
2. 检查 `spark-component` 编译
3. 删除旧目录（project/, page-model/, json-document/, leave-request/）

---

## 风险矩阵

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| project-node-model.ts 拆分引入循环依赖 | 中 | 高 | node-helpers.ts 放纯函数，class 文件只 import helpers + contract |
| barrel 路径遗漏导致公共 API 变更 | 中 | 高 | public-api-imports.test.ts 机械验证 |
| import 路径错误导致编译失败 | 高 | 中 | 每个阶段后立即编译+测试 |
| 测试文件 import 失效 | 高 | 低 | 测试文件逐批更新 |
| 消费者（spark-app/spark-component）编译失败 | 低 | 高 | 保持所有 export 名称不变，只改内部路径 |
| page-data-canonicalize 合并到 data.artifact.ts 引入冲突 | 低 | 中 | 合并前先 diff 确认无函数名冲突 |
| diagnostics + helpers 合并为 support.ts 丢失导出 | 低 | 中 | 保留所有 export，合并后运行诊断测试 |
