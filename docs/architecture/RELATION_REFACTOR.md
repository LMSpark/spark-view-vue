# DataRelation 两层分离重构方案

> 状态：**方案评审**（未开始实施）  
> 日期：2026-03-31  
> 影响包：`spark-data`

---

## 一、现状诊断

### 1.1 当前 `DataRelation` 是扁平混合体

```typescript
interface DataRelation {
  // ── 表结构字段（Data Schema）──
  parentTable: string
  childTable: string
  parentField?: string
  childField?: string
  cascadeUpdate?: boolean
  cascadeDelete?: boolean
  relationName?: string
  filterExpression?: FilterExpression

  // ── 视图联动字段（View Schema）──
  parentViewId?: string
  childViewId?: string
  dependencyType?: DependencyType
  autoLoad?: boolean
}
```

一个接口同时回答两个问题：
1. **数据层面**：哪两张表有关联？用什么字段匹配？
2. **视图层面**：哪个视图响应哪个视图？怎么响应？

### 1.2 问题

| # | 问题 | 影响 |
|---|------|------|
| 1 | AI 无法区分"数据结构关联"和"UI 视图联动" | 生成配置时容易混淆、遗漏 |
| 2 | 字段信息（parentField/childField）和视图信息（parentViewId/childViewId）耦合 | 同一表关系多视图联动时被迫重复字段信息 |
| 3 | 内部索引只有视图级（`parentTable:viewId`） | 聚合函数（`$sum/$count`）本质只需表级信息，却依赖视图级索引——如果未来某场景只有表关系无视图联动，聚合会失效 |
| 4 | `cascadeUpdate/Delete`（声明性元数据，代码中未消费）与 `autoLoad`（运行时行为）混在同一层 | 语义模糊 |

### 1.3 关键消费点分析

| 消费者 | 需要的表结构字段 | 需要的视图联动字段 |
|--------|------------------|--------------------|
| `CascadeDelegate.setupCascade()` | parentTable, childTable | parentViewId, childViewId, dependencyType |
| `CascadeDelegate.respondToParentChange()` | parentField, childField | autoLoad |
| `DataView.requestData()` — API 参数构建 | parentField, childField | parentViewId, childViewId |
| `DataView.applyInMemoryCascade()` | parentField, childField | — |
| `ComputedColumnDelegate` — 聚合解析 | parentTable, childTable, parentField, childField | childViewId |
| `DataSet._buildRelationIndex()` | parentTable, childTable | parentViewId, childViewId |

### 1.4 实际使用数据

- 所有 `pagedata.json` 中 `parentViewId`/`childViewId` 均为 `"default"`
- `dependencyType` 最常见 `"currentRow"`（主从联动）和 `"allRows"`（全量级联）
- `cascadeUpdate`/`cascadeDelete` 仅在类型定义和测试中存在，**运行时代码未消费**

---

## 二、方案选型回顾

### 2.1 V1：平行双数组 + 字符串引用 → ❌ 否决

`ViewDependency` 通过 `relation: "name"` 字符串引用 `TableRelation`。

**否决原因**：字符串断链风险高；99% 场景 1:1 时双数组冗余；`relationName` 不填时无法引用。

### 2.2 V2：嵌套 viewLinks → ❌ 否决

`TableRelation.viewLinks?: ViewLink[]` 内嵌视图联动配置。

**否决原因**：99% 场景 viewLinks 只一条，嵌套 JSON 层级增加认知负担，AI 并不更好理解。

### 2.3 V3：渐进式语义分层 → ✅ 采纳

`tableRelations[]`（只管表结构）+ 可选 `viewDependencies[]`（只管视图联动，省略时全自动推导）。

**优势**：最简场景只写 3 字段；零字符串引用；100% 向后兼容；内部引擎零改动。

---

## 三、最终方案

### 3.1 核心理念

1. **配置分两层**（Data Schema + View Schema）让 AI 和人都能分清语义
2. **内部展开为扁平结构**（现有 `DataRelation`）→ CascadeDelegate / DataView / ComputedColumn 零改动
3. **旧格式 100% 兼容** → 无迁移压力
4. **内部索引分两级** → 表级索引（聚合消费）+ 视图级索引（级联消费）

### 3.2 两层定义

两层都是 Schema（配置时声明，运行时只读），区别是**描述对象不同**：

```
TableRelation（表关系 / Data Schema）
  → 描述数据：哪两张表有关联？用什么字段匹配？
  → 类比 SQL: FOREIGN KEY / JOIN ON

ViewDependency（视图联动 / View Schema）
  → 描述视图：哪个视图响应哪个视图的变化？怎么响应？
  → SQL 无对应物，纯前端 UI 编排
```

### 3.3 类型定义

```typescript
// ═══════════════════════════════════════════
// L1: 表关系（Data Schema）
// ═══════════════════════════════════════════

/**
 * 表关系 — 声明两张表之间的外键/逻辑关联。
 *
 * 纯数据结构描述，不涉及 UI 联动。
 * 消费者：计算列聚合函数（$sum/$count）、内存级联过滤、API 请求参数构建。
 *
 * SQL 等价：
 * ```sql
 * SELECT child.* FROM {childTable} child
 * JOIN {parentTable} parent ON child.{childField} = parent.{parentField}
 * ```
 */
interface TableRelation {
  relationName?: string
  parentTable: string
  childTable: string

  // ── 简写模式（单字段外键，95% 场景）──
  /** 子表外键字段（简写模式必填） */
  childField?: string
  /** 父表匹配字段（默认取父表 primaryKey，通常 'id'） */
  parentField?: string

  // ── 完整条件（与 childField/parentField 互斥，后续迭代定义具体结构）──
  /**
   * 复合匹配条件（预留）。
   *
   * 用于复合键、带静态过滤等高级场景。
   * SQL 等价：JOIN ON + WHERE 合并。
   * 当前版本不消费此字段，具体结构后续迭代定义。
   */
  condition?: Record<string, unknown>

  // ── 声明性元数据 ──
  cascadeUpdate?: boolean
  cascadeDelete?: boolean
}

// ═══════════════════════════════════════════
// L2: 视图联动（View Schema）
// ═══════════════════════════════════════════

/**
 * 视图依赖 — 声明子视图如何响应父视图数据变化。
 *
 * 基于 TableRelation 的字段信息工作，独立描述视图层面的联动策略。
 * 省略时框架为每条 TableRelation 自动生成默认依赖。
 */
interface ViewDependency {
  /** 与 TableRelation 对齐的匹配键 */
  parentTable: string
  /** 与 TableRelation 对齐的匹配键 */
  childTable: string
  /** 父视图 ID（默认 'default'） */
  parentViewId?: string
  /** 子视图 ID（默认 'default'） */
  childViewId?: string
  /** 响应父视图的哪种数据变化（默认 'currentRow'） */
  dependencyType?: DependencyType
  /** 父变化时是否自动级联加载子视图（默认 true） */
  autoLoad?: boolean
}
```

### 3.4 DataSet 配置接口

```typescript
interface IDataSetMetadata {
  dataSetName: string
  tables: Record<string, ITableMetadata>

  // ── 新格式（推荐）──
  /** L1: 表关系 — 声明表间外键/逻辑关联 */
  tableRelations?: TableRelation[]
  /** L2: 视图联动 — 声明视图联动策略（省略时自动从 tableRelations 推导） */
  viewDependencies?: ViewDependency[]

  // ── 旧格式（100% 兼容）──
  /** @deprecated 使用 tableRelations + viewDependencies 替代 */
  relations?: DataRelation[]
}
```

---

## 四、pagedata.json 配置示例

### 4.1 最简模式（95% 场景）

只写 `tableRelations`，视图联动全自动推导（default→default, currentRow, autoLoad=true）：

```json
{
  "dataSetName": "OrderDS",
  "tables": {
    "Users":      { "columns": [...], "rows": [...] },
    "Orders":     { "columns": [...], "rows": [...] },
    "OrderItems": { "columns": [...], "rows": [...] }
  },
  "tableRelations": [
    { "parentTable": "Users",  "childTable": "Orders",     "childField": "userId" },
    { "parentTable": "Orders", "childTable": "OrderItems",  "childField": "orderId" }
  ]
}
```

### 4.2 显式视图联动

```json
{
  "tableRelations": [
    { "parentTable": "Users", "childTable": "Orders", "childField": "userId" }
  ],
  "viewDependencies": [
    {
      "parentTable": "Users", "childTable": "Orders",
      "parentViewId": "picker", "childViewId": "summary",
      "dependencyType": "selectedRows"
    }
  ]
}
```

### 4.3 仅聚合无联动

`viewDependencies: []` 明确无视图联动，但 `$sum('OrderItems', 'amount')` 仍可工作（走表级索引）：

```json
{
  "tableRelations": [
    { "parentTable": "Orders", "childTable": "OrderItems", "childField": "orderId" }
  ],
  "viewDependencies": []
}
```

### 4.4 旧格式（100% 兼容）

```json
{
  "relations": [
    {
      "parentTable": "Users",
      "childTable": "Orders",
      "parentField": "id",
      "childField": "userId",
      "dependencyType": "currentRow"
    }
  ]
}
```

---

## 五、语义约定

| 配置 | 含义 |
|------|------|
| `tableRelations: [...]`, 无 `viewDependencies` | 每条表关系自动推导一条默认视图联动 |
| `tableRelations: [...]`, `viewDependencies: [...]` | 显式声明的视图联动覆盖对应表关系的自动推导；未覆盖的表关系仍自动推导 |
| `tableRelations: [...]`, `viewDependencies: []`（空数组） | **明确无视图联动** — 表关系只用于聚合函数，不触发级联 |
| `relations: [...]`（旧格式） | **已移除** — 必须使用 `tableRelations` + `viewDependencies` |
| `tableRelations` 与 `relations` 同时存在 | `tableRelations` 优先，`relations` 被忽略 |

---

## 六、内部架构

### 6.1 DataSet 构造函数规范化流程

```
构造函数入口
  │
  ├─① 格式检测
  │   ├─ 有 tableRelations → 新格式路径
  │   ├─ 有 relations → 旧格式路径（拆分转换）
  │   └─ 都没有 → 无关系，跳过
  │
  ├─② 旧格式拆分（relations → tableRelations + viewDependencies）
  │   for each relation:
  │     tableRelation = pick(parentTable, childTable, parentField, childField,
  │                          cascadeUpdate, cascadeDelete, relationName)
  │     viewDependency = pick(parentTable, childTable, parentViewId, childViewId,
  │                           dependencyType, autoLoad)
  │   tableRelation 按 parentTable+childTable 去重（保留第一条）
  │
  ├─③ 自动推导缺省 ViewDependency
  │   for each tableRelation:
  │     if 没有显式 viewDependency 匹配此 parentTable+childTable:
  │       自动生成 { parentTable, childTable,
  │                  parentViewId:'default', childViewId:'default',
  │                  dependencyType:'currentRow', autoLoad:true }
  │
  ├─④ 展开为内部 ResolvedRelation[]
  │   for each viewDependency:
  │     找到匹配的 tableRelation → 合并字段信息
  │     filterExpression 从 childField/parentField 自动生成
  │     parentField 未指定时取父视图 primaryKey
  │   输出: 与现有 DataRelation 结构相同的扁平数组
  │
  ├─⑤ 构建双级索引
  │   ├─ 表级索引（新增）: parentTable → TableRelation[]
  │   └─ 视图级索引（现有）: parentTable:viewId → ResolvedRelation[]
  │
  └─⑥ 后续流程不变（setDataSet → setupCascade → onDataSetRelationsReady）
```

### 6.2 双级索引

```typescript
class DataSet {
  // ── 表级索引（新增）— 供聚合函数消费 ──
  private _tableChildIdx  = new Map<string, TableRelation[]>()   // parentTable → children
  private _tableParentIdx = new Map<string, TableRelation[]>()   // childTable  → parents

  // ── 视图级索引（保持现有）— 供级联订阅消费 ──
  private _childRelIdx  = new Map<string, ResolvedRelation[]>()  // parentTable:viewId → deps
  private _parentRelIdx = new Map<string, ResolvedRelation[]>()  // childTable:viewId  → deps

  // 新 API
  getTableChildRelations(parentTable: string): TableRelation[]
  getTableParentRelations(childTable: string): TableRelation[]

  // 现有 API（保持，签名不变）
  getChildRelations(parentTable: string, parentViewId: string): ResolvedRelation[]
  getParentRelations(childTable: string, childViewId: string): ResolvedRelation[]
}
```

**关键修复**：`ComputedColumnDelegate._createAggregateResolver()` 改为查**表级索引**：

```typescript
// 改前（耦合）：
const relations = ds.getChildRelations(this._host.tableName, this._host.viewId)

// 改后（解耦）：
const tableRelations = ds.getTableChildRelations(this._host.tableName)
```

这样 `viewDependencies: []` 时聚合函数仍可正常工作。

---

## 七、AI 理解增益

| 场景 | 旧格式 | 新格式 |
|------|--------|--------|
| 生成主从页面 | 写一个 relation 对象含 7-10 个字段 | 写一个 tableRelation：3 个字段；联动全自动 |
| 计算列聚合 | "relation 中哪些字段影响 $sum？" | "聚合只看 tableRelations" |
| parentViewId 是什么 | "属于 relation？为什么关系定义需要视图 ID？" | "属于 viewDependencies — 因为同一表关系可在不同视图间建立不同联动" |
| 仅聚合无联动 | 无法表达 | `viewDependencies: []` 语义明确 |

---

## 八、影响面分析

| 文件 | 变更量 | 说明 |
|------|--------|------|
| `types.ts` | +2 接口 | 新增 `TableRelation`, `ViewDependency`；`IDataSetMetadata` 新增字段；`DataRelation` 标 `@deprecated` |
| `dataset.ts` | 中等 | 构造函数增加格式检测 + 旧→新拆分 + 自动推导 + 展开；新增表级索引 + 查询 API |
| `spark-data.ts` | 小 | 新增 `createTableRelation()` 便利函数 |
| `index.ts` | 小 | 导出新类型 |
| `computed-column-delegate.ts` | 小 | `_createAggregateResolver()` 改查表级索引 |
| `cascade-delegate.ts` | **零改** | 消费展开后的内部扁平结构（视图级索引） |
| `data-view.ts` | **零改** | 同上 |
| `data-table.ts` | **零改** | 同上 |
| 现有 `pagedata.json` | **零改** | 旧 `relations` 继续工作 |
| 测试 | 新增 | 新格式规范化、旧格式兼容、auto-derive、显式覆盖、空数组语义、表级索引聚合 |
| AI 提示词 | 更新 | `copilot-instructions.md` + `system-prompt.txt` 推荐新格式 |

---

## 九、`condition` 预留字段（后续迭代）

当前 `TableRelation` 的 `childField/parentField` 简写只支持单字段等值匹配。`condition` 字段预留给以下高级场景（当前不消费）：

```jsonc
// 复合键
{
  "parentTable": "Regions", "childTable": "Stores",
  "condition": {
    "join": [
      { "childField": "country",  "parentField": "country" },
      { "childField": "province", "parentField": "province" }
    ]
  }
}

// 复合键 + 静态过滤
{
  "parentTable": "Users", "childTable": "Profiles",
  "condition": {
    "join": [{ "childField": "userId", "parentField": "id" }],
    "where": { "field": "status", "op": "==", "value": "active" }
  }
}
```

设计原则：`condition` 内部结构对齐 SQL（`join` → ON 子句，`where` → WHERE 子句），可直接映射后端 SQL，前端内存过滤逐条件求值无需表达式编译。具体结构在需要时再定义。

---

## 十、实施步骤

| 阶段 | 内容 | 风险 |
|------|------|------|
| Phase 1 | `types.ts`：新增 `TableRelation` + `ViewDependency`；`IDataSetMetadata` 增加新字段 | 零（纯类型新增） |
| Phase 2 | `dataset.ts`：格式检测 + 旧→新拆分 + 自动推导 + 展开 + 表级索引 | 中（核心路径） |
| Phase 3 | `computed-column-delegate.ts`：聚合解析器改查表级索引 | 低 |
| Phase 4 | `spark-data.ts` + `index.ts`：公共 API + 导出 | 低 |
| Phase 5 | 测试：新格式 / 旧格式兼容 / auto-derive / 空数组 / 表级索引聚合 | — |
| Phase 6 | AI 提示词更新 | — |
| Phase 7 | （可选）示例页面迁移到新格式 | 低 |
