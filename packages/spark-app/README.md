# @spark-view/spark-app

SPARK 应用层基础设施包 - 提供应用级上下文、路由守卫、错误处理、初始化流水线、日志系统等公共能力。

## 功能模块

### 📦 核心模块

- **Constants** - 符号常量表（错误码、环境、权限等）
- **AppContext** - 应用级上下文（用户、租户、环境）
- **Bootstrap** - 应用初始化流水线
- **Router Guards** - 路由守卫（鉴权、权限检查、预加载）
- **Error Boundary** - 全局错误处理与降级
- **Config Manager** - 配置管理（环境变量 + 远程配置）
- **Logger** - 应用层日志系统（级别、上报、作用域）

## 安装

```bash
pnpm add @spark-view/spark-app
```

## 快速开始

### 1. 初始化应用

```typescript
import { createApp } from 'vue'
import { SparkApp } from '@spark-view/spark-app'
import App from './App.vue'
import router from './router'

const app = createApp(App)

// 使用 SparkApp 初始化
SparkApp.bootstrap({
  app,
  router,
  config: {
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
    logLevel: import.meta.env.DEV ? 'debug' : 'warn'
  },
  beforeMount: async (context) => {
    // 自定义初始化逻辑
    console.log('应用即将挂载', context)
  }
})
```

### 2. 使用 AppContext

```typescript
import { useAppContext } from '@spark-view/spark-app'

// 在组件中使用
const appContext = useAppContext()

console.log('当前用户:', appContext.user.username)
console.log('用户权限:', appContext.user.permissions)
console.log('租户信息:', appContext.tenant.tenantName)
```

### 3. 路由守卫

```typescript
import { setupRouterGuards } from '@spark-view/spark-app'

// 自动设置路由守卫（鉴权、权限、预加载）
setupRouterGuards(router, {
  loginPath: '/login',
  forbiddenPath: '/forbidden',
  enablePreload: true
})
```

### 4. 错误处理

```typescript
import { setupErrorHandler } from '@spark-view/spark-app'

// 设置全局错误处理
setupErrorHandler(app, {
  onError: (error, context) => {
    console.error('应用错误', error, context)
  },
  enableFallback: true
})
```

### 5. 日志系统

```typescript
import { pageLogger, apiLogger, createAppLogger } from '@spark-view/spark-app'

// 使用预定义的作用域 Logger
pageLogger.info('页面加载', { pageId: 'home' })
apiLogger.error('API 请求失败', { url: '/api/users' })

// 创建自定义 Logger
const customLogger = createAppLogger({
  level: 'debug',
  prefix: 'Custom',
  enableRemote: true
})

customLogger.success('操作成功')
```

### 6. 使用符号常量

```typescript
import {
  ErrorCodes,
  getErrorMessage,
  StorageKeys,
  getStorageItem,
  setStorageItem,
  DefaultConfig,
  Patterns
} from '@spark-view/spark-app'

// 错误码
if (!isAuthenticated) {
  throw new Error(getErrorMessage(ErrorCodes.AUTH_REQUIRED))
}

// 本地存储
setStorageItem(StorageKeys.AUTH_TOKEN, 'xxx')
const token = getStorageItem(StorageKeys.AUTH_TOKEN)

// 默认配置
const timeout = DefaultConfig.REQUEST_TIMEOUT

// 正则验证
if (Patterns.EMAIL.test(email)) {
  console.log('邮箱格式正确')
}
```

详见：[符号常量表文档](./src/constants/README.md)

## 日志系统架构

### 分层设计

```
App Logger (spark-app)           ← 应用层：配置、上报、作用域
    ↓ 使用
Core Logger (spark-core)         ← 核心层：基础能力、组件内部
```

### 职责划分

| 特性 | Core Logger | App Logger |
|-----|------------|------------|
| 基础日志 | ✅ | ✅ 增强 |
| 日志级别 | ❌ | ✅ 可配置 |
| 格式化 | ⚠️ 简单 | ✅ 完整 |
| 远程上报 | ❌ | ✅ HTTP 传输器 |
| 作用域 | ❌ | ✅ page/api/router |

详见：[Logger 架构说明](./src/logger/README.md)

详见 [API.md](./API.md)

## 架构设计

### 应用层职责

应用层（L1）是 SPARK 架构的最外层，负责：

1. **应用级上下文管理** - 用户、租户、环境等全局信息
2. **路由生命周期** - 鉴权、权限检查、预加载
3. **错误边界** - 统一错误处理与降级策略
4. **初始化流水线** - 依赖顺序管理、阶段化加载
5. **全局服务注入** - SparkManager、ModelRegistry 等单例

### 与其他层的关系

```
L1 Application Layer (spark-app)     ← 本包
  ↓ 提供 AppContext、Router Guards
L2 Business Orchestration            ← 业务编排层（页面配置）
  ↓ 使用 AppContext 进行权限过滤
L3 Business Model                    ← 模型层
  ↓
L4 Data Operation                    ← 操作层
  ↓
L5 Interaction Capability            ← 能力层
  ↓
L6 Foundation Components             ← 组件层
```

## License

MIT
