# SparkNode 构建流：从组件选择到树写入

> 文档目标：把"组件列表查询 → 属性选择 → 组装 SparkNode → 调 FC 写入树"这条路径在当前仓库中完整落地，明确每一层的职责边界、数据对象类型与对应源码位置。

---

## 一、设计动机

传统的"让 LLM 直接输出完整 rule.json"方案有三个系统性缺陷：

1. **错误放大**：整棵树一起提交，一处错误会污染整个 UI 配置；
2. **约束难以注入**：LLM 不知道哪些组件存在、哪些 props 合法；
3. **纠错成本高**：失败原因难以定位，LLM 和开发者都需要手动扫全文。

正确的解法是：**先选组件，再组装节点，最后调用树操作**。这样每一步都是受约束的小动作，失败原因也能精确定位到哪一步。

---

## 二、四层语义边界

这条链路的关键不是"能不能做"，而是**中间对象的类型边界必须清晰**：

| 层次 | 对象 | 类型语义 | 说明 |
|------|------|----------|------|
| 组件目录 | **A**（组件 type） | `string`（如 `r-table`） | 组件的注册键，非实例，非节点 |
| 组件规格 | **A 的 schema** | `FcComponentConfigGuide` | 描述这个组件"怎么配"，仍属于目录层 |
| SparkNode 实例 | **B** | `SparkNode` | 配置完之后的实例对象，有 `type/props/children` |
| FC 参数 | **写入参数** | `SparkNodeTreeAddParams` 等 | 把 B 放进树时用的调用参数，属于能力层 |

> A 是组件类型，A 的属性是组件配置 schema，B 是 SparkNode 实例数据，FC 参数是把 B 放进树时的调用参数。这四者不可混淆。

---

## 三、完整链路说明

```
┌─────────────────────────────────────────────────────────────────────┐
│                    LLM FC 调用链路（标准流程）                         │
├──────────────────────┬──────────────────────────────────────────────┤
│  第 1 步：查组件列表   │  LLM 拿到"有哪些可选组件"                      │
│  第 2 步：选组件 type  │  LLM 决定用哪个组件，得到 A                    │
│  第 3 步：查 A 的规格  │  LLM 拿到 A 的 props schema、约束、示例         │
│  第 4 步：构造 SparkNode│  LLM 基于规格组装实例对象 B                   │
│  第 5 步：写入树       │  LLM 调 SparkNodeTree FC，把 B 放进当前子树    │
└──────────────────────┴──────────────────────────────────────────────┘
```

### 第 1 步：查询组件列表

**调用入口**：`catalog.query({})`
**响应来源**：`catalog-projections.ts → projectComponentDirectory()`
**响应结构**：`FcDirectoryPayload`
**包含内容**：

- `registry` — 按分类列出全部组件 type（`containers / fields / groups / meta`）
- `components` — 所有组件的 `type + category + description` 摘要
- `capabilities` — 按能力聚合（`dataBinding / eventDriven / optionDriven`）

这一步的目的是让 LLM 知道"能选什么组件"，不暴露 props 细节，减少 Token 消耗。

**关键源码**：
- 投影函数：[packages/spark-ai/src/catalog/catalog-projections.ts](../../../packages/spark-ai/src/catalog/catalog-projections.ts)（`projectComponentDirectory`）
- 事实源：[packages/spark-ai/src/catalog/component-catalog.json](../../../packages/spark-ai/src/catalog/component-catalog.json)
- 查询分发：[packages/spark-ai/src/stills/meta-methods.ts](../../../packages/spark-ai/src/stills/meta-methods.ts)（`catalogQuery` / `catalogGuide`）

---

### 第 2 步：选择组件 type（由 LLM 推理完成）

LLM 根据用户意图，从第 1 步拿到的列表中选择一个组件 type，例如：

```
A = 'r-table'
```

这是一个纯推理步骤，不产生 FC 调用。**A 只是一个 string，不是节点，也不是能力**。

---

### 第 3 步：查询 A 的配置规格

**调用入口**：`catalog.guide({ type: 'r-table' })`
**响应来源**：`catalog-projections.ts → projectComponentConfigGuide() / projectComponentSpec()`
**响应结构**：`FcComponentConfigGuide` / `FcComponentSpec`
**包含内容**：

- `requiredProps` — 必填属性列表（含类型、描述）
- `optionalProps` — 可选属性列表（含默认值）
- `bindingGuide` — 数据绑定能力摘要（`selfResolving / dataContainer / fieldProvider / hasOptions`）
- `minimalConfig` — 带占位值的最小安全配置示例
- `failFastChecks` — 提交配置前的自检清单
- `eventGuide` — 事件参数签名说明

这一步的目的是让 LLM 知道"这个组件怎么配"，给出完整约束以防止幻觉。**这仍然属于组件目录层，不是能力层。**

**关键源码**：
- 投影函数：[packages/spark-ai/src/catalog/catalog-projections.ts](../../../packages/spark-ai/src/catalog/catalog-projections.ts)（`projectComponentSpec`、`projectComponentConfigGuide`、`projectHydratedComponent`）
- 查询入口：[packages/spark-ai/src/stills/meta-methods.ts](../../../packages/spark-ai/src/stills/meta-methods.ts)（`catalogQuery`、`catalogGuide`）

---

### 第 4 步：构造 SparkNode 实例 B（由 LLM 推理完成）

LLM 拿到 A 的规格后，构造一个完整的 `SparkNode` 对象：

```ts
// SparkNode 类型定义位于 packages/spark-component/src/core/types.ts
const B: SparkNode = {
  type: 'r-table',              // A — 组件 type
  id: 'user-table',             // 可选，建议提供稳定 id
  props: {
    dataKey: 'Users@rows',      // 由 bindingGuide 约束
    highlightCurrentRow: true,  // 由 minimalConfig / failFastChecks 指导
    stripe: true,
  },
  children: [                   // 字段子节点
    { type: 'r-text', props: { field: 'name', label: '姓名' } },
    { type: 'r-text', props: { field: 'email', label: '邮箱' } },
  ],
}
```

**注意**：

- `B` 是实例数据，此时还没有进入树；
- `props` 的内容由第 3 步的规格约束，不能随意填写；
- `children` 是否需要取决于组件语义（容器类才有 `children`，字段类一般没有）；
- 这是一个纯推理步骤，不产生 FC 调用。

**SparkNode 模型定义**：
- 类型文件：`packages/spark-component/src/core/types.ts`（`SparkNode`）
- API 层本体：[packages/spark-component/src/core/spark-node-tree.ts](../../../packages/spark-component/src/core/spark-node-tree.ts)（`SparkNodeTree`）

---

### 第 5 步：调用 SparkNodeTree FC 写入树

**调用入口**：通过 Stills 系统执行 `sparkNodeTree.addNode` / `sparkNodeTree.addNodes` 等动作
**执行桥接**：[packages/spark-ai/src/business/page-design/stills/edit/actions/edit-domain.ts](../../../packages/spark-ai/src/business/page-design/stills/edit/actions/edit-domain.ts)（`EDIT_NODE_TREE_STILLS`）
**Catalog 来源**：[packages/spark-ai/src/business/page-design/functions/node-tree/tool-catalog.ts](../../../packages/spark-ai/src/business/page-design/functions/node-tree/tool-catalog.ts)（`PageDesignNodeTreeCatalog.parameterTable`）
**底层 API**：[packages/spark-component/src/core/spark-node-tree.ts](../../../packages/spark-component/src/core/spark-node-tree.ts)（`SparkNodeTree` 类）

典型写入调用示例：

```jsonc
// sparkNodeTree.addNode
{
  "node": {
    "type": "r-table",
    "id": "user-table",
    "props": { "dataKey": "Users@rows", "highlightCurrentRow": true }
  },
        "parentComponentId": null,   // null 表示当前绑定的根组件实例
  "index": 0
}
```

**FC 参数**（`SparkNodeTreeAddParams`）包含的是"放置信息"，而非组件配置本身：

| 参数 | 说明 |
|------|------|
| `node` | 第 4 步构造好的 SparkNode 实例 B |
| `parentComponentId` | 目标父节点的组件 id（null = 当前绑定根组件实例） |
| `index` | 插入位置（省略则追加到末尾） |

**这里最关键的分层边界**：组件配置（`type + props`）封装在 `node` 参数里，而写入位置（`parentComponentId + index`）是 FC 参数本身，两者不混淆。

---

## 四、可用 FC 列表（SparkNodeTree 能力集合）

`SparkNodeTree` 提供的公开能力分为四类：

### 查询类（describe）

| 动作 | 方法 | 说明 |
|------|------|------|
| `sparkNodeTree.getNode` | `getNode` | 按 componentId 查找节点 |
| `sparkNodeTree.getLocation` | `getLocation` | 查找节点的父节点和位置信息 |
| `sparkNodeTree.hasNode` | `hasNode` | 判断节点是否存在 |
| `sparkNodeTree.getParent` | `getParent` | 获取直接父节点 |
| `sparkNodeTree.listChildren` | `listChildren` | 列出直接子节点 |

### 统计类（describe）

| 动作 | 方法 | 说明 |
|------|------|------|
| `sparkNodeTree.countNodes` | `countNodes` | 统计子树节点总数 |
| `sparkNodeTree.collectDataKeys` | `collectDataKeys` | 收集子树中的所有 dataKey |
| `sparkNodeTree.collectHandlerNames` | `collectHandlerNames` | 收集子树中的所有事件处理函数名 |

### 节点写入类（request）

| 动作 | 方法 | 说明 |
|------|------|------|
| `sparkNodeTree.addNode` | `addNode` | 在指定位置插入单个新节点 |
| `sparkNodeTree.addNodes` | `addNodes` | 在指定位置批量插入多个节点 |
| `sparkNodeTree.replaceNode` | `replaceNode` | 完整替换一个现有节点 |
| `sparkNodeTree.replaceNodes` | `replaceNodes` | 批量替换多个节点 |
| `sparkNodeTree.removeNode` | `removeNode` | 删除一个节点 |
| `sparkNodeTree.removeNodes` | `removeNodes` | 批量删除节点 |

### 属性写入类（request）

| 动作 | 方法 | 说明 |
|------|------|------|
| `sparkNodeTree.setProps` | `setProps` | 设置或合并单个节点的 props |
| `sparkNodeTree.setPropsBatch` | `setPropsBatch` | 批量设置多个节点的 props |

> Catalog 定义来源：`PageDesignNodeTreeCatalog.parameterTable`，执行桥接：`EDIT_NODE_TREE_STILLS`。

---

## 五、数据流与模块依赖图

```
component-catalog.json   ←──── json-catalog-generator.ts（构建期生成）
        │
        ├── catalog-projections.ts
        │       ├── projectComponentDirectory()   ─→ 第 1 步：组件列表
        │       ├── projectComponentSpec()        ─→ 第 3 步：组件规格
        │       └── projectComponentConfigGuide() ─→ 第 3 步：配置指南

spark-node-tree.ts (SparkNodeTree 类)   ←── 第 5 步底层 API
        │
        └── functions/node-tree/tool-catalog.ts
                └── PageDesignNodeTreeCatalog.parameterTable
                        └── stills/edit/actions/edit-domain.ts
                                └── EDIT_NODE_TREE_STILLS ─→ 执行桥接

meta-methods.ts
        ├── catalog.query()         ─→ 组件目录查询入口
        ├── catalog.guide()         ─→ 单组件配置指南入口
        └── stills.actionSpec()     ─→ 动作规格查询入口

core/protocol/function-call-schema.ts
        └── generateToolDefinitions() ─→ LLM FC 工具注册入口

business/page-design/fc-dispatcher.ts
        └── dispatchToolCall() ─→ 本地 still 执行分发入口
```

---

## 六、关键约束一览

### 组件目录层（第 1-3 步）

- 事实源唯一：`component-catalog.json` 是唯一来源，任何代码不得手写维护组件列表；
- 投影只读：`catalog-projections.ts` 全部为纯函数，无副作用；
- LLM 访问口三个：`catalog.query({})` 查组件目录；`catalog.guide({ type })` 查单组件规格；`stills.actionSpec({ action })` 查动作参数与约束。

### SparkNode 实例层（第 4 步）

- `SparkNode` 结构：`{ type: string; id?: string; props?: Record<string, unknown>; children?: SparkNodeChildren }`；
- `type` 必须通过组件目录确认存在，不得猜测；
- `props` 必须根据该组件的规格填写，不得添加组件不支持的属性；
- `children` 仅在组件语义需要时才添加；

### 树写入层（第 5 步）

- 写操作前必须先 Bootstrap，确保 `SparkNodeTree` 实例已初始化（`EDIT_BOOTSTRAP_ACTION`）；
- `addNode.parentComponentId = null` 表示放在当前绑定的根组件实例下；
- 写操作产生新的不可变子树快照，不直接修改传入节点；
- `setProps` 默认做浅合并（`merge !== false`），传 `merge: false` 时会完全替换 props 对象。

---

## 七、标准协议动作序列

### 查询阶段（两步，必须先执行）

```
Step 1: catalog.query({})
        ↳ 拿到全部组件 type + category + description 轻量目录

Step 2: catalog.guide({ type: 'r-table' })  // 按需查，不必全查
        ↳ 拿到 r-table 的 requiredProps / minimalConfig / failFastChecks
```

### 写入阶段（两步，节点配置和树写入分开）

```
Step 3: [LLM 内部推理] 基于规格，构造 SparkNode 实例 B
        B = { type: 'r-table', props: { dataKey: 'Users@rows', ... }, children: [...] }

Step 4: sparkNodeTree.addNode / sparkNodeTree.addNodes
        参数: { node: B, parentComponentId: 'section-main', index: 0 }
```

---

## 八、文件快速索引

| 模块职责 | 文件路径 |
|----------|----------|
| 组件目录事实源 | `packages/spark-ai/src/catalog/component-catalog.json` |
| 目录投影层（纯函数） | `packages/spark-ai/src/catalog/catalog-projections.ts` |
| 目录类型定义 | `packages/spark-ai/src/catalog/types.ts` |
| SparkNode 树 API 本体 | `packages/spark-component/src/core/spark-node-tree.ts` |
| FC 参数类型 | `packages/spark-component/src/core/spark-node-tree.ts`（行 ~1-200） |
| FC Catalog 表 | `packages/spark-ai/src/business/page-design/stills/node-tree/tool-catalog.ts` |
| FC 执行桥接 | `packages/spark-ai/src/business/page-design/stills/edit/actions/edit-domain.ts` |
| 元动作（组件目录查询） | `packages/spark-ai/src/stills/meta-methods.ts` |
| LLM FC 工具注册与分发 | `packages/spark-ai/src/core/protocol/function-call-schema.ts` / `packages/spark-ai/src/core/runtime/fc-dispatcher.ts` |
| 目录生成器（构建期） | `packages/vite-plugin-spark-catalog/src/json-catalog-generator.ts` |
