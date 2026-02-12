# DataSet 架构深度梳理方案

## 🔴 当前架构的混乱点

### 1. **接口定义混乱**

#### 问题现状
```typescript
// ❌ IDataSet 既是数据接口又是运行时接口
export interface IDataSet {
  dataSetName: string
  tables: Record<string, IDataTable>  // ❌ IDataTable 是运行时接口
  relations?: DataRelation[]
  
  // ❌ 混合了运行时方法
  updateRelatedTables(tableName: string, contextId?: string): void
  subscribe(tableName: string, contextId: string, callback: () => void): () => void
}
```

**核心问题**：
- `IDataSet` 既用于配置（构造函数参数）
- 又定义了运行时方法（updateRelatedTables, subscribe）
- `tables: Record<string, IDataTable>` 要求运行时实例，但构造函数接收的是数据

### 2. **构造函数设计混乱**

```typescript
// ❌ 当前设计
constructor(config: IDataSet, dataLoader?: ...) {
  // config.tables 是 Record<string, IDataTable>（运行时接口）
  // 但实际传入的是数据对象
  Object.entries(config.tables).forEach(([tableName, tableData]) => {
    const table = DataTable.fromPlainObject({
      ...tableData,  // ❌ tableData 类型是 IDataTable，但这里当数据用
      tableName
    })
  })
}
```

**核心问题**：
- 类型声明说 `tables` 是 `IDataTable`（带方法）
- 实际使用时当作 `IDataTableData`（纯数据）
- TypeScript 类型系统完全被破坏

### 3. **序列化/反序列化不对称**

```typescript
// ❌ 命名和设计不对称
toJSON(): string                    // 返回字符串
fromJSON(json: string): DataSet     // 接收字符串

// ❌ 但内部逻辑
toPlainObject(): IDataTableData     // 转换为数据对象
fromPlainObject(data: IDataTable): DataTable  // 接收错误类型
```

### 4. **类型系统缺失**

缺少关键的数据配置接口：
- ❌ 没有 `IDataSetConfig`（构造配置）
- ❌ 没有 `IDataSetData`（序列化数据）
- ❌ `IDataSet` 混合了两者的职责

---

## ✅ 重构方案：清晰的三层架构

### **架构原则**

```
┌──────────────────────────────────────────────────┐
│   数据层 (Data)    - 纯数据结构，可序列化        │
│   ↓                                               │
│   配置层 (Config)  - 构造配置，扩展数据+元信息    │
│   ↓                                               │
│   运行时层 (Runtime) - 类实例，包含方法和状态    │
└──────────────────────────────────────────────────┘
```

### **新类型系统**

```typescript
// ==================== 1. 数据层（序列化） ====================

/**
 * DataSet 数据接口（纯数据，用于序列化）
 * 
 * 用途：JSON 序列化、网络传输、存储
 * 特征：只包含数据字段，无方法
 */
export interface IDataSetData {
  dataSetName: string
  tables: Record<string, IDataTableData>  // ✅ 纯数据表
  relations?: DataRelation[]
  version?: number
  pageId?: string
}

// ==================== 2. 配置层（构造） ====================

/**
 * DataSet 配置接口（用于构造函数）
 * 
 * 用途：创建 DataSet 实例时的配置
 * 特征：扩展数据层，增加可选的运行时配置
 */
export interface IDataSetConfig extends IDataSetData {
  autoLoadRelations?: boolean
  dataLoader?: (tableName: string) => Promise<IDataRow[]>
}

// ==================== 3. 运行时层（实例） ====================

/**
 * DataSet 运行时接口（包含方法）
 * 
 * 用途：运行时操作的接口定义
 * 特征：包含运行时方法和状态管理
 */
export interface IDataSet extends IDataSetData {
  // 覆盖为运行时类型
  tables: Record<string, IDataTable>  // ✅ 运行时表实例
  
  // 运行时方法
  getTable(tableName: string): IDataTable | undefined
  updateRelatedTables(tableName: string, contextId?: string): void
  notifySubscribers(tableName: string, contextId?: string): void
  
  // 事件系统
  subscribe(tableName: string, contextId: string, callback: () => void): () => void
  on(event: string, handler: EventCallback): void
  off(event: string, handler: EventCallback): void
  emit(event: string, data: unknown): void
  
  // 序列化
  toData(): IDataSetData
  toJSON(): string
}
```

### **DataSet 类重构**

```typescript
export class DataSet implements IDataSet {
  // ==================== 构造函数 ====================
  
  /**
   * ✅ 接收配置接口（数据+可选运行时配置）
   */
  constructor(config: IDataSetConfig) {
    this.dataSetName = config.dataSetName
    this.dataLoader = config.dataLoader
    this.autoLoadRelations = config.autoLoadRelations
    
    // ✅ 将数据表转换为运行时实例
    this.tables = {}
    Object.entries(config.tables).forEach(([tableName, tableData]) => {
      this.tables[tableName] = DataTable.fromData(tableData, this)
    })
    
    this.relations = config.relations
    this.version = config.version
    this.pageId = config.pageId
  }
  
  // ==================== 序列化方法（重命名） ====================
  
  /**
   * ✅ 转换为纯数据对象
   */
  toData(): IDataSetData {
    const tables: Record<string, IDataTableData> = {}
    Object.entries(this.tables).forEach(([name, table]) => {
      tables[name] = table.toData()  // ✅ 统一命名
    })
    
    return {
      dataSetName: this.dataSetName,
      tables,
      relations: this.relations,
      version: this.version,
      pageId: this.pageId
    }
  }
  
  /**
   * ✅ 序列化为 JSON 字符串
   */
  toJSON(): string {
    return JSON.stringify(this.toData(), null, 2)
  }
  
  /**
   * ✅ 从数据对象创建（替代 fromPlainObject）
   */
  static fromData(data: IDataSetData, dataLoader?: ...): DataSet {
    return new DataSet({
      ...data,
      dataLoader
    })
  }
  
  /**
   * ✅ 从 JSON 字符串创建
   */
  static fromJSON(json: string, dataLoader?: ...): DataSet {
    const data = JSON.parse(json) as IDataSetData
    return DataSet.fromData(data, dataLoader)
  }
}
```

### **DataTable 类重构**

```typescript
export class DataTable extends BindingContext implements IDataTable {
  constructor(
    tableName: string,
    columns: DataColumn[] = [],
    dataSet?: IDataSet
  ) {
    super(tableName, 'default', dataSet)
    this.tableName = tableName
    this.columns = columns
  }
  
  // ==================== 序列化方法（统一命名） ====================
  
  /**
   * ✅ 转换为纯数据对象（重命名 toPlainObject → toData）
   */
  toData(): IDataTableData {
    return {
      tableName: this.tableName,
      columns: this.columns,
      api: this.api,
      rows: this.rows,
      originalRows: this.originalRows,
      contexts: this.contextsToData(),
      // BindingContext 字段
      currentRow: this.currentRow,
      selectedRows: this.selectedRows,
      hostTable: this.hostTable,
      contextId: this.contextId,
      filterExpression: this.filterExpression,
      sortExpression: this.sortExpression,
      pagination: this.pagination,
      // 扩展字段
      loading: this.loading,
      error: this.error
    }
  }
  
  private contextsToData(): Record<string, IBindingContextData> {
    const result: Record<string, IBindingContextData> = {}
    Object.entries(this.contexts).forEach(([id, ctx]) => {
      result[id] = ctx.toData()
    })
    return result
  }
  
  /**
   * ✅ 从数据对象创建（重命名 fromPlainObject → fromData）
   */
  static fromData(data: IDataTableData, dataSet?: IDataSet): DataTable {
    const table = new DataTable(data.tableName, data.columns, dataSet)
    
    // 基本字段
    table.api = data.api
    table.currentRow = data.currentRow ?? null
    table.selectedRows = data.selectedRows ?? []
    table.rows = data.rows ?? []
    table['__originalRows'] = data.originalRows
    table.filterExpression = data.filterExpression
    table.sortExpression = data.sortExpression
    table.pagination = data.pagination
    table.loading = data.loading
    table.error = data.error
    
    // 转换上下文
    if (data.contexts) {
      Object.entries(data.contexts).forEach(([contextId, contextData]) => {
        table.contexts[contextId] = BindingContext.fromData(
          contextData,
          table.tableName,
          contextId,
          dataSet
        )
      })
    }
    
    return table
  }
}
```

### **BindingContext 类重构**

```typescript
export class BindingContext implements IBindingContext {
  // ... 现有代码 ...
  
  /**
   * ✅ 转换为纯数据对象
   */
  toData(): IBindingContextData {
    return {
      currentRow: this.currentRow,
      selectedRows: this.selectedRows,
      rows: this.rows,
      originalRows: this.originalRows,
      hostTable: this.hostTable,
      contextId: this.contextId,
      filterExpression: this.filterExpression,
      sortExpression: this.sortExpression,
      pagination: this.pagination
    }
  }
  
  /**
   * ✅ 从数据对象创建
   */
  static fromData(
    data: IBindingContextData,
    hostTable: string,
    contextId: string,
    dataSet?: IDataSet
  ): BindingContext {
    const context = new BindingContext(hostTable, contextId, dataSet)
    context.currentRow = data.currentRow ?? null
    context.selectedRows = data.selectedRows ?? []
    context.rows = data.rows ?? []
    context['__originalRows'] = data.originalRows
    context.filterExpression = data.filterExpression
    context.sortExpression = data.sortExpression
    context.pagination = data.pagination
    return context
  }
}
```

---

## 🔄 迁移步骤

### **步骤 1：添加新类型（向后兼容）**

1. 在 `types.ts` 中添加 `IDataSetData` 和 `IDataSetConfig`
2. 保留现有 `IDataSet`，标记为 deprecated

### **步骤 2：添加新方法（并存）**

1. DataSet 添加 `toData()` / `fromData()` - 保留 `toPlainObject()` / `fromPlainObject()`
2. DataTable 添加 `toData()` / `fromData()` - 保留旧方法
3. BindingContext 添加 `toData()` / `fromData()`

### **步骤 3：更新命名空间**

```typescript
export const SparkData = {
  createDataSet: (config: IDataSetConfig): DataSet => {
    return new DataSet(config)  // ✅ 类型正确
  },
  
  createDataSetFromData: (data: IDataSetData, dataLoader?: ...): DataSet => {
    return DataSet.fromData(data, dataLoader)
  },
  
  // 保留向后兼容（标记废弃）
  fromJSON: (json: string, dataLoader?: ...): DataSet => {
    return DataSet.fromJSON(json, dataLoader)
  }
}
```

### **步骤 4：更新调用方**

1. 搜索所有 `new DataSet()` 调用
2. 搜索所有 `toPlainObject()` / `fromPlainObject()` 调用
3. 逐步迁移到新 API

### **步骤 5：移除旧代码**

1. 移除 deprecated 标记的方法
2. 更新 IDataSet 接口定义
3. 清理文档

---

## 📊 对比总结

| 方面 | ❌ 当前设计 | ✅ 重构后 |
|------|-----------|----------|
| **类型系统** | IDataSet 混合数据+方法 | IDataSetData(数据) + IDataSet(运行时) |
| **构造函数** | 接收 IDataSet（类型错误） | 接收 IDataSetConfig（类型正确） |
| **序列化** | toPlainObject 命名不一致 | toData 统一命名 |
| **反序列化** | fromPlainObject 类型错误 | fromData 类型正确 |
| **类型安全** | 类型断言到处都是 | 完全类型安全 |
| **可维护性** | 概念混乱，难以理解 | 三层清晰，职责分明 |

---

## 🎯 重构收益

1. **类型安全**：消除所有类型断言和 `as` 转换
2. **清晰架构**：数据层、配置层、运行时层职责分明
3. **易于维护**：命名统一，概念清晰
4. **向后兼容**：渐进式迁移，不破坏现有代码
5. **更好的 IDE 支持**：类型推断准确，自动补全完整
