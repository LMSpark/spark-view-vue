# @spark-view/spark-app

> SPARK 应用层基础设施 - 提供应用启动、认证、路由守卫、错误处理和日志系统

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Vue](https://img.shields.io/badge/Vue-3.4-green.svg)](https://vuejs.org/)

## 特性

- ⚡ **SparkApp.start()** - 声明式应用启动（推荐）
- 🔐 **Authentication** - 内置认证服务和令牌管理
- 🛡️ **Router Guards** - 鉴权和权限检查
- 🚨 **Error Boundary** - 全局错误处理
- 📝 **Logger** - 多级别、多传输器日志系统
- 🎯 **Composables** - Vue 3 组合式 API（推荐）

## 安装

```bash
pnpm add @spark-view/spark-app
```

## 快速开始

### 1. 使用 SparkApp.start()（推荐）

最简单的方式 - 100% 声明式配置：

```typescript
import { SparkApp } from '@spark-view/spark-app'
import App from './App.vue'

await SparkApp.start({
  rootComponent: App,
  routerMode: 'history',
  config: {
    apiBaseUrl: '/api',
    logLevel: 'debug',
    enableMock: import.meta.env.DEV
  }
})
```

### 2. 使用 SparkApp.bootstrap()（高级用法）

需要更多控制时：

```typescript
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { SparkApp } from '@spark-view/spark-app'
import App from './App.vue'
import routes from './routes'

const app = createApp(App)
const router = createRouter({ 
  history: createWebHistory(),
  routes 
})

await SparkApp.bootstrap({
  app,
  router,
  config: {
    apiBaseUrl: '/api',
    logLevel: import.meta.env.DEV ? 'debug' : 'warn'
  },
  beforeMount: async (context) => {
    console.log('即将挂载', context)
  }
})
```

## 核心功能

### 认证服务

```typescript
import { authService } from '@spark-view/spark-app'

// 登录
const result = await authService.login({
  username: 'admin',
  password: '123456'
})

if (result) {
  console.log('登录成功', result.user)
}

// 登出
await authService.logout()

// 检查认证状态
const authResult = await authService.checkAuth()
```

### 日志系统

```typescript
import { createLogger } from '@spark-view/spark-app'

const logger = createLogger('MyComponent')

logger.info('应用启动')
logger.warn('警告信息', { code: 400 })
logger.error('错误信息', new Error('Something went wrong'))
logger.debug('调试信息', { data: {...} })
```

### 服务访问（推荐使用 SPARK 能力系统）

```typescript
import { useSparkComponent } from '@spark-view/spark-component'
import { APP_SERVICES } from '@spark-view/spark-utils'
import { useRouter } from 'vue-router'
import { Logger } from '@spark-view/spark-utils'

export default {
  setup() {
    // 方式 1：直接使用标准工具（推荐）
    const router = useRouter()  // vue-router
    const logger = Logger('MyComponent')  // 工厂函数
    logger.info('组件初始化')
    
    // 方式 2：通过 APP_SERVICES 能力获取（组件内）
    const { consume } = useSparkComponent({ type: 'my-comp' })
    const services = consume(APP_SERVICES)
    if (services) {
      services.router?.push('/home')
      services.logger?.info('Action')
      services.auth?.logout()
    }
    
    return { router, logger }
  }
}
```

### 组件注册表访问

```typescript
import { useSparkRegistry } from '@spark-view/spark-app'

export default {
  setup() {
    // 访问 SPARK 组件注册表
    const registry = useSparkRegistry()
    const hasComponent = registry.has('my-component')
    
    return { hasComponent }
  }
}
```

### 配置管理

```typescript
import { loadConfig, isFeatureEnabled } from '@spark-view/spark-app'

// 加载配置
const config = await loadConfig({
  apiBaseUrl: '/api',
  enableMock: true,
  features: {
    enableExport: true
  }
})

// 检查功能开关
if (isFeatureEnabled(config, 'enableExport')) {
  // 显示导出功能
}
```

### 错误处理

```typescript
import { setupErrorHandler, createErrorBoundary } from '@spark-view/spark-app'

// 全局错误处理
setupErrorHandler(app, {
  enableFallback: true
})

// 错误边界组件
const ErrorBoundary = createErrorBoundary((error) => {
  // 自定义降级 UI
  return h('div', `发生错误: ${error.message}`)
})
```

## API 概览

### SparkApp 命名空间

| API | 描述 | 类型 |
|-----|------|------|
| `SparkApp.start()` | 启动应用（推荐） | 高级 API |
| `SparkApp.bootstrap()` | 初始化流水线 | 中级 API |
| `SparkApp.setupRouterGuards()` | 设置路由守卫 | 工具函数 |
| `SparkApp.setupErrorHandler()` | 设置错误处理 | 工具函数 |
| `SparkApp.loadConfig()` | 加载配置 | 工具函数 |
| `SparkApp.createAppContext()` | 创建应用上下文 | 工具函数 |

### 服务访问方式

| 方式 | 用途 | 示例 |
|------|------|------|
| `useRouter()` from vue-router | 路由导航 | `const router = useRouter()` |
| `Logger('module')` 工厂函数 | 日志记录 | `const logger = Logger('MyComponent')` |
| `consume(APP_SERVICES)` | 应用服务能力 | `const services = consume(APP_SERVICES)` |
| `useSparkRegistry()` | 组件注册表 | `const registry = useSparkRegistry()` |

### 认证服务

| 方法 | 描述 |
|------|------|
| `authService.login(credentials)` | 用户登录 |
| `authService.logout()` | 用户登出 |
| `authService.checkAuth()` | 检查认证状态 |
| `authService.getToken()` | 获取访问令牌 |
| `authService.refreshToken()` | 刷新令牌 |

### 日志系统

| 方法 | 描述 |
|------|------|
| `createLogger(scope)` | 创建作用域日志 |
| `logger.debug(msg, data?)` | 调试日志 |
| `logger.info(msg, data?)` | 信息日志 |
| `logger.warn(msg, data?)` | 警告日志 |
| `logger.error(msg, error?)` | 错误日志 |

## 类型定义

```typescript
interface AppContext {
  user: UserInfo
  tenant: TenantInfo
  env: EnvironmentInfo
  config: Record<string, unknown>
  initializedAt: string
}

interface UserInfo {
  id: string | number
  name: string
  email?: string
  roles: string[]
  permissions: string[]
}

interface TenantInfo {
  id: string
  name: string
  domain?: string
}
```

## 最佳实践

### ✅ 推荐用法

```typescript
// 使用 vue-router 标准 API
import { useRouter } from 'vue-router'
const router = useRouter()

// 使用 Logger 工厂函数
import { Logger } from '@spark-view/spark-utils'
const logger = Logger('MyComponent')

// 使用 SPARK 能力系统
import { useSparkComponent } from '@spark-view/spark-component'
import { APP_SERVICES } from '@spark-view/spark-utils'
const { consume } = useSparkComponent({ type: 'my-comp' })
const services = consume(APP_SERVICES)

// 使用命名空间 API
await SparkApp.start({ ... })
```

## 依赖

```json
{
  "vue": "^3.4.0",
  "vue-router": "^4.2.0"
}
```

## 开发命令

```bash
pnpm run typecheck   # 类型检查
pnpm run lint        # 代码检查
pnpm run test        # 运行测试
pnpm run build       # 构建包
```

## 更新日志

查看 [CHANGELOG.md](../../CHANGELOG.md) 了解详细的更新历史。

## License

MIT
