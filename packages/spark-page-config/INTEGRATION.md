# L2 对接 L1 集成指南

本文档说明 L2 (页面配置层) 如何使用 L1 (应用层) 提供的能力。

## 架构依赖关系

```
L1 (spark-app) - 应用基础设施层
    ├── AppContext (用户、租户、环境信息)
    ├── Logger (应用级日志系统)
    ├── Constants (符号常量表)
    ├── Router Guards (路由守卫)
    └── Bootstrap (初始化流水线)
        ↓
L2 (spark-page-config) - 业务编排层
    ├── ConfigLoader (使用 L1 Logger + Constants)
    ├── DynamicRouter (使用 L1 Logger + ErrorCodes)
    └── Validator (使用 L1 ErrorCodes)
```

## 1. ConfigLoader 对接 L1

### 1.1 使用 L1 Logger

```typescript
import { pageLogger } from '@spark-view/spark-app'

// 在配置加载时记录日志
pageLogger.debug('从缓存加载配置', { cacheKey })
pageLogger.info('加载配置', { cacheKey, source: this.options.source })
pageLogger.success('配置加载成功', { cacheKey })
pageLogger.error('配置加载失败', { cacheKey, error })
pageLogger.warn('远程加载失败，降级到本地', { error })
```

### 1.2 使用 L1 Constants

```typescript
import { 
  ErrorCodes,
  getErrorMessage,
  DefaultConfig,
  StorageKeys,
  getStorageItem,
  setStorageItem
} from '@spark-view/spark-app'

// 使用统一的超时配置
const DEFAULT_OPTIONS = {
  timeout: DefaultConfig.REQUEST_TIMEOUT, // 10000ms
  cacheExpiry: DefaultConfig.CONFIG_CACHE_EXPIRY // 300000ms
}

// 使用标准错误码
if (!response.ok) {
  const errorMsg = getErrorMessage(ErrorCodes.CONFIG_LOAD_FAILED)
  throw new Error(errorMsg)
}

// 使用统一的存储键名 (如需要)
const cache = getStorageItem(StorageKeys.APP_CONFIG, 'session')
```

### 1.3 错误处理流程

```typescript
try {
  pageLogger.debug('尝试从远程加载路由')
  return await this.fetchFromRemote<RouteConfig[]>('/routes')
} catch (error) {
  // 使用 L1 Logger 记录警告
  pageLogger.warn('远程加载失败，降级到本地', { error })
  
  // 使用 L1 ErrorCodes
  if ((error as Error).name === 'AbortError') {
    const errorMsg = getErrorMessage(ErrorCodes.NETWORK_TIMEOUT)
    pageLogger.error('请求超时', { url, timeout: this.options.timeout })
    throw new Error(errorMsg)
  }
  
  return this.fetchFromLocal<RouteConfig[]>('/routes.json')
}
```

## 2. DynamicRouter 对接 L1

### 2.1 使用 L1 Logger

```typescript
import { routerLogger, ErrorCodes, getErrorMessage } from '@spark-view/spark-app'

// 路由注册时记录日志
routerLogger.info('开始注册动态路由')
routerLogger.debug('执行 beforeRegister 钩子')
routerLogger.debug('路由已注册', { path: config.path, name: config.name })
routerLogger.success('动态路由注册完成', { count: routes.length })
```

### 2.2 使用 L1 ErrorCodes

```typescript
// 路由加载失败时使用标准错误码
if (!result.success || !result.data) {
  const errorMsg = getErrorMessage(ErrorCodes.ROUTE_INVALID)
  routerLogger.error('路由加载失败', { error: result.error })
  throw new Error(`${errorMsg}: ${result.error}`)
}
```

### 2.3 支持 beforeRegister 权限过滤

```typescript
// DynamicRouter 支持在注册前过滤路由（权限控制）
const dynamicRouter = new DynamicRouter({
  router,
  configLoader,
  pageComponent: DynamicPage,
  
  // 由 L1 提供的权限系统驱动
  async beforeRegister(routes: RouteConfig[]) {
    // L1 的 AppContext 提供用户权限
    const context = inject(APP_CONTEXT_KEY)
    const userPermissions = context?.user?.permissions || []
    
    // 过滤掉用户无权限的路由
    return routes.filter(route => {
      if (!route.meta?.permission) return true
      return userPermissions.includes(route.meta.permission)
    })
  }
})
```

## 3. Validator 对接 L1

### 3.1 使用 L1 ErrorCodes

```typescript
import { ErrorCodes, getErrorMessage, pageLogger } from '@spark-view/spark-app'

// 验证失败时使用标准错误码
if (!config.pageId) {
  const errorMsg = getErrorMessage(ErrorCodes.CONFIG_INVALID)
  pageLogger.error('配置验证失败：缺少 pageId', { config })
  throw new Error(errorMsg)
}
```

## 4. 集成完成的特性

✅ **统一日志系统**
- ConfigLoader 使用 `pageLogger`
- DynamicRouter 使用 `routerLogger`
- 所有日志格式统一，便于追踪

✅ **统一错误码**
- 网络错误：`ErrorCodes.NETWORK_TIMEOUT`, `ErrorCodes.NETWORK_REQUEST_FAILED`
- 配置错误：`ErrorCodes.CONFIG_LOAD_FAILED`, `ErrorCodes.CONFIG_INVALID`
- 路由错误：`ErrorCodes.ROUTE_INVALID`

✅ **统一配置常量**
- 超时时间：`DefaultConfig.REQUEST_TIMEOUT`
- 缓存过期：`DefaultConfig.CONFIG_CACHE_EXPIRY`
- 分页大小：`DefaultConfig.PAGE_SIZE`

✅ **权限过滤支持**
- DynamicRouter 支持 `beforeRegister` 钩子
- 可集成 L1 的 AppContext 进行权限过滤

## 5. 使用示例

### 5.1 在主应用中使用

```typescript
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { createAppContext } from '@spark-view/spark-app'
import { PageConfigLoader, DynamicRouter } from '@spark-view/spark-page-config'
import DynamicPage from './views/DynamicPage.vue'

const app = createApp(App)
const router = createRouter({
  history: createWebHistory(),
  routes: []
})

// 1. 创建 L1 AppContext
const appContext = createAppContext({
  appId: 'my-app',
  environment: 'production',
  user: { id: '1', name: 'Admin' },
  tenant: { id: 'tenant-1', name: 'Company' }
})

// 2. 提供 AppContext 给全局
app.provide(APP_CONTEXT_KEY, appContext)

// 3. 创建 L2 ConfigLoader
const configLoader = new PageConfigLoader({
  source: 'hybrid', // 优先远程，失败降级本地
  apiBaseUrl: '/api',
  enableCache: true,
  // 使用 L1 的默认配置
  timeout: DefaultConfig.REQUEST_TIMEOUT,
  cacheExpiry: DefaultConfig.CONFIG_CACHE_EXPIRY
})

// 4. 创建 L2 DynamicRouter（集成权限过滤）
const dynamicRouter = new DynamicRouter({
  router,
  configLoader,
  pageComponent: DynamicPage,
  
  // 权限过滤（使用 L1 的 AppContext）
  async beforeRegister(routes) {
    const userPermissions = appContext.user?.permissions || []
    return routes.filter(route => {
      if (!route.meta?.permission) return true
      return userPermissions.includes(route.meta.permission)
    })
  },
  
  // 注册后钩子
  afterRegister(routes) {
    console.log(`已注册 ${routes.length} 个路由`)
  }
})

// 5. 注册动态路由
await dynamicRouter.registerRoutes()

// 6. 启动应用
app.use(router)
app.mount('#app')
```

### 5.2 日志输出示例

```
[PAGE] DEBUG 从缓存加载配置 { cacheKey: "routes" }
[PAGE] INFO  加载配置 { cacheKey: "routes", source: "hybrid" }
[PAGE] DEBUG 尝试从远程加载路由
[PAGE] DEBUG 发送远程请求 { url: "/api/routes" }
[PAGE] DEBUG 远程加载成功 { url: "/api/routes" }
[PAGE] DEBUG 配置已缓存 { cacheKey: "routes" }
[PAGE] SUCCESS 配置加载成功 { cacheKey: "routes" }

[ROUTER] INFO  开始注册动态路由
[ROUTER] DEBUG 执行 beforeRegister 钩子
[ROUTER] DEBUG 路由已注册 { path: "/dashboard", name: "Dashboard" }
[ROUTER] DEBUG 路由已注册 { path: "/users", name: "Users" }
[ROUTER] DEBUG 执行 afterRegister 钩子
[ROUTER] SUCCESS 动态路由注册完成 { count: 2 }
```

## 6. 最佳实践

1. **始终使用 L1 Logger**
   - 不要使用 `console.log`，使用 `pageLogger` 或 `routerLogger`
   - 日志信息要包含上下文（如 pageId、url、error）

2. **始终使用 L1 ErrorCodes**
   - 不要硬编码错误消息
   - 使用 `getErrorMessage(ErrorCodes.XXX)` 获取标准错误文本

3. **始终使用 L1 DefaultConfig**
   - 不要硬编码超时、缓存时间等配置
   - 使用 `DefaultConfig.REQUEST_TIMEOUT` 等常量

4. **权限过滤在 L1 层**
   - L2 只负责路由注册
   - 权限判断通过 `beforeRegister` 钩子由 L1 的 AppContext 提供

5. **错误处理一致性**
   - 使用统一的 try-catch 模式
   - 记录日志 + 抛出标准错误
   - 支持降级策略（如远程 → 本地）

## 7. 下一步

- ✅ L2 已完成对 L1 的集成
- ⏳ L3 (spark-renderer) 需要对接 L1 和 L2
- ⏳ 主应用需要更新为使用新的包架构
