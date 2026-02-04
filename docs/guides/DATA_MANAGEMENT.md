# 数据管理指南

> 使用 `@spark-view/spark-data` 包的 DataSet 和 TreeManager

## DataSet 核心概念

DataSet 是一个内存中的关系型数据容器，支持：
- 多表管理（Tables）
- 表间关系（Relations）
- 级联操作（Cascade Update/Delete）
- 事件通知（Event System）

## 快速开始

### 1. 创建 DataSet

```javascript
import { SparkData } from '@spark-view/spark-data'

// 使用命名空间 API（推荐）
const dataSet = SparkData.createDataSet({
  dataSetName: 'MyApp',
  tables: {
    Users: {
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'number', primaryKey: true },
        { name: 'name', type: 'string' },
        { name: 'email', type: 'string' }
      ],
      rows: []
    },
    Orders: {
      tableName: 'Orders',
      columns: [
        { name: 'id', type: 'number', primaryKey: true },
        { name: 'userId', type: 'number' },
        { name: 'amount', type: 'number' }
      ],
      rows: []
    }
  },
  relations: [
    {
      parentTable: 'Users',
      childTable: 'Orders',
      type: 'one-to-many',
      filterExpression: 'userId == @parent.id'
    }
  ]
})
```

### 2. 表操作

```javascript
const users = dataSet.getTable('Users')

// 添加行
users.addRow({ id: 1, name: '张三', email: 'zhang@example.com' })

// 更新行
const row = users.getRow(0)
users.updateRow(row, { name: '李四' })

// 删除行
users.deleteRow(row)

// 查询
const activeUsers = users.rows.filter(r => r.status === 'active')
```

### 3. 关系过滤

```javascript
// 设置当前行（自动触发子表过滤）
const users = dataSet.getTable('Users')
users.setCurrentRow({ id: 1, name: '张三' })

// 子表自动过滤
const orders = dataSet.getTable('Orders')
console.log(orders.rows)  // 只显示 userId === 1 的订单
```

### 4. 级联操作

```javascript
// 级联更新
const oldValues = { id: 1, name: '张三' }
const newValues = { id: 100, name: '张三' }
dataSet.cascadeUpdate('Users', newValues, oldValues)
// Orders 表中 userId === 1 的记录自动更新为 userId === 100

// 级联删除
dataSet.cascadeDelete('Users', { id: 1 })
// Orders 表中 userId === 1 的记录自动删除
```

## 事件系统

### 监听事件

```javascript
// 数据加载成功
dataSet.on('loadSuccess', ({ tableName }) => {
  console.log(`${tableName} 加载完成`)
})

// 数据加载失败
dataSet.on('loadError', ({ tableName, error }) => {
  console.error(`${tableName} 加载失败:`, error)
})

// 当前行变化
dataSet.on('currentRowChanged', ({ tableName, row }) => {
  console.log(`${tableName} 当前行:`, row)
})

// 数据变化（通用）
dataSet.on('data:changed', ({ tableName, row, operation }) => {
  console.log(`${tableName} 数据变化:`, operation, row)
})
```

### 取消监听

```javascript
const handler = ({ tableName }) => {
  console.log('加载成功:', tableName)
}

dataSet.on('loadSuccess', handler)
dataSet.off('loadSuccess', handler)
```

## 按需加载

### 注册数据加载器

```javascript
// 在页面脚本中
function __init__() {
  const dataSet = $dataSet
  
  // 注册加载器
  dataSet.dataLoader = async (tableName) => {
    const response = await fetch(`/api/${tableName}`)
    return response.json()
  }
  
  // 页面启动时加载主表
  dataSet.requestTableData('Users')
}
```

### 懒加载子表

```javascript
function handleUserSelect(row) {
  const dataSet = $dataSet
  const users = dataSet.getTable('Users')
  const orders = dataSet.getTable('Orders')
  
  // 设置当前行
  users.setCurrentRow(row)
  
  // 检查子表是否已加载
  if (!orders._originalRows) {
    console.log('子表未加载，触发加载...')
    dataSet.requestTableData('Orders')
  }
}
```

## TreeManager

用于管理树形数据结构。

### 创建 TreeManager

```javascript
import { SparkData } from '@spark-view/spark-data'

const treeManager = SparkData.createTreeManager({
  idField: 'id',
  parentIdField: 'parentId',
  childrenField: 'children'  // 可选，默认 'children'
})

// 加载扁平数据
const flatData = [
  { id: 1, name: '根节点', parentId: null },
  { id: 2, name: '子节点1', parentId: 1 },
  { id: 3, name: '子节点2', parentId: 1 }
]

treeManager.loadData(flatData)
```

### 树操作

```javascript
// 富化节点（计算 level 和 hasChildren）
treeManager.enrichNodes()

// 构建嵌套树
const tree = treeManager.buildNestedTree()

// 获取子节点
const children = treeManager.getChildren(1)

// 获取路径
const path = treeManager.getNodePath(3)
console.log(path.pathNodes)  // [根节点, 子节点2]

// 查找节点
const node = treeManager.getNodeById(2)
```

## FilterParser

解析过滤表达式为 SQL 或 MongoDB 查询。

### SQL 转换

```javascript
import { SparkData } from '@spark-view/spark-data'

const expression = 'userId == @parent.id && status == "active"'
const result = SparkData.FilterParser.toSQL(expression)

console.log(result.sql)     // userId = ? AND status = ?
console.log(result.params)  // [@parent.id, "active"]
```

### MongoDB 转换

```javascript
const expression = 'age > 18 && status == "active"'
const query = SparkData.FilterParser.toMongoDB(expression)

console.log(query)  // { age: { $gt: 18 }, status: "active" }
```

## 实战示例

### 主从表联动

```javascript
// pagedata.json
{
  "dataSet": {
    "tables": {
      "Users": { "rows": [...] },
      "Orders": { "rows": [...] }
    },
    "relations": [{
      "parentTable": "Users",
      "childTable": "Orders",
      "filterExpression": "userId == @parent.id"
    }]
  }
}

// script.js
function handleUserRowChange(row) {
  const users = $dataSet.getTable('Users')
  users.setCurrentRow(row)  // Orders 自动过滤
}
```

### 级联删除

```javascript
async function handleDeleteUser() {
  const dataSet = $dataSet
  const users = dataSet.getTable('Users')
  const selectedUser = $data.selectedUser
  
  // 确认删除
  await ElMessageBox.confirm(
    `确定删除用户 "${selectedUser.name}" 及其所有订单吗？`,
    '危险操作'
  )
  
  // 1. 删除数据
  const index = users.rows.findIndex(u => u.id === selectedUser.id)
  users.rows.splice(index, 1)
  
  // 2. 级联删除子表
  dataSet.cascadeDelete('Users', selectedUser)
  
  ElMessage.success('删除成功')
}
```

### 数据导出

```javascript
function exportDataSet() {
  const dataSet = $dataSet
  const json = dataSet.toJSON()
  
  // 下载为文件
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'dataset-export.json'
  a.click()
  URL.revokeObjectURL(url)
}
```

## 性能优化

### 1. 批量操作

```javascript
// ❌ 逐条添加并通知
for (let i = 0; i < 1000; i++) {
  users.addRow({ id: i, name: `User ${i}` })
  dataSet.notifySubscribers('Users')  // 每次都通知！
}

// ✅ 批量添加后通知一次
for (let i = 0; i < 1000; i++) {
  users.rows.push({ id: i, name: `User ${i}` })
}
dataSet.notifySubscribers('Users')  // 只通知一次
```

### 2. 条件加载

```javascript
// 只在需要时加载子表
function handleUserSelect(row) {
  const orders = $dataSet.getTable('Orders')
  
  // 检查是否已有数据
  if (!orders._originalRows) {
    $dataSet.requestTableData('Orders')
  }
}
```

### 3. 取消订阅

```javascript
// 组件销毁时取消订阅
function cleanup() {
  const dataSet = $dataSet
  dataSet.off('loadSuccess', handler)
  dataSet.off('data:changed', handler)
}
```

## 调试技巧

```javascript
function debugDataSet() {
  const dataSet = $dataSet
  
  // 查看所有表
  console.log('Tables:', Object.keys(dataSet.dataSet.tables))
  
  // 查看关系配置
  console.log('Relations:', dataSet.dataSet.relations)
  
  // 查看表数据
  const users = dataSet.getTable('Users')
  console.log('Users rows:', users.rows)
  console.log('Users currentRow:', users.currentRow)
  
  // 查看原始数据（未过滤）
  console.log('Original rows:', users._originalRows)
}
```

## 参考示例

查看以下页面配置：
- `dataset-demo` - 主从表联动、SQL/MongoDB 查询
- `cascade-demo` - 级联更新、级联删除
- `master-detail` - 主从表事件监听
- `smart-load` - 按需加载、懒加载
