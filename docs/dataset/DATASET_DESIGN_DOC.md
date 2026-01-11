# DataSet 架构设计文档（第一部分：核心数据层）

> **PageData 1.1 完整解决方案** - 企业级数据管理架构
> 
> 作者：基于 CSDN 系列文章实现  
> 版本：1.1.0  
> 日期：2026-01-09

---

## 📚 目录

1. [架构概览](#架构概览)
2. [核心类型系统](#核心类型系统)
3. [DataTable 数据表](#datatable-数据表)
4. [DataRelation 数据关系](#datarelation-数据关系)
5. [FilterExpression 过滤表达式](#filterexpression-过滤表达式)
6. [BindingContext 绑定上下文](#bindingcontext-绑定上下文)
7. [DataSetManager 管理器](#datasetmanager-管理器)
8. [级联操作系统](#级联操作系统)
9. [依赖分析与智能加载](#依赖分析与智能加载)
10. [观察者模式与事件系统](#观察者模式与事件系统)

---

## 1. 架构概览

### 1.1 设计理念

DataSet 架构采用 **契约驱动 + 观察者模式 + 声明式配置** 的设计：

```
┌─────────────────────────────────────────────────────────────┐
│                     PageData 架构层次                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  UI Layer    │    │  UI Layer    │    │  UI Layer    │  │
│  │  (Rules)     │    │  (Rules)     │    │  (Rules)     │  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
│         │                   │                   │            │
│         └───────────────────┼───────────────────┘            │
│                             ↓                                │
│                    ┌─────────────────┐                       │
│                    │  Subscription   │  观察者模式           │
│                    │    (rebind)     │                       │
│                    └─────────────────┘                       │
│                             ↓                                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           DataSetManager (核心管理器)                 │   │
│  │  • 关系管理 (Relations)                              │   │
│  │  • 级联操作 (Cascade Update/Delete)                  │   │
│  │  • 依赖分析 (Dependency Analysis)                    │   │
│  │  • 智能加载 (Smart Loading)                          │   │
│  │  • 事件通知 (Event System)                           │   │
│  └──────────────────────────────────────────────────────┘   │
│                             ↓                                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              DataSet (数据集)                         │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐     │   │
│  │  │  DataTable │  │  DataTable │  │  DataTable │     │   │
│  │  │   (Users)  │  │  (Orders)  │  │(OrderItems)│     │   │
│  │  └────────────┘  └────────────┘  └────────────┘     │   │
│  │                                                       │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │          DataRelations (关系配置)            │   │   │
│  │  │  • 主从关系 (Master-Detail)                  │   │   │
│  │  │  • 外键映射 (Foreign Key Map)                │   │   │
│  │  │  • 过滤表达式 (FilterExpression)             │   │   │
│  │  │  • 级联规则 (Cascade Rules)                  │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
│                             ↓                                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │        FilterExpressionParser (表达式引擎)           │   │
│  │  • 内存过滤 (toMemoryFilter)                         │   │
│  │  • SQL 生成 (toSQL)                                  │   │
│  │  • MongoDB 查询 (toMongoQuery)                       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 核心特性

| 特性 | 说明 | 优势 |
|------|------|------|
| **契约驱动** | JSON 配置定义关系 | 零代码配置，易维护 |
| **观察者模式** | 订阅-通知机制 | 完全解耦，自动更新 |
| **级联操作** | 递归更新/删除 | 数据一致性保证 |
| **智能加载** | 依赖分析自动加载 | 优化性能，减少请求 |
| **类型安全** | TypeScript 类型系统 | 编译时错误检查 |
| **多上下文** | 一表多视图绑定 | 灵活的 UI 适配 |
| **过滤引擎** | 统一表达式语法 | 跨平台数据查询 |

### 1.3 设计模式应用

```typescript
// 1. 观察者模式（UI 订阅数据变化）
dataSetManager.subscribe('Users', () => {
  rebindRules(); // 数据变化自动更新 UI
});

// 2. 策略模式（FilterExpression 多种解析策略）
FilterExpressionParser.toMemoryFilter(expression);  // 内存过滤
FilterExpressionParser.toSQL(expression);          // SQL 生成
FilterExpressionParser.toMongoQuery(expression);   // MongoDB 查询

// 3. 责任链模式（依赖加载链）
Root Table → Child Table → Grandchild Table
    ↓           ↓               ↓
  Load → Notify → Apply Filter

// 4. 命令模式（CRUD 操作）
dataSet.addRow(tableName, row);
dataSet.updateRow(tableName, index, row);
dataSet.deleteRow(tableName, index);
dataSet.cascadeDelete(tableName, row);
```

---

## 2. 核心类型系统

### 2.1 类型层次结构

```typescript
// 基础类型
DataRow (Record<string, any>)
    ↓
BindingContext (currentRow, selectedRows)
    ↓
DataTable (extends BindingContext)
    ↓
DataSet (tables[], relations[])
```

### 2.2 DataRow - 数据行

```typescript
/**
 * 数据行：键值对结构，代表表中一条记录
 */
export type DataRow<T = any> = Record<string, T>

// 示例
const userRow: DataRow = {
  id: 1,
  name: '张三',
  email: 'zhangsan@example.com',
  age: 28
}
```

**设计要点：**
- 使用泛型支持类型约束
- 动态字段支持（`[key: string]: any`）
- 兼容 JSON 序列化

### 2.3 DataColumn - 列定义

```typescript
export interface DataColumn {
  name: string              // 字段名称，必须唯一
  type: string              // 数据类型：'string' | 'number' | 'date' | 'boolean'
  allowDBNull?: boolean     // 是否允许空值，默认 true
  defaultValue?: any        // 默认值
  isPrimaryKey?: boolean    // 是否主键
  autoIncrement?: boolean   // 是否自增
  caption?: string          // 显示名称（用于 UI）
}
```

**示例配置：**

```json
{
  "columns": [
    {
      "name": "id",
      "type": "number",
      "isPrimaryKey": true,
      "autoIncrement": true,
      "caption": "用户ID"
    },
    {
      "name": "name",
      "type": "string",
      "allowDBNull": false,
      "caption": "姓名"
    },
    {
      "name": "email",
      "type": "string",
      "allowDBNull": false,
      "caption": "邮箱"
    },
    {
      "name": "createdAt",
      "type": "date",
      "defaultValue": "NOW()",
      "caption": "创建时间"
    }
  ]
}
```

---

## 3. DataTable 数据表

### 3.1 类型定义

```typescript
export interface DataTable extends BindingContext {
  tableName: string           // 表名（唯一标识）
  columns: DataColumn[]       // 字段定义列表
  api?: CrudApi               // CRUD 接口组（可选）
  rows: DataRow[]             // 数据行集合
  contexts?: BindingContext[] // 额外上下文（多视图绑定）
  
  // 扩展属性
  loading?: boolean           // 加载状态
  error?: string              // 错误信息
  
  // 分页状态
  pagination?: {
    pageIndex?: number        // 当前页码（从 1 开始）
    pageSize?: number         // 每页大小
    total?: number            // 总记录数
    totalPages?: number       // 总页数
  }
}
```

### 3.2 多上下文机制

**核心概念：** 一个表可以同时绑定多个 UI 组件，每个组件维护独立的选中状态。

```typescript
// 示例：Products 表同时绑定列表、详情和图表
const productsTable: DataTable = {
  tableName: 'Products',
  rows: [...],
  
  // 默认上下文（contextOrder = 0）
  currentRow: null,
  selectedRows: [],
  
  // 额外上下文
  contexts: [
    {
      componentID: 'Products_detail',  // 详情面板
      currentRow: {...},               // 详情展示的当前行
      selectedRows: []
    },
    {
      componentID: 'Products_chart',   // 图表组件
      currentRow: null,
      selectedRows: [...]              // 图表选中的数据
    }
  ]
}
```

**访问路径：**

```typescript
// 默认上下文（contextOrder = 0）
"dataKey": "dataset.tables.Products.currentRow"
"dataKey": "dataset.tables.Products.selectedRows"

// 额外上下文（contextOrder = 1, 2, ...）
"dataKey": "dataset.tables.Products.contexts[0].currentRow"  // 详情
"dataKey": "dataset.tables.Products.contexts[1].selectedRows" // 图表
```

### 3.3 分页支持

```typescript
// 分页配置示例
const table: DataTable = {
  tableName: 'Orders',
  rows: [...], // 所有数据或当前页数据
  pagination: {
    pageIndex: 1,      // 当前第 1 页
    pageSize: 20,      // 每页 20 条
    total: 156,        // 总共 156 条
    totalPages: 8      // 共 8 页
  }
}

// 分页数据访问
"dataKey": "dataset.tables.Orders.pagedRows"  // 当前页数据
```

### 3.4 CRUD API 配置

```typescript
export interface CrudApi {
  create?: HttpEndpoint       // POST /api/users
  retrieve?: HttpEndpoint     // GET /api/users/:id
  update?: HttpEndpoint       // PUT /api/users/:id
  delete?: HttpEndpoint       // DELETE /api/users/:id
  list?: HttpEndpoint & {     // GET /api/users?page=1&size=20
    pagination?: {
      pageParam?: string      // 页码参数名（默认 'page'）
      sizeParam?: string      // 页大小参数名（默认 'size'）
      sortParam?: string      // 排序参数名（默认 'sort'）
    }
  }
  batch?: {
    create?: HttpEndpoint     // POST /api/users/batch
    update?: HttpEndpoint     // PUT /api/users/batch
    delete?: HttpEndpoint     // DELETE /api/users/batch
  }
  import?: HttpEndpoint       // POST /api/users/import
  export?: HttpEndpoint       // GET /api/users/export
}
```

---

## 4. DataRelation 数据关系

### 4.1 类型定义

```typescript
export interface DataRelation {
  parentTable: string             // 父表名
  parentContextId?: string        // 父上下文 ID (推荐)
  parentContextOrder?: number     // 父上下文序号（兼容旧）
  childTable: string              // 子表名
  childContextId?: string         // 子上下文 ID (推荐)
  childContextOrder?: number      // 子上下文序号（兼容旧）
  dependencyType: DependencyType  // 依赖类型
  filterExpression: FilterExpression // 过滤表达式
  cascadeUpdate?: boolean         // 是否级联更新
  cascadeDelete?: boolean         // 是否级联删除
  autoLoad?: boolean              // 是否自动加载（currentRow 依赖）
  relationName?: string           // 关系名称
}
```

### 4.2 依赖类型详解

```typescript
export type DependencyType =
  | 'currentRow'    // 依赖父表的当前选中行（单选）
  | 'selectedRows'  // 依赖父表的批量选中行（多选）
    | 'allRows'       // 依赖父上下文的数据视图 (Context.rows)
#### 4.2.1 currentRow - 主从表模式

**典型场景：** 点击用户时显示该用户的订单列表

```json
{
  "parentTable": "Users",
  "childTable": "Orders",
  "dependencyType": "currentRow",
  "autoLoad": true,
  "filterExpression": {
    "field": "userId",
    "op": "==",
    "value": "$.parentRow.id"
  }
}
```

**工作流程：**

```
1. 用户点击 Users 表第 3 行
   ↓
2. Kernel 自动更新: Users.currentRow = row3
   ↓
3. Kernel 检测到 autoLoad: true
   ↓
4. Kernel 调用: requestTableData('Orders')
   ↓
5. DataLoader 加载: WHERE userId = row3.id
   ↓
6. Kernel 更新: Orders.rows = [...filtered]
   ↓
7. Kernel 通知: notifySubscribers('Orders')
   ↓
8. UI 自动更新（Vue 响应式）
```

#### 4.2.2 selectedRows - 批量关联模式

**典型场景：** 批量选中订单时显示相关的订单明细

```json
{
  "parentTable": "Orders",
  "childTable": "OrderItems",
  "dependencyType": "selectedRows",
  "filterExpression": {
    "field": "orderId",
    "op": "in",
    "value": "$.parentRows[*].id"
  }
}
```

**逻辑：**

```typescript
// 用户选中 3 个订单：[order1, order2, order3]
// 过滤条件自动展开为：
WHERE orderId IN (order1.id, order2.id, order3.id)
```

#### 4.2.3 allRows - 全量依赖模式

**典型场景：** 统计面板依赖所有用户数据

```json
{
  "parentTable": "Users",
  "childTable": "UserStats",
  "dependencyType": "allRows",
  "filterExpression": {
    "func": "aggregate",
    "args": ["COUNT", "$.parentRows[*]"]
  }
}
```

### 4.3 外键映射机制

**自动提取外键映射：**

```typescript
/**
 * 从 FilterExpression 提取外键映射
 * @returns [{ parentField: 'id', childField: 'userId' }]
 */
extractForeignKeyMap(expression: FilterExpression): ForeignKeyPair[]
```

**示例：**

```typescript
// 输入表达式
{
  "type": "and",
  "children": [
    { "field": "userId", "op": "==", "value": "$.parentRow.id" },
    { "field": "status", "op": "==", "value": "active" }
  ]
}

// 提取结果
[
  { parentField: 'id', childField: 'userId' }
]
```

---

## 5. FilterExpression 过滤表达式

### 5.1 表达式类型

```typescript
export type FilterExpression =
  // 1. 单一条件
  | { 
      field: string
      op: FilterOperator
      value: any
    }
  // 2. 逻辑组合（AND / OR）
  | { 
      type: 'and' | 'or'
      children: FilterExpression[]
    }
  // 3. 条件取反
  | { 
      type: '!condition'
      field: string
      op: FilterOperator
      value: any
    }
  // 4. 逻辑取反组合
  | { 
      type: '!and' | '!or'
      children: FilterExpression[]
    }
  // 5. 函数调用
  | { 
      func: string
      args: any[]
    }
```

### 5.2 操作符支持

```typescript
export type FilterOperator =
  // 比较运算符
  | '==' | '!=' | '>' | '>=' | '<' | '<='
  
  // 集合运算符
  | 'in' | 'not in'
  
  // 模糊匹配
  | 'like' | 'not like'
  | 'startsWith' | 'endsWith' | 'contains'
  
  // 空值判断
  | 'is null' | 'is not null'
  
  // 区间运算符
  | 'between' | 'not between'
```

### 5.3 值引用语法

**支持的引用路径：**

```typescript
// 1. 父行字段引用
"$.parentRow.id"           // 父表当前行的 id
"$.parentRow.name"         // 父表当前行的 name

// 2. 父行数组引用（批量选中）
"$.parentRows[*].id"       // 所有父行的 id 数组
"$.parentRows[0].name"     // 第一个父行的 name

// 3. 变量引用
"$.variables.currentUserId" // 上下文变量

// 4. 常量值
"active"                   // 字符串常量
123                        // 数字常量
true                       // 布尔常量
```

### 5.4 复杂表达式示例

#### 示例 1：多条件 AND

```json
{
  "type": "and",
  "children": [
    {
      "field": "userId",
      "op": "==",
      "value": "$.parentRow.id"
    },
    {
      "field": "status",
      "op": "in",
      "value": ["active", "pending"]
    },
    {
      "field": "amount",
      "op": ">=",
      "value": 100
    }
  ]
}
```

**等价 SQL：**

```sql
WHERE userId = :parentRowId
  AND status IN ('active', 'pending')
  AND amount >= 100
```

#### 示例 2：嵌套 OR 和 AND

```json
{
  "type": "and",
  "children": [
    {
      "field": "companyId",
      "op": "==",
      "value": "$.parentRow.id"
    },
    {
      "type": "or",
      "children": [
        { "field": "status", "op": "==", "value": "active" },
        { "field": "isPriority", "op": "==", "value": true }
      ]
    }
  ]
}
```

**等价 SQL：**

```sql
WHERE companyId = :parentRowId
  AND (status = 'active' OR isPriority = true)
```

#### 示例 3：条件取反

```json
{
  "type": "!condition",
  "field": "status",
  "op": "==",
  "value": "deleted"
}
```

**等价 SQL：**

```sql
WHERE NOT (status = 'deleted')
```

### 5.5 FilterExpressionParser API

#### 5.5.1 内存过滤

```typescript
const filterFn = FilterExpressionParser.toMemoryFilter(
  expression,
  { parentRow: currentUser }
);

const filtered = childRows.filter(filterFn);
```

#### 5.5.2 SQL 生成

```typescript
const { sql, params } = FilterExpressionParser.toSQL(
  expression,
  { parentRow: currentUser },
  true  // 参数化查询
);

// 输出
// sql: "WHERE userId = $1 AND status = $2"
// params: [123, 'active']
```

#### 5.5.3 MongoDB 查询

```typescript
const mongoQuery = FilterExpressionParser.toMongoQuery(
  expression,
  { parentRow: currentUser }
);

// 输出
// { userId: 123, status: 'active' }

const results = await db.collection('orders').find(mongoQuery).toArray();
```

---

## 6. BindingContext 绑定上下文

### 6.1 核心概念

**BindingContext** 是 DataTable 的基类，代表一个数据视图的选中状态：

```typescript
export interface BindingContext {
  componentID?: string      // 绑定组件的唯一标识
    currentRow?: DataRow | null // 当前选中行（单选）
    selectedRows?: DataRow[]  // 批量选中行（多选）
    rows?: DataRow[]          // 上下文的数据视图 (主表默认上下文也可能被过滤)
  ```

  ### 6.2 继承关系

  ```
  BindingContext (基类)
      ↓
  DataTable (extends BindingContext)
      ↓
      • 默认上下文（contextOrder = 0 或 'default'）
      • 额外上下文（contexts: Record<string, BindingContext>）
  ```

### 6.3 上下文管理

```typescript
// 获取默认上下文（表本身）
const context = dataSet.getContext('Users');  // contextOrder = 0

// 获取额外上下文
const detailContext = dataSet.getContext('Users', 1);
const chartContext = dataSet.getContext('Users', 2);

// 设置当前行
dataSet.setCurrentRow('Users', userRow);        // 默认上下文
dataSet.setCurrentRow('Users', userRow, 1);     // 详情上下文

// 设置选中行
dataSet.setSelectedRows('Users', [row1, row2]); // 默认上下文
dataSet.setSelectedRows('Users', [row3], 2);    // 图表上下文
```

### 6.4 自动同步机制

**Kernel 自动注入事件处理器：**

```typescript
// DynamicPage.vue 自动为 el-table 注入
{
  "type": "el-table",
  "on": {
    // 内核自动注入（用户无需编写）
    "current-change": (currentRow) => {
      dataSet.setCurrentRow(tableName, currentRow);  // 自动同步
      // 触发：notifySubscribers() → rebindRules() → UI 更新
    },
    "selection-change": (selectedRows) => {
      dataSet.setSelectedRows(tableName, selectedRows);  // 自动同步
    }
  }
}
```

**用户代码：零行！** 所有同步逻辑由内核处理。

---

## 7. DataSetManager 管理器

### 7.1 职责划分

```typescript
export class DataSetManager {
  // 1. 上下文管理
  getTable(tableName: string): DataTable | undefined
  getContext(tableName: string, contextOrder?: number): BindingContext | undefined
  setCurrentRow(tableName: string, row: DataRow, contextOrder?: number): void
  setSelectedRows(tableName: string, rows: DataRow[], contextOrder?: number): void
  
  // 2. 关系管理
  applyRelation(relation: DataRelation): void
  updateRelatedTables(parentTableName: string, contextOrder?: number): void
  refreshAllRelations(): void
  
  // 3. 级联操作
  cascadeUpdate(tableName: string, row: DataRow, oldValues?: DataRow): void
  cascadeDelete(tableName: string, row: DataRow): void
  extractForeignKeyMap(expression: FilterExpression): ForeignKeyPair[]
  
  // 4. CRUD 操作
  addRow(tableName: string, row: DataRow): void
  updateRow(tableName: string, rowIndex: number, row: DataRow): void
  deleteRow(tableName: string, rowIndex: number): void
  
  // 5. 依赖分析
  getTableDependencies(tableName: string): string[]
  getRootDependencies(tableName: string): string[]
  areDependenciesSatisfied(tableName: string): boolean
  
  // 6. 智能加载
  requestTableData(tableName: string): void
  private _requestTableDataAsync(tableName: string): Promise<void>
  private loadTableData(tableName: string): Promise<void>
  
  // 7. 订阅系统
  subscribe(tableName: string, callback: Function): () => void
  notifySubscribers(tableName: string): void
  
  // 8. 事件系统
  on(event: string, listener: Function): void
  off(event: string, listener: Function): void
  emit(event: string, data: any): void
}
```

### 7.2 初始化流程

```typescript
// 1. 创建管理器实例
const dataSet = new DataSetManager(dataSet, dataLoader);

// 2. 自动初始化上下文
dataSet.initializeContexts();
// - 为额外上下文分配 componentID
// - 为关系分配默认 contextOrder

// 3. 自动订阅表（DynamicPage.vue）
dataSet.subscribe('Users', () => rebindRules());
dataSet.subscribe('Orders', () => rebindRules());

// 4. 注册数据加载器（script.js）
dataSet.dataLoader = mockDataLoader;

// 5. 监听事件（可选）
dataSet.on('loadSuccess', ({ tableName }) => {
  console.log(`${tableName} 加载完成`);
});
```

### 7.3 关系应用逻辑

```typescript
/**
 * 应用数据关系
 */
applyRelation(relation: DataRelation): void {
  // 1. 获取父子上下文
  const parentContext = this.getContext(relation.parentTable, relation.parentContextOrder);
  const childTable = this.getTable(relation.childTable);
  const childContext = this.getContext(relation.childTable, relation.childContextOrder);
  
  // 2. 获取父数据范围
  const parentRows = this.getParentRows(parentContext, relation.dependencyType);
  
  // 3. 特殊处理 currentRow + autoLoad
  if (relation.dependencyType === 'currentRow' && relation.autoLoad) {
    this.requestTableData(relation.childTable);
    return;
  }
  
  // 4. 应用过滤表达式
  const filteredRows = this.filterChildRows(
    childTable.rows,
    relation.filterExpression,
    parentRows,
    parentContext
  );
  
  // 5. 更新子上下文 (使用 rows)
  if (childContext) {
      childContext.rows = filteredRows;
  }
  
  // 6. 递归更新子表的子表
  this.updateRelatedTables(relation.childTable, relation.childContextOrder);
}
```

---

## 8. 级联操作系统

### 8.1 cascadeUpdate - 级联更新

**目标：** 父表行更新时，同步更新子表中匹配行的外键字段。

```typescript
/**
 * 级联更新
 * @param tableName 父表名
 * @param row 更新后的行数据
 * @param oldValues 更新前的旧值（用于匹配子行）
 */
cascadeUpdate(tableName: string, row: DataRow, oldValues?: DataRow): void {
  // 1. 查找需要级联更新的关系
  const relations = this.dataSet.relations?.filter(
    rel => rel.parentTable === tableName && rel.cascadeUpdate === true
  );
  
  // 2. 对每个关系进行级联更新
  relations?.forEach(relation => {
    const childTable = this.getTable(relation.childTable);
    const foreignKeyMap = this.extractForeignKeyMap(relation.filterExpression);
    
    // 3. 遍历子表行，更新匹配的外键
    childTable?.rows.forEach(childRow => {
      // 检查是否匹配（基于旧值）
      const matches = foreignKeyMap.every(({ childField, parentField }) => {
        return childRow[childField] === (oldValues?.[parentField] ?? row[parentField]);
      });
      
      if (matches) {
        // 4. 更新外键为新值
        foreignKeyMap.forEach(({ childField, parentField }) => {
          childRow[childField] = row[parentField];
        });
        
        // 5. 递归级联更新子表的子表
        this.cascadeUpdate(relation.childTable, childRow, childRow);
      }
    });
    
    // 6. 通知订阅者
    this.notifySubscribers(relation.childTable);
  });
}
```

**示例场景：**

```typescript
// 用户修改公司名称
const company = { id: 1, name: 'Old Company' };
const newCompany = { id: 1, name: 'New Company' };

dataSet.cascadeUpdate('Companies', newCompany, company);

// 自动级联：
// Companies (id=1) → Departments (companyId=1) → Teams (departmentId=x)
//    更新 name         同步 companyId              同步 departmentId
```

### 8.2 cascadeDelete - 级联删除

**目标：** 父表行删除时，递归删除子表中所有依赖的子行。

```typescript
/**
 * 级联删除
 * @param tableName 父表名
 * @param row 要删除的行数据
 */
cascadeDelete(tableName: string, row: DataRow): void {
  // 1. 查找需要级联删除的关系
  const relations = this.dataSet.relations?.filter(
    rel => rel.parentTable === tableName && rel.cascadeDelete === true
  );
  
  relations?.forEach(relation => {
    const childTable = this.getTable(relation.childTable);
    const foreignKeyMap = this.extractForeignKeyMap(relation.filterExpression);
    
    // 2. 找到所有需要删除的子行
    const rowsToDelete: DataRow[] = [];
    childTable?.rows.forEach(childRow => {
      const matches = foreignKeyMap.every(({ childField, parentField }) => {
        return childRow[childField] === row[parentField];
      });
      
      if (matches) {
        rowsToDelete.push(childRow);
      }
    });
    
    // 3. 递归删除子表的子表（深度优先）
    rowsToDelete.forEach(childRow => {
      this.cascadeDelete(relation.childTable, childRow);
    });
    
    // 4. 删除子行（从后向前，避免索引变化）
    rowsToDelete.forEach(rowToDelete => {
      const index = childTable.rows.indexOf(rowToDelete);
      if (index > -1) {
        childTable.rows.splice(index, 1);  // 触发 Vue 响应式
      }
    });
    
    // 5. 触发事件
    this.emit('cascadeDelete', { 
      parentTable: tableName, 
      childTable: relation.childTable,
      deletedRows: rowsToDelete
    });
  });
  
  // 6. 通知订阅者
  this.notifySubscribers(tableName);
  relations?.forEach(rel => this.notifySubscribers(rel.childTable));
}
```

**删除顺序（深度优先）：**

```
删除 Company(id=1)
    ↓
1. 找到 Departments(companyId=1) → [dept1, dept2]
    ↓
2. 递归删除 dept1 的子表
    ↓ Teams(departmentId=dept1.id) → [team1, team2]
    ↓ 递归删除 team1 的子表
    ↓ Employees(teamId=team1.id) → [emp1, emp2, emp3]
    ↓ 删除 emp1, emp2, emp3
    ↓ 删除 team1
    ↓ 递归删除 team2 的子表...
    ↓ 删除 team2
    ↓ 删除 dept1
3. 递归删除 dept2 的子表...
4. 删除 dept2
5. 完成
```

### 8.3 外键映射提取

```typescript
/**
 * 从 FilterExpression 提取外键映射
 * @returns [{ parentField, childField }]
 */
extractForeignKeyMap(expression: FilterExpression): ForeignKeyPair[] {
  const pairs: ForeignKeyPair[] = [];
  
  const extract = (expr: FilterExpression) => {
    // 单一条件：{ field: 'userId', op: '==', value: '$.parentRow.id' }
    if ('field' in expr && 'value' in expr && typeof expr.value === 'string') {
      const match = expr.value.match(/\$\.parentRow\.(\w+)/);
      if (match) {
        pairs.push({
          childField: expr.field,
          parentField: match[1]
        });
      }
    }
    
    // 递归处理逻辑组合
    if ('children' in expr) {
      expr.children.forEach(child => extract(child));
    }
  };
  
  extract(expression);
  return pairs;
}
```

---

## 9. 依赖分析与智能加载

### 9.1 依赖关系图

```
Users (根表)
  ↓ currentRow
Orders (依赖 Users)
  ↓ currentRow
OrderItems (依赖 Orders)
  ↓ currentRow
ProductDetails (依赖 OrderItems)
```

### 9.2 依赖分析算法

```typescript
/**
 * 获取表的所有父依赖（递归）
 * @returns 父表名称数组（从根到直接父表）
 */
getTableDependencies(tableName: string): string[] {
  const dependencies: string[] = [];
  const visited = new Set<string>();
  
  const findParents = (currentTable: string) => {
    if (visited.has(currentTable)) return;  // 防止循环依赖
    visited.add(currentTable);
    
    // 找到所有以 currentTable 为子表的关系
    const parentRelations = this.dataSet.relations?.filter(
      rel => rel.childTable === currentTable
    ) || [];
    
    parentRelations.forEach(relation => {
      if (!dependencies.includes(relation.parentTable)) {
        findParents(relation.parentTable);  // 递归查找父表的父表
        dependencies.push(relation.parentTable);
      }
    });
  };
  
  findParents(tableName);
  return dependencies;  // ['Users', 'Orders'] for OrderItems
}
```

### 9.3 根表识别

```typescript
/**
 * 获取根依赖表（没有父表的表）
 * @returns 根表名称数组
 */
getRootDependencies(tableName: string): string[] {
  const allDependencies = this.getTableDependencies(tableName);
  
  // 过滤出没有父表的表（根表）
  return allDependencies.filter(depTable => {
    const hasParent = this.dataSet.relations?.some(
      rel => rel.childTable === depTable
    );
    return !hasParent;
  });
}
```

### 9.4 智能加载流程

```typescript
/**
 * 智能请求表数据（非阻塞）
 */
requestTableData(tableName: string): void {
  console.log(`🔍 UI 请求表数据: ${tableName}`);
  this.emit('loadStart', { tableName });
  
  // 异步处理，不阻塞 UI
  this._requestTableDataAsync(tableName).catch(error => {
    console.error(`❌ 加载 ${tableName} 失败:`, error);
    this.emit('loadError', { tableName, error });
  });
}

/**
 * 内部异步请求方法
 */
private async _requestTableDataAsync(tableName: string): Promise<void> {
  const table = this.getTable(tableName);
  
  // 1. 检查表是否已有数据
  if (table && table.rows && table.rows.length > 0) {
    this.notifySubscribers(tableName);
    this.emit('loadSuccess', { tableName });
    return;
  }
  
  // 2. 检查依赖是否满足
  if (this.areDependenciesSatisfied(tableName)) {
    const dependencies = this.getTableDependencies(tableName);
    
    if (dependencies.length === 0) {
      // 根表，直接加载
      await this.loadTableData(tableName);
    } else {
      // 有依赖，应用关系过滤
      this.applyRelationsForTable(tableName);
      this.notifySubscribers(tableName);
    }
    
    this.emit('loadSuccess', { tableName });
    return;
  }
  
  // 3. 依赖不满足，加载根表
  const rootTables = this.getRootDependencies(tableName);
  
  for (const rootTable of rootTables) {
    await this.loadTableData(rootTable);
  }
  
  // 4. 通知依赖已更新（让子表自己决定）
  this.notifyDependencyUpdated(tableName);
}
```

**加载场景示例：**

```typescript
// 场景 1：直接加载根表
dataSet.requestTableData('Users');
// → 立即加载 Users 数据

// 场景 2：加载有依赖的子表
dataSet.requestTableData('Orders');
// → 检查 Users 是否有数据
// → 如果没有，先加载 Users
// → 然后根据 Users.currentRow 过滤 Orders

// 场景 3：加载深层嵌套表
dataSet.requestTableData('OrderItems');
// → 检查依赖链：OrderItems → Orders → Users
// → 加载根表 Users
// → 通知 Orders: 依赖已更新
// → Orders 自动加载
// → 通知 OrderItems: 依赖已更新
// → OrderItems 自动加载
```

---

## 10. 观察者模式与事件系统

### 10.1 订阅机制

```typescript
/**
 * 订阅表数据变化
 * @param tableName 表名
 * @param callback 回调函数（接收更新后的表）
 * @returns 取消订阅函数
 */
subscribe(tableName: string, callback: Function): () => void {
  if (!this.tableSubscribers.has(tableName)) {
    this.tableSubscribers.set(tableName, new Set());
  }
  
  this.tableSubscribers.get(tableName)!.add(callback);
  console.log(`📡 UI 订阅表: ${tableName}`);
  
  // 返回取消订阅函数
  return () => {
    this.tableSubscribers.get(tableName)?.delete(callback);
  };
}

/**
 * 通知订阅者数据变化
 */
notifySubscribers(tableName: string): void {
  const subscribers = this.tableSubscribers.get(tableName);
  if (subscribers && subscribers.size > 0) {
    const table = this.getTable(tableName);
    console.log(`📢 通知 ${subscribers.size} 个订阅者: ${tableName} 数据已更新`);
    subscribers.forEach(callback => callback(table));
  }
}
```

### 10.2 事件类型

```typescript
// DataSetManager 支持的事件
dataSet.on('loadStart', ({ tableName }) => {
  console.log(`开始加载: ${tableName}`);
});

dataSet.on('loadSuccess', ({ tableName }) => {
  console.log(`加载成功: ${tableName}`);
});

dataSet.on('loadError', ({ tableName, error }) => {
  console.error(`加载失败: ${tableName}`, error);
});

dataSet.on('currentRowChanged', ({ tableName, contextOrder, row }) => {
  console.log(`当前行改变: ${tableName}`, row);
});

dataSet.on('selectedRowsChanged', ({ tableName, contextOrder, rows }) => {
  console.log(`选中行改变: ${tableName}`, rows);
});

dataSet.on('cascadeUpdate', ({ parentTable, childTable, updatedRows }) => {
  console.log(`级联更新: ${parentTable} → ${childTable}`);
});

dataSet.on('cascadeDelete', ({ parentTable, childTable, deletedRows }) => {
  console.log(`级联删除: ${parentTable} → ${childTable}`, deletedRows);
});

dataSet.on('dependencyUpdated', ({ tableName }) => {
  console.log(`依赖更新通知: ${tableName}`);
});
```

### 10.3 自动订阅（Kernel）

**DynamicPage.vue 自动处理：**

```typescript
/**
 * 自动订阅所有表（扫描 dataKey）
 */
autoSubscribeTables() {
  const tableNames = this.extractTableNamesFromRules(originalRules.value);
  
  tableNames.forEach(tableName => {
    dataSetManager.subscribe(tableName, () => {
      rebindRules();  // 数据变化自动重绑
    });
  });
}
```

**用户代码：零订阅！** Kernel 自动扫描 `dataKey` 并订阅。

---

## 总结

### 核心设计原则

1. **契约驱动** - JSON 配置定义一切
2. **完全解耦** - UI ↔ Subscription ↔ DataSetManager ↔ Data
3. **零业务代码** - Kernel 自动处理同步和关系
4. **观察者模式** - 数据变化自动通知订阅者
5. **智能加载** - 依赖分析自动加载根表
6. **级联操作** - 递归处理更新和删除
7. **类型安全** - TypeScript 编译时检查

### 技术栈

- **TypeScript** - 类型安全
- **Vue 3** - 响应式系统
- **form-create** - 表单引擎
- **Element Plus** - UI 组件
- **Vite SSR** - 服务端渲染

### 下一部分预告

**第二部分：自引用树架构**
- TreeManager 树管理器
- 扁平化存储 + 懒加载
- 差量补齐机制
- 层级构建算法
- 路径展开与搜索

---

**📄 文档版本：1.0**  
**📅 更新日期：2026-01-09**  
**👨‍💻 基于：PageData 1.1 CSDN 系列文章**

