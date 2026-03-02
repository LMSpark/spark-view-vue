# 数据管理指南

> 使用 DataSet、DataView 和 TreeManager 管理应用数据
>
> **API 参考**：`packages/spark-data/src/`

## 概述

SPARK 数据层核心对象：

| 对象 | 职责 |
|------|------|
| `DataSet` | 数据空间协调器，持有多个 `DataTable`，管理关系配置 |
| `DataTable` | 单表数据存储容器，持有列定义和多个 `DataView` |
| `DataView` | 数据视图，**唯一数据交互枢纽**（读写、加载、选择、状态） |
| `TreeManager` | 树形数据转换与导航 |

**引用链**（单向）：`DataView → DataTable → DataSet`

---

## 1. 创建 DataSet

```typescript
import { SparkData } from '@spark-view/spark-data'

const dataSet = SparkData.createDataSet({
  dataSetName: 'UserManagement',
  tables: {
    Users: {
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'number', primaryKey: true },
        { name: 'name', type: 'string', nullable: false },
        { name: 'email', type: 'string', nullable: false },
        { name: 'departmentId', type: 'number' }
      ],
      rows: [                      // 可选：提供初始（静态）数据
        { id: 1, name: 'Alice', email: 'alice@example.com', departmentId: 1 },
        { id: 2, name: 'Bob', email: 'bob@example.com', departmentId: 1 }
      ]
    },
    Departments: {
      tableName: 'Departments',
      columns: [
        { name: 'id', type: 'number', primaryKey: true },
        { name: 'name', type: 'string', nullable: false }
      ],
      rows: []
    }
  },
  relations: [
    {
      name: 'UserDepartment',
      parentTable: 'Departments',
      childTable: 'Users',
      parentField: 'id',
      childField: 'departmentId',
      parentViewId: 'default',
      childViewId: 'default'
    }
  ]
})
```

---

## 2. DataView — 数据读写

`DataView` 是数据读写的唯一入口，通过 `DataSet.getView()` 获取：

```typescript
// 获取（并按需创建）DataView
const usersView = dataSet.getView('Users', 'default')
// 等价于：dataSet.tables['Users'].getOrCreateView('default')
```

### 读取数据

```typescript
// 行数据
const allRows = usersView?.rows ?? []
const currentRow = usersView?.currentRow
const selectedRows = usersView?.selectedRows ?? []

// 分页信息
const total = usersView?.total ?? 0
const page = usersView?.page ?? 1
const pageSize = usersView?.pageSize ?? 20

// 加载状态
const requestState = usersView?.requestState  // RequestState 枚举
const error = usersView?.loadingError
```

### 写入数据（直接赋值，用于静态数据）

```typescript
// 设置行（替换现有数据，不触发网络请求）
if (usersView) {
  usersView.rows = [
    { id: 1, name: 'Alice', email: 'alice@example.com', departmentId: 1 },
    { id: 2, name: 'Bob', email: 'bob@example.com', departmentId: 1 }
  ]
  usersView.total = usersView.rows.length
}
```

---

## 3. 从服务器加载数据（DataView.requestData）

```typescript
// requestData() 是幂等的：requestState !== Idle 时直接返回
usersView?.requestData()

// 监听状态变化
usersView?.events.on('stateChanged', (event) => {
  console.log('状态变化:', event)
  // event.requestState, event.rows 等
})
```

### 配置 CRUD API（DataTable 级别）

```typescript
import { SparkData } from '@spark-view/spark-data'
import type { CrudApi } from '@spark-view/spark-data'

const usersTable = dataSet.tables['Users']

// 设置 CRUD API
usersTable.setApi({
  read: async (params) => {
    const res = await fetch(`/api/users?page=${params.page}&pageSize=${params.pageSize}`)
    const data = await res.json()
    return { success: true, data: { rows: data.items, total: data.total } }
  },
  create: async (data) => {
    const res = await fetch('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' }
    })
    const created = await res.json()
    return { success: true, data: created }
  },
  update: async (id, data) => {
    const res = await fetch(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' }
    })
    return { success: res.ok, data: await res.json() }
  },
  delete: async (id) => {
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' })
    return { success: res.ok }
  }
})
```

---

## 4. CRUD 操作（DataView 级别）

所有 CRUD 方法都在 `DataView` 上，返回 `CrudResult`：

```typescript
const usersView = dataSet.getView('Users', 'default')!

// 新增
const addResult = await usersView.addRecord({
  name: 'Charlie',
  email: 'charlie@example.com',
  departmentId: 1
})
if (addResult.success) {
  console.log('新增成功:', addResult.data)
}

// 更新
const updateResult = await usersView.updateRecord(1, { name: 'Alice Updated' })

// 删除
const deleteResult = await usersView.deleteRecord(2)

// 批量操作
const batchResult = await usersView.batchCreate([
  { name: 'D', email: 'd@example.com', departmentId: 2 },
  { name: 'E', email: 'e@example.com', departmentId: 2 }
])
```

---

## 5. 数据查询（JavaScript 原生）

DataView 提供原始数据数组，查询使用 JavaScript 数组方法：

```typescript
const view = dataSet.getView('Users', 'default')
if (!view) return

const rows = view.rows

// 查找单行
const alice = rows.find(row => row.name === 'Alice')

// 过滤
const engineers = rows.filter(row => row.departmentId === 1)

// 排序（不可变）
const sorted = [...rows].sort((a, b) => (a.name as string).localeCompare(b.name as string))

// 分页
const pageSize = 10
const page = 1
const paginated = rows.slice((page - 1) * pageSize, page * pageSize)
```

---

## 6. 选择状态管理

```typescript
const view = dataSet.getView('Users', 'default')!

// 当前行
view.currentRow = view.rows[0] ?? null

// 多选
view.selectedRows = view.rows.filter(r => r.departmentId === 1)

// 响应式监听（Vue 组件内）
import { computed } from 'vue'
const currentUser = computed(() => view.currentRow)
const selectedUsers = computed(() => view.selectedRows)
```

---

## 7. DataKey 绑定（渲染层使用）

```typescript
import { SparkData } from '@spark-view/spark-data'
import { PAGE_DATASET } from '@spark-view/spark-component'
import { useSparkComponent } from '@spark-view/spark-component'

// 在渲染层组件中
const { consume } = useSparkComponent(props.config)
const dataSet = consume(PAGE_DATASET)

// 通过 DataKey 绑定解析（推荐方式）
const binding = SparkData.resolveDataKeyBinding('UserManagement@Users@rows', dataSet)
if (binding?.kind === 'view') {
  const view = binding.source              // IDataSource（DataView 实现）
  const rows = computed(() => view.rows)
}
```

DataKey 格式：

| 格式 | 示例 | viewId |
|------|------|--------|
| `scope@table@viewId@field` | `UserManagement@Users@grid@rows` | 显式指定 |
| `scope@table@field` | `UserManagement@Users@rows` | 默认 `default` |

---

## 8. 级联加载（父子视图）

子视图根据父视图的 `currentRow` 自动加载：

```typescript
const dataSet = SparkData.createDataSet({
  dataSetName: 'OrderManagement',
  tables: {
    Orders: { /* ... */ },
    OrderItems: { /* ... */ }
  },
  relations: [
    {
      parentTable: 'Orders',
      childTable: 'OrderItems',
      parentField: 'id',
      childField: 'orderId'
    }
  ]
})

// 选择父行后，子视图自动重新加载
const ordersView = dataSet.getView('Orders')!
const itemsView = dataSet.getView('OrderItems')!

ordersView.currentRow = ordersView.rows[0]
// → itemsView 会自动执行 requestData()（订阅父 stateChanged）
```

---

## 9. TreeManager（树形数据）

```typescript
import { SparkData } from '@spark-view/spark-data'

const treeManager = SparkData.createTreeManager({
  idField: 'id',
  parentIdField: 'parentId',
  childrenField: 'children'
})

// 将平铺数据转换为树形
const flatData = [
  { id: 1, name: 'Root', parentId: null },
  { id: 2, name: 'Child A', parentId: 1 },
  { id: 3, name: 'Child B', parentId: 1 },
  { id: 4, name: 'Grandchild', parentId: 2 }
]

const tree = treeManager.buildTree(flatData)
```

---

## 10. 在 Vue 组件中使用

```vue
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useSparkComponent } from '@spark-view/spark-component'
import { PAGE_DATASET } from '@spark-view/spark-component'
import { SparkData } from '@spark-view/spark-data'
import type { ComponentConfig } from '@spark-view/spark-component'

interface UserGridConfig extends ComponentConfig {
  dataKey: string
}

const props = defineProps<{ config: UserGridConfig }>()
const { consume, logger } = useSparkComponent(props.config)

// 消费 DataSet
const dataSet = consume(PAGE_DATASET)

// 通过 DataKey 解析 DataView
const binding = SparkData.resolveDataKeyBinding(props.config.dataKey, dataSet)
const view = binding?.kind === 'view' ? binding.source : null

// 响应式数据
const rows = computed(() => view?.rows ?? [])
const currentRow = computed(() => view?.currentRow)
const isLoading = computed(() => view?.requestState === 2 /* Loading */)

onMounted(() => {
  // 监听状态变化
  view?.events.on('stateChanged', (event) => {
    logger.debug('View state changed', event)
  })
})
</script>
```

---

## 相关文档

- [数据流架构](../architecture/DATAFLOW_ARCHITECTURE.md) — 完整调用链
- [组件开发指南](COMPONENT_DEVELOPMENT.md) — 能力系统
- [插件配置](PLUGIN_CONFIGURATION.md) — UI 库集成
