# SPARK Data API 文档

## SparkData 命名空间

### 概览

`SparkData` 是数据空间的统一入口，提供优雅的工厂方法来创建数据管理对象。

```typescript
import { SparkData } from '@spark-view/spark-data'
```

---

## API Reference

### DataSet 管理

#### `SparkData.createDataSet(config)`

创建 DataSet 实例

**参数：**
- `config: IDataSet` - DataSet 配置

**返回：** `DataSet`

**示例：**
```typescript
const dataSet = SparkData.createDataSet({
  dataSetName: 'MyApp',
  tables: {
    Users: {
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'number', isPrimaryKey: true },
        { name: 'name', type: 'string' },
        { name: 'email', type: 'string' }
      ],
      rows: [
        { id: 1, name: 'Alice', email: 'alice@example.com' },
        { id: 2, name: 'Bob', email: 'bob@example.com' }
      ]
    }
  },
  // 数据关系配置
  relations: [
    {
      parentTable: 'Departments',
      parentViewId: 'deptGrid',
      childTable: 'Users',
      childViewId: 'userGrid',
      dependencyType: 'currentRow',
      filterExpression: {
        field: 'departmentId',
        op: '==',
        value: { func: 'parentRow.id', args: [] }
      },
      autoLoad: true,
      cascadeDelete: true,
      relationName: 'dept-users'
    }
  ]
})
```

---

### 数据关系管理

#### DataRelation 配置

DataRelation 定义父子视图之间的依赖关系，支持级联操作和动态过滤。

**接口定义：**
```typescript
interface DataRelation {
  parentTable: string             // 父表名（数据源标识）
  parentViewId?: string           // 父视图 ID（默认 'default'）
  
  childTable: string              // 子表名（数据源标识）
  childViewId?: string            // 子视图 ID（默认 'default'）
  
  dependencyType: DependencyType  // 依赖类型：'currentRow' | 'selectedRows' | 'allRows' | 'pagedRows'
  filterExpression: FilterExpression // 过滤表达式，定义如何从父上下文过滤子上下文
  cascadeUpdate?: boolean         // 是否级联更新
  cascadeDelete?: boolean         // 是否级联删除
  autoLoad?: boolean              // 是否自动加载子表数据
  relationName?: string           // 关系名称，便于引用
}
```

**依赖类型 (DependencyType)：**
- `'currentRow'` - 依赖父上下文的当前行
- `'selectedRows'` - 依赖父上下文的选中行
- `'allRows'` - 依赖父上下文的全部行
- `'pagedRows'` - 依赖父上下文的分页行

**过滤表达式 (FilterExpression)：**
```typescript
type FilterExpression =
  // 单一条件
  | { field: string; op: FilterOperator; value: unknown }
  // 逻辑组合
  | { type: 'and' | 'or'; children: FilterExpression[] }
  // 函数调用
  | { func: string; args: unknown[] }
```

**示例：**
```typescript
// 部门-用户主从关系
{
  parentTable: 'Departments',
  parentViewId: 'deptGrid',
  childTable: 'Users',
  childViewId: 'userGrid',
  dependencyType: 'currentRow',
  filterExpression: {
    field: 'departmentId',
    op: '==',
    value: { func: 'parentRow.id', args: [] }
  },
  autoLoad: true,
  cascadeDelete: true,
  relationName: 'dept-users'
}

// 订单-订单明细关系
{
  parentTable: 'Orders',
  childTable: 'OrderDetails',
  dependencyType: 'selectedRows',
  filterExpression: {
    type: 'and',
    children: [
      { field: 'orderId', op: 'in', value: { func: 'parentRows.ids', args: [] } },
      { field: 'status', op: '!=', value: 'cancelled' }
    ]
  },
  autoLoad: false
}
```

#### `SparkData.fromJSON(json)`

从 JSON 字符串恢复 DataSet

**参数：**
- `json: string` - JSON 字符串

**返回：** `DataSet`

**示例：**
```typescript
const jsonString = '{"dataSetName":"MyApp","tables":{...}}'
const dataSet = SparkData.fromJSON(jsonString)
```

---

### TreeManager 管理

#### `SparkData.createTreeManager(config, initialNodes?)`

创建 TreeManager 实例，用于管理树形数据结构

**参数：**
- `config: TreeConfig` - 树配置
- `initialNodes?: FlatTreeNode[]` - 初始节点数组

**返回：** `TreeManager`

**示例：**
```typescript
// 基本使用
const treeManager = SparkData.createTreeManager({
  idField: 'id',
  parentIdField: 'parentId',
  textField: 'name',
  lazy: true
})

// 带初始数据
const treeManager = SparkData.createTreeManager(
  { idField: 'id', parentIdField: 'parentId' },
  [
    { id: 1, parentId: null, name: 'Root' },
    { id: 2, parentId: 1, name: 'Child 1' },
    { id: 3, parentId: 1, name: 'Child 2' }
  ]
)
```

---

### DataView 管理

#### `SparkData.createDataView(config)`

创建 DataView 实例，用于数据绑定和视图管理

**参数：**
- `config.tableName: string` - 表名
- `config.viewId?: string` - 视图 ID（默认：'default'）

**返回：** `DataView`

**示例：**
```typescript
// 基本使用
const view = SparkData.createDataView({ tableName: 'Users' })

// 指定上下文 ID
const detailView = SparkData.createDataView({ tableName: 'Orders', viewId: 'detail' })
```

---

---

## 高级用法

### 直接访问类构造器

如果需要更多控制，可以直接访问类：

```typescript
import { SparkData } from '@spark-view/spark-data'

// 使用构造器
const dataSet = new (await import('@spark-view/spark-data')).DataSet({ ... })
```

### 向后兼容的导入方式

```typescript
import { DataSet, TreeManager } from '@spark-view/spark-data'

// 直接使用类
const tree = new TreeManager({ ... })
```

---

## 最佳实践

### 1. 使用命名空间 API

**推荐：**
```typescript
import { SparkData } from '@spark-view/spark-data'
const dataSet = SparkData.createDataSet({ ... })
```

**不推荐：**
```typescript
import { DataSetManager } from '@spark-view/spark-data'
const dataSet = DataSetManager.create({ ... })
```

### 2. 组合使用 DataSet 和 TreeManager

```typescript
// 创建 DataSet
const dataSet = SparkData.createDataSet({
  dataSetName: 'OrgData',
  tables: {
    Departments: {
      tableName: 'Departments',
      columns: [
        { name: 'id', type: 'number' },
        { name: 'parentId', type: 'number' },
        { name: 'name', type: 'string' }
      ],
      rows: []
    }
  }
})

// 创建 DataView
const dataView = SparkData.createDataView({ tableName: 'Departments' })

// 创建 TreeManager 并关联
const treeManager = SparkData.createTreeManager(
  { idField: 'id', parentIdField: 'parentId' },
  dataSet.getTable('Departments')?.rows || []
)

// 双向绑定
dataView.setTreeManager(treeManager)
```

### 3. 使用数据加载器

```typescript
const dataSet = SparkData.createDataSet(
  { dataSetName: 'MyApp', tables: { ... } }
)

// 通过 DataView.requestData() 加载表数据
const view = SparkData.createDataView({ tableName: 'Users' })
await view.requestData()
```

---

## 类型定义

所有类型都可以从包中导入：

```typescript
import type {
  IDataSet,
  IDataRow,
  DataColumn,
  TreeConfig,
  FlatTreeNode,
  FilterExpression,
  CrudApi,
  ITableMetadata,
  IViewMetadata
} from '@spark-view/spark-data'
```

---

## DataKey 统一数据绑定键

### 概览

DataKey 是统一的数据绑定键格式，用于在页面配置（rule.json）中声明数据绑定关系。所有数据绑定使用 `@` 分隔的标准格式。

### 格式

```
scope@tableName@viewId@field     # 完整 4 段格式
scope@tableName@field            # 简写（viewId 默认 'default'）
```

- **scope** — 页面 ID 或 DataSet 名称（`dataSetName`）
- **tableName** — 表名
- **viewId** — 视图 ID（省略时默认 `'default'`）
- **field** — `rows` | `currentRow` | `selectedRows`

### API

#### `isDataKey(dataKey: string): boolean`

判断字符串是否为 DataKey 格式。

#### `parseDataKey(dataKey: string): DataKeyDescriptor | null`

解析 DataKey 字符串为结构化描述符。非 DataKey 格式返回 `null`。

统一格式（`@` 分隔符，无 scope 前缀，SPA 单 DataSet）：

| 段数 | 格式 | 示例 |
|------|------|------|
| 2 段 | `table@field`（viewId 默认 `default`） | `Users@rows` |
| 3 段 | `table@viewId@field` | `Users@grid@rows` |
| 4 段 | `scope@table@viewId@field`（旧格式，向后兼容，scope 被忽略） | — |

```typescript
import { parseDataKey } from '@spark-view/spark-data'

parseDataKey('Users@rows')
// → { tableName: 'Users', viewId: 'default', field: 'rows', raw: 'Users@rows' }

parseDataKey('Users@grid@rows')
// → { tableName: 'Users', viewId: 'grid', field: 'rows', raw: 'Users@grid@rows' }

parseDataKey('settings.siteName')
// → null（非 DataKey，回落到 pageData 路径）
```

#### `resolveDataKey(descriptor: DataKeyDescriptor, dataSet: DataSet): IDataRow[] | IDataRow | null | undefined`

从 DataSet 中解析数据键对应的值。

```typescript
const dk = parseDataKey('Users@rows')!
const rows = resolveDataKey(dk, dataSet)  // → DataView.rows
```

#### `buildDataKey(tableName, field, viewId?): string`

构建标准化 DataKey 字符串。viewId 为 `'default'` 时省略（输出 2 段格式）。

```typescript
buildDataKey('Users', 'rows')           // → 'Users@rows'
buildDataKey('Users', 'rows', 'grid')   // → 'Users@grid@rows'
```

#### `normalizeDataKey(rawKey: string): string`

将旧 4 段格式（带 scope）剥离 scope 前缀，转为新格式。2/3 段格式原样返回。

```typescript
normalizeDataKey('MyApp@Users@default@rows')  // → 'Users@default@rows'
normalizeDataKey('Users@rows')                 // → 'Users@rows'（不变）
```

#### `getViewKey(descriptor: DataKeyDescriptor): string`

从描述符提取视图唯一键（`tableName.viewId`），用于订阅去重。

### 类型

```typescript
type DataKeyField = 'rows' | 'currentRow' | 'selectedRows' | 'summaryRow' | 'selectionSummaryRow'

interface DataKeyDescriptor {
  scope?: string        // 仅旧 4 段格式保留，新格式无此字段
  tableName: string
  viewId: string
  field: DataKeyField
  fieldPath?: string    // 如 'currentRow.totalUsers' → fieldPath = 'totalUsers'
  raw: string
}
```

### 在 rule.json 中使用

```json
{
  "type": "el-table",
  "dataKey": "Users@rows",
  "props": { "border": true, "highlightCurrentRow": true }
}
```

非 DataSet 键（如 `"dataKey": "settings.siteName"`）会回落到 pageData 路径解析。

---

## 架构对应关系

| SPARK Data | .NET Framework | 职责 |
|-----------|---------------|------|
| `DataSet` | `System.Data.DataSet` | 数据集管理 |
| `DataTable` | `System.Data.DataTable` | 数据表结构 |
| `DataView` | `System.Data.DataView` | 数据视图 / 绑定上下文 |
| `TreeManager` | (自定义) | 树形数据管理 |

---

## 更多示例

查看 [README.md](./README.md) 获取更多示例和用法。
