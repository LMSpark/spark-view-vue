# @spark-view/spark-utils

> SPARK 框架核心工具库 - 提供能力系统、日志、错误处理等基础设施

## 📦 安装

```bash
pnpm add @spark-view/spark-utils
```

## 🎯 核心功能

### 1️⃣ 能力系统（Capability System）

基于**供需解耦**的组件通信系统，支持能力树、按名称查找、动态连接。

```typescript
import { Capability } from '@spark-view/spark-utils'

// 创建管理器
const manager = Capability.create()
manager.registerConnector('data', new Capability.DataFlow())

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
```

**核心特性：**
- ✅ 能力树：通过 parent 链构建层级结构
- ✅ 就近查找：沿 parent 链向上查找能力
- ✅ 解耦设计：供方和需方互不依赖
- ✅ 内置连接器：DataFlow、Event、Method
- ✅ 类型安全：完整的 TypeScript 支持

### 2️⃣ 日志系统（Logger）

灵活的日志系统，支持多传输器、日志级别、命名空间。

```typescript
import { Logger } from '@spark-view/spark-utils'

const logger = Logger('MyModule')
logger.info('Application started')
logger.warn('Warning message')
logger.error('Error occurred', error)

// 设置全局日志级别
Logger.setLevel('debug')
```

**特性：**
- 多级别：debug、info、warn、error
- 命名空间：模块化日志管理
- 多传输器：Console、HTTP、Memory
- 自定义传输器支持

### 3️⃣ HTTP 客户端（HTTP Client）

类型安全的 HTTP 请求封装。

```typescript
import { HttpClient } from '@spark-view/spark-utils'

const client = HttpClient.create({
  baseURL: 'https://api.example.com',
  timeout: 5000
})

const data = await client.get('/users/1')
```

### 4️⃣ 环境工具（Environment Utils）

浏览器环境检测和安全访问。

```typescript
import { isBrowser, getWindow, getDocument } from '@spark-view/spark-utils'

if (isBrowser()) {
  const win = getWindow()
  const doc = getDocument()
}
```

---

## 📚 完整 API

### 能力系统

```typescript
import {
  Capability,           // 命名空间 API（推荐）
  Provider,            // 提供者类型
  Consumer,            // 消费者类型
  Context,             // 上下文类型
  CapabilityManager,   // 管理器类
  EventConnector,      // 事件连接器
  DataFlowConnector,   // 数据流连接器
  MethodConnector      // 方法连接器
} from '@spark-view/spark-utils'
```

### 日志

```typescript
import {
  Logger,                   // 日志创建函数
  createConsoleTransport,   // 控制台传输器
  createHttpTransport,      // HTTP 传输器
  createMemoryTransport,    // 内存传输器
  type LogLevel,            // 日志级别类型
  type LoggerApi            // 日志 API 接口
} from '@spark-view/spark-utils'
```

### HTTP 客户端

```typescript
import {
  HttpClient,          // HTTP 客户端类
  createHttpClient,    // 创建 HTTP 客户端
  type IApiContext     // API 上下文接口
} from '@spark-view/spark-utils'
```

### 环境工具

```typescript
import {
  isBrowser,           // 是否浏览器环境
  isServer,            // 是否服务器环境
  getWindow,           // 安全获取 window
  getDocument,         // 安全获取 document
  getWindowProperty,   // 获取 window 属性
  getDocumentProperty  // 获取 document 属性
} from '@spark-view/spark-utils'
```

---

## 🎓 使用示例

### 场景：构建用户管理模块

```typescript
import { Capability, Logger, HttpClient } from '@spark-view/spark-utils'

// 1. 创建日志
const logger = Logger('UserModule')

// 2. 创建 HTTP 客户端
const httpClient = HttpClient.create({
  baseURL: 'https://api.example.com'
})

// 3. 创建能力管理器
const manager = Capability.create()
manager.registerConnector('data', new Capability.DataFlow())
manager.registerConnector('event', new Capability.Event())

// 4. 创建上下文树
const appContext = { providers: new Set(), parent: null }
const userContext = { providers: new Set(), parent: appContext }

// 5. 提供用户服务能力
const userServiceProvider: Capability.ProviderType = {
  name: 'user-service',
  version: '1.0.0',
  implementation: {
    getUser: async (id: string) => {
      logger.info(`Fetching user: ${id}`)
      return httpClient.get(`/users/${id}`)
    },
    updateUser: async (user: any) => {
      logger.info(`Updating user: ${user.id}`)
      return httpClient.put(`/users/${user.id}`, user)
    }
  }
}
appContext.providers.add(userServiceProvider)

// 6. 提供用户事件能力
const { provider: eventProvider, emitter } = Capability.Events.createProvider('user-events')
appContext.providers.add(eventProvider)

// 6. 组件消费能力
const consumer: Capability.ConsumerType = {
  capabilityName: 'user-service'
}
manager.connectCapability(userServiceProvider, consumer, userContext)

// 7. 使用服务
const service = consumer.implementation as any
const user = await service.getUser('123')
logger.info('User fetched:', user)

// 8. 监听事件
const eventConsumer = Capability.Events.createConsumer('user-events', {
  userUpdated: (user) => logger.info('User updated:', user),
  userDeleted: (id) => logger.info('User deleted:', id)
})
manager.connectCapability(eventProvider, eventConsumer, userContext)

// 9. 发送事件
emitter.emit('userUpdated', { id: '123', name: 'Jane Doe' })
```

---

## 🔧 开发

```bash
# 安装依赖
pnpm install

# 类型检查
pnpm run typecheck

# 运行测试
pnpm run test

# Lint
pnpm run lint
```

---

## 📖 文档

- [能力系统完整文档](./CAPABILITY_SYSTEM_API.md)
- [能力系统快速参考](./CAPABILITY_QUICK_REF.md)
- [API 文档](./CAPABILITY_API.md)

---

## 📄 许可证

MIT

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📦 相关包

- `@spark-view/spark-component` - SPARK 组件系统
- `@spark-view/spark-data` - 数据管理
- `@spark-view/spark-renderer` - 渲染器
