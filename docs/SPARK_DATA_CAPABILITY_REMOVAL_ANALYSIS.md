# spark-data 包能力体系移除分析报告

## 1. 当前能力体系使用情况

### 1.1 实现 ICapabilityContext 的类

| 类 | ICapabilityContext 字段 | 提供的能力 |
|---|---|---|
| **DataSet** | id, type, parent, capabilities | `DATA_SET` (包含 dataSet 实例) |
| **DataTable** | id, type, parent, capabilities | `DATA_TABLE` (tableName, columns, api, crudConfig)<br>`FIELD_METADATA` (列元数据) |
| **DataView** | id, type, parent, capabilities | `DATA_VIEW` (rows, currentRow, selectedRows 等)<br>`DATA_EVENTS` (数据变更事件) |

### 1.2 parent 链结构

```
DataSet (根)
  └── parent: undefined
      │
      ├── DataTable
      │     └── parent: DataSet
      │           │
      │           └── DataView (default)
      │                 └── parent: DataTable
      │
      └── DataTable
            └── parent: DataSet
```

### 1.3 能力查找使用场景

#### DataView 中的 lookup 使用（3 处）

**场景 1: `requestData()` - 获取 DataSet 进行关系查询**
```typescript
// 文件：data-view.ts:247
const dsCap = lookup<{ dataSet: IDataSetRelationCap }>(this, DATA_SET)
const ds = dsCap?.dataSet
if (!ds) { this.requestState = RequestState.Idle; return }

// 用途：
const parents = ds.getParentRelations(this.tableName, this.viewId)
const pView = ds.getView(rel.parentTable, rel.parentViewId ?? 'default')
```

**场景 2: `setupCascade()` - 获取 DataSet 建立级联订阅**
```typescript
// 文件：data-view.ts:616
const dsCap = lookup<{ dataSet: IDataSetRelationCap }>(this, DATA_SET)
if (!dsCap) return
const ds = dsCap.dataSet
const parentRels = ds.getParentRelations(this.tableName, this.viewId)
```

**场景 3: `initializeCrudService()` - 获取 DataTable 的 api 配置**
```typescript
// 文件：data-view.ts:678
const cap = lookup<IDataTableCapability>(this.parent, DATA_TABLE)
if (cap?.api) {
  this.crudService = createCrudService(cap.api)
}
```

**场景 4: `getCrudConfig()` - 获取 CRUD 操作配置**
```typescript
// 文件：data-view.ts:687
return lookup<IDataTableCapability>(this.parent, DATA_TABLE)?.crudConfig
```

#### 能力提供使用（5 处）

```typescript
// DataSet.constructor
setCapability(this, DATA_SET, { dataSet: this })

// DataTable.constructor
setCapability(this, DATA_TABLE, {
  get tableName() { return table.tableName },
  get columns() { return table.columns },
  get api() { return table.api },
  get crudConfig() { return table.crudConfig },
})

setCapability(this, FIELD_METADATA, {
  get tableName() { return table.tableName },
  getColumns: () => table.columns,
  getColumn: (name: string) => table.columns.find(c => c.name === name),
  getPrimaryKey: () => table.columns.find(c => c.isPrimaryKey)?.name,
})

// DataView.constructor
setCapability(this, DATA_VIEW, {
  tableName: this.tableName,
  viewId: this.viewId,
  get rows() { return view.rows },
  // ... 其他属性和方法
})

setCapability(this, DATA_EVENTS, this.dataEvents)
```

### 1.4 外部依赖情况

**检查结果：无外部直接依赖**
- `packages/spark-renderer` - 未使用 `consume(DATA_*)`
- `features/**/*.vue` - 未使用 `consume(DATA_*)`

**外部仅依赖类实例：**
- 外部通过 `dataSet.getView()` 获取 DataView 实例
- 外部直接访问 `dataView.rows`、`dataView.currentRow` 等属性
- 不依赖能力系统的 `lookup`

## 2. 能力体系的作用分析

### 2.1 实际作用

1. **向上查找 DataSet**
   - DataView 通过 `lookup(this, DATA_SET)` 获取 DataSet
   - 用途：获取关系配置（`getParentRelations`）、获取父视图（`getView`）

2. **向上查找 DataTable**
   - DataView 通过 `lookup(this.parent, DATA_TABLE)` 获取 DataTable 配置
   - 用途：获取 API 配置、CRUD 配置

3. **能力门面模式**
   - 提供受控的 API 访问接口（不直接暴露类实例）
   - 限制外部访问范围

### 2.2 过度设计分析

**问题：**
1. **lookup 开销**：每次都要沿 parent 链向上遍历查找
2. **间接性**：本可以直接引用，却通过能力系统间接访问
3. **复杂性**：引入额外的抽象层（ICapabilityContext、capabilities Map）
4. **无实际需求**：外部不使用能力系统，只在内部使用

**为什么过度设计：**
- DataView 只需要访问 DataTable 和 DataSet
- 可以直接持有引用，无需能力查找
- 能力门面模式在此场景无价值（外部不通过能力系统访问）

## 3. 移除方案

### 3.1 直接引用替代

#### 方案 A：构造函数注入（推荐）

```typescript
export class DataView {
  // 移除 ICapabilityContext 字段
  // parent?: ICapabilityContext
  // capabilities = new Map<CapabilityName, unknown>()
  
  // 添加直接引用
  private dataTable!: DataTable  // 由 DataTable 设置
  
  // getter 访问 DataSet
  private getDataSet(): DataSet | undefined {
    return this.dataTable?.dataSet
  }
  
  // 原 lookup(this, DATA_SET) 替换为
  const ds = this.getDataSet()
  
  // 原 lookup(this.parent, DATA_TABLE) 替换为
  const api = this.dataTable?.api
  const crudConfig = this.dataTable?.crudConfig
}

export class DataTable {
  // 移除 ICapabilityContext 字段
  // parent?: ICapabilityContext
  // capabilities = new Map<CapabilityName, unknown>()
  
  // 添加直接引用
  dataSet!: DataSet  // 由 DataSet 设置
  
  setDataSet(ds: DataSet): void {
    this.dataSet = ds
    // 设置所有视图的引用
    for (const view of Object.values(this.views)) {
      view.dataTable = this
      view.setupCascade()
    }
  }
}

export class DataSet {
  // 移除 ICapabilityContext 字段
  // parent?: ICapabilityContext
  // capabilities = new Map<CapabilityName, unknown>()
  
  // 无需修改其他逻辑
}
```

#### 方案 B：保留 parent（类型改为具体类）

```typescript
export class DataView {
  parent?: DataTable  // 改为具体类型
  // 移除 capabilities Map
  
  // 原 lookup(this, DATA_SET) 替换为
  const ds = this.parent?.dataSet
  
  // 原 lookup(this.parent, DATA_TABLE) 替换为
  const api = this.parent?.api
}

export class DataTable {
  parent?: DataSet  // 改为具体类型
  // 移除 capabilities Map
}
```

### 3.2 能力提供的替代

#### 原：通过能力系统暴露
```typescript
setCapability(this, DATA_VIEW, {
  get rows() { return view.rows },
  // ...
})
```

#### 新：直接暴露实例或通过 getter
```typescript
// 外部直接访问
dataView.rows
dataView.currentRow

// 或提供只读接口（可选）
interface IDataView {
  readonly rows: IDataRow[]
  readonly currentRow: IDataRow | null
  // ...
}
```

### 3.3 移除步骤

#### 第 1 步：移除 ICapabilityContext 实现

**DataSet (dataset.ts)**
```diff
- import { DATA_SET, provide as setCapability } from '@spark-view/spark-utils'
- import type { CapabilityName, ICapabilityContext } from '@spark-view/spark-utils'

- export class DataSet implements ICapabilityContext {
+ export class DataSet {
-   // ===== ICapabilityContext =====
-   id: string
-   readonly type = 'dataset'
-   parent?: ICapabilityContext
-   capabilities = new Map<CapabilityName, unknown>()

    // 构造函数
    constructor(config: {...}) {
      this.dataSetName = config.dataSetName
-     this.id = `ds:${config.dataSetName}`
-     setCapability(this, DATA_SET, { dataSet: this })
      
      // 构建表实例...
    }
}
```

**DataTable (data-table.ts)**
```diff
- import { DATA_TABLE, FIELD_METADATA, provide as setCapability } from '@spark-view/spark-utils'
- import type { CapabilityName, ICapabilityContext, IFieldMetadataCapability, IColumnMeta } from '@spark-view/spark-utils'

- export class DataTable implements ICapabilityContext {
+ export class DataTable {
-   // ===== ICapabilityContext =====
-   id: string
-   readonly type = 'datatable'
-   parent?: ICapabilityContext
-   capabilities = new Map<CapabilityName, unknown>()
+   dataSet!: DataSet  // 直接引用

    constructor(tableName: string, columns: DataColumn[] = []) {
      this.tableName = tableName
-     this.id = `dt:${tableName}`
      this.columns = columns
-     setCapability(this, DATA_TABLE, {...})
-     setCapability(this, FIELD_METADATA, {...})
    }

-   setDataSet(ds: ICapabilityContext): void {
+   setDataSet(ds: DataSet): void {
-     this.parent = ds
+     this.dataSet = ds
      for (const view of Object.values(this.views)) {
-       view.parent = this
+       view.dataTable = this
        view.setupCascade()
      }
    }
}
```

**DataView (data-view.ts)**
```diff
- import { provide as setCapability, lookup, ... } from '@spark-view/spark-utils'
- import type { CapabilityName, ICapabilityContext, ... } from '@spark-view/spark-utils'

- export class DataView implements ICapabilityContext {
+ export class DataView {
-   // ── ICapabilityContext ──
-   id: string
-   readonly type = 'dataview'
-   parent?: ICapabilityContext
-   capabilities = new Map<CapabilityName, unknown>()
+   private dataTable!: DataTable  // 直接引用

    constructor(tableName: string, viewId: string = 'default') {
      this.tableName = tableName
      this.viewId = viewId
-     this.id = `dv:${tableName}:${viewId}`
-     setCapability(this, DATA_VIEW, {...})
-     setCapability(this, DATA_EVENTS, this.dataEvents)
    }
    
+   /** 获取 DataSet（向上访问） */
+   private getDataSet(): DataSet | undefined {
+     return this.dataTable?.dataSet
+   }
}
```

#### 第 2 步：替换 lookup 调用

**requestData() - 获取 DataSet**
```diff
  async requestData(): Promise<void> {
-   const dsCap = lookup<{ dataSet: IDataSetRelationCap }>(this, DATA_SET)
-   const ds = dsCap?.dataSet
+   const ds = this.getDataSet()
    if (!ds) { this.requestState = RequestState.Idle; return }
```

**setupCascade() - 获取 DataSet**
```diff
  setupCascade(): void {
    this.teardownCascade()
-   const dsCap = lookup<{ dataSet: IDataSetRelationCap }>(this, DATA_SET)
-   if (!dsCap) return
-   const ds = dsCap.dataSet
+   const ds = this.getDataSet()
+   if (!ds) return
```

**initializeCrudService() - 获取 DataTable api**
```diff
  private initializeCrudService(): void {
-   if (!this.parent) return
-   const cap = lookup<IDataTableCapability>(this.parent, DATA_TABLE)
-   if (cap?.api) {
-     this.crudService = createCrudService(cap.api)
-   }
+   if (!this.dataTable?.api) return
+   this.crudService = createCrudService(this.dataTable.api)
  }
```

**getCrudConfig() - 获取 CRUD 配置**
```diff
  private getCrudConfig(): CrudOperationConfig | undefined {
-   if (!this.parent) return undefined
-   return lookup<IDataTableCapability>(this.parent, DATA_TABLE)?.crudConfig
+   return this.dataTable?.crudConfig
  }
```

#### 第 3 步：清理能力导入

```diff
- import { 
-   Logger, DATA_VIEW, DATA_SET, DATA_TABLE, DATA_EVENTS,
-   provide as setCapability, lookup, createEventEmitter,
- } from '@spark-view/spark-utils'
+ import { Logger, createEventEmitter } from '@spark-view/spark-utils'
- import type { CapabilityName, ICapabilityContext, IEventEmitter } from '@spark-view/spark-utils'
+ import type { IEventEmitter } from '@spark-view/spark-utils'
```

## 4. 影响评估

### 4.1 性能影响

**正面影响：**
- ✅ 移除 lookup 遍历开销（每次 lookup 都要沿 parent 链查找）
- ✅ 移除 capabilities Map 内存开销
- ✅ 直接引用访问更快（O(1) vs O(n)）

**负面影响：**
- ❌ 无（外部不依赖能力系统）

### 4.2 兼容性影响

**破坏性变更：**
- ✅ 无（外部不使用 ICapabilityContext、lookup、DATA_* 能力）
- ✅ 外部仅通过类实例访问（dataView.rows 等），无变化

**内部变更：**
- ⚠️ DataSet、DataTable、DataView 不再实现 ICapabilityContext
- ⚠️ 移除 id、type、parent、capabilities 字段
- ⚠️ DataView 添加 dataTable 引用字段

### 4.3 代码简化程度

**减少代码：**
- `-50 行`：移除 ICapabilityContext 接口实现（3 个类 × 约 15 行）
- `-20 行`：移除 setCapability 调用（5 处能力注册）
- `-10 行`：移除导入和类型声明

**增加代码：**
- `+5 行`：添加直接引用字段（dataTable, dataSet）
- `+3 行`：添加 getDataSet() 辅助方法

**净减少：约 72 行**

### 4.4 可维护性影响

**正面影响：**
- ✅ 更直观的依赖关系（直接引用 vs 能力查找）
- ✅ 更少的抽象层次（移除能力系统间接层）
- ✅ 更简单的类型系统（具体类型 vs ICapabilityContext）
- ✅ 更容易调试（直接 `.dataSet` vs `lookup(this, DATA_SET)?.dataSet`）

**负面影响：**
- ❌ 无

## 5. 推荐方案

### 推荐：方案 A（构造函数注入 + 直接引用）

**理由：**
1. ✅ 完全移除能力体系，简化代码
2. ✅ 性能提升（移除 lookup 开销）
3. ✅ 无破坏性变更（外部不依赖能力系统）
4. ✅ 代码更直观易维护
5. ✅ 类型系统更简单（具体类型）

**不推荐保留能力体系**：
- ❌ 外部不使用，仅内部使用
- ❌ 可以用更简单的直接引用替代
- ❌ 增加不必要的抽象层次

## 6. 实施计划

### 阶段 1：移除 ICapabilityContext（核心变更）
- [ ] DataSet 移除 ICapabilityContext 实现
- [ ] DataTable 移除 ICapabilityContext 实现，添加 dataSet 字段
- [ ] DataView 移除 ICapabilityContext 实现，添加 dataTable 字段

### 阶段 2：替换 lookup 调用
- [ ] 替换 DataView.requestData() 中的 lookup
- [ ] 替换 DataView.setupCascade() 中的 lookup
- [ ] 替换 DataView.initializeCrudService() 中的 lookup
- [ ] 替换 DataView.getCrudConfig() 中的 lookup

### 阶段 3：清理能力导入
- [ ] 移除 DATA_SET、DATA_TABLE、DATA_VIEW、DATA_EVENTS 导入
- [ ] 移除 provide as setCapability 导入
- [ ] 移除 lookup 导入
- [ ] 移除 CapabilityName、ICapabilityContext 类型导入

### 阶段 4：测试验证
- [ ] 运行 `pnpm run typecheck`（预期 0 错误）
- [ ] 运行 `pnpm run test`（预期 153 passed）
- [ ] 功能测试：数据加载、级联关系、CRUD 操作

### 阶段 5：提交
- [ ] Commit: `refactor(spark-data): remove capability system - use direct references`

## 7. 风险评估

### 低风险 ✅
- 外部无依赖，仅内部重构
- 类型检查和测试覆盖充分
- 逻辑等价替换（lookup → 直接引用）

### 无风险
- 外部 API 不变（dataView.rows 等直接访问保持不变）
- 功能行为不变（仅实现方式变更）
