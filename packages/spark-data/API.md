# SPARK Data API 文档

## SparkData 命名空间

### DataKey 概览

`SparkData` 是数据空间的统一入口，提供优雅的工厂方法来创建数据管理对象。

公共 API 规矩：
- `create*` 入口优先使用命名类型或位置参数，保持强约束、容易定位错误。
- 宽输入与归一化入口统一收口到 `fromJson(...)`；历史包裹结构不再接受。

```typescript
import { SparkData } from '@spark-view/spark-data'
```

---

## API Reference

### DataSet 管理

#### `SparkData.createDataSet(meta)`

创建 DataSet 实例

该入口是强约束入口，只接受 canonical `IDataSetMetadata`。
如果输入是 JSON 字符串或 pagedata 原始对象，请改用 `SparkData.fromJson(...)`。

**参数：**
- `meta: IDataSetMetadata` - canonical DataSet 元数据

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
      views: {
        default: {
          rows: [
            { id: 1, name: 'Alice', email: 'alice@example.com' },
            { id: 2, name: 'Bob', email: 'bob@example.com' }
          ]
        }
      }
    }
  },
  // 数据关系配置
  tableRelations: [
    {
      parentTable: 'Departments',
      childTable: 'Users',
      childField: 'departmentId',
      cascadeDelete: true,
      relationName: 'dept-users'
    }
  ],
  viewDependencies: [
    {
      parentTable: 'Departments',
      childTable: 'Users',
      dependencyType: 'currentRow',
      autoLoad: true,
    }
  ]
})
```

---

### 数据关系管理

#### DataRelation 配置

DataRelation 定义父子视图之间的依赖关系，支持级联操作和动态过滤。
公共辅助函数也遵循同一条规矩：直接接受命名类型对象，而不是匿名 options。

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

#### `SparkData.fromJson(json)`

从 JSON 字符串、canonical DataSet 对象或 pagedata 原始对象恢复 DataSet。
历史 `{ dataset: ... }` 包裹结构已移除，请直接传入 canonical `IDataSetMetadata`。
该入口负责宽输入归一化；当你需要强约束类型检查时，请优先使用 `createDataSet(meta)`。

**参数：**
- `json: string | Record<string, unknown> | IDataSetMetadata` - JSON 字符串或对象

**返回：** `DataSet`

**示例：**
```typescript
const jsonString = '{"dataSetName":"MyApp","tables":{...}}'
const dataSet = SparkData.fromJson(jsonString)
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

#### `SparkData.createDataView(tableName, meta?)`

创建 DataView 实例，用于数据绑定和视图管理

**参数：**
- `tableName: string` - 表名
- `meta?: IViewMetadata` - 视图元数据

**返回：** `DataView`

**示例：**
```typescript
// 基本使用
const view = SparkData.createDataView('Users')

// 指定上下文 ID
const detailView = SparkData.createDataView('Orders', { viewId: 'detail' })
```

## 高级用法

### 直接访问类构造器

如果需要更多控制，可以直接访问类：

```typescript
import { SparkData } from '@spark-view/spark-data'

// 使用构造器
const dataSet = new (await import('@spark-view/spark-data')).DataSet({ ... })
```

### 直接类导入

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
      views: {
        default: {
          rows: []
        }
      }
    }
  }
})

// 创建 DataView
const dataView = SparkData.createDataView('Departments')

// 创建 TreeManager 并关联
const treeManager = SparkData.createTreeManager(
  { idField: 'id', parentIdField: 'parentId' },
  dataSet.getTable('Departments')?.views.default?.rows || []
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
const view = SparkData.createDataView('Users')
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

## DataKey / ViewKey 数据视图绑定键

### 概览

ViewKey 用于在页面配置（rule.json）中定位 DataView；DataKey 用于读取 DataView 输出字段。两者都使用 `@` 分隔的标准格式。

### 格式

```
tableName@viewId                 # ViewKey：容器定位 DataView
#scope@tableName@viewId          # 跨页面 ViewKey
tableName@viewId@field           # DataKey：读取 DataView 输出字段
#scope@tableName@viewId@field    # 跨页面 DataKey
```

- **scope** — 跨页面页面 ID 或 DataSet 名称（`dataSetName`），必须使用 `#` 前缀
- **tableName** — 表名
- **viewId** — 视图 ID，必须显式写出；默认视图也写 `default`
- **field** — `rows` | `columns` | `currentRow` | `selectedRows` | `aggregateResult` | `selectionAggregateResult` | `total` | `page` | `pageSize` | `requestState` | `mutating` | `loadingError` | `mutatingError`

### API

#### `isDataKey(dataKey: string): boolean`

判断字符串是否为 DataKey 格式。

#### `parseDataKey(dataKey: string): DataKeyDescriptor | null`

解析 DataKey 字符串为结构化描述符。非 DataKey 格式返回 `null`。

统一格式（`@` 分隔符；跨页面必须带 `#scope` 前缀）：

| 段数 | 格式 | 示例 |
|------|------|------|
| 3 段 | `table@viewId@field` | `Users@grid@rows` |
| 4 段 | `#scope@table@viewId@field` | `#SharedDS@Users@grid@rows` |

旧式 `table@field`、`#scope@table@field`、`scope@table@viewId@field` 和点号链式 DataKey 不再支持。

```typescript
import { parseDataKey } from '@spark-view/spark-data'

parseDataKey('Users@rows')
// → null（旧短写不再合法，必须显式写 viewId）

parseDataKey('Users@grid@rows')
// → { tableName: 'Users', viewId: 'grid', field: 'rows', raw: 'Users@grid@rows' }

parseDataKey('#SharedDS@Users@grid@rows')
// → { scope: 'SharedDS', tableName: 'Users', viewId: 'grid', field: 'rows', raw: '#SharedDS@Users@grid@rows', crossPage: true }

parseDataKey('settings.siteName')
// → null（非 DataKey，回落到 pageData 路径）
```

#### `resolveDataKey(descriptor: DataKeyDescriptor, dataSet: DataSet): IDataRow[] | IDataRow | null | undefined`

从 DataSet 中解析数据键对应的值。

```typescript
const dk = parseDataKey('Users@default@rows')!
const rows = resolveDataKey(dk, dataSet)  // → DataView.rows
```

#### `buildDataKey(tableName, field, viewId?): string`

构建标准化 DataKey 字符串。viewId 为 `'default'` 时也会显式输出。

```typescript
buildDataKey('Users', 'rows')           // → 'Users@default@rows'
buildDataKey('Users', 'rows', 'grid')   // → 'Users@grid@rows'
```

#### `getViewKey(descriptor: DataKeyDescriptor): string`

从描述符提取视图唯一键（`tableName.viewId`），用于订阅去重。

### 类型

```typescript
type DataKeyField = 'rows' | 'columns' | 'currentRow' | 'selectedRows' | 'aggregateResult' | 'selectionAggregateResult' | 'total' | 'page' | 'pageSize' | 'requestState' | 'mutating' | 'loadingError' | 'mutatingError'

interface DataKeyDescriptor {
  scope?: string        // 仅跨页面 #scope 前缀存在
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
  "type": "r-table",
  "props": {
    "viewKey": "Users@default",
    "border": true,
    "highlightCurrentRow": true
  }
}
```

展示组件、动作和 `contextDataKey` 需要读取 DataView 输出时，使用完整 DataKey，例如 `Users@default@currentRow.name` 或 `Users@summary@aggregateResult.totalAmount`。

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
