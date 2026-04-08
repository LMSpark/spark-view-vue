# Stills V3 架构重构方案

> 状态：设计评审中 | 日期：2026-04-02

## 1. 问题诊断

### 1.1 当前架构（V2）的问题

```
┌─────────────────────────────────────────────────┐
│ stills/dataset-methods.ts                       │
│ stills/datatable-methods.ts                     │
│ stills/dataview-methods.ts                      │← 每个文件 ~200-400 行
│ stills/relation-methods.ts                      │  参数验证 + 业务逻辑 + 错误处理 全混在一起
│ stills/dependency-methods.ts                    │
│ stills/schema-methods.ts                        │
└─────────────┬───────────────────────────────────┘
              │ 操作
              ▼
        IDataSetMetadata（纯 JSON 对象）       ← 问题 1: 不是运行时对象
        session.dataset: IDataSetMetadata      ← 问题 2: 元数据≠DataSet
```

| 编号 | 问题 | 影响 |
|------|------|------|
| P1 | `session.dataset` 是 `IDataSetMetadata`（JSON），不是 `DataSet`（运行时对象） | 无法使用 DataSet/DataTable/DataView 的运行时 API（事件、级联、序列化），metadata-ops 重复实现了 DataSet 已有的建表/建视图逻辑 |
| P2 | 每个 stills 文件内 validate + execute 耦合 | 参数验证（JSON 格式检查）和业务执行（DataSet 操作）混在同一个 StillDefinition 内，违反单一职责 |
| P3 | 31 个 StillDefinition 各自独立，注册靠手写数组 | 新增一个动作要改 4 处：方法文件 + index.ts export + allStills 数组 + 可能还有 capability 注册 |
| P4 | `metadata-ops.ts` 操作 IDataSetMetadata | 与 DataSet 运行时 API 重复（addTable、addView 等），且不触发事件、不走规范化 |

### 1.2 用户三条核心要求

1. **`metadata-ops` 应该直接操作 DataSet 运行时对象**，需要元数据时通过 `toData()` 序列化获取
2. **参数验证是 stills 公共层职责**（所有参数都是 JSON），不应下沉到每个方法实现
3. **所有非 Stills 自身的 stills，都是外部业务系统注册进来的**，注册方式：`Map<方法名, { 参数描述, handler }>`；dispatcher 统一 try/catch，成功返回成功，失败返回错误信息+正确参数格式

---

## 2. 目标架构（V3）

```
                         ┌─────────────────────────────────────────┐
                         │           StillsRegistry (Map)          │
                         │  key: action name (string)              │
                         │  value: StillEntry {                    │
                         │    description,                         │
                         │    type: 'query' | 'command',           │
                         │    guard: StillGuard,                   │
                         │    paramsSchema: Record<string, string>,│
                         │    example?: Record<string, unknown>,   │
                         │    validate: (params) => string | null, │
                         │    execute: (session, params) => T      │  ← 直接返回数据，异常即失败
                         │  }                                      │
                         └──────────────┬──────────────────────────┘
                                        │
                    ┌───────────────────▼───────────────────┐
                    │         Dispatcher (统一管道)          │
                    │                                       │
                    │  1. 查找 action                       │
                    │  2. guard 检查（session 状态）         │
                    │  3. validate（JSON 参数格式）          │
                    │  4. try { execute } catch (e) {       │
                    │       return { ok:false, msg, fix }   │
                    │     }                                 │
                    │  5. 成功 → { ok:true, data, summary } │
                    │  6. 写 patchLog                       │
                    └───────────────────────────────────────┘

注册来源（按域分离）：
  ┌──────────┐    ┌──────────────┐    ┌──────────────┐
  │  meta    │    │  blueprint   │    │  dataset-ops │  ← spark-data 包
  │ (3 stills│    │ (4 stills)   │    │ (24 stills:  │
  │ Stills 内部)│    │ (Stills 内部)   │    │  21 → ops fn │
  └──────────┘    └──────────────┘    │  3 → session)│
                                      └──────────────┘
```

### 2.1 关键设计决策

| 决策 | 方案 | 理由 |
|------|------|------|
| **session.dataset 类型** | `DataSet \| null` | DataSet 是运行时对象，拥有 getTable/getView/toData 等 API |
| **execute 签名** | `(session, params) => data` | 直接返回数据对象（不返回 `StillResult`），异常传播给 dispatcher |
| **错误处理** | 业务错误抛 `DataSetOpError`；dispatcher 统一 try/catch | handler 只写正向逻辑，不写 `{ ok: false }` 样板 |
| **参数验证位置** | `StillEntry.validate` 由注册方提供，dispatcher 在 execute 前调用 | JSON 格式检查是 stills 层职责，但具体规则由注册方声明 |
| **metadata-ops.ts** | **删除**，不再需要 | DataSet 运行时 API 已提供 addTable 等等操作，直接用 |
| **spark-data 新增** | `DataSetOpError` 错误类 + `dataset-ops.ts`（AI 操作层） | 纯操作函数，直接操作 DataSet 对象，抛 DataSetOpError |
| **导出格式** | 需要元数据时调 `ds.toData()` | DataSet/DataTable/DataView 都有 `toData()` 序列化方法 |

### 2.2 DataSet 构建工厂（替代 createEmptyDataset）

```typescript
// 变更前（V2, types.ts）
export function createEmptyDataset(name: string): IDataSetMetadata {
  return { dataSetName: name, tables: {}, schemaVersion: 1 }
}

// 变更后（V3）
import { DataSet } from '@spark-view/spark-data'
export function createEmptyDataset(name: string): DataSet {
  return new DataSet({ dataSetName: name, tables: {} })
}
```

### 2.3 StillEntry —— 最简注册接口

```typescript
/** 业务系统注册进 stills 的最小契约 */
interface StillEntry<TParams = unknown> {
  /** 功能说明（LLM 可读） */
  description: string
  /** query = 只读, command = 写操作 */
  type: 'query' | 'command'
  /** 准入条件 */
  guard: StillGuard
  /** 参数格式说明（LLM 发现用） */
  paramsSchema: Record<string, string>
  /** 最小参数示例 */
  example?: Record<string, unknown>
  /** JSON 参数格式校验，null=通过 */
  validate: (params: TParams) => string | null
  /** 执行：直接返回 data，失败抛 DataSetOpError */
  execute: (session: DesignSessionV2, params: TParams) => unknown
}
```

与 V2 `StillDefinition` 的关键差异：

| V2 StillDefinition | V3 StillEntry | 变化原因 |
|-----|-----|------|
| `execute(ctx: { session }, params) => StillResult` | `execute(session, params) => data` | 不再返回 StillResult 包装，直接返回业务数据；去掉 StillContext 中间层 |
| `action` 字段在定义上 | 注册时作为 Map key | action 名是注册时确定的，不是定义自带的 |
| 每个 execute 内部写 `{ ok: false, code, msg, fix }` | 抛 `DataSetOpError(code, msg, fix)` | 错误处理统一由 dispatcher 完成 |

> **StillContext 移除**：V2 中 execute 接收 `ctx: StillContext`（实际只有 `ctx.session`），V3 直接传 `session` 参数，消除无谓包装。

### 2.4 DataSetOpError —— 领域操作错误

```typescript
// 位置: packages/spark-data/src/errors.ts
export class DataSetOpError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly fix: string,
  ) {
    super(message)
    this.name = 'DataSetOpError'
  }
}
```

在 `dataset-ops.ts` 中使用：
```typescript
function assertTable(ds: DataSet, tableName: string): DataTable {
  const table = ds.getTable(tableName)
  if (!table) throw new DataSetOpError('TABLE_NOT_FOUND', `表 ${tableName} 不存在`, '请先 datatable.create')
  return table
}
```

### 2.5 Dispatcher V3 —— 统一 try/catch 管道

```typescript
function executeStill(action: string, params: unknown, session: DesignSessionV2, requestId: string): StillResult {
  // 1. 查找
  const entry = registry.get(action)
  if (!entry) return { ok: false, code: 'UNKNOWN_ACTION', msg: `未知动作: ${action}`, fix: '请查 stills.capabilities' }

  // 2. Guard
  const guardErr = checkGuard(entry.guard, session)
  if (guardErr !== null) return guardErr

  // 3. Validate (JSON params)
  const validErr = entry.validate(params)
  if (validErr !== null) {
    return {
      ok: false, code: 'INVALID_PARAMS', msg: validErr,
      fix: `正确参数格式: ${JSON.stringify(entry.paramsSchema)}${entry.example ? `\n示例: ${JSON.stringify(entry.example)}` : ''}`
    }
  }

  // 4. Execute with try/catch
  try {
    const data = entry.execute(session, params)
    const summary = typeof data === 'object' && data !== null && 'summary' in data
      ? String((data as Record<string, unknown>).summary)
      : `${action} 执行成功`

    // 5. PatchLog (command only)
    if (entry.type === 'command') {
      session.patchLog.push({ action, requestId, timestamp: Date.now(), summary })
    }

    return { ok: true, data, summary }
  } catch (err: unknown) {
    if (err instanceof DataSetOpError) {
      return { ok: false, code: err.code, msg: err.message, fix: err.fix }
    }
    // 未知错误 — fail-fast 暴露
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, code: 'INTERNAL_ERROR', msg, fix: '请检查参数后重试' }
  }
}
```

**核心变化**：
- validate 失败时，`fix` 自动携带 `paramsSchema` + `example` —— AI 下次调用就知道正确格式
- execute 内部不再写 `{ ok: false }` 样板，只写正向逻辑 + 异常抛出
- 未知异常也能被捕获，不会导致调用方崩溃

---

## 3. 文件布局

### 3.1 spark-data 新增

```
packages/spark-data/src/
  errors.ts              ← NEW: DataSetOpError
  dataset-ops.ts         ← NEW: 直接操作 DataSet 的纯函数（替代 metadata-ops.ts）
  metadata-ops.ts        ← DELETE（本次删除）
  index.ts               ← 更新导出
```

### 3.2 spark-ai 变更

```
packages/spark-ai/src/stills/
  types.ts               ← 修改: DesignSessionV2.dataset → DataSet | null
                                  StillEntry 替代 StillDefinition
  dispatcher.ts          ← 修改: 统一 try/catch 管道
  guards.ts              ← 微调: 适配 DataSet 对象
  index.ts               ← 简化: 注册方式改为 Map 批量注册

  meta-methods.ts        ← 保留（3 stills，纯 session/registry 查询）
  blueprint-methods.ts   ← 保留（4 stills，纯 session 操作）
  schema-methods.ts      ← 简化（2 stills → throw DataSetOpError）

  dataset-methods.ts     ← 简化: 调用 spark-data/dataset-ops
  datatable-methods.ts   ← 简化: 调用 spark-data/dataset-ops
  dataview-methods.ts    ← 简化: 调用 spark-data/dataset-ops
  relation-methods.ts    ← 简化: 调用 spark-data/dataset-ops
  dependency-methods.ts  ← 简化: 调用 spark-data/dataset-ops
```

### 3.3 dataset-ops.ts 函数清单

每个函数直接操作 `DataSet` 对象，失败抛 `DataSetOpError`，成功返回 data 对象。

> **24 个数据域 stills 中，3 个是纯会话状态操作，不需要 ops 函数**：
> - `dataset.init` → `session.dataset = createEmptyDataset(name)`
> - `dataset.reset` → `session.dataset = null; session.schemaLocked = false`
> - `schema.unlock` → `session.schemaLocked = false`
>
> 其余 21 个 stills 各对应一个 ops 函数：

```typescript
// packages/spark-data/src/dataset-ops.ts

// ── 内部 assert 工具 ──
function assertTable(ds: DataSet, name: string): DataTable
function assertView(ds: DataSet, tableName: string, viewId?: string): { table: DataTable; view: DataView; vid: string }

// ── Dataset 级 ──
function opsDescribeDataSet(ds: DataSet, opts?: { schemaLocked?: boolean }): object
function opsValidateDataSet(ds: DataSet, opts?: { schemaLocked?: boolean }): object
function opsExportDataSet(ds: DataSet): { snapshot: IDataSetMetadata }

// ── DataTable 级 ──
function opsAddTable(ds: DataSet, tableName: string, columns: DataColumn[]): object
function opsDescribeTable(ds: DataSet, tableName: string): object
function opsAddColumns(ds: DataSet, tableName: string, columns: DataColumn[]): object
function opsUpdateColumn(ds: DataSet, tableName: string, columnName: string, updates: Partial<DataColumn>): object
function opsRemoveColumn(ds: DataSet, tableName: string, columnName: string): object
function opsSetTableApi(ds: DataSet, tableName: string, api: CrudApi): object
function opsAddRows(ds: DataSet, tableName: string, rows: IDataRow[]): object

// ── DataView 级 ──
function opsAddView(ds: DataSet, tableName: string, viewId: string): object
function opsDescribeView(ds: DataSet, tableName: string, viewId?: string): object
function opsConfigureView(ds: DataSet, tableName: string, viewId: string | undefined, config: Partial<IViewMetadata>): object
function opsSetAggregates(ds: DataSet, tableName: string, viewId: string | undefined, aggregates: Record<string, AggregateColumnConfig>): object
function opsSetTreeConfig(ds: DataSet, tableName: string, viewId: string | undefined, treeConfig: TreeConfig): object

// ── Relation 级 ──
function opsAddRelation(ds: DataSet, params: { parentTable, childTable, parentField, childField, relationName? }): object
function opsRemoveRelation(ds: DataSet, parentTable: string, childTable: string): object
function opsListRelations(ds: DataSet): object

// ── Dependency 级 ──
function opsAddDependency(ds: DataSet, params: { parentTable, childTable, dependencyType?, autoLoad? }): object
function opsRemoveDependency(ds: DataSet, parentTable: string, childTable: string): object

// ── Schema 校验 ──
function opsCheckSchemaLockable(ds: DataSet): object
```

### 3.4 opsAddTable 实现示例

```typescript
import { DataTable } from './data-table'
import { DataSetOpError } from './errors'

export function opsAddTable(ds: DataSet, tableName: string, columns: DataColumn[]): object {
  // 业务规则检查 — 违反即抛
  if (ds.getTable(tableName)) {
    throw new DataSetOpError('TABLE_EXISTS', `表 ${tableName} 已存在`, '使用 datatable.addColumns 向已有表追加列')
  }

  // 直接操作运行时对象
  const table = new DataTable(tableName, columns)
  ds.tables[tableName] = table
  table.setDataSet(ds)               // ← 关联 DataSet（触发级联设置）

  const computedCols = columns.filter(c => c.computeExpression !== undefined)

  return {
    status: 'ok',
    tableName,
    columnCount: columns.length,
    columns: columns.map(c => c.name),
    ...(computedCols.length > 0 ? { computedColumns: computedCols.map(c => c.name) } : {}),
    summary: `建表 ${tableName}（${columns.length} 列）`,
  }
}
```

> **DataTable ↔ DataSet 关联**：手动添加 table 后必须调用 `table.setDataSet(ds)`，否则视图的级联设置不会触发。
> 同理，修改 `ds.tableRelations` 后应调用 `table.onDataSetRelationsReady()` 通知相关视图重编译计算列。
```

### 3.5 stills adapter 示例（datatable.create）

```typescript
// packages/spark-ai/src/stills/datatable-methods.ts

import { opsAddTable } from '@spark-view/spark-data'

export const datatableCreate: StillEntry = {
  description: '添加一张表（tableName + columns）',
  type: 'command',
  guard: { requireBlueprint: true, requireSchemaUnlocked: true },
  paramsSchema: {
    tableName: 'string — 表名',
    columns: 'DataColumn[] — 列定义（name/type/isPrimaryKey/label 等）',
  },
  example: {
    tableName: 'Orders',
    columns: [
      { name: 'id', type: 'number', isPrimaryKey: true, label: '订单ID' },
    ],
  },
  validate: (params) => {
    if (!params.tableName || typeof params.tableName !== 'string') return '缺少 tableName'
    if (!Array.isArray(params.columns) || params.columns.length === 0) return '缺少 columns'
    for (const col of params.columns) {
      if (!col.name || typeof col.name !== 'string') return '列缺少 name'
      if (!col.type) return `列 ${col.name} 缺少 type`
    }
    return null
  },
  execute: (session, params) => {
    return opsAddTable(session.dataset!, params.tableName, params.columns)
  },
}
```

注意 execute 内：
- **不写** `if (ds === null)` —— guard 已保证
- **不写** try/catch —— dispatcher 统一处理
- **不写** `{ ok: true/false }` —— 直接返回 data 或 throw

---

## 4. session.dataset 类型变更

### 4.1 DesignSessionV2 类型变更

```typescript
// 变更前
import type { IDataSetMetadata } from '@spark-view/spark-data'
interface DesignSessionV2 {
  dataset: IDataSetMetadata | null
}

// 变更后
import type { DataSet } from '@spark-view/spark-data'
interface DesignSessionV2 {
  dataset: DataSet | null
}
```

### 4.2 影响分析

| 位置 | 当前用法 | 变更后用法 |
|------|---------|-----------|
| `dataset.init` execute | `session.dataset = metaCreateDataSet(name)` | `session.dataset = new DataSet({ dataSetName: name, tables: {} })` |
| `dataset.export` execute | `JSON.parse(JSON.stringify(ds))` | `ds.toData()` → 深拷贝已内置 |
| `dataset.describe` | 手算 tableNames/totalColumns | `ds.toData()` → 序列化后统计 |
| `dataset.validate` | 遍历 `ds.tables[name].columns` | `ds.getTable(name)!.columns` |
| `datatable.create` | `ds.tables[name] = { tableName, columns, views }` | `new DataTable() + ds.tables[name] = table` |
| `relation.add` | `ds.tableRelations.push(...)` | `ds.tableRelations!.push(...)` |
| `dataview.configure` | `Object.assign(view, config)` | `view.applyViewConfig(config)` |
| `dataview.setAggregates` | `view.aggregates = {...}` | `view.applyViewConfig({ aggregates })` |
| `schema.lock` PK 检查 | `ds.tables[t].columns.some(c => c.isPrimaryKey)` | `ds.getTable(t)!.columns.some(...)` |
| Guard `dataset === null` | 判空 | 不变（DataSet \| null） |
| 测试断言 `session.dataset!.tables['X']` | 读 ITableMetadata | 读 DataTable 运行时对象 |

### 4.3 测试变更策略

核心：53 个测试中大部分通过 `exec(action, params)` 间接操作，断言的是 `StillResult` 的 data 字段，**不直接断言 session.dataset 内部结构**。需要调整的是少数直接读 `session.dataset!.tables['X']` 的断言。

| 测试断言类型 | 数量 | 变更 |
|------|------|------|
| `session.dataset!.tables['X'].columns.length` | ~5 处 | `ds.getTable('X')!.columns.length` |
| `session.dataset!.tables['X'].views.default.rows` | ~2 处 | `ds.getView('X', 'default')!.rows` 或 `ds.getTable('X')!.rows` |
| `session.dataset!.tables['X'].views.default.autoLoad` | ~2 处 | `ds.getView('X', 'default')!.autoLoad` |
| `session.dataset!.tables['X'].views.default.treeConfig` | ~1 处 | `ds.getView('X', 'default')!.treeConfig` |
| `session.dataset!.tables['X'].views.default.aggregates` | ~1 处 | `ds.getView('X', 'default')!.aggregates` |
| `session.dataset!.tableRelations` | ~5 处 | 不变（DataSet.tableRelations 是公开数组） |
| `session.dataset!.viewDependencies` | ~3 处 | 不变 |
| `session.dataset!.dataSetName` | ~2 处 | 不变 |
| 直接赋值 `session.dataset!.tables['NoPK'] = {...}` | 2 处 | 改为 `new DataTable('NoPK', columns)` + `setDataSet` |
| 直接赋值 `session.dataset!.tableRelations = [...]` | 2 处 | 直接修改数组仍可行，DataSet.tableRelations 是可变的 |
| 直接赋值 `session.dataset!.viewDependencies = [...]` | 1 处 | 同上 |

---

## 5. 注册机制

### 5.1 注册方式：Map 批量注入

```typescript
// packages/spark-ai/src/stills/index.ts

export function registerAllStills(): void {
  // meta（内置，不依赖 DataSet）
  registerStills({
    'stills.capabilities': stillsCapabilities,
    'stills.actionSpec': stillsActionSpec,
    'session.describe': sessionDescribe,
  })

  // blueprint（内置，纯 session 操作）
  registerStills({
    'blueprint.create': blueprintCreate,
    'blueprint.describe': blueprintDescribe,
    'blueprint.advance': blueprintAdvance,
    'blueprint.revise': blueprintRevise,
  })

  // dataset-ops（来自 spark-data 域）
  registerStills(datasetStills)    // 24 个
}
```

```typescript
// dispatcher.ts
export function registerStills(map: Record<string, StillEntry>): void {
  for (const [action, entry] of Object.entries(map)) {
    _registry.set(action, entry)
  }
}
```

### 5.2 stills 注册约束

- **key** = action name（`domain.verb` 格式，如 `datatable.create`）
- **value** = StillEntry（最小契约）
- 注册方只需导出一个 `Record<string, StillEntry>` 对象
- dispatcher 不关心注册方来自哪个包——解耦

---

## 6. 迁移步骤（按顺序执行）

### Step 1: spark-data 新增 errors.ts + dataset-ops.ts

1. 创建 `packages/spark-data/src/errors.ts` — `DataSetOpError` 类
2. 创建 `packages/spark-data/src/dataset-ops.ts` — 21 个 `ops*` 函数（操作 DataSet 运行时对象）
3. 更新 `packages/spark-data/src/index.ts` — 导出新增内容
4. 删除 `packages/spark-data/src/metadata-ops.ts` — 不再需要

### Step 2: spark-ai types.ts 类型变更

1. `DesignSessionV2.dataset` 从 `IDataSetMetadata | null` → `DataSet | null`
2. `StillDefinition` → `StillEntry`（简化签名）
3. `createEmptyDataset` 改为创建真正的 DataSet 实例
4. `StillResult` 保留（dispatcher 返回值不变，但 execute 不再返回它）

### Step 3: 更新 dispatcher.ts

1. `executeStill` 内加 try/catch
2. validate 失败时 fix 自动包含 `paramsSchema` + `example`
3. 注册函数改为 `registerStills(map: Record<string, StillEntry>)`

### Step 4: 更新 guards.ts

1. `session.dataset === null` 判断不变（DataSet | null 仍然判空一样）
2. 无需其他变更

### Step 5: 改写 10 个方法文件

每个文件的 execute 函数：
- 去掉 `{ ok: true/false }` 包装
- 改为调用 `ops*` 函数（可能抛 DataSetOpError）
- 直接返回 data 对象

### Step 6: 更新 index.ts 注册方式

从手写数组改为 `Record<string, StillEntry>` 对象批量注册。

### Step 7: 更新测试

1. `session.dataset!.tables['X']` → 改为 DataTable 运行时 API
2. 直接赋值 `session.dataset!.tables['NoPK'] = {...}` → `new DataTable()`
3. StillResult 断言不变（dispatcher 返回值类型不变）

### Step 8: 删除 metadata-ops.ts + 清理旧导出

---

## 7. 风险评估

| 风险 | 等级 | 缓解 |
|-------|------|------|
| DataSet 构造开销 > IDataSetMetadata | 低 | AI 会话频率低，DataSet 轻量 |
| DataTable 不是 spark-data 公开导出 | 中 | dataset-ops.ts 在包内，可直接 import `./data-table` |
| DataView.wrapInstance 钩子 | 低 | AI 会话不使用 Vue 响应式，默认 identity 函数即可 |
| 测试 53 个断言需要调整 | 中 | 大部分通过 exec() 间接操作，仅 ~15 处直接读 session.dataset |
| addRows 存入 DataView.rows vs DataTable.rows | 中 | 需确认：AI 构建阶段的 rows 应写入 metadata（序列化可保存），通过 `table.rows = rows` 存储 |

### 7.1 addRows 特殊处理

V2 中 `metaAddRows` 写入 `view.rows`（IViewMetadata 的 rows 字段）。在 V3 中：
- `DataTable.rows` = 内联静态数据源（序列化时保留）
- `DataView.rows` = 运行时视图数据（序列化时也保留）

AI 构建阶段写入的静态行应该走 **`table.rows`**（因为这些是 pagedata.json 中的内联数据），同时也要同步到 default view 的 rows。实际上 `DataTable.fromTableData()` 在反序列化时就是把 `IViewMetadata.rows` 同步到 DataView 的。

**决策**：`opsAddRows` 同时写入 `table.rows` 和 `view.rows`，确保序列化 (`toData()`) 时行数据出现在正确位置。

---

## 8. 前后对比

### 8.1 代码量变化

| 文件 | V2 行数 | V3 行数 | 减少 |
|------|---------|---------|------|
| stills/datatable-methods.ts | ~400+ | ~80 | -80% |
| stills/dataview-methods.ts | ~290 | ~70 | -75% |
| stills/relation-methods.ts | ~180 | ~40 | -78% |
| stills/dependency-methods.ts | ~150 | ~35 | -77% |
| stills/schema-methods.ts | ~70 | ~30 | -57% |
| stills/dataset-methods.ts | ~170 | ~60 | -65% |
| spark-data/metadata-ops.ts | ~860 | 0 (删) | -100% |
| spark-data/dataset-ops.ts | 0 | ~350 | 新增 |
| spark-data/errors.ts | 0 | ~15 | 新增 |

净减：~860 + ~700 → ~350 + ~315 = **净减 ~900 行**

### 8.2 职责分离

```
V2:  stills/ = 参数验证 + 业务规则 + DataSet操作 + 错误包装 + 结果格式化
     metadata-ops.ts = 重复的IDataSetMetadata操作

V3:  stills/ = 参数声明 + JSON验证 + 调用dataset-ops
     dataset-ops.ts = 纯业务操作（操作DataSet对象）
     dispatcher.ts = guard + validate + try/catch + patchLog
```

---

## 9. 自查清单

- [x] DesignSessionV2.dataset 从 IDataSetMetadata → DataSet —— 所有读写处已分析
- [x] execute 签名统一：直接返回 data，失败抛 DataSetOpError
- [x] dispatcher 统一 try/catch，validate 失败 fix 包含 paramsSchema
- [x] metadata-ops.ts 删除，dataset-ops.ts 操作运行时对象
- [x] DataTable 未公开导出但 dataset-ops.ts 在包内可访问
- [x] DataView.wrapInstance 在 AI 会话中不影响（不使用 Vue）
- [x] addRows 写入 table.rows + view.rows
- [x] 测试断言变更点已逐一列出（~15 处）
- [x] 注册机制：Map<action, StillEntry> 批量注入
- [x] guard 检查不变（DataSet | null 判空一致）
- [x] toData() 序列化替代 JSON.parse(JSON.stringify())
