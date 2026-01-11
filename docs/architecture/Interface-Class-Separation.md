# 完全重构：接口与类分离

## 重构目标

彻底分离接口和实现：
- **接口（I开头）**：纯数据结构，仅属性，用于序列化
- **类**：实现接口 + 包含方法逻辑

## 架构设计

### 1. 接口层（纯数据结构）

```typescript
// IBindingContext - 纯属性接口
export interface IBindingContext {
  currentRow?: DataRow | null
  selectedRows?: DataRow[]
  rows?: DataRow[]
  _originalRows?: DataRow[]
  _hostTable?: string
  _contextId?: string
  filterExpression?: FilterExpression
  sortExpression?: SortExpression
  pagination?: { ... }
}

// IDataTable - 纯属性接口
export interface IDataTable extends IBindingContext {
  tableName: string
  columns: DataColumn[]
  api?: CrudApi
  rows: DataRow[]
  contexts?: Record<string, IBindingContext>
  loading?: boolean
  error?: string
}

// IDataSet - 纯属性接口
export interface IDataSet {
  dataSetName: string
  tables: Record<string, IDataTable>
  relations?: DataRelation[]
  version?: number
  pageId?: string
  autoLoadRelations?: boolean
}
```

### 2. 类实现（接口 + 方法）

```typescript
// BindingContext 类
export class BindingContext implements IBindingContext {
  // 实现 IBindingContext 的所有属性
  currentRow: DataRow | null = null
  selectedRows: DataRow[] = []
  rows: DataRow[] = []
  // ...
  
  // Manager 引用
  protected manager?: IDataSetManager
  
  // 方法
  setCurrentRow(row: DataRow | null, skipNotify?: boolean): void
  setSelectedRows(rows: DataRow[]): void
  notifyChange(): void
  setManager(manager: IDataSetManager): void
  
  // 序列化
  toJSON(): IBindingContext
  static fromJSON(data: IBindingContext, ...): BindingContext
}

// DataTable 类
export class DataTable extends BindingContext implements IDataTable {
  tableName: string
  columns: DataColumn[]
  contexts: Record<string, BindingContext> = {}
  // ...
  
  // 方法
  getOrCreateContext(contextId: string): BindingContext
  toPlainObject(): IDataTable
  static fromPlainObject(data: IDataTable, ...): DataTable
}

// DataSet 类
export class DataSet implements IDataSet {
  dataSetName: string
  tables: Record<string, DataTable>  // 注意：运行时是类实例
  relations?: DataRelation[]
  // ...
  
  // CRUD 方法
  getTable(tableName: string): DataTable | undefined
  addRow(tableName: string, row: DataRow): boolean
  updateRow(...): boolean
  deleteRow(...): boolean
  
  // 级联操作
  cascadeUpdate(...): string[]
  cascadeDelete(...): string[]
  
  // 序列化
  toJSON(): string
  static fromJSON(json: string): DataSet
}
```

## 关键设计决策

### 1. 接口只包含属性

**目的**：用于序列化/反序列化和类型标注

```typescript
// ✅ 正确：接口只有属性
export interface IBindingContext {
  currentRow?: DataRow | null
  selectedRows?: DataRow[]
  // 没有方法
}

// ❌ 错误：接口包含方法
export interface IBindingContext {
  currentRow?: DataRow | null
  setCurrentRow?: (...) => void  // 不应该在接口中
}
```

### 2. 类实现接口并添加方法

**目的**：封装行为，运行时执行逻辑

```typescript
export class BindingContext implements IBindingContext {
  // 实现接口属性
  currentRow: DataRow | null = null
  
  // 添加方法
  setCurrentRow(row: DataRow | null): void {
    this.currentRow = row
    if (this.manager) {
      this.dataSet.notifySubscribers(...)
    }
  }
}
```

### 3. 向后兼容的旧接口

保留旧的 `BindingContext`、`DataTable`、`DataSet` 接口，但标记为 `@deprecated`：

```typescript
/**
 * @deprecated 使用 IBindingContext 代替
 */
export interface BindingContext extends IBindingContext {
  setCurrentRow?: (row: DataRow | null, skipNotify?: boolean) => void
  setSelectedRows?: (rows: DataRow[]) => void
  notifyChange?: () => void
}
```

这样现有代码可以继续使用 `BindingContext` 类型，不会报错。

### 4. 序列化方法重命名

- `toJSON()` → `toPlainObject()` - 返回纯对象（接口类型）
- `fromJSON()` → `fromPlainObject()` - 从纯对象创建类实例

**原因**：更明确表达"转换为普通对象"的语义

```typescript
class DataTable {
  // 转换为纯接口对象
  toPlainObject(): IDataTable {
    return {
      tableName: this.tableName,
      columns: this.columns,
      // ... 只包含属性，不包含方法
    }
  }
  
  // 从纯对象创建类实例
  static fromPlainObject(data: IDataTable): DataTable {
    const table = new DataTable(data.tableName, data.columns)
    // ...
    return table
  }
}
```

## 文件结构

```
src/
├── types/
│   └── pageData.ts          # 接口定义（IBindingContext, IDataTable, IDataSet）
├── models/
│   ├── BindingContext.ts    # BindingContext 类
│   └── DataTable.ts         # DataTable 类
└── utils/
    ├── dataSet.ts           # DataSet 类
    └── dataSetManager.ts    # DataSetManager（协调器）
```

## 使用示例

### 序列化（保存到文件）

```typescript
const dataSet = new DataSet(config)

// 转换为纯对象
const tables: Record<string, IDataTable> = {}
Object.entries(dataSet.tables).forEach(([name, table]) => {
  tables[name] = table.toPlainObject()  // 类 → 接口
})

const json = JSON.stringify({
  dataSetName: dataSet.dataSetName,
  tables,  // 纯对象，可序列化
  relations: dataSet.relations
})
```

### 反序列化（从文件加载）

```typescript
const data: IDataSet = JSON.parse(json)

// 创建类实例
const dataSet = new DataSet(data)  // 自动转换 IDataTable → DataTable 类

// 现在可以调用方法
dataSet.addRow('Users', { id: 1, name: 'Alice' })
dataSet.cascadeDelete('Users', row)
```

### DataSetManager 集成

```typescript
// 接受接口类型配置
const dataSet = new DataSetManager(pageData.dataset)

// 内部自动转换为类实例
// dataSet.dataSet.tables['Users'] 是 DataTable 类实例，有方法
dataSet.getTable('Users')?.getOrCreateContext('detail')
```

## 重构收益

### ✅ 1. 类型安全

```typescript
// 接口：用于类型标注
function saveToFile(data: IDataSet): void {
  // data 是纯对象，可序列化
}

// 类：用于运行时逻辑
function processData(dataSet: DataSet): void {
  dataSet.addRow('Users', { ... })  // 可以调用方法
}
```

### ✅ 2. 清晰的职责分离

- **接口**：数据契约（DTO - Data Transfer Object）
- **类**：业务逻辑（Service/Domain Model）

### ✅ 3. 更好的 IDE 支持

```typescript
const context: BindingContext  // 类类型
context.setCurrentRow(row)     // IDE 自动补全方法

const data: IBindingContext    // 接口类型
data.currentRow = row          // IDE 只显示属性
```

### ✅ 4. 方法内置，无需注入

```typescript
// 重构前：需要 DataSetManager 注入方法
context.setCurrentRow = (row) => { ... }  // ❌ 运行时注入

// 重构后：方法内置在类中
context.setCurrentRow(row)  // ✅ 直接调用
```

### ✅ 5. 简化 DataSetManager

```typescript
// 重构前：需要 injectMethodsToContext() 方法（~50行）
private injectMethodsToContext(context: BindingContext): void {
  context.setCurrentRow = (row) => { ... }
  context.setSelectedRows = (rows) => { ... }
  context.notifyChange = () => { ... }
}

// 重构后：只需设置 manager 引用
table.setManager(this)  // ✅ 1行代码
```

## 总结

### 架构原则

```
接口 = 纯属性              ✅ 用于序列化
类 = 接口 + 方法            ✅ 用于逻辑
方法内置在类中              ✅ 简洁
```

### 核心优势

1. **接口与实现分离**：接口用于数据传输，类用于业务逻辑
2. **方法内置**：不再需要运行时注入，代码更简洁
3. **类型安全**：编译时检查方法存在性
4. **更好的封装**：数据+行为封装在类中

这是一个符合 OOP 原则的清晰架构！


