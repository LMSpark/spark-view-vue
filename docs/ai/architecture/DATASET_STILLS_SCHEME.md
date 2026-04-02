# Dataset Stills 方案

> 状态：待评审
> 日期：2026-04-01
> 范围：spark-ai / stills / SAP 协议扩展

---

## 1. 一句话定位

在 SAP 协议框架下，把 AI 页面设计从“直接生成最终数据配置”转变为“通过标准化动作渐进式构建 Dataset Memory”。

---

## 2. 问题陈述

### 2.1 当前设计的三个根因问题

**问题一：双写**

session-state 中 DataRegistry（表/列/关系）和 ViewRegistry（视图）是独立的平行注册表。它们记录的信息与最终导出快照高度重叠，但格式不同。proposal accept 写 registry，最后还要把 registry 再翻译成导出结果——中间多了一层不必要的映射。

**问题二：粒度不可控**

一个 `@@proposal:data-model` 可以包含任意大小的 payload（1 张表或 5 张表），proposal accept 是全有或全无。AI 无法逐步构建——只能一次性给出完整数据模型让用户判断。

**问题三：导出快照被误当作创作对象**

当前 AI 的目标表述如果仍然是“生成完整导出文件”，就会把导出结果误当作创作对象。但导出结果只是 DataSet 的序列化快照，不应该是创作过程中的操作对象。创作过程应该操作 DataSet 本身的结构。

### 2.2 目标状态

- 单一事实源：`IDataSetMetadata`（已有类型，覆盖 tables/columns/views/relations/viewDependencies/api/aggregates，与 `DataSet.toData()` 等价）
- 工作流先产出蓝图：AI 先把“用户需要什么、准备怎么做、每步如何验证”整理为 blueprint，再开始写 Dataset
- 操作粒度：每一步只做一件事（建表 / 加列 / 配视图），每步有即时校验反馈
- 可查询而非假设：AI 如果不知道可用动作、参数格式、返回格式、当前状态，必须先查询再执行
- 结果驱动迭代：每次执行后，AI 必须读取 `@@result/@@error`，修正 blueprint，再决定下一步
- 执行协议：复用 SAP 协议（`@@request:action#id` → `@@result/@@error`），不发明新协议
- 前端先行：handler 是纯 TypeScript 函数，vitest 验证，后端移植在最后

### 2.3 Dataset Memory 的语义解释

Dataset Memory 不是“随便放一点表定义”的临时草稿，它有明确语义边界。

它表示的是：

1. **当前业务页面的数据蓝图工作对象**
  - AI 与用户正在共同迭代的、可持续修改的结构化对象
  - 它承载“这个页面需要哪些表、列、关系、视图、依赖、API”

2. **DataSet 的可序列化设计态投影**
  - 它不是运行中的 `DataSet` 实例
  - 它也不是最终文件名或最终物理存储形式
  - 它是运行态 DataSet 的设计态、可持久化、可回放版本

3. **会话内唯一数据事实源**
  - 表定义以它为准
  - 视图定义以它为准
  - 关系定义以它为准
  - API 定义以它为准

4. **受 blueprint 驱动、受 stills 动作修改的状态对象**
  - AI 不能直接“口头宣布”它已经变化
  - 只有 stills 动作成功返回后，Dataset Memory 才算真的变化

Dataset Memory 不包含的内容：

1. 不包含 UI 组件树本身
2. 不包含脚本函数正文
3. 不包含样式正文
4. 不包含运行态事件监听器、HTTP client、订阅器、destroy 状态
5. 不包含“猜测中的未来结构”

可以把它理解成：

- 它不是文件
- 它不是实例
- 它不是提案文本
- 它是 AI 当前正在共同打造的“数据工作对象”

### 2.4 目标与非目标

为了避免目标含糊，这里把本方案的目标收口为 4 个，非目标收口为 4 个。

**目标**：

1. 让 AI 能从业务需求出发，先形成可执行蓝图
2. 让 AI 能基于可查询动作与参数格式，一步步构建 Dataset Memory
3. 让每一步都具备明确反馈、可验证、可回退
4. 让最终形成的 Dataset Memory 可继续用于后续 view / API / UI 生成链路

**非目标**：

1. 不是让 AI 一次性吐出最终完整配置
2. 不是把 AI 变成自由发挥的 schema 生成器
3. 不是让 blueprint 成为第二事实源
4. 不是在第一阶段解决 UI/script/style 的全部问题

### 2.5 缺的关键一步：需要 → 蓝图 → 执行

仅有 Dataset Memory 还不够。

在真正执行 `datatable.create`、`relation.add` 这些写动作之前，还缺一个标准化的“蓝图阶段”：

1. AI 先理解用户目标与约束
2. AI 查询自己当前可用的 stills 能力，而不是凭印象假设
3. AI 查询关键动作的参数格式、guard 条件、返回结构
4. AI 生成一份 blueprint，说明准备分几步完成、每步验证什么
5. AI 严格按 blueprint 一步一步执行
6. 每次执行后，依据 `@@result/@@error` 回写蓝图并决定下一步

这一步的价值不是再造一个“第二数据模型”，而是把“从需求到执行”的路线本身标准化、可检查、可迭代。

### 2.6 标准工作步骤

工作步骤必须足够清晰，AI 才不会乱跳。这里把流程明确拆成 6 步：

| 步骤 | 名称 | 目标 | 允许动作 | 退出条件 |
|------|------|------|----------|----------|
| 1 | 需求收敛 | 搞清楚业务目标、约束、缺失信息 | 自然语言提问 | 不再存在影响 schema 的关键歧义 |
| 2 | 能力发现 | 搞清楚当前可用动作、参数格式、状态 | `session.describe` / `stills.capabilities` / `stills.actionSpec` | 已知本轮需要的动作与参数规范 |
| 3 | 蓝图生成 | 形成 checkpoints、plannedActions、verification | `blueprint.create` / `blueprint.describe` | blueprint 已存在且当前 checkpoint 清晰 |
| 4 | 单步执行 | 只执行一个最小 stills 写动作 | `dataset.*` / `datatable.*` / `relation.*` / `dataview.*` / `dependency.*` / `schema.*` | 收到 `@@result` 或 `@@error` |
| 5 | 反馈迭代 | 根据结果推进或修订蓝图 | `blueprint.advance` / `blueprint.revise` / describe 类动作 | 已决定下一步且状态一致 |
| 6 | 阶段验证 | 验证当前 checkpoint 是否闭环 | `dataset.validate` / `session.describe` / `dataset.describe` | 当前 checkpoint 可标记为 done |

AI 任何时候都不应该从步骤 1 或 2 直接跳到连续多个写动作。

---

## 3. 架构决定

### 3.1 Dataset Memory = IDataSetMetadata

不发明 draft model。直接复用 `packages/spark-data/src/types.ts` 中的 `IDataSetMetadata`。

代码依据：
- `DataSet.fromData(metadata)` 能从 `IDataSetMetadata` 恢复完整运行态实例
- `DataSet.toData()` 返回 `IDataSetMetadata`
- `IDataSetMetadata` 覆盖：`dataSetName` / `schemaVersion` / `tables(ITableMetadata)` / `tableRelations(TableRelation)` / `viewDependencies(ViewDependency)` / `version` / `pageId`
- `ITableMetadata` 覆盖：`tableName` / `columns(DataColumn)` / `api(CrudApi)` / `crudConfig` / `views({ default: IViewMetadata })`
- `DataColumn` 覆盖：`name` / `type` / `label` / `isPrimaryKey` / `computeExpression` / 验证字段
- `IViewMetadata` 覆盖：`aggregates` / `pageSize` / `autoLoad` / `autoCurrentFirst` / `treeConfig` / `filterExpression` / `sortExpression`

不需要旁挂任何平行数据结构。

### 3.2 Session 退居工作流外壳

```typescript
interface DesignSessionV2 {
  version: 2

  // ── 工作流 ──
  currentPass: 'A' | 'B'
  currentStep: DesignStep
  schemaLocked: boolean           // A4 后 true
  blueprint: ExecutionBlueprint | null

  // ── 单一事实源 ──
  dataset: IDataSetMetadata | null  // null = 尚未 init

  // ── 变更日志 ──
  patchLog: PatchEntry[]          // 每次 still 执行记录
}

interface PatchEntry {
  id: string            // SAP 块 #id
  action: string        // datatable.create / relation.add / ...
  timestamp: string     // ISO 时间戳
  params: unknown       // 请求参数原文
  success: boolean
  summary: string       // 一句话变更摘要
}

interface ExecutionBlueprint {
  version: 1
  userGoal: string
  currentCheckpointId: string | null
  openQuestions: string[]
  checkpoints: BlueprintCheckpoint[]
  lastReflection: string | null
}

interface BlueprintCheckpoint {
  id: string
  phase: 'clarify' | 'plan' | 'schema' | 'view' | 'api' | 'validate' | 'export'
  objective: string
  plannedActions: string[]
  verification: string
  status: 'pending' | 'in-progress' | 'done' | 'blocked'
}
```

**移除：** DataRegistry、ViewRegistry、acceptedProposals、dependencyGraph。

**保留但分离：** UIRegistry（componentIds / functionNames / cssClasses）属于 rule.json 领域，不在 Dataset Memory 范畴。

### 3.3 Blueprint 不是第二事实源

Blueprint 是工作流元数据，不是业务数据源。

- `dataset` 仍然是唯一的数据事实源
- `blueprint` 只描述步骤、检查点、未决问题和验证方式
- blueprint 里不保存权威版 tables/columns/views 定义
- 任何结构化数据结果，最终都必须落到 `dataset`

### 3.4 导出快照降级为输出对象

- 创作过程操作 `IDataSetMetadata`
- `dataset.export` 时输出的 JSON 就是 `IDataSetMetadata` 序列化——这是最终导出快照结构
- `DataSet.fromData(exported)` 可直接恢复运行态

---

## 4. Stills 标准模式

### 4.1 StillDefinition：每个动作的统一形状

```typescript
interface StillDefinition<TParams = unknown, TResult = unknown> {
  /** SAP action 名，如 'datatable.create' */
  action: string

  /** SAP block type */
  type: 'request' | 'describe'

  /** 动作说明，供 AI 查询 */
  description: string

  /** 声明式准入条件 */
  guard: StillGuard

  /** 参数结构说明，供 stills.actionSpec 返回 */
  paramsSchema?: Record<string, unknown>

  /** 返回结构说明，供 stills.actionSpec 返回 */
  resultSchema?: Record<string, unknown>

  /** 最小示例，供 AI 避免拍脑袋拼参数 */
  example?: Record<string, unknown>

  /** 参数校验 —— null 表示通过，字符串表示错误信息 */
  validate: (params: TParams) => string | null

  /** 执行 —— 纯函数，直接读写 ctx.dataset */
  execute: (ctx: StillContext, params: TParams) => StillResult<TResult>
}
```

### 4.2 StillGuard：声明式准入

```typescript
interface StillGuard {
  requireDataset?: boolean          // 默认 true，dataset 必须已 init
  requireBlueprint?: boolean        // true → 必须先有 blueprint
  requireSchemaUnlocked?: boolean   // true → 锁后拒绝
  requireSchemaLocked?: boolean     // true → 未锁拒绝
  allowedSteps?: DesignStep[]       // 空 → 不限步骤
}
```

### 4.3 StillContext 与 StillResult

```typescript
interface StillContext {
  blueprint: ExecutionBlueprint | null
  dataset: IDataSetMetadata | null   // 可读可写
  schemaLocked: boolean
  currentStep: DesignStep
}

type StillResult<T = unknown> =
  | { ok: true; data: T; summary: string }
  | { ok: false; code: string; msg: string; fix: string }
```

### 4.4 Dispatcher：通用，不改

```typescript
function executeStill(session: DesignSessionV2, action: string, params: unknown): StillResult {
  // 1. 查 handler
  const still = getStill(action)
  if (!still) → { ok: false, code: 'UNKNOWN_ACTION', ... }

  // 2. 跑 guard
  const guardErr = checkGuard(still.guard, session)
  if (guardErr) → return guardErr

  // 3. 跑 validate
  const valErr = still.validate(params)
  if (valErr) → { ok: false, code: 'INVALID_PARAMS', ... }

  // 4. execute
  const result = still.execute({ dataset: session.dataset, ... }, params)

  // 5. 记 patchLog（仅成功时）
  if (result.ok) session.patchLog.push({ action, params, success: true, summary: result.summary, ... })

  return result
}
```

### 4.5 注册：按需一行

```typescript
// registry.ts
const stills = new Map<string, StillDefinition>()
export function registerStill(def: StillDefinition): void { stills.set(def.action, def) }
export function getStill(action: string): StillDefinition | undefined { return stills.get(action) }

// 由各 methods 模块批量注册
registerMetaMethods(stills)
registerBlueprintMethods(stills)
registerDatasetMethods(stills)
registerDataTableMethods(stills)
```

### 4.6 扩展成本

新增一个动作 = **补参数类型** + **在对应 methods 文件里加一个定义** + **补一组测试**。Dispatcher / Guard / 协议格式零改动。

### 4.7 少文件原则

不采用“一动作一文件”。

实现按三类收口：

1. **core**：通用运行框架，如 `types.ts`、`dispatcher.ts`、`guards.ts`、`registry.ts`
2. **params**：参数与结果类型，按命名空间集中定义
3. **methods**：按领域集中实现，如 `dataset-methods.ts`、`datatable-methods.ts`

这样新增动作时，只改同一个领域 methods 文件和同一个参数文件，不会把目录炸开。

### 4.8 AI 执行契约：先查、再计划、再执行

为避免 AI 在执行中乱猜，stills 必须配套一组强约束：

1. **先蓝图后写动作**：除 `stills.*`、`session.describe`、`blueprint.*` 之外，所有写动作默认要求 `requireBlueprint: true`
2. **不知道就查**：AI 不确定动作名、参数字段、guard 限制时，必须先调用 `stills.capabilities` 或 `stills.actionSpec`
3. **一次只做一步**：每轮只执行一个写动作；不允许一轮里假设后续动作也会成功
4. **结果驱动**：每次写动作后，必须读取 `@@result/@@error`，再决定是否继续、回退、修订 blueprint 或发问
5. **步骤内自校验**：schema 类动作执行到一个小里程碑后，必须调用 `dataset.validate` 或 `session.describe` 做核对
6. **错误不是噪音**：`@@error` 的 `fix` 字段是下一轮修正输入，AI 不能忽略

### 4.9 AI 基础工具集

为了让 AI 不假设，必须给它一个明确、最小、足够的基础工具集。这里把工具分成 4 组：

#### A. 状态工具

| 工具 | 作用 | AI 什么时候必须用 |
|------|------|-------------------|
| `session.describe` | 看当前 step、锁状态、dataset 摘要、blueprint 摘要、推荐下一步 | 进入新 session；遇到状态错误；不确定当前进度时 |
| `dataset.describe` | 看当前 dataset 的结构摘要 | 写完 schema/view/api 后要核对结果时 |
| `blueprint.describe` | 看当前 checkpoint、未决问题、下一步计划 | 准备继续执行前、执行失败后 |

#### B. 发现工具

| 工具 | 作用 | AI 什么时候必须用 |
|------|------|-------------------|
| `stills.capabilities` | 看当前允许使用的动作目录 | 不确定当前能做什么时 |
| `stills.actionSpec` | 看某动作的参数结构、guard、返回结构、示例 | 第一次使用某动作前；参数报错后 |

#### C. 规划工具

| 工具 | 作用 | AI 什么时候必须用 |
|------|------|-------------------|
| `blueprint.create` | 从需求生成 checkpoints | 需求足够清晰、准备开始执行前 |
| `blueprint.advance` | 推进到下一个 checkpoint | 当前 checkpoint 已完成 |
| `blueprint.revise` | 修改计划、修正路线 | 动作失败、用户补充信息、验证不通过 |

#### D. 执行工具

| 工具组 | 作用 | AI 使用原则 |
|--------|------|-------------|
| `dataset.*` | 生命周期与整体校验 | 用于初始化、验证、导出快照 |
| `datatable.*` | 表、列、API | 一次只做一个最小结构变化 |
| `relation.*` | 表间关系 | 只在 schema 阶段使用 |
| `dataview.*` | 视图与聚合 | 只在 schema 锁定后使用 |
| `dependency.*` | 视图级联依赖 | 只在 view 阶段使用 |
| `schema.*` | 锁定/解锁 | 用于切换阶段，不用于承载业务结构 |

这套工具必须足够清晰，AI 才知道：

- 先看状态
- 再看能力
- 再看动作规格
- 再做计划
- 再做一步执行
- 再读反馈

---

## 5. 动作目录（按需实现）

按 SAP 命名空间组织。不预建全部——哪步要用就实现哪个。

### 5.0 stills / session / blueprint（发现 + 规划）

| 动作 | type | guard | 说明 |
|------|------|-------|------|
| `stills.capabilities` | describe | — | 返回当前可用动作、按步骤/锁状态过滤后的动作目录 |
| `stills.actionSpec` | describe | — | 返回指定动作的 `description` / `guard` / `paramsSchema` / `resultSchema` / `example` |
| `session.describe` | describe | — | 返回当前 `step` / `schemaLocked` / `dataset` 摘要 / `blueprint` 摘要 / 推荐下一步 |
| `blueprint.create` | request | — | 根据用户目标生成执行蓝图与 checkpoints |
| `blueprint.describe` | describe | — | 返回当前蓝图、当前 checkpoint、未决问题 |
| `blueprint.advance` | request | requireBlueprint | 标记当前 checkpoint 完成并推进下一步 |
| `blueprint.revise` | request | requireBlueprint | 根据执行反馈修订 blueprint |

### 5.1 dataset（生命周期）

| 动作 | type | guard | 说明 |
|------|------|-------|------|
| `dataset.init` | request | requireDataset: **false**, requireBlueprint | 创建空 IDataSetMetadata（设 dataSetName） |
| `dataset.describe` | describe | — | 返回全局摘要（表数/列数/关系数/视图数/锁状态/当前步骤） |
| `dataset.validate` | request | — | 全量结构校验，返回 `issues[]` |
| `dataset.export` | request | — | 导出完整 IDataSetMetadata 快照 |
| `dataset.reset` | request | — | 清空重来（需前端二次确认） |

### 5.2 datatable（表 + 列）

| 动作 | type | guard | 说明 |
|------|------|-------|------|
| `datatable.create` | request | requireBlueprint, requireSchemaUnlocked | 添加一张表（tableName + columns） |
| `datatable.describe` | describe | — | 返回指定表详情（列清单/关系/API/视图数） |
| `datatable.addColumns` | request | requireBlueprint, requireSchemaUnlocked | 向已有表追加列（合并，同名列不覆盖） |
| `datatable.updateColumn` | request | requireBlueprint, requireSchemaUnlocked | 修改单列属性（type/label/computeExpression 等） |
| `datatable.removeColumn` | request | requireBlueprint, requireSchemaUnlocked | 删除列（校验关系/视图引用，返回 impact） |
| `datatable.setApi` | request | requireBlueprint, requireSchemaLocked | 设置表的 CrudApi 配置 |
| `datatable.addRows` | request | requireBlueprint | 写入内联静态行（枚举/配置表用） |

### 5.3 relation（表间关系）

| 动作 | type | guard | 说明 |
|------|------|-------|------|
| `relation.add` | request | requireBlueprint, requireSchemaUnlocked | 添加 TableRelation |
| `relation.remove` | request | requireBlueprint, requireSchemaUnlocked | 删除 TableRelation（校验 viewDependency 引用） |
| `relation.list` | describe | — | 列出所有 tableRelations |

### 5.4 dataview（视图 + 聚合）

| 动作 | type | guard | 说明 |
|------|------|-------|------|
| `dataview.create` | request | requireBlueprint, requireSchemaLocked | 为指定表创建命名视图（tableName + viewId） |
| `dataview.describe` | describe | — | 返回指定视图配置详情 |
| `dataview.configure` | request | requireBlueprint, requireSchemaLocked | 设置视图选项（pageSize/autoLoad/autoCurrentFirst 等） |
| `dataview.setAggregates` | request | requireBlueprint, requireSchemaLocked | 设置视图级聚合配置 |
| `dataview.setTreeConfig` | request | requireBlueprint, requireSchemaLocked | 设置树视图配置 |

### 5.5 dependency（视图级联）

| 动作 | type | guard | 说明 |
|------|------|-------|------|
| `dependency.add` | request | requireBlueprint, requireSchemaLocked | 添加 ViewDependency |
| `dependency.remove` | request | requireBlueprint, requireSchemaLocked | 删除 ViewDependency |

### 5.6 schema（工作流控制）

| 动作 | type | guard | 说明 |
|------|------|-------|------|
| `schema.lock` | request | requireBlueprint, requireSchemaUnlocked | A4 锁定——锁后 datatable.*/relation.* 写操作被拒绝 |
| `schema.unlock` | request | requireBlueprint, requireSchemaLocked | 解锁（返回影响范围） |

---

## 6. Guard 矩阵

| 状态 | 允许 | 拒绝（返回 @@error） |
|------|------|---------------------|
| blueprint 未创建 | `stills.capabilities` / `stills.actionSpec` / `session.describe` / `blueprint.create` | 所有 dataset/datatable/relation/dataview/dependency/schema 写动作 |
| dataset 未 init | `dataset.init` / `blueprint.describe` / `blueprint.advance` / `blueprint.revise` / describe 类动作 | 依赖 dataset 实体存在的结构写动作 |
| schema 未锁（A3） | `datatable.*`（写）/ `relation.*` / `dataset.describe` / `dataset.validate` | `dataview.*`（写）/ `dependency.*` / `datatable.setApi` / `dataset.export` |
| schema 已锁（B 阶段） | `dataview.*` / `dependency.*` / `datatable.setApi` / `datatable.describe` / `dataset.describe` / `dataset.validate` / `dataset.export` | `datatable.create` / `datatable.addColumns` / `datatable.removeColumn` / `relation.add` / `relation.remove` |
| 手工回退 | `dataset.reset` / `schema.unlock` / `blueprint.revise` | 必须结合当前锁状态与影响分析 |

AI 跳步 → 收到 `@@error` → 自动修正（SAP 回灌机制已有）。

---

## 7. SAP 协议集成

### 7.1 零协议改动

Stills 使用标准 SAP 块格式，不新增任何协议语法：

```text
@@request:datatable.create#s2
{"tableName":"Orders","columns":[{"name":"id","type":"number","isPrimaryKey":true}]}
@@end
```

```text
@@result:datatable.create#s2
{"status":"ok","tableName":"Orders","columnCount":1}
@@end
```

```text
@@error:datatable.create#s2
{"code":"SCHEMA_LOCKED","msg":"Schema 已锁定","fix":"视图/API 阶段不允许此操作"}
@@end
```

### 7.2 前端路由（action 前缀分流）

前端面板提取 `ToolProtocolBlock` 后，按 action 前缀决定执行路径：

| action 前缀 | 执行路径 |
|------------|---------|
| `stills.*` / `session.*` / `blueprint.*` / `dataset.*` / `datatable.*` / `relation.*` / `dataview.*` / `dependency.*` / `schema.*` | 前端本地 dispatcher（`executeStill`） |
| `file.*` / `db.*` / `system.*` | POST /api/sap/execute（后端） |

### 7.3 与 SapChatPanel / SapAssistantService 的关系

- 前端面板模式：`SapChatPanel` 提取块 → 识别为 dataset stills → 调 `executeStill` → 格式化 `@@result` 回灌 AI
- 后端助手模式：**暂不走这条路**。P6 前端闭环跑通后，P7 再考虑把 handler 移植到 Java `ActionHandler`

---

## 8. 典型流程示例

以"订单管理"为例，完整 16 轮构建过程：

```
Round  1: @@describe:stills.capabilities#s1   → 查询当前可用动作目录
Round  2: @@describe:stills.actionSpec#s2     → 查询 `datatable.create` 参数格式与 guard
Round  3: @@request:blueprint.create#s3       → 基于用户目标生成 blueprint
Round  4: @@request:dataset.init#s4           → 创建 OrderManagement 空 Dataset
Round  5: @@request:datatable.create#s5       → 建 Orders 表（id/customerId/orderDate/status）
Round  6: @@request:datatable.create#s6       → 建 OrderItems 表（id/orderId/productName/price/qty/amount）
Round  7: @@request:relation.add#s7           → Orders→OrderItems 关系
Round  8: @@request:datatable.addColumns#s8   → Orders 加 totalAmount 计算列
Round  9: @@request:dataset.validate#s9       → 校验通过
Round 10: @@request:blueprint.advance#s10     → 标记 schema checkpoint 完成
Round 11: @@request:schema.lock#s11           → 锁定 schema
Round 12: @@request:dataview.configure#s12    → Orders default 视图（autoLoad/pageSize/autoCurrentFirst）
Round 13: @@request:dataview.setAggregates#s13 → Orders default 聚合（totalAmount sum）
Round 14: @@request:dependency.add#s14        → Orders→OrderItems currentRow 级联
Round 15: @@request:datatable.setApi#s15      → Orders API 端点
Round 16: @@request:dataset.export#s16        → 导出完整 IDataSetMetadata
```

每轮一个动作，每轮有 `@@result` 确认。任何一步出错都收到 `@@error`，AI 可自修正或问用户。

---

## 9. 文件结构

按“核心框架 / 参数契约 / 领域方法”三层组织，避免一动作一文件。

```
packages/spark-ai/src/stills/
  ├── types.ts                    # StillDefinition / StillGuard / StillContext / StillResult /
  │                               # DesignSessionV2 / PatchEntry / ExecutionBlueprint
  ├── dispatcher.ts               # executeStill()
  ├── guards.ts                   # checkGuard() + 复用 guard helper
  ├── registry.ts                 # 批量注册各 methods 模块 + getStill()
  ├── params.ts                   # 全部 action 的 params/result 类型定义
  ├── methods/
  │   ├── meta-methods.ts         # stills.capabilities / stills.actionSpec / session.describe
  │   ├── blueprint-methods.ts    # blueprint.create / describe / advance / revise
  │   ├── dataset-methods.ts      # dataset.init / describe / validate / export / reset
  │   ├── datatable-methods.ts    # datatable.create / describe / addColumns / updateColumn /
  │   │                           # removeColumn / setApi / addRows
  │   ├── relation-methods.ts     # relation.add / remove / list
  │   ├── dataview-methods.ts     # dataview.create / describe / configure / setAggregates /
  │   │                           # setTreeConfig
  │   ├── dependency-methods.ts   # dependency.add / remove
  │   └── schema-methods.ts       # schema.lock / unlock
  └── __tests__/
      ├── dataset-stills-core.test.ts
      ├── blueprint-stills.test.ts
      ├── datatable-stills.test.ts
      ├── relation-stills.test.ts
      ├── dataview-stills.test.ts
      └── schema-stills.test.ts
```

约束：

1. `params.ts` 统一收口所有参数和结果类型，避免类型碎片化。
2. `methods/*.ts` 按领域聚合多个动作；一个文件里可以有多个 `StillDefinition`。
3. `registry.ts` 只做批量注册，不写业务逻辑。
4. `__tests__/` 也按领域聚合，不做一动作一测试文件。

这样目录规模稳定，后续新增动作通常只会改 2 个文件：`params.ts` 和对应的 `*-methods.ts`。

---

## 10. 分阶段实施 & 验证

每阶段独立 PR，独立测试，不依赖后续阶段。

### P0：需要 → 蓝图 → 可查询规范

| 实现 | 验证 |
|------|------|
| `params.ts` | 增加 `stills.capabilities` / `stills.actionSpec` / `session.describe` / `blueprint.*` 参数类型 |
| `methods/meta-methods.ts` | capabilities 返回当前动作清单；actionSpec 返回 guard/paramsSchema/resultSchema/example |
| `methods/blueprint-methods.ts` | create 能生成 checkpoints；advance/revise 能推进与修订 |
| `guards.ts` | 对写动作启用 `requireBlueprint` |

闭环标志：AI 在第一次写 Dataset 之前，已经能查询能力、查参数格式、产出 blueprint。

### P1：能建表（最小闭环）

| 实现 | 验证 |
|------|------|
| `types.ts` / `dispatcher.ts` / `guards.ts` / `registry.ts` | — |
| `params.ts` | 覆盖 `dataset.init` / `dataset.describe` / `datatable.create` / `datatable.addColumns` 的参数定义 |
| `methods/dataset-methods.ts` | init / describe 可用，dataset 非 null，摘要正确 |
| `methods/datatable-methods.ts` | 创建 2 张表 → tables 有 2 项；追加列 → 列数增加 |

闭环标志：能从 0 构建出多表多列的 `IDataSetMetadata`。

### P2：能建关系

| 实现 | 验证 |
|------|------|
| `params.ts` | 增加 `relation.add/remove/list`、`dataset.validate` 参数类型 |
| `methods/relation-methods.ts` | 添加关系 → tableRelations 有记录；删除关系 → 清除；list 返回正确 |
| `methods/dataset-methods.ts` | validate 遇到断裂关系 → issues 非空 |

闭环标志：validate 能检出引用不完整的关系。

### P3：工作流控制

| 实现 | 验证 |
|------|------|
| `params.ts` | 增加 `schema.lock/unlock`、`datatable.updateColumn/removeColumn` 参数类型 |
| `methods/schema-methods.ts` | 锁定成功；解锁成功 |
| `methods/datatable-methods.ts` | 锁前可改，锁后拒绝；删列时返回 impact |

闭环标志：lock 后 `datatable.create` 返回 `SCHEMA_LOCKED`。

### P4：视图层

| 实现 | 验证 |
|------|------|
| `params.ts` | 增加 `dataview.*`、`dependency.*` 参数类型 |
| `methods/dataview-methods.ts` | 创建命名视图；设置 pageSize/autoLoad；设置 aggregates |
| `methods/dependency-methods.ts` | 添加/删除级联依赖 |

闭环标志：视图 + 聚合 + 依赖全部在 `IDataSetMetadata` 中可见。

### P5：API 配置 + 完整导出

| 实现 | 验证 |
|------|------|
| `params.ts` | 增加 `datatable.setApi`、`dataset.export` 参数类型 |
| `methods/datatable-methods.ts` | 设置 CrudApi |
| `methods/dataset-methods.ts` | 导出 IDataSetMetadata |
| — | `DataSet.fromData(exported)` 成功实例化 |

闭环标志：export 输出可 round-trip 恢复为运行态 DataSet。

### P6：前端面板集成

| 实现 | 验证 |
|------|------|
| 前端 action 路由分流 | AI 输出 `datatable.create` → 本地执行 → 结果回灌 |
| session 持久化/恢复 | 刷新页面后 dataset 不丢失 |

闭环标志：在前端 stills 宿主中完整跑一遍 16 轮流程。

### P7：后端移植

| 实现 | 验证 |
|------|------|
| Java ActionHandler 注册 | mvn test：同协议文本，返回相同结果 |
| 前端模式可选切换（本地 / 后端） | 两条路径产出相同 Dataset |

闭环标志：后端接管执行，前端无感知。

---

## 11. 与现有系统的关系

### 11.1 取代的概念

| 旧概念 | 处置 | 原因 |
|--------|------|------|
| `DataRegistry` | 移除 | 表/列/关系已在 `IDataSetMetadata.tables` + `tableRelations` 中 |
| `ViewRegistry` | 移除 | 视图信息已在 `ITableMetadata.views` 中 |
| `acceptedProposals` | 降级为 `patchLog` | 每次 still 执行即记录，无需手动 accept |
| `dependencyGraph` | 移除 | 关系在 `tableRelations` + `viewDependencies` 中，validate 动态检查 |
| “AI 自己拍脑袋决定下一步” | 不再允许 | 必须先有 blueprint，并基于 actionSpec/result 迭代 |
| `@@proposal:data-model` | 不再需要 | AI 直接发 `@@request:datatable.create` |
| `@@proposal:view-plan` | 不再需要 | AI 直接发 `@@request:dataview.configure` |
| `applyProposalToSession()` | 不再需要 | dispatcher 直接改 `IDataSetMetadata` |
| `buildSessionContextPrompt()` | 重写 | 从 `dataset` 直接生成摘要注入 AI 上下文 |

### 11.2 保留的概念

| 概念 | 保留原因 |
|------|---------|
| `UIRegistry` | 属于 rule.json 领域，不在 Dataset Memory 范畴 |
| `currentPass` / `currentStep` | 工作流步骤控制仍然需要 |
| `DesignStep`（A1-A4/B1-B6） | 步骤枚举本身不变 |
| SAP 协议格式（`@@request/@@result/@@error`） | 完全复用，零改动 |
| 前端 `SapChatPanel` 协议提取逻辑 | 复用，只加 action 前缀路由 |

### 11.3 设计步骤映射

| 步骤 | AI 发什么 |
|------|----------|
| A1 需求澄清 | 纯对话（`@@clarify`） |
| A2 架构评估 | `@@compare` + `stills.capabilities` + `stills.actionSpec` + `blueprint.create` |
| A3 数据建模 | `dataset.init` → N 次 `datatable.create` / `datatable.addColumns` / `relation.add` → `blueprint.advance` |
| A4 锁 schema | `schema.lock` |
| B1 视图规划 | N 次 `dataview.create` / `dataview.configure` / `dependency.add` → `blueprint.advance` |
| B2 UI 设计 | rule.json 生成（不在 stills 范畴） |
| B3 交互 | script.js 生成（不在 stills 范畴） |
| B4 API 配置 | N 次 `datatable.setApi` → `blueprint.advance` |
| B5 样式 | style.css 生成（不在 stills 范畴） |
| B6 校验 | `dataset.validate` → 通过后 `dataset.export` |

---

## 12. 设计约束

1. **每个 Still 是纯函数**：`(ctx, params) → StillResult`，无副作用，无网络调用，可直接 vitest 测试。
2. **按需扩展**：不预建全部动作；需要哪个动作，就在 `params.ts` 和对应 `*-methods.ts` 中补上。
3. **前端先行**：P1-P5 全部在 `packages/spark-ai/src/stills/` 中实现和测试，不涉及后端。
4. **Merge 语义**：`datatable.addColumns` / `dataview.configure` 等写操作是增量合并，不是全量替换。
5. **Guard 硬拒绝**：状态不满足就返回 `@@error`，AI 通过 SAP 回灌机制自修正。
6. **先计划再执行**：所有写动作默认要求 blueprint 已存在，禁止 AI 直接裸写 Dataset。
7. **不知道就查**：动作名、参数格式、返回结构、guard 限制都必须可通过 `stills.capabilities` / `stills.actionSpec` 查询。
8. **validate 不阻塞**：返回 `issues[]`，AI 自行决定是否修正。
9. **export 纯导出**：不改 session 状态，可反复执行。
10. **IDataSetMetadata 直接复用**：不包装、不派生、不发明第二套模型。
