# @spark-view/spark-utils

> SPARK 核心工具库 - 提供能力系统、日志、错误处理和异步工具

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)

## 特性

-  **能力系统** - 供需解耦的组件通信机制
-  **日志系统** - 多传输器、多级别日志
-  **错误处理** - 统一错误处理和重试机制
-  **异步工具** - Promise 工具和竞态控制
-  **配置管理** - 配置存储和访问

## 安装

\\\ash
pnpm add @spark-view/spark-utils
\\\

## 快速开始

### 1. 能力系统

\\\	ypescript
import { Capability } from '@spark-view/spark-utils'

// 创建管理器
const manager = Capability.create()

// 提供能力
const provider = {
  name: 'userService',
  version: '1.0.0',
  implementation: {
    getUser: (id) => ({ id, name: 'User' })
  }
}
context.providers.add(provider)

// 消费能力
const consumer = { capabilityName: 'userService' }
manager.connectCapability(provider, consumer, context)
console.log(consumer.implementation.getUser('123'))
\\\

**特性**:
-  能力树：通过 parent 链构建层级
-  就近查找：沿 parent 链向上查找
-  解耦设计：供需互不依赖
-  类型安全：完整 TypeScript 支持

### 2. 日志系统

\\\	ypescript
import { Logger } from '@spark-view/spark-utils'

const logger = Logger.create({
  level: 'info',
  namespace: 'app',
  transports: [
    Logger.consoleTransport(),
    Logger.httpTransport({ url: '/api/logs' })
  ]
})

logger.info('应用启动')
logger.error('错误', { code: 500 })
\\\

**特性**:
-  多级别：debug、info、warn、error
-  多传输器：console、HTTP、memory
-  命名空间：日志作用域隔离

### 3. 错误处理

\\\	ypescript
import { handleError, withRetry, AppError } from '@spark-view/spark-utils'

// 创建应用错误
throw new AppError('NETWORK_ERROR', '网络错误', { url })

// 错误处理
handleError(error, {
  context: 'api',
  onError: (err) => console.error(err)
})

// 自动重试
await withRetry(() => fetchData(), {
  maxRetries: 3,
  delay: 1000
})
\\\

### 4. 异步工具

\\\	ypescript
import { RaceController, timeout } from '@spark-view/spark-utils'

// 竞态控制
const race = new RaceController<User>()
race.run(async () => {
  return await fetchUser(id)
})

// 超时控制
await timeout(fetchData(), 5000)
\\\

## 核心模块

| 模块 | 说明 |
|------|------|
| **Capability** | 能力系统（Provider/Consumer） |
| **Logger** | 日志系统（多级别、多传输器） |
| **ErrorHandler** | 错误处理（AppError、重试） |
| **AsyncUtils** | 异步工具（竞态控制、超时） |
| **ConfigManager** | 配置管理（get/set/clear） |
| **EventEmitter** | 事件发射器 |

## API 文档

完整 API 文档请查看 [API.md](./API.md)

## 依赖

无外部依赖（纯 TypeScript 实现）

## 开发命令

\\\ash
pnpm run typecheck   # 类型检查
pnpm run test        # 运行测试
pnpm run build       # 构建包
\\\

## License

MIT