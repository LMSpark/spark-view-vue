# DataSet 完整 CRUD 操作指南

## 架构概览

**完全动态化的 DataSet 管理**：
- ✅ 结构定义通过 API 获取（表结构、列定义、关系配置）
- ✅ 数据通过 API 获取（增删改查）
- ✅ 所有操作支持服务器同步

## 1. 配置示例

### pagedata.json - 定义 API 端点

```json
{
  "datasetStructureApi": {
    "url": "/api/dataset/structure/user-order",
    "method": "GET",
    "autoLoad": true,
    "dataPath": "data"
  },
  
  "usersApi": {
    "url": "/api/users",
    "method": "GET",
    "autoLoad": true,
    "dataPath": "data"
  },
  
  "ordersApi": {
    "url": "/api/orders",
    "method": "GET",
    "autoLoad": true,
    "dataPath": "data"
  },
  
  "dataset": null,
  "filteredOrders": [],
  "currentUser": { "label": "未选择", "orderCount": 0 }
}
```

### 结构 API 响应示例

**GET /api/dataset/structure/user-order**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "dataSetName": "UserOrderDataSet",
    "version": 1,
    "tables": [
      {
        "tableName": "Users",
        "columns": [
          {
            "name": "id",
            "type": "number",
            "isPrimaryKey": true,
            "caption": "用户ID",
            "nullable": false
          },
          {
            "name": "name",
            "type": "string",
            "caption": "姓名",
            "maxLength": 50
          },
          {
            "name": "email",
            "type": "string",
            "caption": "邮箱",
            "pattern": "email"
          },
          {
            "name": "status",
            "type": "string",
            "caption": "状态",
            "defaultValue": "激活"
          }
        ]
      },
      {
        "tableName": "Orders",
        "columns": [
          {
            "name": "id",
            "type": "number",
            "isPrimaryKey": true,
            "caption": "订单ID"
          },
          {
            "name": "userId",
            "type": "number",
            "caption": "用户ID",
            "foreignKey": { "table": "Users", "column": "id" }
          },
          {
            "name": "orderNo",
            "type": "string",
            "caption": "订单号"
          },
          {
            "name": "amount",
            "type": "number",
            "caption": "金额"
          },
          {
            "name": "status",
            "type": "string",
            "caption": "状态"
          },
          {
            "name": "createdAt",
            "type": "string",
            "caption": "创建时间"
          }
        ]
      }
    ],
    "relations": [
      {
        "parentTable": "Users",
        "childTable": "Orders",
        "dependencyType": "currentRow",
        "filter": {
          "type": "condition",
          "field": "userId",
          "op": "==",
          "value": { "func": "FIELD", "args": ["id"] }
        }
      }
    ]
  }
}
```

## 2. Script.js 完整实现

```javascript
import { $data, $rebindRules, $refreshData } from '@/utils/page-helpers/common.js'
import { DataSetManager } from '@/utils/dataSetManager'
import { 
  loadDataSetStructure, 
  loadApiDataToTable,
  addRow,
  updateRow,
  deleteRow,
  queryRows,
  findRowByKey,
  saveRowToServer,
  deleteRowFromServer
} from '../datasetHelper'
import { ElMessage, ElMessageBox } from 'element-plus'

let dataSetManager = null

/**
 * 初始化 DataSet
 */
export async function initDataSet() {
  const pageData = $data()
  
  try {
    // 1. 从 API 加载结构
    const structure = loadDataSetStructure(pageData, 'datasetStructureApi')
    if (!structure) {
      throw new Error('加载 DataSet 结构失败')
    }
    
    pageData.dataset = structure
    
    // 2. 加载各表数据
    if (pageData.usersApi) {
      loadApiDataToTable(pageData.dataset, 'Users', pageData, 'usersApi')
    }
    
    if (pageData.ordersApi) {
      loadApiDataToTable(pageData.dataset, 'Orders', pageData, 'ordersApi')
    }
    
    // 3. 初始化 DataSetManager
    dataSetManager = new DataSetManager(pageData.dataset)
    
    console.log('✅ DataSet 初始化完成', dataSetManager.getDataSet())
    
    // 4. 重新绑定数据到视图
    $rebindRules()
    
  } catch (error) {
    console.error('❌ DataSet 初始化失败:', error)
    ElMessage.error('数据加载失败')
  }
}

// ==================== 增（Create）====================

/**
 * 添加新用户
 */
export async function handleAddUser() {
  try {
    // 1. 显示输入对话框（实际应该用表单）
    const { value: name } = await ElMessageBox.prompt('请输入用户姓名', '添加用户')
    
    const newUser = {
      id: Date.now(), // 实际应该由服务器生成
      name: name,
      email: `${name}@example.com`,
      status: '激活'
    }
    
    // 2. 保存到服务器
    const result = await saveRowToServer('/api/users', 'POST', newUser)
    
    // 3. 更新本地 DataSet
    const pageData = $data()
    if (result.code === 200) {
      addRow(pageData.dataset, 'Users', result.data || newUser)
      
      // 4. 重新初始化 DataSetManager
      dataSetManager = new DataSetManager(pageData.dataset)
      
      // 5. 刷新视图
      $rebindRules()
      
      ElMessage.success('添加成功')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('添加用户失败:', error)
      ElMessage.error('添加失败')
    }
  }
}

/**
 * 添加新订单（关联当前用户）
 */
export async function handleAddOrder() {
  const pageData = $data()
  const usersTable = dataSetManager.getTable('Users')
  
  if (!usersTable?.currentRow) {
    ElMessage.warning('请先选择用户')
    return
  }
  
  try {
    const newOrder = {
      id: Date.now(),
      userId: usersTable.currentRow.id,
      orderNo: `ORD${Date.now()}`,
      amount: Math.floor(Math.random() * 2000) + 500,
      status: '待付款',
      createdAt: new Date().toISOString()
    }
    
    // 保存到服务器
    const result = await saveRowToServer('/api/orders', 'POST', newOrder)
    
    if (result.code === 200) {
      addRow(pageData.dataset, 'Orders', result.data || newOrder)
      
      // 重新应用关系过滤
      const relation = dataSetManager.getDataSet().relations?.find(
        r => r.parentTable === 'Users' && r.childTable === 'Orders'
      )
      if (relation) {
        dataSetManager = new DataSetManager(pageData.dataset)
        dataSetManager.setCurrentRow('Users', usersTable.currentRow)
        dataSetManager.applyRelation(relation)
        
        pageData.filteredOrders = dataSetManager.getContext('Orders')?.selectedRows || []
        pageData.currentUser.orderCount = pageData.filteredOrders.length
      }
      
      $rebindRules()
      ElMessage.success('订单添加成功')
    }
  } catch (error) {
    console.error('添加订单失败:', error)
    ElMessage.error('添加失败')
  }
}

// ==================== 改（Update）====================

/**
 * 更新用户信息
 */
export async function handleEditUser(row) {
  try {
    const { value: newName } = await ElMessageBox.prompt('修改用户姓名', '编辑用户', {
      inputValue: row.name
    })
    
    const updates = { name: newName }
    
    // 1. 更新服务器
    const result = await saveRowToServer(`/api/users/${row.id}`, 'PUT', { ...row, ...updates })
    
    if (result.code === 200) {
      // 2. 更新本地 DataSet
      const pageData = $data()
      updateRow(pageData.dataset, 'Users', r => r.id === row.id, updates)
      
      // 3. 重新初始化
      dataSetManager = new DataSetManager(pageData.dataset)
      
      $rebindRules()
      ElMessage.success('更新成功')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('更新用户失败:', error)
      ElMessage.error('更新失败')
    }
  }
}

/**
 * 更新订单状态
 */
export async function handleUpdateOrderStatus(row, newStatus) {
  try {
    const updates = { status: newStatus }
    
    const result = await saveRowToServer(`/api/orders/${row.id}`, 'PATCH', updates)
    
    if (result.code === 200) {
      const pageData = $data()
      updateRow(pageData.dataset, 'Orders', r => r.id === row.id, updates)
      
      // 重新应用过滤
      const usersTable = dataSetManager.getTable('Users')
      if (usersTable?.currentRow) {
        dataSetManager = new DataSetManager(pageData.dataset)
        dataSetManager.setCurrentRow('Users', usersTable.currentRow)
        
        const relation = dataSetManager.getDataSet().relations?.find(
          r => r.parentTable === 'Users' && r.childTable === 'Orders'
        )
        if (relation) {
          dataSetManager.applyRelation(relation)
          pageData.filteredOrders = dataSetManager.getContext('Orders')?.selectedRows || []
        }
      }
      
      $rebindRules()
      ElMessage.success('状态更新成功')
    }
  } catch (error) {
    console.error('更新订单状态失败:', error)
    ElMessage.error('更新失败')
  }
}

// ==================== 删（Delete）====================

/**
 * 删除用户
 */
export async function handleDeleteUser(row) {
  try {
    await ElMessageBox.confirm(`确定删除用户 ${row.name} 吗？`, '警告', {
      type: 'warning'
    })
    
    // 1. 删除服务器数据
    const result = await deleteRowFromServer(`/api/users/${row.id}`)
    
    if (result.code === 200) {
      // 2. 删除本地 DataSet
      const pageData = $data()
      deleteRow(pageData.dataset, 'Users', r => r.id === row.id)
      
      // 3. 级联删除订单
      deleteRow(pageData.dataset, 'Orders', r => r.userId === row.id)
      
      // 4. 重新初始化
      dataSetManager = new DataSetManager(pageData.dataset)
      
      // 5. 清空过滤数据
      pageData.filteredOrders = []
      pageData.currentUser = { label: '未选择', orderCount: 0 }
      
      $rebindRules()
      ElMessage.success('删除成功')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除用户失败:', error)
      ElMessage.error('删除失败')
    }
  }
}

/**
 * 删除订单
 */
export async function handleDeleteOrder(row) {
  try {
    await ElMessageBox.confirm(`确定删除订单 ${row.orderNo} 吗？`, '警告', {
      type: 'warning'
    })
    
    const result = await deleteRowFromServer(`/api/orders/${row.id}`)
    
    if (result.code === 200) {
      const pageData = $data()
      deleteRow(pageData.dataset, 'Orders', r => r.id === row.id)
      
      // 重新应用过滤
      const usersTable = dataSetManager.getTable('Users')
      if (usersTable?.currentRow) {
        dataSetManager = new DataSetManager(pageData.dataset)
        dataSetManager.setCurrentRow('Users', usersTable.currentRow)
        
        const relation = dataSetManager.getDataSet().relations?.find(
          r => r.parentTable === 'Users' && r.childTable === 'Orders'
        )
        if (relation) {
          dataSetManager.applyRelation(relation)
          pageData.filteredOrders = dataSetManager.getContext('Orders')?.selectedRows || []
          pageData.currentUser.orderCount = pageData.filteredOrders.length
        }
      }
      
      $rebindRules()
      ElMessage.success('删除成功')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除订单失败:', error)
      ElMessage.error('删除失败')
    }
  }
}

// ==================== 查（Read）====================

/**
 * 查询激活用户
 */
export function handleQueryActiveUsers() {
  const pageData = $data()
  const activeUsers = queryRows(pageData.dataset, 'Users', row => row.status === '激活')
  
  console.log('激活用户:', activeUsers)
  ElMessage.info(`找到 ${activeUsers.length} 个激活用户`)
  
  return activeUsers
}

/**
 * 根据 ID 查找用户
 */
export function handleFindUserById(userId) {
  const pageData = $data()
  const user = findRowByKey(pageData.dataset, 'Users', userId)
  
  if (user) {
    console.log('找到用户:', user)
    ElMessage.success(`找到用户: ${user.name}`)
  } else {
    ElMessage.warning('用户不存在')
  }
  
  return user
}

/**
 * 统计订单总额
 */
export function handleCalculateTotalAmount() {
  const pageData = $data()
  const allOrders = queryRows(pageData.dataset, 'Orders')
  
  const total = allOrders.reduce((sum, order) => sum + (order.amount || 0), 0)
  
  ElMessage.success(`订单总额: ¥${total}`)
  return total
}

// ==================== 用户选中事件 ====================

export function handleUserSelect(row) {
  if (!dataSetManager || !row) return
  
  dataSetManager.setCurrentRow('Users', row)
  
  const relation = dataSetManager.getDataSet().relations?.find(
    r => r.parentTable === 'Users' && r.childTable === 'Orders'
  )
  
  if (relation) {
    dataSetManager.applyRelation(relation)
    
    const ordersContext = dataSetManager.getContext('Orders')
    const pageData = $data()
    pageData.filteredOrders = ordersContext?.selectedRows || []
    pageData.currentUser = {
      label: row.name,
      orderCount: pageData.filteredOrders.length
    }
    
    $rebindRules()
  }
}

// 页面加载时初始化
setTimeout(() => {
  initDataSet()
}, 200)
```

## 3. Mock API 实现

```typescript
// src/mock/api.ts
import { MockMethod } from 'vite-plugin-mock'

// 模拟数据库
let users = [
  { id: 1, name: '张三', email: 'zhangsan@example.com', status: '激活' },
  { id: 2, name: '李四', email: 'lisi@example.com', status: '激活' },
  { id: 3, name: '王五', email: 'wangwu@example.com', status: '禁用' }
]

let orders = [
  { id: 101, userId: 1, orderNo: 'ORD001', amount: 1200, status: '已完成', createdAt: '2024-01-15' },
  { id: 102, userId: 1, orderNo: 'ORD002', amount: 800, status: '进行中', createdAt: '2024-01-20' },
  { id: 103, userId: 2, orderNo: 'ORD003', amount: 1500, status: '已完成', createdAt: '2024-01-18' }
]

export default [
  // 获取 DataSet 结构
  {
    url: '/api/dataset/structure/user-order',
    method: 'get',
    response: () => ({
      code: 200,
      message: 'success',
      data: {
        dataSetName: 'UserOrderDataSet',
        version: 1,
        tables: [
          {
            tableName: 'Users',
            columns: [
              { name: 'id', type: 'number', isPrimaryKey: true, caption: '用户ID' },
              { name: 'name', type: 'string', caption: '姓名' },
              { name: 'email', type: 'string', caption: '邮箱' },
              { name: 'status', type: 'string', caption: '状态' }
            ]
          },
          {
            tableName: 'Orders',
            columns: [
              { name: 'id', type: 'number', isPrimaryKey: true, caption: '订单ID' },
              { name: 'userId', type: 'number', caption: '用户ID' },
              { name: 'orderNo', type: 'string', caption: '订单号' },
              { name: 'amount', type: 'number', caption: '金额' },
              { name: 'status', type: 'string', caption: '状态' },
              { name: 'createdAt', type: 'string', caption: '创建时间' }
            ]
          }
        ],
        relations: [
          {
            parentTable: 'Users',
            childTable: 'Orders',
            dependencyType: 'currentRow',
            filter: {
              type: 'condition',
              field: 'userId',
              op: '==',
              value: { func: 'FIELD', args: ['id'] }
            }
          }
        ]
      }
    })
  },

  // 查询所有用户
  {
    url: '/api/users',
    method: 'get',
    response: () => ({
      code: 200,
      data: users
    })
  },

  // 添加用户
  {
    url: '/api/users',
    method: 'post',
    response: ({ body }) => {
      const newUser = JSON.parse(body)
      users.push(newUser)
      return { code: 200, message: '添加成功', data: newUser }
    }
  },

  // 更新用户
  {
    url: '/api/users/:id',
    method: 'put',
    response: ({ body, query }) => {
      const id = parseInt(query.id)
      const updates = JSON.parse(body)
      const index = users.findIndex(u => u.id === id)
      
      if (index !== -1) {
        users[index] = { ...users[index], ...updates }
        return { code: 200, message: '更新成功', data: users[index] }
      }
      return { code: 404, message: '用户不存在' }
    }
  },

  // 删除用户
  {
    url: '/api/users/:id',
    method: 'delete',
    response: ({ query }) => {
      const id = parseInt(query.id)
      users = users.filter(u => u.id !== id)
      orders = orders.filter(o => o.userId !== id) // 级联删除
      return { code: 200, message: '删除成功' }
    }
  },

  // 订单 CRUD（类似实现）
  {
    url: '/api/orders',
    method: 'get',
    response: () => ({ code: 200, data: orders })
  },

  {
    url: '/api/orders',
    method: 'post',
    response: ({ body }) => {
      const newOrder = JSON.parse(body)
      orders.push(newOrder)
      return { code: 200, message: '添加成功', data: newOrder }
    }
  },

  {
    url: '/api/orders/:id',
    method: 'patch',
    response: ({ body, query }) => {
      const id = parseInt(query.id)
      const updates = JSON.parse(body)
      const index = orders.findIndex(o => o.id === id)
      
      if (index !== -1) {
        orders[index] = { ...orders[index], ...updates }
        return { code: 200, message: '更新成功', data: orders[index] }
      }
      return { code: 404, message: '订单不存在' }
    }
  },

  {
    url: '/api/orders/:id',
    method: 'delete',
    response: ({ query }) => {
      const id = parseInt(query.id)
      orders = orders.filter(o => o.id !== id)
      return { code: 200, message: '删除成功' }
    }
  }
] as MockMethod[]
```

## 4. 高级功能

### 批量操作

```javascript
import { batchAddRows, batchDeleteByKeys } from '../datasetHelper'

// 批量导入用户
export async function handleBatchImportUsers(userList) {
  const result = await saveRowToServer('/api/users/batch', 'POST', userList)
  
  if (result.code === 200) {
    const pageData = $data()
    batchAddRows(pageData.dataset, 'Users', result.data)
    dataSetManager = new DataSetManager(pageData.dataset)
    $rebindRules()
  }
}

// 批量删除订单
export async function handleBatchDeleteOrders(orderIds) {
  const result = await deleteRowFromServer(`/api/orders/batch?ids=${orderIds.join(',')}`)
  
  if (result.code === 200) {
    const pageData = $data()
    batchDeleteByKeys(pageData.dataset, 'Orders', orderIds)
    dataSetManager = new DataSetManager(pageData.dataset)
    $rebindRules()
  }
}
```

### 事务支持

```javascript
export async function handleTransferOrder(orderId, fromUserId, toUserId) {
  try {
    // 开始事务
    const result = await fetch('/api/transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operations: [
          { type: 'update', table: 'Orders', id: orderId, data: { userId: toUserId } },
          { type: 'log', table: 'AuditLog', data: { action: 'transfer', orderId, fromUserId, toUserId } }
        ]
      })
    })
    
    const data = await result.json()
    
    if (data.code === 200) {
      // 更新本地 DataSet
      const pageData = $data()
      updateRow(pageData.dataset, 'Orders', r => r.id === orderId, { userId: toUserId })
      dataSetManager = new DataSetManager(pageData.dataset)
      $rebindRules()
      ElMessage.success('订单转移成功')
    }
  } catch (error) {
    console.error('事务失败:', error)
    ElMessage.error('操作失败')
  }
}
```

## 8. 级联操作（Cascade Operations）

### 8.1 级联更新 (cascadeUpdate)

当父表的行更新时，自动同步更新子表中的外键字段。

#### 配置示例

```json
{
  "dataSetName": "UserOrders",
  "tables": [...],
  "relations": [
    {
      "parentTable": "Users",
      "childTable": "Orders",
      "dependencyType": "currentRow",
      "filterExpression": {
        "field": "userId",
        "op": "==",
        "value": { "func": "FIELD", "args": ["id"] }
      },
      "cascadeUpdate": true  // ✅ 启用级联更新
    }
  ]
}
```

#### 使用方法

```javascript
import { updateRow } from '@/utils/page-helpers/datasetHelper.js'
import { DataSetManager } from '../utils/dataSetManager'

export async function handleUpdateUserId(oldUserId, newUserId) {
  const pageData = $data()
  
  // 创建 DataSetManager 实例
  const manager = new DataSetManager(pageData.dataset)
  
  // 更新用户 ID（传入 manager 触发级联）
  const count = updateRow(
    pageData.dataset, 
    'Users', 
    row => row.id === oldUserId,
    { id: newUserId },
    manager  // ✅ 传入 manager 启用级联
  )
  
  // 级联更新会自动：
  // 1. 找到所有 Orders 表中 userId === oldUserId 的行
  // 2. 将这些行的 userId 更新为 newUserId
  
  if (count > 0) {
    // 同步到服务器
    await saveRowToServer('/api/users', { id: newUserId })
    $rebindRules()
    ElMessage.success('用户ID更新成功，订单已自动关联')
  }
}
```

#### 工作原理

1. **提取外键映射**：从 `filterExpression` 中解析出 `{ childField: 'userId', parentField: 'id' }`
2. **查找匹配行**：在子表中找到所有满足旧值的行
3. **更新外键**：将这些行的外键字段更新为新值
4. **触发事件**：emit `cascadeUpdate` 事件供监听

### 8.2 级联删除 (cascadeDelete)

当父表的行删除时，自动删除子表中所有关联的行（递归删除）。

#### 配置示例

```json
{
  "relations": [
    {
      "parentTable": "Users",
      "childTable": "Orders",
      "dependencyType": "allRows",
      "filterExpression": {
        "field": "userId",
        "op": "==",
        "value": { "func": "FIELD", "args": ["id"] }
      },
      "cascadeDelete": true  // ✅ 启用级联删除
    },
    {
      "parentTable": "Orders",
      "childTable": "OrderItems",
      "dependencyType": "allRows",
      "filterExpression": {
        "field": "orderId",
        "op": "==",
        "value": { "func": "FIELD", "args": ["id"] }
      },
      "cascadeDelete": true  // ✅ 多层级联
    }
  ]
}
```

#### 使用方法

```javascript
import { deleteRow } from '@/utils/page-helpers/datasetHelper.js'
import { DataSetManager } from '../utils/dataSetManager'

export async function handleDeleteUser(userId) {
  const pageData = $data()
  
  // 创建 DataSetManager 实例
  const manager = new DataSetManager(pageData.dataset)
  
  // 删除用户（传入 manager 触发级联）
  const count = deleteRow(
    pageData.dataset,
    'Users',
    row => row.id === userId,
    manager  // ✅ 传入 manager 启用级联
  )
  
  // 级联删除会自动：
  // 1. 删除所有 userId === userId 的 Orders 行
  // 2. 递归删除所有关联的 OrderItems 行（子表的子表）
  // 3. 按依赖顺序由深到浅删除，避免孤儿数据
  
  if (count > 0) {
    // 同步到服务器
    await deleteRowFromServer(`/api/users/${userId}`)
    $rebindRules()
    ElMessage.success(`用户及其 ${manager.deletedCount} 个关联记录已删除`)
  }
}
```

#### 工作原理

1. **递归删除**：先删除子表的子表，再删除子表（深度优先）
2. **提取外键映射**：从 `filterExpression` 解析外键关系
3. **查找关联行**：在子表中找到所有匹配的行
4. **批量删除**：从子表的 `rows` 数组中移除匹配行
5. **触发事件**：emit `cascadeDelete` 事件供监听

### 8.3 事件监听

```javascript
import { DataSetManager } from '../utils/dataSetManager'

export function initDataSet() {
  const pageData = $data()
  const manager = new DataSetManager(pageData.dataset)
  
  // 监听级联更新事件
  manager.on('cascadeUpdate', ({ parentTable, childTable, parentRow, oldValues }) => {
    console.log(`级联更新: ${parentTable} -> ${childTable}`)
    console.log('父行新值:', parentRow)
    console.log('父行旧值:', oldValues)
    
    // 可以在这里添加日志、UI 提示等
    ElMessage.info(`${childTable} 已自动更新以匹配 ${parentTable}`)
  })
  
  // 监听级联删除事件
  manager.on('cascadeDelete', ({ parentTable, childTable, parentRow, deletedRows }) => {
    console.log(`级联删除: ${parentTable} -> ${childTable}`)
    console.log('删除的父行:', parentRow)
    console.log('删除的子行数量:', deletedRows.length)
    
    ElMessage.warning(`删除 ${parentTable} 时已自动删除 ${deletedRows.length} 个 ${childTable} 记录`)
  })
  
  return manager
}
```

### 8.4 注意事项

⚠️ **级联配置风险**：
- `cascadeDelete` 会递归删除所有子孙数据，务必谨慎使用
- 建议在删除前显示确认对话框，提示将删除的关联数据数量
- 生产环境建议使用软删除（标记 `deleted: true`）而非物理删除

⚠️ **性能考虑**：
- 大量级联操作会遍历整个子表，数据量大时可能有性能影响
- 建议使用后端批量删除 API（`DELETE /api/users/1?cascade=true`）
- 前端级联主要用于：
  1. 本地数据模拟
  2. Mock 数据测试
  3. 离线模式操作

⚠️ **服务器同步**：
- 级联操作**仅更新本地 DataSet**，不会自动调用服务器 API
- 需要手动调用 `saveRowToServer()` / `deleteRowFromServer()` 同步
- 或使用支持级联的服务器 API：`DELETE /api/users/1?cascade=true`

### 8.5 完整示例

```javascript
// script.js
import { updateRow, deleteRow } from '@/utils/page-helpers/datasetHelper.js'
import { DataSetManager } from '../utils/dataSetManager'
import { ElMessage, ElMessageBox } from 'element-plus'

let dataSetManager = null

export function initDataSet() {
  const pageData = $data()
  dataSetManager = new DataSetManager(pageData.dataset)
  
  // 监听级联事件
  dataSetManager.on('cascadeUpdate', ({ childTable, deletedRows }) => {
    console.log(`✅ 级联更新: ${childTable} 已同步`)
  })
  
  dataSetManager.on('cascadeDelete', ({ childTable, deletedRows }) => {
    console.log(`⚠️ 级联删除: ${childTable} 删除了 ${deletedRows.length} 行`)
  })
  
  return dataSetManager
}

export async function handleDeleteUserWithConfirm(userId) {
  const pageData = $data()
  const user = pageData.dataset.tables.find(t => t.tableName === 'Users')
    ?.rows.find(r => r.id === userId)
  
  if (!user) return
  
  // 计算将删除的关联数据
  const orderCount = pageData.dataset.tables.find(t => t.tableName === 'Orders')
    ?.rows.filter(r => r.userId === userId).length || 0
  
  // 确认对话框
  try {
    await ElMessageBox.confirm(
      `确定删除用户 "${user.name}"吗？这将同时删除其 ${orderCount} 个订单及所有订单明细。`,
      '危险操作',
      { type: 'warning' }
    )
    
    // 执行级联删除
    const count = deleteRow(
      pageData.dataset,
      'Users',
      row => row.id === userId,
      dataSetManager  // 启用级联
    )
    
    if (count > 0) {
      // 同步到服务器
      await deleteRowFromServer(`/api/users/${userId}?cascade=true`)
      $rebindRules()
      ElMessage.success('删除成功')
    }
  } catch {
    ElMessage.info('已取消删除')
  }
}
```

## 总结

✅ **完整的 CRUD 能力**：增删改查全覆盖  
✅ **服务器同步**：所有操作先更新服务器，再更新本地  
✅ **动态结构**：表结构通过 API 动态加载  
✅ **关系联动**：自动处理主从表关系  
✅ **批量操作**：支持批量增删改  
✅ **事务支持**：多操作原子执行  
✅ **级联更新**：自动同步子表外键字段  
✅ **级联删除**：递归删除所有子孙数据
