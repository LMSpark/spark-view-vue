# 数据管理指南

> 使用 DataSet 和 TreeManager 管理应用数据

## 📖 概述

SPARK 数据层提供完整的客户端数据管理能力，包括 DataSet（数据集）、TreeManager（树形数据管理）和关系数据处理。数据层采用声明式配置，支持类型安全的数据操作和依赖分析。

## 📊 DataSet 数据集

DataSet 是 SPARK 数据管理的核心，提供类似 .NET DataSet 的数据管理能力，支持多表关联、数据验证和变更跟踪。

### 创建 DataSet

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
        { name: 'departmentId', type: 'number' },
        { name: 'createdAt', type: 'date' }
      ],
      rows: []
    },
    Departments: {
      tableName: 'Departments',
      columns: [
        { name: 'id', type: 'number', primaryKey: true },
        { name: 'name', type: 'string', nullable: false },
        { name: 'managerId', type: 'number' }
      ],
      rows: []
    }
  },
  relations: [
    {
      name: 'UserDepartment',
      from: 'Users',
      to: 'Departments',
      fromColumn: 'departmentId',
      toColumn: 'id',
      type: 'many-to-one'
    }
  ]
})
```

### 数据操作

#### 加载数据

```typescript
// 从 API 加载数据
await dataSet.loadTable('Users')
await dataSet.loadTable('Departments')

// 或者直接设置数据
dataSet.getTable('Users').setRows([
  { id: 1, name: 'Alice', email: 'alice@example.com', departmentId: 1 },
  { id: 2, name: 'Bob', email: 'bob@example.com', departmentId: 1 },
  { id: 3, name: 'Charlie', email: 'charlie@example.com', departmentId: 2 }
])

dataSet.getTable('Departments').setRows([
  { id: 1, name: 'Engineering', managerId: 1 },
  { id: 2, name: 'Marketing', managerId: 2 }
])
```

#### 查询数据

```typescript
// 获取表实例
const usersTable = dataSet.getTable('Users')
const departmentsTable = dataSet.getTable('Departments')

// 获取所有行
const allUsers = usersTable.getRows()

// 查找单行
const user = usersTable.findRow(row => row.name === 'Alice')

// 条件查询
const engineers = usersTable.filterRows(row => row.departmentId === 1)

// 排序
const sortedUsers = usersTable.sortRows((a, b) => a.name.localeCompare(b.name))

// 分页
const pageSize = 10
const page = 1
const paginatedUsers = usersTable.getRows()
  .slice((page - 1) * pageSize, page * pageSize)
```

#### 修改数据

```typescript
// 添加新行
const newUser = usersTable.addRow({
  id: 4,
  name: 'Diana',
  email: 'diana@example.com',
  departmentId: 2
})

// 更新行
usersTable.updateRow(user => user.id === 1, {
  name: 'Alice Smith',
  email: 'alice.smith@example.com'
})

// 删除行
usersTable.removeRow(user => user.id === 4)

// 批量操作
usersTable.bulkUpdate(
  user => user.departmentId === 1,
  { departmentId: 3 }
)
```

#### 数据验证

```typescript
// 定义验证规则
const validationRules = {
  name: (value: any) => {
    if (!value || typeof value !== 'string') {
      return 'Name is required'
    }
    if (value.length < 2) {
      return 'Name must be at least 2 characters'
    }
    return true
  },
  email: (value: any) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!value || !emailRegex.test(value)) {
      return 'Valid email is required'
    }
    return true
  }
}

// 验证单行
const errors = usersTable.validateRow(newUser, validationRules)
if (errors.length > 0) {
  console.error('Validation errors:', errors)
}

// 验证整个表
const allErrors = usersTable.validateTable(validationRules)
```

### 关系数据处理

```typescript
// 获取用户及其部门信息
const usersWithDepartments = dataSet.getRelatedRows('Users', 'UserDepartment', 'Departments')

// 级联删除（删除部门时同时删除相关用户）
dataSet.removeWithRelations('Departments', department => department.id === 2)

// 依赖分析
const dependencies = dataSet.analyzeDependencies('Users', user => user.id === 1)
console.log('Affected records:', dependencies)
```

## 🌳 TreeManager 树形数据管理

TreeManager 提供高效的树形数据结构管理，支持父子关系、层级查询和树形操作。

### 创建 TreeManager

```typescript
import { SparkData } from '@spark-view/spark-data'

const treeManager = SparkData.createTreeManager({
  idField: 'id',
  parentIdField: 'parentId',
  rootParentValue: null
})

// 设置数据
treeManager.setData([
  { id: 1, name: 'Root Node', parentId: null },
  { id: 2, name: 'Child 1', parentId: 1 },
  { id: 3, name: 'Child 2', parentId: 1 },
  { id: 4, name: 'Grandchild 1', parentId: 2 },
  { id: 5, name: 'Child 3', parentId: 1 }
])
```

### 树形查询

```typescript
// 获取根节点
const rootNodes = treeManager.getRootNodes()
// [{ id: 1, name: 'Root Node', parentId: null }]

// 获取子节点
const children = treeManager.getChildren(1)
// [{ id: 2, ... }, { id: 3, ... }, { id: 5, ... }]

// 获取父节点
const parent = treeManager.getParent(2)
// { id: 1, name: 'Root Node', parentId: null }

// 获取所有后代
const descendants = treeManager.getDescendants(1)
// [2, 3, 4, 5]

// 获取所有祖先
const ancestors = treeManager.getAncestors(4)
// [2, 1]

// 获取节点层级
const level = treeManager.getLevel(4) // 2

// 获取树形结构
const tree = treeManager.getTreeStructure()
/*
[
  {
    id: 1,
    name: 'Root Node',
    children: [
      {
        id: 2,
        name: 'Child 1',
        children: [
          { id: 4, name: 'Grandchild 1', children: [] }
        ]
      },
      { id: 3, name: 'Child 2', children: [] },
      { id: 5, name: 'Child 3', children: [] }
    ]
  }
]
*/
```

### 树形操作

```typescript
// 添加节点
treeManager.addNode({
  id: 6,
  name: 'New Child',
  parentId: 3
})

// 移动节点
treeManager.moveNode(6, 1) // 将节点6移动到节点1下

// 删除节点及其子节点
treeManager.removeNode(3)

// 更新节点
treeManager.updateNode(2, { name: 'Updated Child 1' })

// 重新排序子节点
treeManager.reorderChildren(1, [5, 2]) // 重新排序节点1的子节点
```

### 高级查询

```typescript
// 查找节点
const foundNode = treeManager.findNode(node => node.name.includes('Child'))

// 过滤节点
const filteredNodes = treeManager.filterNodes(node => node.level > 1)

// 遍历树
treeManager.traverse((node, level) => {
  console.log('  '.repeat(level) + node.name)
})

// 路径查询
const path = treeManager.getPath(4)
// [1, 2, 4]

// 最近公共祖先
const lca = treeManager.getLowestCommonAncestor(4, 5)
// 1
```

## 🔄 数据绑定

SPARK 支持响应式数据绑定，数据变更会自动触发 UI 更新。

### 与 Vue 组件集成

```vue
<template>
  <div class="data-view">
    <div v-for="user in users" :key="user.id" class="user-card">
      <h3>{{ user.name }}</h3>
      <p>{{ user.email }}</p>
      <button @click="editUser(user)">编辑</button>
      <button @click="deleteUser(user)">删除</button>
    </div>

    <button @click="addUser">添加用户</button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { SparkData } from '@spark-view/spark-data'

const dataSet = SparkData.createDataSet({
  dataSetName: 'UserView',
  tables: {
    Users: {
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'number', primaryKey: true },
        { name: 'name', type: 'string' },
        { name: 'email', type: 'string' }
      ],
      rows: []
    }
  }
})

const usersTable = dataSet.getTable('Users')
const usersView = dataSet.getView('Users', 'default')!
const users = ref(usersView.rows)

// 监听数据变更（统一使用 events.on）
usersView.events.on('stateChanged', () => {
  users.value = usersView.rows
})

onMounted(async () => {
  await dataSet.loadTable('Users')
})

const addUser = () => {
  usersTable.addRow({
    id: Date.now(),
    name: 'New User',
    email: 'new@example.com'
  })
}

const editUser = (user: any) => {
  const newName = prompt('Enter new name:', user.name)
  if (newName) {
    usersTable.updateRow(u => u.id === user.id, { name: newName })
  }
}

const deleteUser = (user: any) => {
  usersTable.removeRow(u => u.id === user.id)
}
</script>
```

### 表单数据绑定

```vue
<template>
  <form @submit.prevent="saveUser">
    <div>
      <label for="name">Name:</label>
      <input
        id="name"
        v-model="formData.name"
        @blur="validateField('name')"
      />
      <span v-if="errors.name" class="error">{{ errors.name }}</span>
    </div>

    <div>
      <label for="email">Email:</label>
      <input
        id="email"
        v-model="formData.email"
        type="email"
        @blur="validateField('email')"
      />
      <span v-if="errors.email" class="error">{{ errors.email }}</span>
    </div>

    <button type="submit" :disabled="!isValid">Save</button>
  </form>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { SparkData } from '@spark-view/spark-data'

const dataSet = SparkData.createDataSet({
  dataSetName: 'UserForm',
  tables: {
    Users: {
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'number', primaryKey: true },
        { name: 'name', type: 'string', nullable: false },
        { name: 'email', type: 'string', nullable: false }
      ],
      rows: []
    }
  }
})

const usersTable = dataSet.getTable('Users')

const formData = reactive({
  name: '',
  email: ''
})

const errors = reactive<Record<string, string>>({})

const validationRules = {
  name: (value: string) => {
    if (!value.trim()) return 'Name is required'
    if (value.length < 2) return 'Name must be at least 2 characters'
    return true
  },
  email: (value: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!value.trim()) return 'Email is required'
    if (!emailRegex.test(value)) return 'Please enter a valid email'
    return true
  }
}

const isValid = computed(() => {
  return !Object.values(errors).some(error => error)
})

const validateField = (field: string) => {
  const rule = validationRules[field as keyof typeof validationRules]
  const result = rule(formData[field as keyof typeof formData] as string)

  if (result === true) {
    errors[field] = ''
  } else {
    errors[field] = result
  }
}

const saveUser = () => {
  // 验证所有字段
  Object.keys(validationRules).forEach(field => validateField(field))

  if (!isValid.value) return

  // 保存到数据集
  usersTable.addRow({
    id: Date.now(),
    name: formData.name,
    email: formData.email
  })

  // 重置表单
  formData.name = ''
  formData.email = ''
  Object.keys(errors).forEach(field => {
    errors[field] = ''
  })
}
</script>
```

## 🔍 数据查询和过滤

### 高级查询

```typescript
// 复杂条件查询
const activeUsers = usersTable.filterRows(user => {
  return user.active === true &&
         user.createdAt > new Date('2023-01-01') &&
         user.department !== 'inactive'
})

// 全文搜索
const searchUsers = (query: string) => {
  const lowercaseQuery = query.toLowerCase()
  return usersTable.filterRows(user =>
    user.name.toLowerCase().includes(lowercaseQuery) ||
    user.email.toLowerCase().includes(lowercaseQuery) ||
    (user.bio && user.bio.toLowerCase().includes(lowercaseQuery))
  )
}

// 分页查询
const getUsersPage = (page: number, pageSize: number, filters?: any) => {
  let filteredUsers = usersTable.getRows()

  // 应用过滤器
  if (filters) {
    if (filters.department) {
      filteredUsers = filteredUsers.filter(u => u.departmentId === filters.department)
    }
    if (filters.active !== undefined) {
      filteredUsers = filteredUsers.filter(u => u.active === filters.active)
    }
  }

  // 分页
  const start = (page - 1) * pageSize
  const end = start + pageSize

  return {
    data: filteredUsers.slice(start, end),
    total: filteredUsers.length,
    page,
    pageSize,
    totalPages: Math.ceil(filteredUsers.length / pageSize)
  }
}
```

### 数据聚合

```typescript
// 统计数据
const getUserStats = () => {
  const users = usersTable.getRows()

  return {
    total: users.length,
    active: users.filter(u => u.active).length,
    byDepartment: users.reduce((acc, user) => {
      acc[user.departmentId] = (acc[user.departmentId] || 0) + 1
      return acc
    }, {} as Record<number, number>),
    averageAge: users.reduce((sum, user) => sum + (user.age || 0), 0) / users.length
  }
}

// 数据透视
const pivotByDepartment = () => {
  const users = usersTable.getRows()
  const departments = departmentsTable.getRows()

  return departments.map(dept => ({
    department: dept.name,
    userCount: users.filter(u => u.departmentId === dept.id).length,
    activeUsers: users.filter(u => u.departmentId === dept.id && u.active).length
  }))
}
```

## 💾 数据持久化

### 本地存储

```typescript
// 保存到本地存储
const saveToLocalStorage = () => {
  const data = {
    users: usersTable.getRows(),
    departments: departmentsTable.getRows(),
    timestamp: new Date().toISOString()
  }

  localStorage.setItem('app-data', JSON.stringify(data))
}

// 从本地存储加载
const loadFromLocalStorage = () => {
  const saved = localStorage.getItem('app-data')
  if (saved) {
    const data = JSON.parse(saved)
    usersTable.setRows(data.users)
    departmentsTable.setRows(data.departments)
  }
}
```

### API 集成

```typescript
// 配置数据加载器
const dataSet = SparkData.createDataSet({
  dataSetName: 'ApiData',
  tables: {
    Users: {
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'number', primaryKey: true },
        { name: 'name', type: 'string' },
        { name: 'email', type: 'string' }
      ],
      rows: []
    }
  },
})

// 数据加载通过视图的 CRUD API 完成
const usersView = dataSet.getView('Users', 'default')!
await usersView.loadFromServer()

// 增删改查操作
const usersTable = dataSet.getTable('Users')

// 创建
const newUser = usersTable.addRow({
  id: 0, // API 会分配真实ID
  name: 'New User',
  email: 'new@example.com'
})

// 更新
usersTable.updateRow(user => user.id === 1, {
  name: 'Updated Name'
})

// 删除
usersTable.removeRow(user => user.id === 1)
```

## 🔧 最佳实践

### 1. 数据结构设计

```typescript
// ✅ 推荐：明确的类型定义
interface User {
  id: number
  name: string
  email: string
  departmentId: number
  active: boolean
  createdAt: Date
}

const userSchema = {
  tableName: 'Users',
  columns: [
    { name: 'id', type: 'number', primaryKey: true },
    { name: 'name', type: 'string', nullable: false },
    { name: 'email', type: 'string', nullable: false },
    { name: 'departmentId', type: 'number' },
    { name: 'active', type: 'boolean', defaultValue: true },
    { name: 'createdAt', type: 'date', defaultValue: () => new Date() }
  ]
}
```

### 2. 错误处理

```typescript
// ✅ 推荐：优雅的错误处理
try {
  await dataSet.loadTable('Users')
} catch (error) {
  logger.error('Failed to load users', { error })
  // 显示用户友好的错误信息
  showErrorMessage('Unable to load user data. Please try again.')
}

// ❌ 避免：静默失败
try {
  await dataSet.loadTable('Users')
} catch (error) {
  // 静默处理，用户不知道发生了什么
}
```

### 3. 性能优化

```typescript
// ✅ 推荐：使用索引进行查询
const usersByDepartment = new Map<number, any[]>()

usersTable.getRows().forEach(user => {
  if (!usersByDepartment.has(user.departmentId)) {
    usersByDepartment.set(user.departmentId, [])
  }
  usersByDepartment.get(user.departmentId)!.push(user)
})

// 快速查找
const engineeringUsers = usersByDepartment.get(1) || []

// ❌ 避免：每次都遍历全表
const getUsersByDepartment = (departmentId: number) => {
  return usersTable.filterRows(user => user.departmentId === departmentId) // 每次都遍历
}
```

### 4. 数据一致性

```typescript
// ✅ 推荐：使用事务确保数据一致性
const transferUser = (userId: number, fromDeptId: number, toDeptId: number) => {
  const user = usersTable.findRow(u => u.id === userId)
  if (!user) throw new Error('User not found')

  const fromDept = departmentsTable.findRow(d => d.id === fromDeptId)
  const toDept = departmentsTable.findRow(d => d.id === toDeptId)

  if (!fromDept || !toDept) throw new Error('Department not found')

  // 原子操作
  usersTable.updateRow(u => u.id === userId, { departmentId: toDeptId })

  // 记录操作日志
  logger.info('User transferred', {
    userId,
    fromDepartment: fromDept.name,
    toDepartment: toDept.name
  })
}
```

## 📖 相关文档

- [组件开发指南](COMPONENT_DEVELOPMENT.md) - 创建数据驱动的组件
- [配置系统](CONFIG_SYSTEM.md) - 多租户与远程配置

---

## DataKey 统一数据绑定

### 格式

DataKey 使用 `@` 分隔符统一描述数据绑定关系：

```
scope@tableName@viewId@field     # 完整 4 段
scope@tableName@field            # 简写（viewId 默认 'default'）
```

- **scope** — DataSet 名称（`dataSetName`）或页面 ID
- **tableName** — 表名
- **viewId** — 视图 ID（省略则默认 `'default'`）
- **field** — `rows` | `currentRow` | `selectedRows`

### 在 rule.json 中使用

```json
{
  "type": "el-table",
  "dataKey": "MyApp@Users@default@rows",
  "props": { "border": true, "highlightCurrentRow": true }
}
```

非 DataSet 键（如 `"dataKey": "settings.siteName"`）回落到 pageData 路径解析。

### API

```typescript
import { parseDataKey, resolveDataKey, isDataKey, buildDataKey } from '@spark-view/spark-data'

// 解析
const dk = parseDataKey('MyApp@Users@grid@rows')
// → { scope: 'MyApp', tableName: 'Users', viewId: 'grid', field: 'rows', raw: '...' }

// 从 DataSet 取值
const rows = resolveDataKey(dk, dataSet)

// 构建
buildDataKey('MyApp', 'Users', 'rows')         // → 'MyApp@Users@default@rows'
buildDataKey('MyApp', 'Users', 'rows', 'grid') // → 'MyApp@Users@grid@rows'
```

---

## 数据操作

### 访问表和视图

```typescript
// 通过 DataSet 获取表
const table = dataSet.getTable('Users')

// 获取默认视图
const view = table?.getOrCreateView('default')

// 读取数据
const rows = view?.rows ?? []
const currentRow = view?.currentRow

// 设置状态
view?.setCurrentRow(rows[0])
view?.setSelectedRows([rows[0], rows[1]])
```

### 订阅变化

```typescript
// 订阅视图变化（统一使用 events.on）
const view = dataSet.getView('Users', 'default')!
const handler = () => {
  console.log('用户表视图数据已变化')
}
view.events.on('stateChanged', handler)

// 取消订阅
view.events.off('stateChanged', handler)
```

### 主从表关联

```typescript
const dataSet = SparkData.createDataSet({
  dataSetName: 'OrderData',
  tables: {
    Users: { tableName: 'Users', columns: [...], rows: [...] },
    Orders: { tableName: 'Orders', columns: [...], rows: [] }
  },
  relations: [{
    parentTable: 'Users',
    childTable: 'Orders',
    dependencyType: 'currentRow',
    autoLoad: true,
    filterExpression: {
      field: 'userId',
      op: '==',
      value: { func: 'parentRow.id', args: [] }
    }
  }]
})

// 子视图自动通过 setupCascade() 订阅父视图 stateChanged
// 父无数据 → 清空子；父有数据 + autoLoad → 请求子数据
```

## TreeManager 树形数据

管理树形数据的扁平化和嵌套转换。

### 创建 TreeManager

```typescript
import { SparkData } from '@spark-view/spark-data'

const treeManager = SparkData.createTreeManager({
  idField: 'id',
  parentIdField: 'parentId',
  childrenField: 'children',
  lazy: false
})
```

### 扁平转树形

```typescript
const flatData = [
  { id: 1, name: '根节点', parentId: null },
  { id: 2, name: '子节点1', parentId: 1 },
  { id: 3, name: '子节点2', parentId: 1 },
  { id: 4, name: '孙节点', parentId: 2 }
]

const tree = treeManager.buildTree(flatData)
```

### 树形转扁平

```typescript
const treeData = [{ id: 1, children: [...] }]
const flatData = treeManager.flatten(treeData)
```

## 在组件中使用

### 提供 DataSet 能力

```vue
<script setup lang="ts">
import { SparkData } from '@spark-view/spark-data'
import { useSparkComponent } from '@spark-view/spark-component'
import { DATA_SET } from '@spark-view/spark-utils'

const dataSet = SparkData.createDataSet({ ... })

const { provide } = useSparkComponent({ type: 'page-container' })

// 通过能力系统提供 DataSet
provide(DATA_SET, { dataSet })
</script>
```

### 消费 DataSet 能力

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useSparkComponent } from '@spark-view/spark-component'
import { DATA_SET } from '@spark-view/spark-utils'

const { consume } = useSparkComponent({ type: 'data-grid' })

const dsCap = consume(DATA_SET)
const dataSet = dsCap?.dataSet

const rows = computed(() => {
  const view = dataSet?.getTable('Users')?.getOrCreateView('default')
  return view?.rows ?? []
})
</script>
```

## 最佳实践

### 1. 使用 DataKey 统一格式

```json
// rule.json 中统一使用 @ 格式
{ "dataKey": "MyApp@Users@default@rows" }
{ "dataKey": "MyApp@Users@currentRow" }
```

### 2. 通过 DataView 管理选中状态

```typescript
const view = dataSet.getTable('Users')?.getOrCreateView('default')

// 设置当前行（自动触发级联和订阅通知）
view?.setCurrentRow(selectedRow)

// 设置多选
view?.setSelectedRows(checkedRows)
```

### 3. 错误处理

```typescript
const view = dataSet.getTable('Users')?.getOrCreateView('default')
view?.setLoading()
try {
  const data = await fetchData()
  view?.rows.splice(0, view.rows.length, ...data)
  view?.setReady()
} catch (error) {
  view?.setError(error as Error)
}
```

## 更多信息

- [组件开发指南](COMPONENT_DEVELOPMENT.md)

---
## 视图状态管理

DataView 是 UI 和数据之间的智能桥梁，管理数据加载的完整生命周期。

### 视图状态

| 状态 | 条件 | 说明 |
|------|------|------|
| `loading` | `requestState === RequestState.Loading` | 数据加载中 |
| `ready` | `requestState === RequestState.Loaded` | 数据已就绪 |
| `error` | `requestState === RequestState.Failed` | 加载失败 |
| `empty` | `requestState === RequestState.Loaded`, `rows.length === 0` | 无数据 |

```typescript
class DataView {
  requestState: RequestState  // Idle | Preparing | Loading | Loaded | Failed
  loadingError: Error | null
  rows: IDataRow[]
  currentRow: IDataRow | null
  selectedRows: IDataRow[]
}

enum RequestState {
  Idle = 'idle',
  Preparing = 'preparing',
  Loading = 'loading',
  Loaded = 'loaded',
  Failed = 'failed'
}
```

### 订阅视图变化

```typescript
// 事件方式 — 统一使用 events.on 监听所有状态变化
view.events.on('stateChanged', (event: ViewStateEvent) => {
  console.log(`[${event.tableName}.${event.viewId}] ${event.changeType}`)
  if (view.requestState === RequestState.Loading) showLoading()
  else if (view.requestState === RequestState.Failed) showError(view.loadingError?.message)
  else renderData(view.rows)
})
```

### 依赖链管理

```typescript
dataSet.addRelations([{
  parentTable: 'Departments',
  childTable: 'Users',
  parentKey: 'id',
  childKey: 'departmentId',
  autoLoad: true  // 父表就绪后自动加载子表
}])

// 子视图通过 setupCascade() 自动订阅父视图 stateChanged
// 父无数据 → 清空子；父有数据 + autoLoad → 请求子数据
```

### Vue 组件示例

```vue
<script setup>
const view = computed(() => dataSet.getTable('Users')?.views['default'])
const viewState = ref({ isLoading: false, error: null, ready: false })

const handler = () => {
  viewState.value = {
    isLoading: view.value.requestState === RequestState.Loading,
    error: view.value.loadingError?.message ?? null,
    ready: view.value.requestState === RequestState.Loaded && view.value.rows.length > 0
  }
}

onMounted(() => {
  view.value?.events.on('stateChanged', handler)
  view.value?.requestData()  // 非阻塞
})
onUnmounted(() => view.value?.events.off('stateChanged', handler))
</script>
```

---

## 网络 CRUD 封装

spark-data 提供完整的网络 CRUD 封装，基于 spark-utils HTTP 客户端。

### 创建 CRUD 服务

```typescript
import { createCrudService } from '@spark-view/spark-data'

const crudService = createCrudService({
  create:   { url: '/api/users', method: 'POST' },
  retrieve: { url: '/api/users/:id', method: 'GET', pathParams: ['id'] },
  update:   { url: '/api/users/:id', method: 'PUT', pathParams: ['id'] },
  delete:   { url: '/api/users/:id', method: 'DELETE', pathParams: ['id'] },
  list:     { url: '/api/users', method: 'GET', pagination: { pageParam: 'page', sizeParam: 'size' } }
})
```

### DataTable 集成

```typescript
const userTable = SparkData.createDataTable({
  tableName: 'users',
  columns: [
    { name: 'id', type: 'number', isPrimaryKey: true },
    { name: 'name', type: 'string' },
    { name: 'email', type: 'string' }
  ],
  api: {
    create:   { url: '/api/users', method: 'POST' },
    retrieve: { url: '/api/users/:id', method: 'GET', pathParams: ['id'] },
    update:   { url: '/api/users/:id', method: 'PUT', pathParams: ['id'] },
    delete:   { url: '/api/users/:id', method: 'DELETE', pathParams: ['id'] },
    list:     { url: '/api/users', method: 'GET' }
  }
})

// CRUD 操作
await userTable.createRecord({ name: '张三', email: 'zhang@example.com' })
await userTable.loadFromServer({ page: 1, pageSize: 20 })
await userTable.updateRecord(1, { name: '李四' })
await userTable.deleteRecord(1)

// 批量操作
await userTable.batchCreateRecords([...])
await userTable.batchDeleteRecords([1, 2, 3])

// 导入导出
await userTable.importData(file)
await userTable.exportData({ filter: { status: 'active' } })
```

### 权限集成

CRUD 操作自动处理权限：

```typescript
const result = await userTable.createRecord({ name: '新用户' })
if (result.success && result.data?._perm?.allowDelete) {
  // 用户有删除权限
}
```