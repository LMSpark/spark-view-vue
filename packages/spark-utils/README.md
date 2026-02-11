# @spark-view/spark-utils

> SPARK 核心工具库 - 提供能力系统、日志、权限和 HTTP 客户端

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)

## 特性

- 🔌 **能力系统** - 供需解耦的组件通信机制
- 📝 **日志系统** - 多传输器、多级别日志
- 🔐 **权限系统** - 统一的权限检查和过滤
- 🌐 **统一请求层** - 基于拦截器的现代化请求系统
- 📡 **文件加载器** - 基于时间戳的智能缓存
- 🎯 **事件系统** - 类型安全的事件发布订阅

## 安装

```bash
pnpm add @spark-view/spark-utils
```

## 快速开始

### 1. 能力系统

```typescript
import type { Provider, Consumer, Context } from '@spark-view/spark-utils'

// 定义能力提供者
const provider: Provider = {
  name: 'userService',
  version: '1.0.0',
  implementation: {
    getUser: (id: string) => ({ id, name: 'User' })
  }
}

// 添加到上下文
context.providers.add(provider)

// 组件中消费能力
const consumer: Consumer = {
  capabilityName: 'userService',
  implementation: null // 由连接器注入
}
```

**特性**:
- ✅ 能力树：通过 parent 链构建层级
- ✅ 就近查找：沿 parent 链向上查找
- ✅ 解耦设计：供需互不依赖
- ✅ 类型安全：完整 TypeScript 支持

### 2. 日志系统

```typescript
import { Logger } from '@spark-view/spark-utils'

// 方式 1：简单字符串标签（用于简单脚本或独立模块）
const logger = Logger('MyModule')
logger.info('应用启动')
logger.error('错误', { code: 500 })

// 方式 2：从组件上下文获取应用层提供的 logger（推荐）
const { logger } = useSparkComponent({ type: 'my-comp' })
logger.info('组件初始化')  // 自动使用应用层配置的 logger

// 应用层提供 logger（在 main.ts 或 App.vue 中）
import { createLogger } from '@spark-view/spark-app'
const appLogger = createLogger('App', {
  level: 'info',
  enableRemote: true,  // 生产环境远程上报
  remoteEndpoint: '/api/logs'
})

// 通过能力系统提供给所有组件
provide('logger', appLogger)
// 或通过 APP_SERVICES
provide(APP_SERVICES, { logger: appLogger })
```

**特性**:
- ✅ 多级别：debug、info、warn、error
- ✅ 应用层统一配置：全局日志级别、传输器、格式
- ✅ 继承支持：子组件自动继承应用层 logger
- ✅ 多种传输器：console、HTTP（远程上报）、custom
- ✅ 生产环境支持：远程日志上报、错误追踪

**推荐架构**：
1. 应用层（main.ts）创建全局 logger 并配置传输器
2. 通过 APP_SERVICES 或直接 provide('logger') 提供
3. 组件通过 useSparkComponent 获取 logger
4. 所有日志统一格式、统一管理

### 3. 权限系统

```typescript
import { 
  createPermissionChecker, 
  createPermissionFilter,
  createFieldRenderHelper
} from '@spark-view/spark-utils'

// 权限检查
const checker = createPermissionChecker()
const canDelete = checker.canDelete(row)
const canEdit = checker.canEdit(row)

// 权限过滤
const filter = createPermissionFilter()
const deletableRows = filter.filterDeletableRows(rows)

// 字段渲染
const helper = createFieldRenderHelper()
const states = helper.computeFieldStates(fields, row)
```

### 4. 统一请求层

```typescript
import { 
  createRequest,
  createAuthInterceptor,
  createStandardApiInterceptor
} from '@spark-view/spark-utils'

// 创建请求实例
const request = createRequest({
  baseURL: '/api',
  timeout: 10000
})

// 配置拦截器
request.interceptors.request.use(
  createAuthInterceptor(() => localStorage.getItem('token'))
)
request.interceptors.response.use(
  createStandardApiInterceptor()
)

// 发起请求
const users = await request.get<User[]>('/users')
const newUser = await request.post<User>('/users', { name: 'John' })
```

**特性**:
- ✅ 拦截器系统：请求/响应双向拦截
- ✅ 自动重试：支持配置重试次数和延迟
- ✅ 内置缓存：GET 请求自动缓存
- ✅ 超时控制：基于 AbortController
- ✅ 9 个预设拦截a器：认证、租户、日志、错误处理等
- ✅ TypeScript 类型安全

**完整指南**: [REQUEST_GUIDE.md](./REQUEST_GUIDE.md)

### 5. 文件加载器

```typescript
import { createFileLoader } from '@spark-view/spark-utils'

// 创建文件加载器
const loader = createFileLoader({
  baseURL: '/config',
  storage: 'localStorage'
})

// 加载文件（带时间戳缓存）
const config = await loader.load('app.json', { timestamp: 123456 })

// 批量加载
const [rule, pageData] = await loader.loadMultiple([
  { url: 'rule.json', options: { timestamp: 123456 } },
  { url: 'pagedata.json', options: { timestamp: 789012 } }
])
```

**特性**:
- ✅ 时间戳缓存：前端带 timestamp，后端判断变化
- ✅ 自动降级：网络失败自动使用缓存
- ✅ 三种存储策略：localStorage/sessionStorage/memory
- ✅ 批量加载：Promise.all 并行加载
- ✅ 缓存统计：查看缓存命中率

### 6. 事件系统

```typescript
import { EventEmitter } from '@spark-view/spark-utils'

interface MyEvents {
  'user:login': (user: User) => void
  'user:logout': () => void
}

const emitter = new EventEmitter<MyEvents>()
emitter.on('user:login', (user) => console.log(user))
emitter.emit('user:login', { id: 1, name: 'Alice' })
```

## 核心模块

| 模块 | 说明 |
|------|------|
| **Capability** | 能力系统（Provider/Consumer） |
| **Logger** | 日志系统（多级别、多传输器） |
| **Permission** | 权限系统（检查器、过滤器、渲染助手） |
| **Request** | 统一请求层（拦截a器、重试、缓存） |
| **FileLoader** | 文件加载器（时间戳缓存、自动降级） |
| **EventEmitter** | 事件发射器（类型安全） |
| **Data Types** | 基础数据类型和权限接口 |

## 数据类型

```typescript
// 基础数据行
type DataRow<T = unknown> = Record<string, T>

// 组件数据行（带权限）
type ComponentDataRow<T = unknown> = WithInstancePermission<DataRow<T>>

// 实例级权限
interface IInstancePermission {
  allowDelete?: boolean
  editableFields?: string[]
  hiddenFields?: string[]
  maskedFields?: string[]
}

// 模型级权限
interface IModelPermission {
  allowCreate?: boolean
  allowImport?: boolean
  allowExport?: boolean
}
```

## 依赖

无外部依赖（纯 TypeScript 实现）

## 开发命令

```bash
pnpm run typecheck   # 类型检查
pnpm run build       # 构建包
```

## License

MIT
