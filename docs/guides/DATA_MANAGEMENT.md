# 数据管理指南

> 使用 DataSet 和 TreeManager 管理应用数据

## DataSet 数据集

类似 .NET DataSet 的数据管理能力。

### 创建 DataSet

\\\	ypescript
import { SparkData } from '@spark-view/spark-data'

const dataSet = SparkData.createDataSet({
  dataSetName: 'MyData',
  tables: {
    Users: {
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'number' },
        { name: 'name', type: 'string' },
        { name: 'age', type: 'number' },
        { name: 'email', type: 'string' }
      ],
      rows: [
        { id: 1, name: 'Alice', age: 25, email: 'alice@example.com' },
        { id: 2, name: 'Bob', age: 30, email: 'bob@example.com' }
      ]
    },
    Orders: {
      tableName: 'Orders',
      columns: [
        { name: 'id', type: 'number' },
        { name: 'userId', type: 'number' },
        { name: 'amount', type: 'number' }
      ],
      rows: []
    }
  }
})
\\\

### 数据操作

\\\	ypescript
// 添加行
dataSet.tables.Users.addRow({
  id: 3,
  name: 'Charlie',
  age: 28,
  email: 'charlie@example.com'
})

// 更新行
dataSet.tables.Users.updateRow(0, { age: 26 })

// 删除行
dataSet.tables.Users.deleteRow(2)

// 查询行
const users = dataSet.tables.Users.rows.filter(r => r.age > 25)

// 清空表
dataSet.tables.Users.clear()
\\\

### 订阅变化

\\\	ypescript
// 订阅表变化
dataSet.subscribe('Users', (event) => {
  console.log('事件类型:', event.type)  // 'add' | 'update' | 'delete'
  console.log('行索引:', event.rowIndex)
  console.log('数据:', event.row)
})

// 取消订阅
const unsubscribe = dataSet.subscribe('Users', handler)
unsubscribe()
\\\

### 主从表关联

\\\	ypescript
// 创建带关联的 DataSet
const dataSet = SparkData.createDataSet({
  dataSetName: 'OrderData',
  tables: {
    Users: { ... },
    Orders: { ... }
  },
  relations: [
    {
      name: 'UserOrders',
      parentTable: 'Users',
      childTable: 'Orders',
      parentColumn: 'id',
      childColumn: 'userId'
    }
  ]
})

// 查询关联数据
const userId = 1
const userOrders = dataSet.tables.Orders.rows.filter(
  order => order.userId === userId
)
\\\

## TreeManager 树形数据

管理树形数据的扁平化和嵌套转换。

### 创建 TreeManager

\\\	ypescript
import { SparkData } from '@spark-view/spark-data'

const treeManager = SparkData.createTreeManager({
  idField: 'id',
  parentIdField: 'parentId',
  childrenField: 'children',
  lazy: false  // 是否懒加载
})
\\\

### 扁平转树形

\\\	ypescript
const flatData = [
  { id: 1, name: '根节点', parentId: null },
  { id: 2, name: '子节点1', parentId: 1 },
  { id: 3, name: '子节点2', parentId: 1 },
  { id: 4, name: '孙节点', parentId: 2 }
]

const tree = treeManager.buildTree(flatData)
// [
//   {
//     id: 1,
//     name: '根节点',
//     children: [
//       {
//         id: 2,
//         name: '子节点1',
//         children: [
//           { id: 4, name: '孙节点', children: [] }
//         ]
//       },
//       { id: 3, name: '子节点2', children: [] }
//     ]
//   }
// ]
\\\

### 树形转扁平

\\\	ypescript
const treeData = [{ id: 1, children: [...] }]
const flatData = treeManager.flatten(treeData)
\\\

### 懒加载

\\\	ypescript
// 创建支持懒加载的 TreeManager
const lazyTree = SparkData.createTreeManager({
  idField: 'id',
  parentIdField: 'parentId',
  lazy: true
})

// 加载子节点
await lazyTree.loadChildren(1, async (parentId) => {
  const response = await fetch(\/api/nodes?parentId=\\)
  return await response.json()
})

// 检查是否有子节点
const hasChildren = lazyTree.hasChildren(nodeId)

// 获取已加载的子节点
const children = lazyTree.getChildren(nodeId)
\\\

## BindingContext 数据绑定

提供数据导航和绑定功能。

### 创建绑定上下文

\\\	ypescript
import { SparkData } from '@spark-view/spark-data'

const context = SparkData.createContext('Users', 'default', dataSet)
\\\

### 数据导航

\\\	ypescript
// 当前行
const currentRow = context.getCurrentRow()

// 移动指针
context.moveNext()       // 下一行
context.movePrevious()   // 上一行
context.moveFirst()      // 第一行
context.moveLast()       // 最后一行
context.moveTo(5)        // 移到指定索引

// 检查位置
const isFirst = context.isFirst()
const isLast = context.isLast()
const currentIndex = context.getCurrentIndex()
\\\

### 数据查询

\\\	ypescript
// 获取所有行
const allRows = context.getRows()

// 过滤数据
const filtered = context.filter(row => row.age > 25)

// 排序数据
const sorted = context.sort((a, b) => a.age - b.age)

// 分页
const page = context.page(1, 10)  // 第1页，每页10条
\\\

## 在组件中使用

### 提供 DataSet 能力

\\\ue
<script setup lang="ts">
import { SparkData } from '@spark-view/spark-data'
import { useSparkComponent } from '@spark-view/spark-component'

const dataSet = SparkData.createDataSet({ ... })

const { provide } = useSparkComponent({ type: 'page-container' })

// 提供 DataSet 给子组件
provide('dataSet', dataSet)
</script>
\\\

### 消费 DataSet 能力

\\\ue
<script setup lang="ts">
import { computed } from 'vue'
import { useSparkComponent } from '@spark-view/spark-component'

const { consume } = useSparkComponent({ type: 'data-grid' })

const dataSet = consume('dataSet')

const rows = computed(() => {
  return dataSet?.tables.Users?.rows || []
})

// 订阅变化
dataSet?.subscribe('Users', (event) => {
  console.log('数据变化:', event)
})
</script>
\\\

## 最佳实践

### 1. 数据验证

\\\	ypescript
function validateUser(row: any): boolean {
  return row.name && row.email && row.age > 0
}

if (validateUser(newUser)) {
  dataSet.tables.Users.addRow(newUser)
}
\\\

### 2. 批量操作

\\\	ypescript
// 暂停订阅通知
dataSet.pauseNotifications()

users.forEach(user => {
  dataSet.tables.Users.addRow(user)
})

// 恢复订阅通知
dataSet.resumeNotifications()
\\\

### 3. 错误处理

\\\	ypescript
try {
  dataSet.tables.Users.updateRow(index, newData)
} catch (error) {
  console.error('更新失败:', error)
  // 回滚操作
}
\\\

## 更多信息

- [组件开发指南](COMPONENT_DEVELOPMENT.md)
- [能力系统指南](CAPABILITY_PROVISION.md)
- [API 参考手册](API_REFERENCE.md)