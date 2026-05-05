# DM: LLM 协作编辑 — DevSystem 内人机协作修改 rule.json / pagedata.json / script.js / style.css

> **状态**：Phase 0 审计完成（v3.1）  
> **日期**：2026-04-08  
> **范围**：spark-ai / spark-component / spark-data / DevSystem
> **竣工**：Phase 0 完成 8/10（T7 提示词 + T8 编排器 + T9 测试待实现），详见 §11
>
> **v3 变更摘要**（源码验证后修正）：
> - 修正动作计数：sparkNodeTree 16→17、datasetTool 28+→31、总计 44→55
> - 修正 §7.1 错误脚注（catalog 实际有 17 个，非 16）
> - 要求 SparkNodeTree 和 DataSetCrudTool 暴露 `historyCursor` 公共 getter（T1b/T1）
> - 明确 SnapshotHistory\<T\> 存裸值：SparkNode / IDataSetMetadata
> - 明确 edit.bootstrap 由前端编排层调用（非 LLM），调用后 4 个文件进入同一 edit session
> - 简化 EditTransaction checkpoint：基于 EditDomainState 直接记录 4 文件会话状态
> - 增加 §5.8 单会话状态模型说明（不再使用 guard/Phase 解锁）
> - 切换模式须同时调用 clearRegistry() + clearDomains()
> - 新增 3 个风险：script/style 编辑器锁定、undoTransaction 部分失败、SnapshotHistory 类型适配

---

## 1. 一句话目标

在 DevSystem 中，人类通过 JsonTreeEditor/CodeEditor 编辑页面配置文件，同时可通过自然语言指令驱动 LLM 对同一组文件做增量修改，两者实时协作、共享历史、统一 Undo。

---

## 2. 决策记录

| # | 问题 | 决策 | 理由 |
|---|------|------|------|
| Q1 | 操作接口 | **B — 注册两个 catalog 为新 stills，与现有 stills 并行** | 现有 stills 面向"从零生成"，catalog 面向"增量编辑"；两者 session 类型不同，可共存 |
| Q2 | 状态真相源 | **C — SparkNodeTree / DataSetCrudTool 实例为 SSoT** | 实例自带 history/undo，编辑器绑定实例状态，human/LLM 编辑统一通过实例方法 |
| Q3 | 同步方向 | **C+F — 请求-响应轮次 + 每轮自动注入 editor 当前状态** | 避免实时同步复杂度；LLM 每轮开始时获得最新状态 |
| Q4 | Blueprint | **A+C — 阈值策略：简单操作跳过，复杂操作走 blueprint** | 加列/改 prop ≤3 action 无需规划；重构表结构需要蓝图 |
| Q5 | 数据加载 | **B+F — 按需查询 + 渐进上下文** | 首轮注入结构摘要，LLM 通过 describe 按需获取详情 |
| Q6 | 历史 | **A — 统一用 SparkNodeTree / DataSet history** | 两个类都有快照/undo，human 和 LLM 操作一视同仁 |
| Q7 | 能力范围 | **A — 55 个操作全部开放**（17 nodeTree + 31 dataset + 4 file + 3 edit） | LLM 可自由决策；guard 机制已提供安全保障 |
| Q8 | UI 入口 | **A/C — 复用 DevAiPanel 或独立面板** | Phase 1 在 DevAiPanel 中增加"编辑模式"；后续可独立 |
| Q9 | 错误 UX | **F — AI 自我修正过程对用户可见** | 透明展示 Stills 交互流，用户可中断 |
| Q10 | 分期 | **C — pagedata 先行** | DataSet 是数据基础；rule 依赖 DataSet 表/列定义 |
| 补充 | script.js / style.css | **文件级修改** | LLM 读取当前内容 → 整体修改 → 写回全文，不做增量 stills |
| 评审 | multi-block/turn | **保持 single-block/turn** | batch 需求由 `addNodes` / `setPropsBatch` / `createTable(columns[])` 覆盖；跨域 multi-block 有依赖风险（block#1 失败 → block#2 基于错误状态） |
| 评审 | escape hatch | **不设 escape hatch** | delete+create 组合等效替代整体替换；开口子会导致 LLM 走捷径绕过增量校验 |
| 评审 | DataSet undo/redo | **SnapshotHistory\\<T\\> 统一组件（spark-utils）** | SparkNodeTree 和 DataSetCrudTool 共用 `SnapshotHistory<T>`；SparkNodeTree 重构现有 `_history[]` + `_cursor`，DataSetCrudTool 从零使用；事务级 undo 由 EditTransaction 实现 |

---

## 3. 四种文件的编辑粒度

| 文件 | 编辑粒度 | SSoT | 操作方式 |
|------|---------|------|---------|
| **rule.json** | 节点级增量 | SparkNodeTree 实例 | 17 个 `sparkNodeTree.*` stills（8 describe + 9 request） |
| **pagedata.json** | 表/列/视图/行级增量 | DataSetCrudTool 实例 | 31 个 `datasetTool.*` stills（12 describe + 19 request） |
| **script.js** | 文件级 | 编辑器文本 | `file.readScript` / `file.writeScript` |
| **style.css** | 文件级 | 编辑器文本 | `file.readStyle` / `file.writeStyle` |

---

## 4. 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                     DevSystem UI                             │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────┐  │
│  │ JsonTreeEditor│  │ SparkCodeEditor│  │   DevAiPanel     │  │
│  │ (rule/pdata) │  │ (script/style)│  │ (编辑模式)        │  │
│  └──────┬───────┘  └───────┬───────┘  └────────┬─────────┘  │
│         │                  │                    │             │
│         │     ┌────────────┴────────────┐       │             │
│  human  │     │    Editor State Sync     │       │ LLM        │
│  edits  │     │  (绑定到 SSoT 实例)      │       │ 指令       │
│         │     └────────────┬────────────┘       │             │
└─────────┼──────────────────┼────────────────────┼─────────────┘
          ▼                  ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                  Editing Session Layer                        │
│                                                              │
│  ┌──────────────────┐    ┌──────────────────┐                │
│  │  SparkNodeTree    │    │  DataSetCrudTool  │                │
│  │  (rule SSoT)      │    │  (pagedata SSoT)  │                │
│  │  + undo/redo      │    │  + snapshot/undo   │                │
│  └──────────────────┘    └──────────────────┘                │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │              Edit-mode Stills Session                  │    │
│  │  domains: { nodeTree, datasetEdit, file }             │    │
│  │  catalog: StillsCatalog (component types)                │    │
│  │  patchLog: human/LLM 操作审计流                        │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    Function Calling
                    tool_call / tool_result
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│               Session Orchestrator                            │
│  runEditLoop(userPrompt, session, backend, config)            │
│  - 每轮自动注入: 结构摘要 + editor 当前状态差异              │
│  - single-block / 轮（batch 用 addNodes/setPropsBatch）       │
│  - 阈值判断: ≤3 actions 跳过 blueprint                       │
└──────────────────────────────────────────────────────────────┘
```

---

## 5. 核心变更清单

### 5.1 DataSetCrudTool 改造（spark-data）

**问题**：当前构造函数只接受 `dataSetName`，创建空 DataSet，不支持加载已有 DataSet。

**变更**：

```typescript
// 新增静态工厂
static fromDataSet(dataSet: DataSet): DataSetCrudTool
static fromJson(json: IDataSetMetadata): DataSetCrudTool

// 构造函数改为 internal，受工厂方法调用
// dataSet 属性去掉 readonly 或通过内部赋值解决
```

**快照/Undo 实现（方案 A：统一 SnapshotHistory\<T\>）**：

DataSet 的 `commitSnapshot` / `restoreSnapshot` 走外部 `StorageAdapter`（localStorage），没有 redo 概念，不适合编辑器场景。

SparkNodeTree 和 DataSetCrudTool 的 undo/redo 逻辑完全同构（`T[]` + `cursor` + `limit`），因此提取通用组件 `SnapshotHistory<T>`（放 `spark-utils`，纯 TS，零框架依赖）：

```typescript
// packages/spark-utils/src/snapshot-history.ts
class SnapshotHistory<T> {
  constructor(private readonly _limit = 50)

  push(snapshot: T): void      // 截断 cursor 之后 → append → 限幅
  undo(): T | null             // cursor-- → 返回快照
  redo(): T | null             // cursor++ → 返回快照
  get canUndo(): boolean
  get canRedo(): boolean
  get current(): T | null
  get cursor(): number         // 暴露给 EditTransaction 记录
  clear(): void
}
```

**两个消费方**：
- SparkNodeTree：`private _history = new SnapshotHistory<SparkNode>(50)`（重构现有 `_history[]` + `_cursor`；SnapshotHistory 只存裸 root 节点，原有 `SparkNodeTreeSnapshot` 的 version/timestamp/label 元数据降级为可选诊断信息由 SparkNodeTree 自行管理）
- DataSetCrudTool：`private _history = new SnapshotHistory<IDataSetMetadata>(50)`（新增，每次写操作前自动 `push(this.toJson())`）

```typescript
// DataSetCrudTool 公开 API（委托 SnapshotHistory）
undo(): boolean           // history.undo() → 从快照重建 DataSet
redo(): boolean           // history.redo() → 从快照重建 DataSet
get canUndo(): boolean
get canRedo(): boolean
```

> **为什么不用 DataSet.StorageAdapter**：StorageAdapter 面向持久化（localStorage），单向追加，无 cursor/redo；编辑器需要轻量内存快照 + 双向导航。

### 5.2 新增 Edit-mode Domain（spark-ai）

新建 `packages/spark-ai/src/stills/edit-domain.ts`：

**三个子域**：

| 子域 | 状态持有 | 动作前缀 |
|------|---------|---------|
| **nodeTree** | SparkNodeTree 实例 | `sparkNodeTree.*`（16 个，来自 catalog） |
| **datasetEdit** | DataSetCrudTool 实例 | `datasetTool.*`（28+ 个，来自 catalog） |
| **file** | `{ script: string, style: string }` | `file.readScript` / `file.writeScript` / `file.readStyle` / `file.writeStyle` |

**域状态**：

```typescript
interface EditDomainState {
  nodeTree: SparkNodeTree | null      // rule.json SSoT
  datasetEdit: DataSetCrudTool | null // pagedata.json SSoT
  script: string                      // script.js 当前内容
  style: string                       // style.css 当前内容
  phase: 'idle' | 'editing' | 'saved'
}
```

**初始化动作** `edit.bootstrap`：

```typescript
// 接收 DevSystem 当前 4 个文件的内容，构建编辑会话
{
  action: 'edit.bootstrap',
  params: {
    ruleJson: SparkNode[],            // 解析后的规则数组
    pageDataJson: IDataSetMetadata,   // 解析后的 DataSet 元数据
    scriptJs: string,                 // 原始文本
    styleCss: string,                 // 原始文本
  }
}
```

执行：
1. `new SparkNodeTree({ root: { type: 'page', children: ruleJson } })`
2. `DataSetCrudTool.fromJson(pageDataJson)`（或 `fromDataSet`）
3. 存储 script/style 文本
4. phase → `'editing'`

### 5.3 Catalog → Still 注册桥（spark-ai）

两个 catalog 文件当前是 `integrationStatus: 'catalog-only'` 的规格定义。需要**生成**对应的 StillDefinition 数组。

**桥接策略**：catalog 的每个 `CapabilityRow` → 一个 `StillDefinition`，execute 委托到 SparkNodeTree / DataSetCrudTool 实例方法。

```typescript
// packages/spark-ai/src/business/page-design/stills/edit/actions/edit-domain.ts（EDIT_NODE_TREE_STILLS）

function createNodeTreeStills(): StillDefinition[] {
  return [
    {
      action: 'sparkNodeTree.addNode',
      type: 'request',
      description: '向组件树添加节点',
      paramsSchema: { /* from catalog */ },
      example: { /* from catalog */ },
      validate: (params) => { /* from catalog validation rules */ },
      execute: (session, params) => {
        const tree = getEditState(session).nodeTree
        if (!tree) {
          return { ok: false, code: 'NO_NODE_TREE', msg: 'nodeTree 未初始化', fix: '请先执行 edit.bootstrap' }
        }
        const result = tree.addNode(params)
        return { ok: true, data: result, summary: `添加 ${params.node.type}` }
      },
    },
    // ... 15 more
  ]
}
```

```typescript
// packages/spark-ai/src/business/page-design/stills/edit/actions/edit-domain.ts（EDIT_DATASET_STILLS）
// 同理：catalog row → StillDefinition, execute 委托 DataSetCrudTool
```

**file 域 stills**（4 个）：

```typescript
const fileStills: StillDefinition[] = [
  {
    action: 'file.readScript',
    type: 'describe',
    execute: (session) => {
      return { ok: true, data: { content: getEditState(session).script } }
    }
  },
  {
    action: 'file.writeScript',
    type: 'request',
    validate: (params) => typeof params.content === 'string' ? null : '缺少 content',
    execute: (session, params) => {
      getEditState(session).script = params.content
      return { ok: true, data: undefined, summary: 'script.js 已更新' }
    }
  },
  // file.readStyle, file.writeStyle 同理
]
```

### 5.4 Edit Orchestrator（spark-ai）

新建 `packages/spark-ai/src/runtime/edit-orchestrator.ts`：

```typescript
interface EditOrchestrator {
  /**
   * 执行一轮编辑交互。
   *
   * @param userPrompt  用户自然语言指令（如"在用户表中加一列 email"）
  * @param session     编辑会话（已 edit.bootstrap）
   * @param backend     LLM 后端
   * @param config      编辑配置
   */
  runEditLoop(
    userPrompt: string,
    session: IStillSession,
    backend: SessionBackend,
    config: EditLoopConfig,
  ): AsyncGenerator<EditLoopEvent>
}

interface EditLoopConfig {
  /** 最大轮次 */
  maxRounds: number                // 默认 10
  /** 简单操作阈值（≤ 此数跳过 blueprint） */
  simpleModeThreshold: number      // 默认 3
  /** 是否自动注入摘要 */
  autoInjectSummary: boolean       // 默认 true
}

type EditLoopEvent =
  | { type: 'round-start'; round: number }
  | { type: 'llm-reply'; text: string; reasoning?: string }
  | { type: 'tool-dispatch'; action: string; params: unknown }
  | { type: 'tool-result'; action: string; result: StillResult }
  | { type: 'tool-error'; action: string; error: StillResult }
  | { type: 'round-end'; round: number }
  | { type: 'done'; summary: string }
  | { type: 'aborted'; reason: string }
```

**每轮自动注入**（Q3-F 决策）：

```typescript
function buildEditContextMessage(session: IStillSession): string {
  const state = getEditState(session)
  const parts: string[] = []

  // 1. DataSet 结构摘要
  if (state.datasetEdit) {
    const ds = state.datasetEdit.dataSet
    parts.push(`## 当前 DataSet: ${ds.dataSetName}`)
    for (const table of Object.values(ds.tables)) {
      parts.push(`- 表 ${table.tableName}: ${table.columns.map(c => c.name).join(', ')}`)
    }
  }

  // 2. SparkNodeTree 结构摘要
  if (state.nodeTree) {
    parts.push(`## 当前组件树节点数: ${state.nodeTree.countNodes()}`)
    parts.push(`DataKeys: ${[...state.nodeTree.collectDataKeys()].join(', ')}`)
    parts.push(`Handlers: ${[...state.nodeTree.collectHandlerNames()].join(', ')}`)
  }

  // 3. script/style 存在标记
  if (state.script.length > 0) parts.push(`## script.js: ${state.script.length} chars`)
  if (state.style.length > 0) parts.push(`## style.css: ${state.style.length} chars`)

  return parts.join('\n')
}
```

### 5.5 Edit-mode 注册（spark-ai）

在 `stills/index.ts` 中新增：

```typescript
import { editDomain } from './edit-domain'

export function registerEditStills(): void {
  registerDomain(editDomain)
}

// 注意：与 registerAllStills() 分开调用
// 生成模式用 registerAllStills()
// 编辑模式用 registerEditStills()
// 两者不要同时注册（action 名冲突）
// 切换模式时必须同时清理两个注册表：
//   clearRegistry()   — 清空 action → StillDefinition 映射
//   clearDomains()    — 清空 domain → DomainProvider 映射
```

### 5.6 DevSystem UI 集成

**DevAiPanel.vue 改造**：

```
现有模式（保留）：
  [生成模式] pageId + prompt → 全新页面

新增模式：
  [编辑模式] 自然语言指令 → 增量修改当前文件
```

**状态流**：

```
1. 用户选择已有 page → DevSystem 加载 4 个文件
2. 用户点击"AI 编辑"或在编辑模式下输入指令
3. 前端构建 edit session:
   a. clearRegistry() + clearDomains() + registerEditStills()
   b. createSession() → session
  c. **前端（非 LLM）** 直接执行 edit.bootstrap（灌入当前 4 个文件内容）
    — 注：edit.bootstrap 由前端编排层调用，经 executeStill 进入 session，但不经 LLM 工具循环
4. 启动 runEditLoop(userPrompt, session, backend)
5. 事件流 → UI 展示 Stills 交互过程（F 决策）
6. 循环结束 → 从 session 提取最新状态:
   a. state.nodeTree.root → rule.json editor
   b. state.datasetEdit.toJson() → pagedata.json editor
   c. state.script → script.js editor
   d. state.style → style.css editor
7. 编辑器刷新显示 → 用户审阅
8. 用户可 Ctrl+Z 撤销（事务级：走 EditTransaction.undoTransaction，整体回滚一轮 LLM 编辑）
```

### 5.7 Edit-mode System Prompt（spark-ai）

新建 `packages/spark-ai/src/prompts/edit-prompts.ts`：

```typescript
export const EDIT_MODE_PROMPT = `\
你在协助用户编辑一个已有的 SPARK 页面配置。

══ 可用操作域 ══

1. sparkNodeTree.* — 修改 rule.json（组件树）
   查询：getNode, getLocation, hasNode, getParent, listChildren, countNodes, collectDataKeys, collectHandlerNames
   变更：addNode, addNodes, setProps, setPropsBatch, replaceNode, replaceNodes, removeNode, removeNodes, reorderChildren

2. datasetTool.* — 修改 pagedata.json（DataSet）
   结构：listTables, getTable, createTable, updateTable, deleteTable
   列：listColumns, getColumn, createColumn, updateColumn, deleteColumn
   视图：listViews, getView, createView, updateView, deleteView
   行：listRows, getRow, createRow, updateRow, deleteRow
   关系：listRelations, getRelation, createRelation, updateRelation, deleteRelation
   依赖：listDependencies, getDependency, createDependency, updateDependency, deleteDependency
   工具：export

3. file.readScript / file.writeScript — 读/写 script.js（文件级）
4. file.readStyle / file.writeStyle — 读/写 style.css（文件级）

══ 编辑纪律 ══

1. 先查询再修改：使用 describe 类动作了解当前结构，再做变更
2. 最小变更原则：只修改用户要求的部分，不动其他内容
3. script.js / style.css 是文件级：读取全文 → 修改 → 写回全文
4. rule.json / pagedata.json 是增量级：通过具体操作修改，不要整体替换
5. 一轮最多一个协议块（批量用 addNodes / setPropsBatch / createTable+columns）
6. tool error 的 fix 字段是必读输入，修正后重试

══ 上下文 ══

每轮开始时，系统会注入当前结构摘要。你可以通过 describe 类动作获取更多详情。
`
```

### 5.8 Edit 单会话状态模型

当前实现不再使用 editGuard 分层策略，也不再做 Phase 1 / Phase 2 解锁。宿主进入编辑模式时，通过 `edit.bootstrap` 一次性把 4 个文件装入同一个 edit session；后续 still 直接读取该 session 的局部状态。

| 会话字段 | 对应文件 | 主要消费者 |
|---------|---------|-----------|
| `state.nodeTree` | `rule.json` | `sparkNodeTree.*`、`edit.exportFiles`、`edit.changedLines` |
| `state.datasetEdit` | `pagedata.json` | `datasetTool.*`、`dataset.export`、`dataset.changedLines`、`edit.exportFiles` |
| `state.script` | `script.js` | `file.readScript` / `file.writeScript`、`edit.exportFiles` |
| `state.style` | `style.css` | `file.readStyle` / `file.writeStyle`、`edit.exportFiles` |

约束下沉到各 still 的 `execute()`：

- 缺少 `nodeTree` 时，由相关 still 返回 `NO_NODE_TREE`
- 缺少 `datasetEdit` 时，由相关 still 返回 `NO_DATASET_EDIT`
- `script.js` / `style.css` 采用整文件覆盖，不再依赖额外阶段 guard

宿主负责 reset / re-bootstrap，会话重入靠覆盖当前 session 状态完成，不再依赖 guard 链路做解锁。

---

## 6. 分期计划

### Phase 0: 基础设施（M1）

**目标**：Edit-mode 会话可创建、可执行 stills、可在测试中跑通端到端。

| 任务 | 包 | 文件 | 说明 |
|------|---|------|------|
| T0 | spark-utils | `snapshot-history.ts` | 提取 `SnapshotHistory<T>` 通用组件（push/undo/redo/cursor） |
| T1 | spark-data | `dataset-crud-tool.ts` | 新增 `fromDataSet()` / `fromJson()` 工厂 + 使用 `SnapshotHistory<IDataSetMetadata>` 实现 undo/redo |
| T1b | spark-component | `spark-node-tree.ts` | 重构现有 `_history[]` + `_cursor` 为 `SnapshotHistory<SparkNode>(50)`（行为不变）；新增 `get historyCursor(): number`（委托 `_history.cursor`，供 EditTransaction 使用） |
| T2 | spark-ai | `stills/edit-domain.ts` | 编辑域定义（state + createState） |
| T3 | spark-ai | `stills/edit/actions/edit-domain.ts` | 17 个 sparkNodeTree.* stills（`EDIT_NODE_TREE_STILLS`，catalog → StillDefinition） |
| T4 | spark-ai | `stills/edit/actions/edit-domain.ts` | 31 个 datasetTool.* stills（`EDIT_DATASET_STILLS`，catalog → StillDefinition） |
| T5 | spark-ai | `stills/text-model/text-model-stills.ts` | 4 个 file.* stills（`EDIT_FILE_STILLS`） |
| T6 | spark-ai | `stills/index.ts` | `registerEditStills()` 导出 |
| T7 | spark-ai | `prompts/edit-prompts.ts` | 编辑模式系统提示词 |
| T8 | spark-ai | `runtime/edit-orchestrator.ts` | 编辑循环（runEditLoop）+ `EditTransaction[]` 事务标记表 + `undoTransaction` |
| T9 | tests | `edit-domain.test.ts` | 编辑域单元测试（含 SnapshotHistory + EditTransaction） |

### Phase 1: pagedata 通路（M2）

**目标**：DevSystem 中可通过自然语言指令修改 pagedata.json（仅 DataSet 域）。

| 任务 | 包 | 说明 |
|------|---|------|
| T10 | DevSystem | DevAiPanel 增加"编辑模式" toggle |
| T11 | DevSystem | useDevEditSession composable（管理 edit session 生命周期） |
| T12 | DevSystem | Stills 交互日志面板（展示 tool call / tool result / tool error 流） |
| T13 | DevSystem | 编辑完成 → 回写 pagedata.json editor |
| T14 | e2e test | "在订单表加一列 total" 端到端验证 |

### Phase 2: rule + script + style 通路（M3）

**目标**：剩余 3 种文件一次性接入，4 种文件全部可通过 LLM 协作编辑。

| 任务 | 包 | 说明 |
|------|---|------|
| T15 | 集成 | sparkNodeTree.* stills 接入 edit session |
| T16 | 集成 | file.readScript/writeScript + file.readStyle/writeStyle 接入 |
| T17 | DevSystem | 编辑完成 → 回写 rule.json + script.js + style.css editor |
| T18 | 集成 | 阈值策略（≤3 actions 跳过 blueprint） |
| T19 | e2e test | "在表格加一个按钮列并加事件处理函数" 端到端验证（跨 rule + script） |

### Phase 3: Polish（M4）

| 任务 | 说明 |
|------|------|
| T20 | Undo 集成：Ctrl+Z 走 `undoTransaction`（事务级，跨工具整体回滚） |
| T21 | 保存同步：编辑模式结果 → PUT /api/pages-config/{pageId}/{filename} |
| T22 | 错误 UX polish：重试动画、可中断、超时处理 |

> **事务级 undo 说明**：LLM 一轮指令可能跨多个工具（如 datasetTool.createColumn + sparkNodeTree.addNode），`EditTransaction` 记录指令前各工具的 cursor 值和 file 原文，Ctrl+Z 时按事务整体回滚而非单工具 undo。详见 §9.4。

---

## 7. 新动作完整清单

### 7.1 sparkNodeTree.*（17 个，来自 catalog）

| 动作 | 类型 | 委托方法 |
|------|------|---------|
| `sparkNodeTree.getNode` | describe | `tree.getNode()` |
| `sparkNodeTree.getLocation` | describe | `tree.getLocation()` |
| `sparkNodeTree.hasNode` | describe | `tree.hasNode()` |
| `sparkNodeTree.getParent` | describe | `tree.getParent()` |
| `sparkNodeTree.listChildren` | describe | `tree.listChildren()` |
| `sparkNodeTree.countNodes` | describe | `tree.countNodes()` |
| `sparkNodeTree.collectDataKeys` | describe | `tree.collectDataKeys()` |
| `sparkNodeTree.collectHandlerNames` | describe | `tree.collectHandlerNames()` |
| `sparkNodeTree.addNode` | request | `tree.addNode()` |
| `sparkNodeTree.addNodes` | request | `tree.addNodes()` |
| `sparkNodeTree.setProps` | request | `tree.setProps()` |
| `sparkNodeTree.setPropsBatch` | request | `tree.setPropsBatch()` |
| `sparkNodeTree.replaceNode` | request | `tree.replaceNode()` |
| `sparkNodeTree.replaceNodes` | request | `tree.replaceNodes()` |
| `sparkNodeTree.removeNode` | request | `tree.removeNode()` |
| `sparkNodeTree.removeNodes` | request | `tree.removeNodes()` |
| `sparkNodeTree.reorderChildren` | request | `tree.reorderChildren()` |

8 describe + 9 request = 17 个，与 `stills/node-tree/tool-catalog.ts` 一一对应。

### 7.2 datasetTool.*（31 个，来自 catalog）

| 动作 | 类型 | 委托方法 |
|------|------|---------|
| `datasetTool.export` | describe | `tool.toJson()` |
| `datasetTool.listTables` | describe | `tool.listTables()` |
| `datasetTool.getTable` | describe | `tool.getTable()` |
| `datasetTool.createTable` | request | `tool.createTable()` |
| `datasetTool.updateTable` | request | `tool.updateTable()` |
| `datasetTool.deleteTable` | request | `tool.deleteTable()` |
| `datasetTool.listColumns` | describe | `tool.listColumns()` |
| `datasetTool.getColumn` | describe | `tool.getColumn()` |
| `datasetTool.createColumn` | request | `tool.createColumn()` |
| `datasetTool.updateColumn` | request | `tool.updateColumn()` |
| `datasetTool.deleteColumn` | request | `tool.deleteColumn()` |
| `datasetTool.listViews` | describe | `tool.listViews()` |
| `datasetTool.getView` | describe | `tool.getView()` |
| `datasetTool.createView` | request | `tool.createView()` |
| `datasetTool.updateView` | request | `tool.updateView()` |
| `datasetTool.deleteView` | request | `tool.deleteView()` |
| `datasetTool.listRows` | describe | `tool.listRows()` |
| `datasetTool.getRow` | describe | `tool.getRow()` |
| `datasetTool.createRow` | request | `tool.createRow()` |
| `datasetTool.updateRow` | request | `tool.updateRow()` |
| `datasetTool.deleteRow` | request | `tool.deleteRow()` |
| `datasetTool.listRelations` | describe | `tool.listRelations()` |
| `datasetTool.getRelation` | describe | `tool.getRelation()` |
| `datasetTool.createRelation` | request | `tool.createRelation()` |
| `datasetTool.updateRelation` | request | `tool.updateRelation()` |
| `datasetTool.deleteRelation` | request | `tool.deleteRelation()` |
| `datasetTool.listDependencies` | describe | `tool.listDependencies()` |
| `datasetTool.getDependency` | describe | `tool.getDependency()` |
| `datasetTool.createDependency` | request | `tool.createDependency()` |
| `datasetTool.updateDependency` | request | `tool.updateDependency()` |
| `datasetTool.deleteDependency` | request | `tool.deleteDependency()` |

### 7.3 file.*（4 个，新增）

| 动作 | 类型 | 说明 |
|------|------|------|
| `file.readScript` | describe | 返回 script.js 当前内容 |
| `file.writeScript` | request | 写入 script.js 全文 |
| `file.readStyle` | describe | 返回 style.css 当前内容 |
| `file.writeStyle` | request | 写入 style.css 全文 |

### 7.4 edit.*（3 个，新增）

| 动作 | 类型 | 说明 |
|------|------|------|
| `edit.bootstrap` | request | 初始化编辑会话（灌入 4 个文件） |
| `edit.changedLines` | describe | 统计 4 个文件相对 bootstrap 基线的变更行数 |
| `edit.exportFiles` | request | 导出 4 个文件的当前内容及变更统计 |

> **评审决策**：不设 escape hatch（`edit.replaceRule` / `edit.replacePagedata`）。"重构" 用 `deleteTable` + `createTable` 或 `removeNodes` + `addNodes` 组合实现，每步走校验。

---

## 8. 与现有 stills 的关系

| 维度 | 生成模式 stills | 编辑模式 stills |
|------|----------------|----------------|
| 注册函数 | `registerAllStills()` | `registerEditStills()` |
| session 创建 | `createSession()` + blueprint | `createSession()` + edit.bootstrap |
| 使用场景 | 旧页面生成链（已删除） | 协作编辑 |
| action 命名空间 | `dataset.*` / `datatable.*` / `rule.*` / `script.*` / `style.*` | `datasetTool.*` / `sparkNodeTree.*` / `file.*` / `edit.*` |
| 状态管理 | 会话内存 → export 文件 | SSoT 实例 → 回写 editor |
| undo | 无内置 undo | SparkNodeTree/DataSet history |

**互斥注册**：同一时刻全局 registry 只注册一套（避免 `rule.addComponent` vs `sparkNodeTree.addNode` 歧义）。DevSystem 根据用户选择的模式决定注册哪套。

---

## 9. 关键接口变更

### 9.1 DataSetCrudTool 新工厂（spark-data）

```typescript
class DataSetCrudTool {
  // 新增：从已有 DataSet 创建
  static fromDataSet(dataSet: DataSet): DataSetCrudTool

  // 新增：从 JSON 元数据创建
  static fromJson(json: IDataSetMetadata): DataSetCrudTool

  // 新增：undo/redo（委托 SnapshotHistory<IDataSetMetadata>，不依赖 DataSet StorageAdapter）
  undo(): boolean
  redo(): boolean
  get canUndo(): boolean
  get canRedo(): boolean
  get historyCursor(): number      // 暴露给 EditTransaction 记录（委托 _history.cursor）
}
```

### 9.2 Edit Domain State（spark-ai）

```typescript
interface EditDomainState extends DomainState<null, EditPhase> {
  nodeTree: SparkNodeTree | null
  datasetEdit: DataSetCrudTool | null
  script: string
  style: string
  baselineSnapshot: EditModelSnapshot | null
}

type EditPhase = 'idle' | 'editing' | 'saved'
```

### 9.3 DevSystem Composable

```typescript
// src/views/app/dev-system/composables/useDevEditSession.ts

interface UseDevEditSessionReturn {
  /** 是否处于编辑模式 */
  isEditMode: Ref<boolean>
  /** 当前编辑会话 */
  session: Ref<IStillSession | null>
  /** Stills 交互事件流 */
  events: Ref<EditLoopEvent[]>
  /** 启动编辑会话 */
  startEditSession(): Promise<void>
  /** 发送编辑指令 */
  sendEditCommand(prompt: string): AsyncGenerator<EditLoopEvent>
  /** 将 session 状态回写到 editor */
  syncToEditors(): void
  /** 撤销最近一轮 AI 编辑（事务级，跨工具整体回滚） */
  undoLastAiEdit(): void
  /** 结束编辑会话 */
  endEditSession(): void
}
```

### 9.4 EditTransaction（事务级 Undo）

LLM 一次用户指令可能跨多个 turn 修改多个工具，Ctrl+Z 需要整体回滚。
Edit Orchestrator 内部维护 `EditTransaction[]` 数组：

```typescript
interface EditTransaction {
  id: string                         // 用户指令 ID
  prompt: string                     // 原始指令
  checkpoints: {
    nodeTreeCursor: number | null     // 指令前的 SparkNodeTree historyCursor
    datasetCursor: number | null      // 指令前的 DataSetCrudTool historyCursor
    scriptBefore: string              // 指令前的 script 文本
    styleBefore: string               // 指令前的 style 文本
  }
}

// 每次用户发指令前记录（edit.bootstrap 之后 nodeTree / datasetEdit 已装入会话）
function createCheckpoint(state: EditDomainState): EditTransaction['checkpoints'] {
  if (!state.nodeTree || !state.datasetEdit) {
    throw new Error('edit session 未完成 bootstrap')
  }
  return {
    nodeTreeCursor: state.nodeTree.historyCursor,
    datasetCursor: state.datasetEdit.historyCursor,
    scriptBefore: state.script,
    styleBefore: state.style,
  }
}

// Ctrl+Z 时回滚到事务前状态
function undoTransaction(state: EditDomainState, tx: EditTransaction): void {
  if (!state.nodeTree || !state.datasetEdit) return
  // nodeTree：连续 undo 直到 cursor 回到事务前位置
  while (state.nodeTree.historyCursor > tx.checkpoints.nodeTreeCursor!)
    state.nodeTree.undo()
  // datasetEdit：同理
  while (state.datasetEdit.historyCursor > tx.checkpoints.datasetCursor!)
    state.datasetEdit.undo()
  // script/style：直接恢复原文
  state.script = tx.checkpoints.scriptBefore
  state.style = tx.checkpoints.styleBefore
}
```

**设计要点**：
- 事务表在 Edit Orchestrator 内部，不污染各工具 API
- `SnapshotHistory.cursor` 只读暴露给事务记录，回滚通过连续调用 `undo()` 实现
- script/style 无快照数组，事务表直接记录原文（文件级，体积小）
- 事务粒度 = 一次用户指令（非一个 Stills turn）
- createCheckpoint 接收 `EditDomainState`；调用点保证已完成 `edit.bootstrap`
---

## 10. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 全局 registry 互斥：切换模式需清空注册 | 模式切换时 stills 不可用 | 切换时 clearRegistry + clearDomains + 重新注册；或改为隔离 registry |
| DataSetCrudTool 构造改造破坏现有 API | 影响 Stills 现有用法 | 保持构造函数不变，仅新增静态工厂 |
| LLM 上下文窗口不够放结构摘要 | 大页面配置可能超出 token 限制 | 渐进式摘要：首轮只放表名/列名，按需展开 |
| script.js 文件级修改可能引入语法错误 | 保存后页面报错 | writeScript 后运行沙箱语法检查，失败则返回 tool error |
| human 和 LLM 同时编辑冲突 | 数据不一致 | Q3-C 决策：请求-响应轮次，human 发指令期间不接受其他编辑 |
| script/style 编辑器内容与 session 状态分离 | LLM 循环期间 human 在 CodeEditor 修改 script/style，sync 时被覆盖 | 方案：LLM 循环进行中锁定 script/style 编辑器为只读；循环结束 syncToEditors() 后解锁 |
| undoTransaction 部分失败 | nodeTree undo 成功但 datasetEdit undo 失败 → 状态不一致 | undo 循环中 catch 异常，回滚失败时 toast 警告 + 记录日志，不中断剩余回滚 |
| `SnapshotHistory<T>` 类型适配 | SparkNodeTree 当前存 SparkNodeTreeSnapshot（含 metadata），SnapshotHistory 存裸 T | T1b 中 `SnapshotHistory<SparkNode>` 只存 root 节点；version/timestamp 等 metadata 由 SparkNodeTree 维护在外部（或简化移除） |

---

## 11. 竣工偏差表（Phase 0，2026-04-08 审计）

> 对照 §6 Phase 0 任务清单，逐项源码审计。

| 任务 | DM 规格 | 实际状态 | 偏差说明 |
|------|---------|---------|---------|
| **T0** | `SnapshotHistory<T>`（spark-utils） | ✅ 完成 | 零偏差。API 完全匹配：`push/undo/redo/canUndo/canRedo/cursor/current/clear`，默认 50 条限幅。纯 TS 零依赖。 |
| **T1** | DataSetCrudTool 工厂 + undo（spark-data） | ✅ 完成 | 零偏差。`fromDataSet()` / `fromJson()` 静态工厂、`undo()/redo()/canUndo/canRedo/historyCursor` 全部就位。内部 `_history: SnapshotHistory<IDataSetMetadata>`，`_afterWrite()` 钩子自动压栈。 |
| **T1b** | SparkNodeTree 重构为 SnapshotHistory（spark-component） | ✅ 完成 | 零偏差。`_history: SnapshotHistory<SparkNode>` 替代原 `_history[] + _cursor`。`historyCursor` getter 委托 `_history.cursor`。构造函数初始化首条快照。 |
| **T2** | Edit Domain 定义（spark-ai） | ✅ 完成 | 当前实现以 `EditDomainState` 为 4 文件单会话真实源：`nodeTree` / `datasetEdit` / `script` / `style` 同时装入 session，由前端直接执行 `edit.bootstrap`；不再依赖 `editGuard()` 三级策略。 |
| **T3** | 17 个 sparkNodeTree.* stills（spark-ai） | ✅ 完成 | 零偏差。`createNodeTreeStills()` 从 catalog 生成 17 个 StillDefinition（8 describe + 9 request），execute 委托 `tree[method](params)`。 |
| **T4** | 31 个 datasetTool.* stills（spark-ai） | ✅ 完成 | 零偏差。`createDatasetStills()` 从 catalog 生成 31 个 StillDefinition（12 describe + 19 request），execute 委托 `tool[method](params)`。 |
| **T5** | 4 个 file.* stills（spark-ai） | ⚠️ 完成，组织偏差 | 功能完整：`file.readScript/writeScript/readStyle/writeStyle` 4 个 still 均定义并注册。**偏差**：DM 要求独立 `edit-file-stills.ts`，实际合并在 `edit-domain.ts` 中（~40 行）。不影响功能，属组织层面偏差。 |
| **T6** | `registerEditStills()` 导出 | ✅ 完成 | 零偏差。`stills/index.ts` 导出 `registerEditStills()`，文档化互斥注册说明。 |
| **T7** | `EDIT_MODE_PROMPT` 编辑模式提示词 | ❌ 未实现 | `packages/spark-ai/src/prompts/edit-prompts.ts` 不存在。Phase 1 阻塞项——LLM 编辑循环需要系统提示词。规格见 §5.7。 |
| **T8** | Edit Orchestrator（runtime） | ❌ 未实现 | `packages/spark-ai/src/runtime/edit-orchestrator.ts` 不存在。`runEditLoop`、`EditTransaction`、`EditLoopConfig`、`EditLoopEvent`、`buildEditContextMessage`、`createCheckpoint`、`undoTransaction` 均未实现。Phase 1 阻塞项。规格见 §5.4 + §9.4。 |
| **T9** | 编辑域单元测试 | ❌ 未实现 | `tests/edit-domain.test.ts` 不存在。SnapshotHistory 本身有独立测试覆盖，但编辑域端到端（init → stills 执行 → undo → export）无测试。 |

### 汇总

| 类别 | 计数 |
|------|------|
| ✅ 完成（零偏差） | 7 / 10（T0, T1, T1b, T2, T3, T4, T6） |
| ⚠️ 完成（轻微组织偏差） | 1 / 10（T5：file stills 合并在 edit-domain.ts） |
| ❌ 未实现 | 3 / 10（T7: 提示词, T8: 编排器, T9: 测试） |
| **Phase 1 阻塞项** | T7 + T8（提示词 + 编排器，Phase 1 必须前置完成） |

### 待办优先级

1. **T7 — edit-prompts.ts**：按 §5.7 规格创建，内容固定，工作量小
2. **T8 — edit-orchestrator.ts**：按 §5.4 + §9.4 规格实现，含 `runEditLoop` 核心循环 + `EditTransaction` 事务机制，工作量中等
3. **T9 — edit-domain.test.ts**：覆盖 init → stills 执行 → undo → export 端到端流程
4. **T5（可选）**：将 file stills 从 `edit-domain.ts` 提取到独立文件（低优先级，不影响功能）

---

## 12. 不在范围内

- [ ] CRDT / OT 实时协同（Q2-E 方案不采用）
- [ ] 双向即时同步（WebSocket 推送 human 编辑到 LLM）
- [ ] script.js 增量 AST 编辑（文件级即可）
- [ ] style.css 增量 CSS 解析编辑（文件级即可）
- [ ] 跨页面共享编辑会话
- [ ] 多人协同编辑同一页面
