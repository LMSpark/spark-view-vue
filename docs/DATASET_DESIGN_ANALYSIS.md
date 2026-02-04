# DataSet 设计分析报告

> **分析时间**: 2026-02-04  
> **分析范围**: packages/spark-data 包  
> **核心理念**: 参考 .NET DataSet/DataTable/DataView 的三层架构

---

## 一、架构概览

### 1.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                       SparkData 命名空间                      │
│                    (统一工厂入口 + 类导出)                    │
└─────────────────────────────────────────────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
    ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
    │   DataSet   │   │ TreeManager │   │FilterParser │
    │  (领域层)   │   │  (树管理)   │   │  (工具类)   │
    └─────────────┘   └─────────────┘   └─────────────┘
           │
           │ 包含多个
           ▼
    ┌─────────────┐
    │  DataTable  │
    │  (结构层)   │
    └─────────────┘
           │
           │ 继承自
           ▼
    ┌──────────────┐
    │BindingContext│
    │  (视图层)    │
    └──────────────┘
```

### 1.2 .NET 架构对应关系

| SPARK 模块 | .NET 对应 | 职责 | 层级 |
|-----------|-----------|------|------|
| **DataSet** | System.Data.DataSet | 数据集管理：表集合、关系、事件、订阅 | 领域层 |
| **DataTable** | System.Data.DataTable | 数据表：列定义、API配置、上下文管理 | 结构层 |
| **BindingContext** | System.Windows.Forms.BindingContext + DataView | 数据绑定：选中状态、过滤、排序、分页 | 视图层 |
| **DataSetManager** | 工厂模式 | 静态工厂方法：创建/恢复 DataSet | 工厂层 |
| **SparkData** | 命名空间 API | 统一入口：所有工厂方法 + 类导出 | 入口层 |

---

## 二、核心类设计

### 2.1 BindingContext（视图层）

**位置**: `packages/spark-data/src/bindingContext.ts`

#### 职责

数据绑定上下文，管理单个表格/列表组件的状态：

- **选中状态管理**: currentRow, selectedRows
- **数据视图管理**: rows（过滤/排序后的数据）
- **过滤排序**: filterExpression, sortExpression
- **分页支持**: pagination { pageIndex, pageSize, total }
- **通知机制**: 通过 DataSet 触发订阅者更新

#### 关键属性

```typescript
export class BindingContext implements IBindingContext {
  // 核心状态
  currentRow: DataRow | null = null        // 当前选中行
  selectedRows: DataRow[] = []             // 批量选中行
  rows: DataRow[] = []                     // 视图数据（过滤/排序后）
  _originalRows?: DataRow[]                // 原始完整数据（内部缓存）
  
  // 宿主信息
  _hostTable: string                       // 宿主表名
  _contextId: string                       // 上下文 ID（default/detail/chart...）
  
  // 配置
  filterExpression?: FilterExpression      // 过滤表达式
  sortExpression?: SortExpression          // 排序表达式
  autoSelectFirst?: boolean                // 自动选中第一行
  autoDeselectOnEmpty?: boolean            // 数据清空时自动取消选中
  
  // 分页
  pagination?: { pageIndex, pageSize, total, totalPages }
  
  // 引用
  protected dataSet?: IDataSet             // DataSet 引用（用于通知）
  treeManager?: ITreeManager               // TreeManager 引用（可选）
}
```

#### 核心方法

```typescript
// 选中管理
setCurrentRow(row: DataRow | null, skipNotify?: boolean): void
setSelectedRows(rows: DataRow[], skipNotify?: boolean): void

// 数据更新
updateRows(sourceData: DataRow[]): void  // 重新应用过滤/排序

// 引用管理
setDataSet(dataSet: IDataSet): void
setTreeManager(treeManager: ITreeManager): void
```

#### 设计特点

1. **独立性**: 每个 BindingContext 实例有独立的 rows/currentRow/selectedRows
2. **通知机制**: 通过 DataSet 触发订阅者（级联更新）
3. **双向绑定**: 与 TreeManager 双向绑定（树形数据）

---

### 2.2 DataTable（结构层）

**位置**: `packages/spark-data/src/dataTable.ts`

#### 职责

数据表结构，继承自 BindingContext，代表默认上下文：

- **表结构定义**: tableName, columns
- **API 配置**: CRUD 接口定义
- **多上下文管理**: contexts（多个独立视图）
- **状态扩展**: loading, error

#### 类继承关系

```typescript
export class DataTable extends BindingContext implements IDataTable {
  // 继承自 BindingContext：
  // - rows, currentRow, selectedRows（默认上下文的数据）
  // - filterExpression, sortExpression
  
  // DataTable 特有属性
  tableName: string                        // 表名
  columns: DataColumn[]                    // 列定义
  api?: CrudApi                            // CRUD API 配置
  contexts: Record<string, BindingContext> // 自定义上下文集合
  
  // 扩展属性
  loading?: boolean                        // 加载状态
  error?: string                           // 错误信息
}
```

#### 核心方法

```typescript
// 上下文管理
getOrCreateContext(contextId: string): BindingContext
refreshAllContexts(): void

// 序列化
toPlainObject(): IDataTable
static fromPlainObject(obj: IDataTable): DataTable
```

#### 设计特点

1. **默认上下文**: DataTable 本身就是一个 BindingContext（contextId='default'）
2. **多上下文**: 通过 contexts 支持同一表的多个独立视图
3. **数据隔离**: 每个上下文有独立的 rows/currentRow/selectedRows

#### 上下文架构

```
DataTable (默认上下文 contextId='default')
├── rows: []              ← 默认视图数据
├── currentRow: null      ← 默认选中行
├── selectedRows: []      ← 默认选中集合
└── contexts: {
    detail: BindingContext {
      rows: []            ← detail 视图数据
      currentRow: null    ← detail 选中行
      selectedRows: []    ← detail 选中集合
    },
    chart: BindingContext {
      rows: []            ← chart 视图数据
      selectedRows: []    ← chart 选中集合
    }
}
```

---

### 2.3 DataSet（领域层）

**位置**: `packages/spark-data/src/dataset-impl.ts`

#### 职责

数据集管理器，负责多表数据的协调：

- **表集合管理**: tables（多个 DataTable）
- **关系管理**: relations（主从表关系）
- **事件系统**: eventListeners（数据变化通知）
- **订阅管理**: contextSubscribers（上下文级别订阅）
- **依赖加载**: 自动处理表依赖（级联加载）
- **CRUD 操作**: addRow, updateRow, deleteRow, cascadeUpdate, cascadeDelete

#### 关键属性

```typescript
export class DataSet implements IDataSet {
  dataSetName: string                      // DataSet 名称
  tables: Record<string, DataTable>        // 表集合
  relations?: DataRelation[]               // 表关系
  version?: number                         // 版本号
  pageId?: string                          // 页面 ID
  autoLoadRelations?: boolean              // 自动加载关联表
  
  // 内部状态
  private eventListeners: Map              // 事件监听器
  private contextSubscribers: Map          // 上下文订阅管理
  private loadingTables: Set               // 正在加载的表
  dataLoader?: (tableName) => Promise      // 数据加载器
}
```

#### 核心方法

```typescript
// 表操作
getTable(tableName: string): DataTable | undefined
getContext(tableName: string, contextId?: string): BindingContext | undefined

// CRUD
addRow(tableName: string, row: DataRow): boolean
updateRow(tableName: string, rowIndex: number, row: DataRow): boolean
deleteRow(tableName: string, rowIndex: number): boolean

// 级联操作
cascadeUpdate(tableName: string, oldRow: DataRow, newRow: DataRow): void
cascadeDelete(tableName: string, deletedRow: DataRow): void

// 数据加载
requestTableData(tableName: string): void
private loadTableData(tableName: string): Promise<void>

// 订阅管理
subscribeToContext(
  listenerTable: string,
  listenerContextId: string,
  sourceTable: string,
  sourceContextId: string,
  callback: (data) => void
): void

// 事件系统
addEventListener(event: string, callback: Function): void
removeEventListener(event: string, callback: Function): void
notifyContextChange(tableName: string, contextId: string, data: any): void
```

#### 数据流核心逻辑

##### 1. 数据加载流程

```typescript
requestTableData(tableName: string): void
  ↓
_requestTableDataAsync(tableName: string): Promise<void>
  ↓
loadTableData(tableName: string): Promise<void>
  ↓ (调用外部 dataLoader)
rows = await this.dataLoader(tableName)
  ↓ (写入默认上下文)
table.rows.splice(0, table.rows.length, ...rows)
  ↓ (缓存原始数据)
table._originalRows = [...rows]
  ↓ (自动选中第一行)
if (table.autoSelectFirst && rows.length > 0) {
  table.setCurrentRow(rows[0], false)  // 触发级联
}
  ↓ (触发订阅者)
this.notifyContextChange(tableName, 'default', table)
```

##### 2. 上下文订阅流程

```
用户操作表格（如选中行）
  ↓
触发 el-table 事件（currentChange）
  ↓
injectTableEvents 中的事件处理器
  ↓
context.setCurrentRow(row, skipNotify=true)
  ↓
通知 DataSet：dataSet.notifyContextChange(tableName, contextId, context)
  ↓
查找订阅者：contextSubscribers.get(`${tableName}.${contextId}`)
  ↓
执行订阅回调：callback(context)
  ↓
更新订阅者的过滤条件
  ↓
重新过滤数据：updateContextRows(subscriberContext, subscriberTable)
  ↓
UI 自动更新（Vue 响应式）
```

##### 3. 级联更新/删除流程

```
cascadeUpdate(tableName, oldRow, newRow)
  ↓
遍历 relations（找依赖此表的关系）
  ↓
获取子表：childTable = this.getTable(relation.childTable)
  ↓
更新子表中匹配的行（外键字段）
  ↓
通知子表变化：notifyContextChange(childTable, 'default', childTable)
```

---

### 2.4 DataSetManager（工厂层）

**位置**: `packages/spark-data/src/dataSetManager.ts`

#### 职责

静态工厂类，提供便捷的创建方法：

```typescript
export class DataSetManager {
  /**
   * 创建 DataSet 实例
   */
  static create(
    config: IDataSet,
    dataLoader?: (tableName: string) => Promise<DataRow[]>
  ): DataSet

  /**
   * 从 JSON 恢复 DataSet
   */
  static fromJSON(
    json: string,
    dataLoader?: (tableName: string) => Promise<DataRow[]>
  ): DataSet
}
```

#### 向后兼容

支持旧代码使用 `DataSetManager.create()` 而非直接 `new DataSet()`。

---

### 2.5 SparkData 命名空间（入口层）

**位置**: `packages/spark-data/src/spark-data-namespace.ts`

#### 职责

统一 API 入口，提供优雅的命名空间 API：

```typescript
export const SparkData = {
  // DataSet 工厂
  createDataSet(config, dataLoader?): DataSet
  fromJSON(json, dataLoader?): DataSet
  
  // TreeManager 工厂
  createTreeManager(config, initialNodes?, bindingContext?): TreeManager
  treeFromJSON(json, bindingContext?): TreeManager
  
  // BindingContext 工厂
  createContext(hostTable, contextId?, dataSet?): BindingContext
  
  // 工具类
  createFilterParser(): FilterExpressionParser
  
  // 类导出（用于高级场景）
  classes: {
    DataSet,
    DataTable,
    BindingContext,
    TreeManager,
    FilterExpressionParser
  }
}
```

#### 使用方式对比

```typescript
// 方式 1：命名空间 API（推荐）
import { SparkData } from '@spark-view/spark-data'
const dataSet = SparkData.createDataSet({ ... })

// 方式 2：工厂类（向后兼容）
import { DataSetManager } from '@spark-view/spark-data'
const dataSet = DataSetManager.create({ ... })

// 方式 3：直接构造（高级场景）
import { DataSet } from '@spark-view/spark-data'
const dataSet = new DataSet({ ... })
```

---

## 三、数据路径系统（DataKey）

### 3.1 路径规范

#### 默认上下文（最常用）

| 路径 | 说明 | 使用场景 |
|------|------|----------|
| `dataset.tables.Users.rows` | 视图数据（过滤/分页后） | el-table 主数据源 |
| `dataset.tables.Users.currentRow` | 当前选中行 | 显示详情、编辑表单 |
| `dataset.tables.Users.selectedRows` | 批量选中行 | 批量操作、统计信息 |
| `dataset.tables.Users._originalRows` | 原始完整数据 | ⚠️ 内部使用，不推荐 UI 绑定 |

#### 自定义上下文

| 路径 | 说明 | 使用场景 |
|------|------|----------|
| `dataset.tables.Users.contexts.detail.rows` | detail 上下文的视图数据 | 独立的详情表格 |
| `dataset.tables.Users.contexts.detail.currentRow` | detail 上下文的当前行 | 详情视图的选中行 |
| `dataset.tables.Users.contexts.chart.selectedRows` | chart 上下文的选中行 | 图表筛选数据源 |

#### 表元数据

| 路径 | 说明 | 使用场景 |
|------|------|----------|
| `dataset.tables.Users.tableName` | 表名 | 标题显示 |
| `dataset.tables.Users.columns` | 列定义 | 动态列配置 |
| `dataset.tables.Users.loading` | 加载状态 | 显示 loading |
| `dataset.tables.Users.error` | 错误信息 | 错误提示 |

### 3.2 路径解析（Renderer 层）

**位置**: `packages/spark-renderer/src/utils/bindRules.ts`

#### el-table 绑定

```typescript
// 支持两种方式：
// 1. 通过 DataSet 绑定（推荐）
if (newRule.type === 'el-table' && newRule.dataKey) {
  const keys = newRule.dataKey.split('.')
  let value = pageData
  for (const key of keys) {
    value = value?.[key]
  }
  if (value !== undefined) {
    newRule.props.data = value
  }
  
  // 如果有 DataSet，注入事件处理
  if (dataSet) {
    injectTableEvents(newRule, dataSet, formApi)
  }
}
```

#### 普通元素文本绑定

```typescript
// 支持任意元素（div, span, p...）
if (newRule.dataKey && newRule.type !== 'el-table') {
  const keys = newRule.dataKey.split('.')
  let value = pageData
  for (const key of keys) {
    value = value?.[key]
  }
  if (value !== undefined && value !== null) {
    newRule.children = [String(value)]
  }
}
```

---

## 四、关键设计模式

### 4.1 继承关系

```
BindingContext (视图层)
    ↑
    │ extends
    │
DataTable (结构层)
```

**优势**：
- DataTable 本身就是一个 BindingContext（默认上下文）
- 代码复用：选中管理、过滤排序逻辑继承自 BindingContext
- 统一接口：所有上下文（默认/自定义）都是 BindingContext 实例

### 4.2 组合模式

DataTable 包含多个 BindingContext：

```typescript
class DataTable extends BindingContext {
  contexts: Record<string, BindingContext> = {}
}
```

**优势**：
- 同一表的多个独立视图
- 每个视图有独立的选中状态
- 互不干扰，各自触发业务逻辑

### 4.3 观察者模式

DataSet 实现发布-订阅机制：

```typescript
class DataSet {
  private contextSubscribers: Map<string, Array<{
    listenerTable: string
    listenerContextId: string
    callback: Function
  }>>
  
  subscribeToContext(...)  // 订阅
  notifyContextChange(...)  // 通知
}
```

**优势**：
- 上下文变化自动通知订阅者
- 支持主从表级联（父表选中 → 子表过滤）
- 解耦：订阅者不需要知道发布者的实现

### 4.4 工厂模式

多层工厂封装：

```
SparkData (命名空间 API)
    ↓
DataSetManager (静态工厂)
    ↓
new DataSet() (构造器)
```

**优势**：
- 统一入口：SparkData.createDataSet()
- 向后兼容：DataSetManager.create()
- 灵活性：直接 new DataSet() 用于高级场景

---

## 五、数据流完整示例

### 5.1 主从表级联场景

#### 配置定义

```json
{
  "dataSet": {
    "dataSetName": "MasterDetail",
    "tables": {
      "Users": {
        "tableName": "Users",
        "columns": [
          { "name": "id", "type": "number" },
          { "name": "name", "type": "string" }
        ],
        "rows": []
      },
      "Orders": {
        "tableName": "Orders",
        "columns": [
          { "name": "id", "type": "number" },
          { "name": "userId", "type": "number" },
          { "name": "product", "type": "string" }
        ],
        "rows": [],
        "contexts": {
          "default": {
            "filterExpression": {
              "dependency": {
                "sourceTable": "Users",
                "sourceContext": "default",
                "type": "currentRow"
              },
              "field": "userId",
              "operator": "==",
              "valuePath": "id"
            }
          }
        }
      }
    },
    "relations": [
      {
        "parentTable": "Users",
        "childTable": "Orders",
        "parentColumn": "id",
        "childColumn": "userId",
        "type": "one-to-many"
      }
    ]
  }
}
```

#### UI 配置

```json
{
  "type": "div",
  "children": [
    {
      "type": "el-table",
      "dataKey": "dataset.tables.Users.rows",
      "props": { "highlightCurrentRow": true }
    },
    {
      "type": "el-table",
      "dataKey": "dataset.tables.Orders.rows",
      "props": { "border": true }
    }
  ]
}
```

#### 执行流程

```
1. 页面初始化
   ↓
   加载 Users 表数据（requestTableData('Users')）
   ↓
   加载 Orders 表数据（requestTableData('Orders')）
   ↓
   建立订阅关系（Orders.default 订阅 Users.default.currentRow）

2. 用户点击 Users 表格第一行（userId=1）
   ↓
   触发 el-table currentChange 事件
   ↓
   调用：Users.setCurrentRow({ id: 1, name: 'Alice' }, skipNotify=true)
   ↓
   通知 DataSet：dataSet.notifyContextChange('Users', 'default', ...)
   ↓
   查找订阅者：找到 Orders.default
   ↓
   执行过滤：Orders.rows = Orders._originalRows.filter(r => r.userId === 1)
   ↓
   UI 自动更新（Vue 响应式）
   ↓
   Orders 表格显示该用户的订单
```

### 5.2 多上下文场景

#### 配置定义

```json
{
  "dataSet": {
    "tables": {
      "Products": {
        "tableName": "Products",
        "rows": [...],
        "contexts": {
          "detail": {
            "filterExpression": {
              "field": "status",
              "operator": "==",
              "value": "active"
            }
          },
          "chart": {
            "sortExpression": {
              "field": "price",
              "direction": "desc"
            }
          }
        }
      }
    }
  }
}
```

#### UI 配置

```json
{
  "type": "div",
  "children": [
    {
      "type": "el-table",
      "dataKey": "dataset.tables.Products.rows",
      "comment": "默认上下文：显示所有产品"
    },
    {
      "type": "el-table",
      "dataKey": "dataset.tables.Products.contexts.detail.rows",
      "comment": "detail 上下文：只显示 active 产品"
    },
    {
      "type": "div",
      "dataKey": "dataset.tables.Products.currentRow.name",
      "children": [""],
      "comment": "默认上下文的选中行"
    },
    {
      "type": "div",
      "dataKey": "dataset.tables.Products.contexts.detail.currentRow.name",
      "children": [""],
      "comment": "detail 上下文的选中行"
    }
  ]
}
```

#### 特点

- 两个表格显示同一份数据（Products）
- 各自维护独立的 currentRow / selectedRows
- 互不干扰，各自触发不同的业务逻辑
- 默认上下文显示全部，detail 上下文只显示过滤后的数据

---

## 六、优势与特点

### 6.1 设计优势

1. **分层清晰**：
   - 视图层（BindingContext）：选中状态、过滤排序
   - 结构层（DataTable）：表定义、多上下文管理
   - 领域层（DataSet）：多表协调、关系管理、事件系统

2. **数据隔离**：
   - 每个 BindingContext 有独立的 rows/currentRow/selectedRows
   - 同一表的多个上下文互不干扰
   - 支持复杂的多视图场景

3. **自动级联**：
   - 主从表自动联动（父表选中 → 子表过滤）
   - 级联更新/删除（父表修改 → 子表同步）
   - 订阅机制解耦（发布者无需知道订阅者）

4. **灵活扩展**：
   - 支持自定义过滤表达式（字段、依赖、逻辑运算）
   - 支持自定义排序表达式（单字段/多字段）
   - 支持树形数据（TreeManager）

5. **Vue 响应式集成**：
   - rows/currentRow/selectedRows 都是响应式对象
   - 数据变化自动触发 UI 更新
   - 无需手动 forceUpdate

### 6.2 技术特点

1. **TypeScript 全覆盖**：
   - 所有接口/类型定义完整
   - 编译时类型检查
   - 良好的 IDE 智能提示

2. **同时支持 .ts 和 .js**：
   - 编译输出 .js + .d.ts
   - 支持纯 JS 项目
   - 类型定义可选

3. **命名空间 API**：
   - 统一入口：SparkData.*
   - 优雅的工厂方法
   - 向后兼容旧 API

4. **序列化支持**：
   - toPlainObject() / fromPlainObject()
   - JSON 序列化/反序列化
   - 支持状态持久化

---

## 七、存在的问题与改进建议

### 7.1 当前问题

#### 问题 1：命名不一致

**现象**：
- `_originalRows` 是私有内部字段，但使用单下划线
- `_hostTable` / `_contextId` 同样使用单下划线
- TypeScript 应使用 `private` 关键字 + 双下划线

**影响**：
- 容易误用（外部代码可能直接访问）
- 类型系统无法阻止访问

**建议**：
```typescript
// 改为
private __originalRows?: DataRow[]
private __hostTable: string
private __contextId: string
```

#### 问题 2：循环依赖风险

**现象**：
- BindingContext 引用 DataSet
- DataSet 包含 DataTable
- DataTable 继承 BindingContext

**影响**：
- 可能导致类型推导循环
- 序列化时需要特殊处理

**建议**：
- 使用前向声明（已部分实现）
- 考虑引入中介者模式

#### 问题 3：订阅管理复杂度高

**现象**：
- contextSubscribers 使用 Map 管理
- 键格式：`"tableName.contextId"`
- 手动管理订阅/取消订阅

**影响**：
- 容易出现内存泄漏（未取消订阅）
- 订阅关系不透明（难以调试）

**建议**：
- 引入专门的 SubscriptionManager 类
- 自动清理机制（组件卸载时）
- 订阅关系可视化工具

#### 问题 4：过滤表达式解析性能

**现象**：
- 每次过滤都重新解析表达式
- 未缓存解析结果
- 复杂表达式性能开销大

**建议**：
- 缓存解析后的函数
- 使用 memoization 优化
- 考虑编译为 WebAssembly（极端场景）

#### 问题 5：缺少批量操作优化

**现象**：
- addRow/updateRow/deleteRow 逐行操作
- 每次操作都触发通知
- 批量导入性能差

**建议**：
```typescript
// 添加批量方法
addRows(tableName: string, rows: DataRow[]): boolean
updateRows(tableName: string, updates: Array<{rowIndex, row}>): boolean
deleteRows(tableName: string, rowIndexes: number[]): boolean

// 批量模式（暂停通知）
beginBatch(): void
endBatch(): void  // 一次性触发通知
```

### 7.2 文档缺失

#### 缺失内容

1. **数据流时序图**：
   - 缺少详细的交互时序图
   - 难以理解异步加载流程

2. **错误处理指南**：
   - 加载失败如何处理？
   - 过滤表达式错误如何捕获？
   - 订阅回调异常如何处理？

3. **性能调优指南**：
   - 大数据量场景的优化建议
   - 虚拟滚动集成方案
   - 内存优化技巧

4. **迁移指南**：
   - 从旧 API 迁移到 SparkData 命名空间
   - 版本升级注意事项

### 7.3 测试覆盖

#### 当前状态

- ✅ 单元测试：基本覆盖（tests/spark-data-namespace.test.ts）
- ⚠️ 集成测试：不足
- ❌ 性能测试：缺失
- ❌ 压力测试：缺失

#### 建议补充

```typescript
// 集成测试
describe('Master-Detail Cascade', () => {
  it('should filter child table when parent row changes', async () => {
    // ...
  })
})

// 性能测试
describe('Performance', () => {
  it('should handle 10k rows efficiently', () => {
    // ...
  })
})

// 压力测试
describe('Stress Test', () => {
  it('should survive 100 concurrent updates', async () => {
    // ...
  })
})
```

---

## 八、总结

### 8.1 核心价值

SPARK DataSet 提供了一套**完整的数据管理解决方案**，灵感来自 .NET 的成熟架构：

1. **分层清晰**：视图层 → 结构层 → 领域层
2. **数据隔离**：多上下文支持，各自独立
3. **自动级联**：主从表联动，订阅机制
4. **灵活扩展**：过滤/排序/分页/树形数据

### 8.2 适用场景

- ✅ 复杂的主从表场景（多层级联）
- ✅ 同一数据的多视图展示（列表/详情/图表）
- ✅ 需要离线编辑/批量提交的表单
- ✅ 树形数据管理（组织架构/菜单树）
- ⚠️ 简单的静态表格（过度设计）
- ❌ 实时流数据（未优化）

### 8.3 下一步行动

#### 短期（1-2 周）

1. 修复命名不一致（私有字段使用 private）
2. 补充集成测试（主从表级联场景）
3. 添加错误处理指南文档

#### 中期（1-2 月）

1. 实现批量操作优化（beginBatch/endBatch）
2. 引入 SubscriptionManager（解耦订阅管理）
3. 性能测试与优化（大数据量场景）

#### 长期（3+ 月）

1. 可视化调试工具（订阅关系图）
2. 虚拟滚动集成方案
3. WebAssembly 编译器（过滤表达式）

---

**分析完成时间**: 2026-02-04  
**下一步**: 根据本分析制定重构计划
