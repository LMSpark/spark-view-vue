# HttpClient 迁移指南

## 概述

本文档记录了从 `HttpClient` 到 `Request` 类的迁移。

**变更时间**：2026-02-11  
**影响范围**：所有使用 `HttpClient` 的代码  
**迁移类型**：破坏性变更（Breaking Change）

## 变更原因

1. **统一网络请求**：系统中存在多种网络请求方式（HttpClient、fetch），需要统一
2. **现代化架构**：Request 类采用拦截器模式，更灵活、更强大
3. **更好的功能**：支持自动重试、内置缓存、超时控制等高级特性
4. **简化维护**：减少重复代码，集中管理网络请求逻辑

## 核心变更

### 1. HttpClient 已删除

```typescript
// ❌ 旧代码（已不可用）
import { createHttpClient } from '@spark-view/spark-utils'
const client = createHttpClient({ baseURL: '/api', token: 'xxx' })
const users = await client.get<User[]>('/users')
```

```typescript
// ✅ 新代码
import { createRequest, createAuthInterceptor } from '@spark-view/spark-utils'

const request = createRequest({ baseURL: '/api' })
request.interceptors.request.use(
  createAuthInterceptor(() => 'xxx')
)
const users = await request.get<User[]>('/users')
```

### 2. IApiContext 移动位置

```typescript
// ❌ 旧导入
import type { IApiContext } from '@spark-view/spark-utils'
```

```typescript
// ✅ 新导入
import type { IApiContext } from '@spark-view/spark-data'
```

**原因**：`IApiContext` 现在由 `ApiAdapter` 使用，移动到 `spark-data` 包更合理。

### 3. ApiAdapter 构造函数变更

```typescript
// ❌ 旧代码
import { createHttpClient } from '@spark-view/spark-utils'
const httpClient = createHttpClient(apiContext)
const adapter = new ApiAdapter(httpClient, apiContext)
```

```typescript
// ✅ 新代码
import { ApiAdapter } from '@spark-view/spark-data'
const adapter = new ApiAdapter(apiContext)
```

**简化**：ApiAdapter 内部自动创建 Request 实例，无需手动传入。

## 功能对比

| 特性 | HttpClient | Request |
|------|-----------|---------|
| 基础请求 | ✅ | ✅ |
| 超时控制 | ✅ | ✅ |
| 标准 API 响应 | ✅ | ✅（通过拦截器） |
| 拦截器系统 | ❌ | ✅ |
| 自动重试 | ❌ | ✅ |
| 内置缓存 | ❌ | ✅ |
| 请求日志 | ❌ | ✅（通过拦截器） |
| 错误转换 | ❌ | ✅（通过拦截器） |
| 401 重定向 | ❌ | ✅（通过拦截器） |

## 详细迁移步骤

### 步骤 1：更新导入语句

```typescript
// Before
import { createHttpClient, type IApiContext } from '@spark-view/spark-utils'

// After
import { createRequest, createAuthInterceptor, createStandardApiInterceptor } from '@spark-view/spark-utils'
import type { IApiContext } from '@spark-view/spark-data'  // 如果需要 IApiContext
```

### 步骤 2：创建 Request 实例

```typescript
// Before
const client = createHttpClient({
  baseURL: '/api',
  token: 'xxx',
  tenantId: 'tenant-123',
  timeout: 10000
})

// After
const request = createRequest({
  baseURL: '/api',
  timeout: 10000
})

// 通过拦截器添加 token 和 tenantId
request.interceptors.request.use(
  createAuthInterceptor(() => 'xxx')
)
request.interceptors.request.use(
  createTenantInterceptor(() => 'tenant-123')
)
```

### 步骤 3：处理标准 API 响应

```typescript
// Before
// HttpClient 自动处理 { code, message, data } 格式

// After
// 需要添加标准 API 拦截器
request.interceptors.response.use(
  createStandardApiInterceptor({
    successCodes: [0, 200],
    errorHandler: (code, message) => {
      console.error(`API 错误 ${code}: ${message}`)
    }
  })
)
```

### 步骤 4：请求方法保持不变

```typescript
// 请求方法完全兼容，无需修改
const users = await request.get<User[]>('/users')
const user = await request.post<User>('/users', { name: 'John' })
const updated = await request.put<User>('/users/1', { name: 'Jane' })
await request.delete('/users/1')
```

## ApiAdapter 迁移

### 旧代码

```typescript
import { createHttpClient } from '@spark-view/spark-utils'
import type { IApiContext } from '@spark-view/spark-utils'
import { ApiAdapter } from '@spark-view/spark-data'

const apiContext: IApiContext = {
  baseURL: '/api',
  token: 'xxx',
  tenantId: 'tenant-123'
}

const httpClient = createHttpClient(apiContext)
const adapter = new ApiAdapter(httpClient, apiContext)
```

### 新代码

```typescript
import { ApiAdapter } from '@spark-view/spark-data'
import type { IApiContext } from '@spark-view/spark-data'

const apiContext: IApiContext = {
  baseURL: '/api',
  token: 'xxx',
  tenantId: 'tenant-123'
}

const adapter = new ApiAdapter(apiContext)
```

**简化说明**：
- 不需要手动创建 HttpClient/Request
- ApiAdapter 内部自动处理认证和租户头
- 构造函数只需要一个参数

## 完整示例

### 应用初始化（main.ts）

```typescript
import { createRequest } from '@spark-view/spark-utils'
import {
  createAuthInterceptor,
  createTenantInterceptor,
  createStandardApiInterceptor,
  createRequestLogInterceptor,
  createResponseLogInterceptor,
  createErrorTransformInterceptor,
  createRedirectInterceptor
} from '@spark-view/spark-utils'

// 创建全局请求实例
export const request = createRequest({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 10000
})

// 配置拦截器
request.interceptors.request.use(
  createAuthInterceptor(() => localStorage.getItem('token'))
)

request.interceptors.request.use(
  createTenantInterceptor(() => localStorage.getItem('tenantId'))
)

request.interceptors.request.use(
  createRequestLogInterceptor({ logHeaders: true })
)

request.interceptors.response.use(
  createStandardApiInterceptor({
    successCodes: [0, 200]
  })
)

request.interceptors.response.use(
  createResponseLogInterceptor()
)

request.interceptors.response.use(
  createErrorTransformInterceptor()
)

request.interceptors.response.use(
  createRedirectInterceptor({
    onUnauthorized: () => {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
  })
)
```

### 业务服务封装

```typescript
import { request } from './request'

export class UserService {
  async getUsers(params?: { page?: number; pageSize?: number }) {
    return request.get<User[]>('/users', params)
  }

  async getUserById(id: number) {
    return request.get<User>(`/users/${id}`)
  }

  async createUser(data: Partial<User>) {
    return request.post<User>('/users', data)
  }

  async updateUser(id: number, data: Partial<User>) {
    return request.put<User>(`/users/${id}`, data)
  }

  async deleteUser(id: number) {
    return request.delete(`/users/${id}`)
  }
}

export const userService = new UserService()
```

## 新增功能

### 1. 自动重试

```typescript
const data = await request.get('/unstable-endpoint', {}, {
  retry: 3,          // 失败后重试 3 次
  retryDelay: 1000   // 每次重试延迟 1 秒
})
```

### 2. 缓存支持

```typescript
const users = await request.get('/users', {}, {
  cache: true,
  cacheExpiry: 300000  // 缓存 5 分钟
})

// 清除缓存
request.clearCache('/users')
```

### 3. 自定义拦截器

```typescript
request.interceptors.request.use({
  name: 'MyCustomInterceptor',
  onRequest: (config) => {
    config.headers = config.headers || {}
    config.headers['X-Request-Id'] = generateRequestId()
    return config
  }
})
```

## 常见问题

### Q: 为什么不保留 HttpClient 作为兼容层？

A: 为了简化维护和避免技术债务。Request 类提供了所有 HttpClient 的功能，且更强大。

### Q: 如何处理标准 API 响应格式？

A: 使用 `createStandardApiInterceptor()` 拦截器：

```typescript
request.interceptors.response.use(
  createStandardApiInterceptor({ successCodes: [0, 200] })
)
```

### Q: 如何添加 token 和 tenantId？

A: 使用预设拦截器：

```typescript
request.interceptors.request.use(createAuthInterceptor(() => token))
request.interceptors.request.use(createTenantInterceptor(() => tenantId))
```

### Q: ApiAdapter 如何使用？

A: 直接传入 IApiContext：

```typescript
const adapter = new ApiAdapter({
  baseURL: '/api',
  token: 'xxx',
  tenantId: 'xxx'
})
```

## 参考文档

- [REQUEST_GUIDE.md](./REQUEST_GUIDE.md) - 完整使用指南
- [Request.ts](./src/Request.ts) - 源代码
- [RequestInterceptors.ts](./src/RequestInterceptors.ts) - 预设拦截器
- [Request.example.ts](./src/Request.example.ts) - 12 个使用示例

## 检查清单

迁移完成后，请确认以下事项：

- [ ] 移除所有 `import { createHttpClient } from '@spark-view/spark-utils'`
- [ ] 移除所有 `import type { IApiContext } from '@spark-view/spark-utils'`
- [ ] 更新 ApiAdapter 的使用方式（单参数构造函数）
- [ ] 配置必要的拦截器（认证、标准 API 响应等）
- [ ] 运行 `pnpm run typecheck` 确保无类型错误
- [ ] 测试所有网络请求功能

## 版本信息

- **移除版本**：v0.3.0
- **替代方案**：Request 类
- **影响范围**：@spark-view/spark-utils, @spark-view/spark-data
