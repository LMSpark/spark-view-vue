# DataSet API 集成改进方案

> **问题描述**: DataTable 的 CrudApi 配置缺少运行时依赖（API 基地址、环境数据、HTTP 客户端）  
> **影响范围**: packages/spark-data, packages/spark-app, packages/spark-renderer  
> **优先级**: P1（短期，1-2周）

---

## 一、现状问题分析

### 1.1 当前设计

```typescript
// packages/spark-data/src/types.ts
export interface DataTable {
  tableName: string
  columns: DataColumn[]
  api?: CrudApi  // ❌ 只是配置，无法直接调用
  rows: DataRow[]
}

export interface CrudApi {
  list?: HttpEndpoint  // { url: '/users', method: 'GET' }
  create?: HttpEndpoint
  update?: HttpEndpoint
  delete?: HttpEndpoint
}

export interface HttpEndpoint {
  url: string              // ❌ 相对路径，缺少 baseURL
  method?: 'GET'|'POST'    // ❌ 没有请求器
  headers?: Record<string, string>  // ❌ 静态配置，无动态 token
}
```

### 1.2 缺失的依赖

| 依赖项 | 当前状态 | 需要来源 | 用途 |
|--------|---------|---------|------|
| **API 基地址** | ❌ 缺失 | AppContext.env.apiBaseUrl | 拼接完整 URL |
| **认证 Token** | ❌ 缺失 | AppContext.user.token | 请求头 Authorization |
| **租户 ID** | ❌ 缺失 | AppContext.tenant.tenantId | 多租户隔离 |
| **HTTP 客户端** | ❌ 缺失 | ApiClient 实例 | 统一请求封装 |
| **环境变量** | ❌ 缺失 | import.meta.env | 区分开发/生产 |

### 1.3 真实使用场景

```typescript
// ❌ 当前无法实现
const usersTable = dataSet.getTable('Users')
if (usersTable.api?.list) {
  // 如何调用？缺少 HTTP 客户端和 baseURL
  const rows = await ???
}

// ✅ 理想的使用方式
const usersTable = dataSet.getTable('Users')
const rows = await usersTable.api.list()  // 自动处理 baseURL、token、错误处理
```

---

## 二、设计目标

### 2.1 核心原则

1. **分层解耦**: DataSet（领域层）不直接依赖 HTTP 客户端
2. **依赖注入**: 从应用层注入 API 客户端和上下文
3. **向后兼容**: 保持现有接口不变，扩展新功能
4. **类型安全**: 完整的 TypeScript 类型支持

### 2.2 设计模式

- **适配器模式**: ApiAdapter 将 CrudApi 配置转换为可调用方法
- **工厂模式**: ApiClientFactory 根据环境创建合适的客户端
- **策略模式**: 不同环境使用不同的请求策略（Mock/Real/Hybrid）

---

## 三、解决方案设计

### 3.1 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      应用层 (App Layer)                       │
│  ┌─────────────────┐        ┌──────────────────┐            │
│  │  AppContext     │───────▶│  ApiClient       │            │
│  │  - apiBaseUrl   │        │  - request()     │            │
│  │  - token        │        │  - get/post()    │            │
│  │  - tenantId     │        │  - interceptors  │            │
│  └─────────────────┘        └──────────────────┘            │
└────────────────────┬────────────────────────────────────────┘
                     │ 注入
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   数据层 (Data Layer)                        │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  DataSet                                            │    │
│  │  - apiAdapter: ApiAdapter  (注入的适配器)           │    │
│  │  - loadTableData(tableName)                         │    │
│  └─────────────────┬───────────────────────────────────┘    │
│                    │                                         │
│                    ▼                                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  DataTable                                          │    │
│  │  - api: CrudApi (静态配置)                          │    │
│  │  - apiAdapter: ApiAdapter (注入的适配器)            │    │
│  │  + async list(params?)                              │    │
│  │  + async create(data)                               │    │
│  │  + async update(id, data)                           │    │
│  │  + async delete(id)                                 │    │
│  └─────────────────┬───────────────────────────────────┘    │
│                    │                                         │
│                    ▼                                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  ApiAdapter                                         │    │
│  │  - client: ApiClient                                │    │
│  │  - context: AppContext                              │    │
│  │  + buildRequest(endpoint: HttpEndpoint)             │    │
│  │  + execute<T>(config): Promise<T>                   │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 新增类型定义

```typescript
// packages/spark-data/src/types.ts

/**
 * API 上下文接口（从应用层注入）
 */
export interface IApiContext {
  /** API 基础地址 */
  baseURL: string
  
  /** 认证 Token */
  token?: string
  
  /** 租户 ID */
  tenantId?: string
  
  /** 自定义请求头 */
  headers?: Record<string, string>
  
  /** 请求超时（毫秒） */
  timeout?: number
}

/**
 * API 客户端接口
 */
export interface IApiClient {
  /**
   * 通用请求方法
   */
  request<T = unknown>(config: {
    url: string
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    params?: Record<string, unknown>
    data?: unknown
    headers?: Record<string, string>
  }): Promise<T>
  
  /** GET 请求 */
  get<T = unknown>(url: string, params?: Record<string, unknown>): Promise<T>
  
  /** POST 请求 */
  post<T = unknown>(url: string, data?: unknown): Promise<T>
  
  /** PUT 请求 */
  put<T = unknown>(url: string, data?: unknown): Promise<T>
  
  /** DELETE 请求 */
  delete<T = unknown>(url: string, params?: Record<string, unknown>): Promise<T>
}

/**
 * API 适配器接口
 */
export interface IApiAdapter {
  /**
   * 构建请求配置
   */
  buildRequest(endpoint: HttpEndpoint, params?: Record<string, unknown>): {
    url: string
    method: string
    data?: unknown
    headers?: Record<string, string>
  }
  
  /**
   * 执行请求
   */
  execute<T = unknown>(endpoint: HttpEndpoint, params?: Record<string, unknown>): Promise<T>
}

/**
 * 增强的 DataTable 接口（添加 API 方法）
 */
export interface IDataTableWithApi extends IDataTable {
  /**
   * 列表查询
   */
  list(params?: Record<string, unknown>): Promise<DataRow[]>
  
  /**
   * 创建记录
   */
  create(data: DataRow): Promise<DataRow>
  
  /**
   * 更新记录
   */
  update(id: string | number, data: Partial<DataRow>): Promise<DataRow>
  
  /**
   * 删除记录
   */
  delete(id: string | number): Promise<boolean>
  
  /**
   * 批量创建
   */
  batchCreate(data: DataRow[]): Promise<DataRow[]>
  
  /**
   * 批量更新
   */
  batchUpdate(data: Array<{ id: string | number; data: Partial<DataRow> }>): Promise<DataRow[]>
  
  /**
   * 批量删除
   */
  batchDelete(ids: Array<string | number>): Promise<boolean>
}
```

### 3.3 ApiAdapter 实现

```typescript
// packages/spark-data/src/apiAdapter.ts

import type { IApiAdapter, IApiClient, IApiContext, HttpEndpoint, DataRow } from './types'

/**
 * API 适配器实现
 * 
 * 职责：
 * - 将 HttpEndpoint 配置转换为实际的 HTTP 请求
 * - 自动注入 baseURL、token、tenantId
 * - 处理路径参数、查询参数
 */
export class ApiAdapter implements IApiAdapter {
  constructor(
    private client: IApiClient,
    private context: IApiContext
  ) {}
  
  /**
   * 构建请求配置
   */
  buildRequest(
    endpoint: HttpEndpoint,
    params?: Record<string, unknown>
  ): {
    url: string
    method: string
    data?: unknown
    headers?: Record<string, string>
  } {
    // 1. 拼接 URL
    let url = endpoint.url
    
    // 处理路径参数: /users/{id} → /users/123
    if (endpoint.pathParams && params) {
      endpoint.pathParams.forEach(param => {
        if (params[param] !== undefined) {
          url = url.replace(`{${param}}`, String(params[param]))
        }
      })
    }
    
    // 拼接 baseURL
    const fullUrl = this.context.baseURL + url
    
    // 2. 合并请求头
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.context.headers,
      ...endpoint.headers
    }
    
    // 添加认证 Token
    if (this.context.token) {
      headers['Authorization'] = `Bearer ${this.context.token}`
    }
    
    // 添加租户 ID
    if (this.context.tenantId) {
      headers['X-Tenant-Id'] = this.context.tenantId
    }
    
    // 3. 处理查询参数和请求体
    const method = endpoint.method || 'GET'
    let data: unknown = undefined
    let queryParams: Record<string, unknown> = { ...endpoint.queryParams }
    
    if (params) {
      // GET/DELETE 使用查询参数
      if (method === 'GET' || method === 'DELETE') {
        queryParams = { ...queryParams, ...params }
      } else {
        // POST/PUT/PATCH 使用请求体
        data = params
      }
    }
    
    // 拼接查询参数到 URL
    if (Object.keys(queryParams).length > 0) {
      const query = new URLSearchParams(
        Object.entries(queryParams).map(([k, v]) => [k, String(v)])
      ).toString()
      url = `${fullUrl}?${query}`
    } else {
      url = fullUrl
    }
    
    return { url, method, data, headers }
  }
  
  /**
   * 执行请求
   */
  async execute<T = unknown>(
    endpoint: HttpEndpoint,
    params?: Record<string, unknown>
  ): Promise<T> {
    const config = this.buildRequest(endpoint, params)
    
    try {
      return await this.client.request<T>(config)
    } catch (error) {
      console.error('[ApiAdapter] 请求失败', { endpoint, params, error })
      throw error
    }
  }
}
```

### 3.4 DataTable 增强实现

```typescript
// packages/spark-data/src/dataTable.ts

import { BindingContext } from './bindingContext'
import type { 
  IDataTable, 
  IDataTableWithApi,
  IBindingContext, 
  DataColumn, 
  CrudApi, 
  IDataSet,
  IApiAdapter,
  DataRow
} from './types'

/**
 * 数据表类（增强版，支持 API 调用）
 */
export class DataTable extends BindingContext implements IDataTableWithApi {
  tableName: string
  columns: DataColumn[]
  api?: CrudApi
  contexts: Record<string, BindingContext> = {}
  
  // 扩展属性
  loading?: boolean
  error?: string
  
  // API 适配器（注入）
  private apiAdapter?: IApiAdapter

  constructor(
    tableName: string,
    columns: DataColumn[] = [],
    dataSet?: IDataSet,
    apiAdapter?: IApiAdapter
  ) {
    super(tableName, 'default', dataSet)
    this.tableName = tableName
    this.columns = columns
    this.apiAdapter = apiAdapter
  }
  
  /**
   * 设置 API 适配器
   */
  setApiAdapter(adapter: IApiAdapter): void {
    this.apiAdapter = adapter
  }
  
  // ==================== CRUD 方法 ====================
  
  /**
   * 列表查询
   */
  async list(params?: Record<string, unknown>): Promise<DataRow[]> {
    if (!this.api?.list) {
      throw new Error(`表 ${this.tableName} 未配置 list API`)
    }
    
    if (!this.apiAdapter) {
      throw new Error('未注入 ApiAdapter，无法执行 API 调用')
    }
    
    this.loading = true
    this.error = undefined
    
    try {
      const data = await this.apiAdapter.execute<DataRow[]>(this.api.list, params)
      
      // 自动更新表数据
      this.rows.splice(0, this.rows.length, ...data)
      this.__originalRows = [...data]
      
      console.info(`✅ [DataTable] ${this.tableName}.list() 成功，共 ${data.length} 行`)
      
      return data
    } catch (error) {
      this.error = (error as Error).message
      console.error(`❌ [DataTable] ${this.tableName}.list() 失败`, error)
      throw error
    } finally {
      this.loading = false
    }
  }
  
  /**
   * 创建记录
   */
  async create(data: DataRow): Promise<DataRow> {
    if (!this.api?.create) {
      throw new Error(`表 ${this.tableName} 未配置 create API`)
    }
    
    if (!this.apiAdapter) {
      throw new Error('未注入 ApiAdapter，无法执行 API 调用')
    }
    
    this.loading = true
    
    try {
      const result = await this.apiAdapter.execute<DataRow>(this.api.create, data)
      
      // 自动添加到表
      this.rows.push(result)
      if (this.__originalRows) {
        this.__originalRows.push(result)
      }
      
      console.info(`✅ [DataTable] ${this.tableName}.create() 成功`)
      
      return result
    } catch (error) {
      console.error(`❌ [DataTable] ${this.tableName}.create() 失败`, error)
      throw error
    } finally {
      this.loading = false
    }
  }
  
  /**
   * 更新记录
   */
  async update(id: string | number, data: Partial<DataRow>): Promise<DataRow> {
    if (!this.api?.update) {
      throw new Error(`表 ${this.tableName} 未配置 update API`)
    }
    
    if (!this.apiAdapter) {
      throw new Error('未注入 ApiAdapter，无法执行 API 调用')
    }
    
    this.loading = true
    
    try {
      const result = await this.apiAdapter.execute<DataRow>(this.api.update, { id, ...data })
      
      // 自动更新表中的记录
      const index = this.rows.findIndex(r => r.id === id)
      if (index > -1) {
        Object.assign(this.rows[index], result)
      }
      
      if (this.__originalRows) {
        const cacheIndex = this.__originalRows.findIndex(r => r.id === id)
        if (cacheIndex > -1) {
          Object.assign(this.__originalRows[cacheIndex], result)
        }
      }
      
      console.info(`✅ [DataTable] ${this.tableName}.update() 成功`)
      
      return result
    } catch (error) {
      console.error(`❌ [DataTable] ${this.tableName}.update() 失败`, error)
      throw error
    } finally {
      this.loading = false
    }
  }
  
  /**
   * 删除记录
   */
  async delete(id: string | number): Promise<boolean> {
    if (!this.api?.delete) {
      throw new Error(`表 ${this.tableName} 未配置 delete API`)
    }
    
    if (!this.apiAdapter) {
      throw new Error('未注入 ApiAdapter，无法执行 API 调用')
    }
    
    this.loading = true
    
    try {
      await this.apiAdapter.execute(this.api.delete, { id })
      
      // 自动从表中删除
      const index = this.rows.findIndex(r => r.id === id)
      if (index > -1) {
        this.rows.splice(index, 1)
      }
      
      if (this.__originalRows) {
        const cacheIndex = this.__originalRows.findIndex(r => r.id === id)
        if (cacheIndex > -1) {
          this.__originalRows.splice(cacheIndex, 1)
        }
      }
      
      console.info(`✅ [DataTable] ${this.tableName}.delete() 成功`)
      
      return true
    } catch (error) {
      console.error(`❌ [DataTable] ${this.tableName}.delete() 失败`, error)
      throw error
    } finally {
      this.loading = false
    }
  }
  
  /**
   * 批量创建
   */
  async batchCreate(data: DataRow[]): Promise<DataRow[]> {
    if (!this.api?.batch?.create) {
      throw new Error(`表 ${this.tableName} 未配置 batch.create API`)
    }
    
    if (!this.apiAdapter) {
      throw new Error('未注入 ApiAdapter，无法执行 API 调用')
    }
    
    this.loading = true
    
    try {
      const result = await this.apiAdapter.execute<DataRow[]>(this.api.batch.create, { items: data })
      
      // 自动添加到表
      this.rows.push(...result)
      if (this.__originalRows) {
        this.__originalRows.push(...result)
      }
      
      console.info(`✅ [DataTable] ${this.tableName}.batchCreate() 成功，共 ${result.length} 条`)
      
      return result
    } catch (error) {
      console.error(`❌ [DataTable] ${this.tableName}.batchCreate() 失败`, error)
      throw error
    } finally {
      this.loading = false
    }
  }
  
  /**
   * 批量更新
   */
  async batchUpdate(updates: Array<{ id: string | number; data: Partial<DataRow> }>): Promise<DataRow[]> {
    if (!this.api?.batch?.update) {
      throw new Error(`表 ${this.tableName} 未配置 batch.update API`)
    }
    
    if (!this.apiAdapter) {
      throw new Error('未注入 ApiAdapter，无法执行 API 调用')
    }
    
    this.loading = true
    
    try {
      const result = await this.apiAdapter.execute<DataRow[]>(this.api.batch.update, { items: updates })
      
      // 自动更新表中的记录
      result.forEach(updated => {
        const index = this.rows.findIndex(r => r.id === updated.id)
        if (index > -1) {
          Object.assign(this.rows[index], updated)
        }
        
        if (this.__originalRows) {
          const cacheIndex = this.__originalRows.findIndex(r => r.id === updated.id)
          if (cacheIndex > -1) {
            Object.assign(this.__originalRows[cacheIndex], updated)
          }
        }
      })
      
      console.info(`✅ [DataTable] ${this.tableName}.batchUpdate() 成功，共 ${result.length} 条`)
      
      return result
    } catch (error) {
      console.error(`❌ [DataTable] ${this.tableName}.batchUpdate() 失败`, error)
      throw error
    } finally {
      this.loading = false
    }
  }
  
  /**
   * 批量删除
   */
  async batchDelete(ids: Array<string | number>): Promise<boolean> {
    if (!this.api?.batch?.delete) {
      throw new Error(`表 ${this.tableName} 未配置 batch.delete API`)
    }
    
    if (!this.apiAdapter) {
      throw new Error('未注入 ApiAdapter，无法执行 API 调用')
    }
    
    this.loading = true
    
    try {
      await this.apiAdapter.execute(this.api.batch.delete, { ids })
      
      // 自动从表中删除
      ids.forEach(id => {
        const index = this.rows.findIndex(r => r.id === id)
        if (index > -1) {
          this.rows.splice(index, 1)
        }
        
        if (this.__originalRows) {
          const cacheIndex = this.__originalRows.findIndex(r => r.id === id)
          if (cacheIndex > -1) {
            this.__originalRows.splice(cacheIndex, 1)
          }
        }
      })
      
      console.info(`✅ [DataTable] ${this.tableName}.batchDelete() 成功，共 ${ids.length} 条`)
      
      return true
    } catch (error) {
      console.error(`❌ [DataTable] ${this.tableName}.batchDelete() 失败`, error)
      throw error
    } finally {
      this.loading = false
    }
  }
  
  // ... 保留原有方法
}
```

### 3.5 DataSet 集成

```typescript
// packages/spark-data/src/dataset-impl.ts

import type { IDataSet, IApiAdapter } from './types'
import { DataTable } from './dataTable'
import { ApiAdapter } from './apiAdapter'

export class DataSet implements IDataSet {
  // ... 现有属性
  
  private apiAdapter?: IApiAdapter
  
  constructor(
    config: IDataSet, 
    dataLoader?: (tableName: string) => Promise<DataRow[]>,
    apiAdapter?: IApiAdapter
  ) {
    // ... 现有逻辑
    
    this.apiAdapter = apiAdapter
    
    // 为所有表注入 ApiAdapter
    Object.values(this.tables).forEach(table => {
      if (apiAdapter) {
        table.setApiAdapter(apiAdapter)
      }
    })
  }
  
  /**
   * 设置 API 适配器
   */
  setApiAdapter(adapter: IApiAdapter): void {
    this.apiAdapter = adapter
    
    // 为所有表注入
    Object.values(this.tables).forEach(table => {
      table.setApiAdapter(adapter)
    })
  }
  
  // ... 其他方法
}
```

### 3.6 应用层集成

```typescript
// packages/spark-app/src/http/index.ts

import type { IApiClient, IApiContext } from '@spark-view/spark-data'

/**
 * HTTP 客户端实现（基于 fetch）
 */
export class HttpClient implements IApiClient {
  private context: IApiContext
  
  constructor(context: IApiContext) {
    this.context = context
  }
  
  /**
   * 通用请求方法
   */
  async request<T = unknown>(config: {
    url: string
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    params?: Record<string, unknown>
    data?: unknown
    headers?: Record<string, string>
  }): Promise<T> {
    const { url, method, data, headers } = config
    
    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.context.timeout || 10000
    )
    
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: data ? JSON.stringify(data) : undefined,
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const result = await response.json()
      
      // 处理标准 API 响应格式
      if (result.code !== undefined) {
        if (result.code === 200 || result.code === 0) {
          return result.data
        }
        throw new Error(result.message || '请求失败')
      }
      
      return result
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }
  
  async get<T = unknown>(url: string, params?: Record<string, unknown>): Promise<T> {
    let fullUrl = url
    if (params && Object.keys(params).length > 0) {
      const query = new URLSearchParams(
        Object.entries(params).map(([k, v]) => [k, String(v)])
      ).toString()
      fullUrl = `${url}?${query}`
    }
    return this.request<T>({ url: fullUrl, method: 'GET' })
  }
  
  async post<T = unknown>(url: string, data?: unknown): Promise<T> {
    return this.request<T>({ url, method: 'POST', data })
  }
  
  async put<T = unknown>(url: string, data?: unknown): Promise<T> {
    return this.request<T>({ url, method: 'PUT', data })
  }
  
  async delete<T = unknown>(url: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>({ url, method: 'DELETE', params })
  }
}

/**
 * 创建 HTTP 客户端
 */
export function createHttpClient(context: IApiContext): IApiClient {
  return new HttpClient(context)
}
```

### 3.7 使用示例

```typescript
// src/main.ts

import { SparkApp } from '@spark-view/spark-app'
import { SparkData } from '@spark-view/spark-data'
import { ApiAdapter } from '@spark-view/spark-data/apiAdapter'
import { createHttpClient } from '@spark-view/spark-app/http'

await SparkApp.bootstrap({
  app,
  router,
  
  async onServices(context) {
    // 1. 创建 HTTP 客户端
    const httpClient = createHttpClient({
      baseURL: context.env.apiBaseUrl,  // '/api'
      token: context.user?.token,
      tenantId: context.tenant?.tenantId,
      timeout: 10000
    })
    
    // 2. 创建 API 适配器
    const apiAdapter = new ApiAdapter(httpClient, {
      baseURL: context.env.apiBaseUrl,
      token: context.user?.token,
      tenantId: context.tenant?.tenantId
    })
    
    // 3. 创建 DataSet 并注入适配器
    const dataSet = SparkData.createDataSet({
      dataSetName: 'MyApp',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' },
            { name: 'name', type: 'string' },
            { name: 'email', type: 'string' }
          ],
          api: {
            list: { url: '/users', method: 'GET' },
            create: { url: '/users', method: 'POST' },
            update: { url: '/users/{id}', method: 'PUT', pathParams: ['id'] },
            delete: { url: '/users/{id}', method: 'DELETE', pathParams: ['id'] }
          },
          rows: []
        }
      }
    }, undefined, apiAdapter)  // 注入适配器
    
    // 4. 全局注册
    app.provide('dataSet', dataSet)
    app.provide('apiAdapter', apiAdapter)
  }
})
```

### 3.8 页面配置使用

```json
// public/pages-config/users/pagedata.json
{
  "dataset": {
    "dataSetName": "Users",
    "tables": {
      "Users": {
        "tableName": "Users",
        "columns": [
          { "name": "id", "type": "number" },
          { "name": "name", "type": "string" },
          { "name": "email", "type": "string" }
        ],
        "api": {
          "list": { "url": "/users", "method": "GET" },
          "create": { "url": "/users", "method": "POST" },
          "update": { "url": "/users/{id}", "method": "PUT", "pathParams": ["id"] },
          "delete": { "url": "/users/{id}", "method": "DELETE", "pathParams": ["id"] }
        },
        "rows": []
      }
    }
  }
}
```

```javascript
// public/pages-config/users/script.js

// 刷新用户列表
export async function refreshUsers() {
  const dataSet = $dataSet()
  const usersTable = dataSet.getTable('Users')
  
  try {
    // ✅ 直接调用 API 方法
    await usersTable.list()
    ElMessage.success('刷新成功')
  } catch (error) {
    ElMessage.error(`刷新失败: ${error.message}`)
  }
}

// 创建用户
export async function createUser() {
  const dataSet = $dataSet()
  const usersTable = dataSet.getTable('Users')
  
  ElMessageBox.prompt('请输入用户名', '新增用户').then(async ({ value }) => {
    try {
      // ✅ 直接调用 API 方法
      await usersTable.create({ name: value, email: `${value}@example.com` })
      ElMessage.success('创建成功')
    } catch (error) {
      ElMessage.error(`创建失败: ${error.message}`)
    }
  })
}

// 更新用户
export async function updateUser(userId, newName) {
  const dataSet = $dataSet()
  const usersTable = dataSet.getTable('Users')
  
  try {
    // ✅ 直接调用 API 方法
    await usersTable.update(userId, { name: newName })
    ElMessage.success('更新成功')
  } catch (error) {
    ElMessage.error(`更新失败: ${error.message}`)
  }
}

// 删除用户
export async function deleteUser(userId) {
  const dataSet = $dataSet()
  const usersTable = dataSet.getTable('Users')
  
  ElMessageBox.confirm('确认删除该用户？', '警告', {
    type: 'warning'
  }).then(async () => {
    try {
      // ✅ 直接调用 API 方法
      await usersTable.delete(userId)
      ElMessage.success('删除成功')
    } catch (error) {
      ElMessage.error(`删除失败: ${error.message}`)
    }
  })
}
```

---

## 四、实施计划

### 4.1 阶段划分

#### Phase 1: 类型定义和接口设计（2天）

- [ ] 新增 `IApiContext`, `IApiClient`, `IApiAdapter` 接口
- [ ] 扩展 `IDataTableWithApi` 接口
- [ ] 更新类型文档

#### Phase 2: 核心实现（3天）

- [ ] 实现 `ApiAdapter` 类
- [ ] 实现 `HttpClient` 类
- [ ] 增强 `DataTable` 类（添加 CRUD 方法）
- [ ] 更新 `DataSet` 类（注入适配器）

#### Phase 3: 集成和测试（2天）

- [ ] 在 `spark-app` 中集成 HttpClient
- [ ] 在 bootstrap 流程中注入 ApiAdapter
- [ ] 编写单元测试
- [ ] 编写集成测试

#### Phase 4: 文档和示例（2天）

- [ ] API 使用文档
- [ ] 配置示例
- [ ] 最佳实践指南
- [ ] 迁移指南（从 Mock 到真实 API）

### 4.2 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 破坏现有功能 | 低 | 高 | 保持向后兼容，ApiAdapter 为可选注入 |
| 类型复杂度增加 | 中 | 中 | 充分的 JSDoc 和示例代码 |
| 性能问题 | 低 | 中 | 请求缓存、防抖、并发控制 |

---

## 五、优势与价值

### 5.1 开发体验提升

```typescript
// ❌ 之前：需要手动管理 HTTP 请求
export async function loadUsers() {
  const response = await fetch('/api/users', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Tenant-Id': tenantId
    }
  })
  const data = await response.json()
  // 手动更新 DataSet...
}

// ✅ 现在：一行代码搞定
export async function loadUsers() {
  await dataSet.getTable('Users').list()
}
```

### 5.2 架构优势

1. **分层清晰**: 应用层、数据层、领域层职责明确
2. **依赖注入**: 解耦 HTTP 客户端和数据层
3. **类型安全**: 完整的 TypeScript 类型支持
4. **可测试性**: ApiAdapter 可独立测试，支持 Mock

### 5.3 功能扩展

- **请求拦截器**: 统一添加 loading、错误处理
- **请求缓存**: 避免重复请求
- **批量操作**: 优化性能
- **乐观更新**: 提升用户体验

---

## 六、总结

### 6.1 核心改进

1. ✅ **API 上下文注入**: 从应用层传递 baseURL、token、tenantId
2. ✅ **HTTP 客户端封装**: 统一请求处理、错误处理、超时控制
3. ✅ **API 适配器**: 将静态配置转换为可调用方法
4. ✅ **DataTable 增强**: 直接提供 list/create/update/delete 方法
5. ✅ **向后兼容**: 保持现有接口不变

### 6.2 开发流程

```
1. 配置 API 端点（pagedata.json）
   ↓
2. 应用启动时注入 ApiAdapter
   ↓
3. 页面脚本直接调用 dataTable.list()
   ↓
4. 自动处理 baseURL、token、错误
```

### 6.3 下一步

- **P1.6**: 实现 API 集成方案（本方案）
- **P1.7**: 添加请求缓存和防抖
- **P1.8**: 实现乐观更新（Optimistic Update）

---

**文档创建时间**: 2026-02-04  
**预计工时**: 9天（Phase 1-4）  
**优先级**: P1（短期，1-2周）
