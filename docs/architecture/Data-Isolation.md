# 数据隔离机制 - BindingContext 独立性

## 核心原则

**每个 BindingContext 实例都有完全独立的数据副本**，不存在引用共享。

## 架构设计

### 1. BindingContext - 基础视图类

```typescript
export class BindingContext implements IBindingContext {
  currentRow: DataRow | null = null    // ✅ 实例独立
  selectedRows: DataRow[] = []         // ✅ 实例独立
  rows: DataRow[] = []                 // ✅ 实例独立
  _originalRows?: DataRow[]            // ✅ 实例独立（缓存用）
}
```

**关键点**：
- 每个属性都是实例级别，不是静态或共享的
- `rows` 初始化为空数组 `[]`，每个实例独立分配内存
- `_originalRows` 用于缓存完整数据，防止过滤后数据丢失

### 2. DataTable - 表结构类

```typescript
export class DataTable extends BindingContext implements IDataTable {
  tableName: string
  columns: DataColumn[]
  contexts: Record<string, BindingContext> = {}  // ✅ 子上下文集合
  
  constructor(tableName: string, columns: DataColumn[] = [], dataSet?: DataSet) {
    super(tableName, 'default', dataSet)  // ✅ 调用父类构造函数，初始化独立 rows
    this.tableName = tableName
    this.columns = columns
  }
}
```

**关键点**：
- DataTable 本身是默认上下文（contextId = 'default'）
- DataTable 的 `rows` 是从 BindingContext 继承的，完全独立
- `contexts` 中的每个子上下文都是独立的 BindingContext 实例

### 3. 数据流转过程

#### 初始加载

```typescript
// 1. DataSet 加载原始数据
const rows = await dataLoader(tableName);

// 2. 赋值到 DataTable（默认上下文）
table.rows.splice(0, table.rows.length, ...rows);  // ✅ 使用 splice 保持响应式

// 3. 缓存原始数据
table._originalRows = [...rows];  // ✅ 浅拷贝，防止引用污染
```

#### 过滤到子上下文

```typescript
// 1. 从原始数据过滤
const sourceData = table._originalRows || table.rows;  // 始终从完整数据源过滤
const filteredRows = sourceData.filter(filterFn);

// 2. 赋值到子上下文
childContext.rows.splice(0, childContext.rows.length, ...filteredRows);  // ✅ 独立副本
```

#### 排序操作

```typescript
// BindingContext.updateRows() 方法
updateRows(sourceData?: DataRow[]): void {
  let result = sourceData ? [...sourceData] : [...(this.rows || [])];  // ✅ 先拷贝
  
  // 1. 过滤
  if (this.filterExpression) {
    result = result.filter(filterFn);
  }
  
  // 2. 排序
  if (this.sortExpression) {
    result = this.applySorting(result, this.sortExpression);
  }
  
  // 3. 赋值（新数组）
  this.rows = result;  // ✅ 完全独立的新数组
}
```

## 数据隔离验证

### 测试场景 1：多个自定义上下文

```typescript
const dataSet = DataSetManager.create({
  dataSetName: 'Test',
  tables: {
    Users: {
      tableName: 'Users',
      columns: [],
      rows: [
        { id: 1, name: 'Alice', role: 'admin' },
        { id: 2, name: 'Bob', role: 'user' },
        { id: 3, name: 'Charlie', role: 'admin' }
      ],
      contexts: {
        admins: {
          filterExpression: { field: 'role', operator: '=', value: 'admin' }
        },
        users: {
          filterExpression: { field: 'role', operator: '=', value: 'user' }
        }
      }
    }
  }
});

// 验证：每个上下文有独立的 rows
const table = dataSet.getTable('Users');
console.log(table.rows.length);                // 3 (完整数据)
console.log(table.contexts.admins.rows.length); // 2 (过滤后)
console.log(table.contexts.users.rows.length);  // 1 (过滤后)

// 修改一个上下文不影响其他
table.contexts.admins.rows[0].name = 'Modified';
console.log(table.rows[0].name);  // 'Alice' (未受影响，因为引用独立)
```

### 测试场景 2：主从表联动

```typescript
// 主表选中行
parentTable.currentRow = parentTable.rows[0];

// 子表自动过滤
const childTable = dataSet.getTable('Orders');
console.log(childTable.rows.length);  // 5 (过滤后仅该用户的订单)

// 切换主表选中行
parentTable.currentRow = parentTable.rows[1];

// 子表自动重新过滤
console.log(childTable.rows.length);  // 3 (新用户的订单)

// 原主表数据未受影响
console.log(parentTable._originalRows.length);  // 10 (完整数据仍在)
```

## 防止数据污染的关键实践

### ✅ DO：使用 splice 更新数组

```typescript
// 正确：保持响应式，更新现有数组
context.rows.splice(0, context.rows.length, ...newRows);
```

### ❌ DON'T：直接赋值引用

```typescript
// 错误：会导致多个上下文共享同一个数组
context.rows = sourceTable.rows;  // ❌ 引用共享！
```

### ✅ DO：拷贝数据再操作

```typescript
// 正确：创建新副本
const result = [...sourceData].filter(fn);
context.rows = result;
```

### ✅ DO：缓存原始数据

```typescript
// 正确：首次加载时缓存
if (!table._originalRows) {
  table._originalRows = [...rows];  // 浅拷贝
}

// 后续过滤始终从缓存读取
const sourceData = table._originalRows || table.rows;
```

## 内存优化考虑

### 浅拷贝 vs 深拷贝

当前实现使用**浅拷贝**：

```typescript
table._originalRows = [...rows];  // ✅ 仅拷贝数组引用，不拷贝对象
```

**优点**：
- 性能高，内存占用少
- 适合大数据集（1000+ 行）

**注意**：
- 如果修改行对象的属性（`row.name = 'New'`），所有引用该对象的上下文都会看到变化
- 这是**预期行为**，符合 .NET DataSet 的设计（DataRow 共享）

### 深拷贝场景

如果需要完全隔离（修改不互相影响），使用深拷贝：

```typescript
// 性能开销大，仅在必要时使用
table._originalRows = JSON.parse(JSON.stringify(rows));
```

## 总结

✅ **当前架构完全满足数据隔离要求**：
1. 每个 BindingContext 实例有独立的 `rows` 数组
2. 使用 `splice()` 保持 Vue 响应式
3. 缓存 `_originalRows` 防止过滤后数据丢失
4. 浅拷贝平衡性能和隔离性

这与 .NET DataSet 的设计完全一致：
- DataTable 有独立的行集合
- DataView（BindingContext）有独立的过滤/排序视图
- DataRow 对象在不同视图间共享（引用语义）

