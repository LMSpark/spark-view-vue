# 业务层网络CRUD封装

本文档介绍如何在 `packages/spark-data` 层使用封装的网络CRUD功能。

## 概述

SPARK数据层提供了完整的网络CRUD封装，基于 `spark-utils` 的HTTP客户端，提供了类型安全的CRUD操作，包括：

- 基础CRUD操作（创建、查询、更新、删除）
- 批量操作
- 分页查询
- 导入导出
- 自动权限处理

## 核心组件

### CrudService

核心CRUD服务类，封装所有网络操作。

```typescript
import { CrudService, createCrudService } from '@spark-view/spark-data'

// 创建CRUD服务实例
const crudService = createCrudService({
  create: { url: '/api/users', method: 'POST' },
  retrieve: { url: '/api/users/:id', method: 'GET', pathParams: ['id'] },
  update: { url: '/api/users/:id', method: 'PUT', pathParams: ['id'] },
  delete: { url: '/api/users/:id', method: 'DELETE', pathParams: ['id'] },
  list: {
    url: '/api/users',
    method: 'GET',
    pagination: { pageParam: 'page', sizeParam: 'size', sortParam: 'sort' }
  }
})
```

### DataTable 集成

DataTable类集成了CRUD功能，可以直接进行网络操作。

```typescript
import { SparkData } from '@spark-view/spark-data'

// 创建带API配置的DataTable
const userTable = SparkData.createDataTable({
  tableName: 'users',
  columns: [
    { name: 'id', type: 'number', isPrimaryKey: true },
    { name: 'name', type: 'string' },
    { name: 'email', type: 'string' }
  ],
  api: {
    create: { url: '/api/users', method: 'POST' },
    retrieve: { url: '/api/users/:id', method: 'GET', pathParams: ['id'] },
    update: { url: '/api/users/:id', method: 'PUT', pathParams: ['id'] },
    delete: { url: '/api/users/:id', method: 'DELETE', pathParams: ['id'] },
    list: { url: '/api/users', method: 'GET' }
  }
})
```

## API配置

### CrudApi 接口

```typescript
interface CrudApi {
  // 基础CRUD
  create?: HttpEndpoint
  retrieve?: HttpEndpoint
  update?: HttpEndpoint
  delete?: HttpEndpoint
  list?: HttpEndpoint & {
    pagination?: {
      pageParam?: string    // 分页页码参数名，默认 'page'
      sizeParam?: string    // 分页大小参数名，默认 'size'
      sortParam?: string    // 排序参数名，默认 'sort'
    }
  }

  // 批量操作
  batch?: {
    create?: HttpEndpoint
    update?: HttpEndpoint
    delete?: HttpEndpoint
  }

  // 导入导出
  import?: HttpEndpoint
  export?: HttpEndpoint
}
```

### HttpEndpoint 接口

```typescript
interface HttpEndpoint {
  url: string                    // 请求URL
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'  // HTTP方法
  headers?: Record<string, string>  // 请求头
  params?: Record<string, unknown>  // URL查询参数
  pathParams?: string[]           // 路径参数（如 :id）
  baseURL?: string               // 基础URL
}
```

## 使用示例

### 1. 基础CRUD操作

```typescript
// 创建记录
const createResult = await userTable.createRecord({
  name: '张三',
  email: 'zhangsan@example.com'
})
if (createResult.success) {
  console.log('创建成功:', createResult.data)
}

// 查询记录
const retrieveResult = await userTable.loadFromServer({ id: 1 })
if (retrieveResult.success) {
  console.log('查询成功:', retrieveResult.data)
}

// 更新记录
const updateResult = await userTable.updateRecord(1, {
  name: '李四',
  email: 'lisi@example.com'
})

// 删除记录
const deleteResult = await userTable.deleteRecord(1)
```

### 2. 分页查询

```typescript
// 分页查询用户列表
const listResult = await userTable.loadFromServer({
  page: 1,
  pageSize: 20,
  sort: 'name asc',
  filter: { status: 'active' }
})

if (listResult.success) {
  const data = listResult.data as any
  console.log(`第${data.page}页，共${data.total}条记录`)
  console.log('用户列表:', data.rows)
}
```

### 3. 批量操作

```typescript
// 批量创建
const batchCreateResult = await userTable.batchCreateRecords([
  { name: '用户1', email: 'user1@example.com' },
  { name: '用户2', email: 'user2@example.com' }
])

// 批量更新
const batchUpdateResult = await userTable.batchUpdateRecords([
  { id: 1, name: '新用户1' },
  { id: 2, name: '新用户2' }
])

// 批量删除
const batchDeleteResult = await userTable.batchDeleteRecords([1, 2, 3])
```

### 4. 导入导出

```typescript
// 导入数据
const importResult = await userTable.importData(fileInput.files[0])
if (importResult.success) {
  console.log(`导入成功: ${importResult.data?.imported}条，失败: ${importResult.data?.failed}条`)
}

// 导出数据
const exportResult = await userTable.exportData({
  filter: { status: 'active' }
})
if (exportResult.success) {
  // 下载导出的文件
  const blob = exportResult.data!
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'users.xlsx'
  a.click()
}
```

## 高级用法

### 自定义HTTP配置

```typescript
import { SparkData } from '@spark-view/spark-data'

// 创建带自定义HTTP配置的CRUD服务
const customCrudService = SparkData.createCrudService(apiConfig, {
  baseURL: '/api/v2',
  timeout: 30000,
  headers: {
    'Authorization': 'Bearer ' + token,
    'X-Tenant-ID': tenantId
  }
})
```

### 事件监听

DataTable在执行CRUD操作时会触发相应的事件：

```typescript
userTable.on('recordCreated', (event) => {
  console.log('记录创建:', event.record)
})

userTable.on('recordUpdated', (event) => {
  console.log('记录更新:', event.record)
})

userTable.on('recordDeleted', (event) => {
  console.log('记录删除:', event.id)
})

userTable.on('dataLoaded', (event) => {
  console.log('数据加载完成:', event.data)
})
```

### 权限集成

CRUD操作会自动处理权限信息：

```typescript
// 创建记录时会检查创建权限
const result = await userTable.createRecord({
  name: '新用户',
  email: 'newuser@example.com'
})

// 返回的数据会包含权限信息
if (result.success) {
  const record = result.data!
  if (record._perm?.allowDelete) {
    // 用户有删除权限
  }
}
```

## 最佳实践

### 1. API配置管理

建议将API配置集中管理：

```typescript
// api-configs.ts
export const userApi: CrudApi = {
  create: { url: '/api/users', method: 'POST' },
  retrieve: { url: '/api/users/:id', method: 'GET', pathParams: ['id'] },
  update: { url: '/api/users/:id', method: 'PUT', pathParams: ['id'] },
  delete: { url: '/api/users/:id', method: 'DELETE', pathParams: ['id'] },
  list: {
    url: '/api/users',
    method: 'GET',
    pagination: { pageParam: 'page', sizeParam: 'limit' }
  }
}
```

### 2. 错误处理

```typescript
try {
  const result = await userTable.createRecord(userData)
  if (!result.success) {
    // 处理业务错误
    console.error('创建失败:', result.message)
    return
  }
  // 处理成功
} catch (error) {
  // 处理网络错误
  console.error('网络错误:', error)
}
```

### 3. 类型安全

使用TypeScript接口确保类型安全：

```typescript
interface User {
  id: number
  name: string
  email: string
  role: 'admin' | 'user'
  createdAt: Date
}

// 在DataTable中使用泛型
const userTable = SparkData.createDataTable<User>({
  tableName: 'users',
  columns: [
    { name: 'id', type: 'number', isPrimaryKey: true },
    { name: 'name', type: 'string' },
    { name: 'email', type: 'string' },
    { name: 'role', type: 'string' },
    { name: 'createdAt', type: 'date' }
  ],
  api: userApi
})
```

## 架构优势

1. **统一抽象**: 基于HTTP的统一CRUD接口
2. **类型安全**: 完整的TypeScript类型支持
3. **权限集成**: 自动处理实例级和模型级权限
4. **事件驱动**: 丰富的事件系统便于状态管理
5. **批量操作**: 支持高效的批量数据处理
6. **导入导出**: 内置文件上传下载功能
7. **可扩展**: 易于扩展自定义业务逻辑