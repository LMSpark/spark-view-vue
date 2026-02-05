# @spark-view/spark-utils

> SPARK 核心工具库 - 提供能力系统、日志、权限和 HTTP 客户端

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)

## 特性

- 🔌 **能力系统** - 供需解耦的组件通信机制
- 📝 **日志系统** - 多传输器、多级别日志
- 🔐 **权限系统** - 统一的权限检查和过滤
- 🌐 **HTTP 客户端** - 类型安全的 HTTP 请求
- 📡 **事件系统** - 类型安全的事件发布订阅

## 安装

```bash
pnpm add @spark-view/spark-utils
```

## 快速开始

### 1. 能力系统

```typescript
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
```

**特性**:
- ✅ 能力树：通过 parent 链构建层级
- ✅ 就近查找：沿 parent 链向上查找
- ✅ 解耦设计：供需互不依赖
- ✅ 类型安全：完整 TypeScript 支持

### 2. 日志系统

```typescript
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
```

**特性**:
- ✅ 多级别：debug、info、warn、error
- ✅ 多传输器：console、HTTP、memory
- ✅ 命名空间：日志作用域隔离

### 3. 权限系统

```typescript
import { 
  PermissionChecker, 
  PermissionFilter,
  FieldRenderHelper
} from '@spark-view/spark-utils'

// 权限检查
const checker = PermissionChecker.create()
const canDelete = checker.canDelete(row)
const canEdit = checker.canEdit(row)

// 权限过滤
const filter = PermissionFilter.create()
const deletableRows = filter.filterDeletableRows(rows)

// 字段渲染
const helper = FieldRenderHelper.create(checker)
const states = helper.computeFieldStates(fields, row)
```

### 4. HTTP 客户端

```typescript
import { createHttpClient } from '@spark-view/spark-utils'

const client = createHttpClient({
  baseURL: 'https://api.example.com',
  headers: { 'Authorization': 'Bearer token' }
})

const users = await client.get<User[]>('/users')
const newUser = await client.post<User>('/users', { name: 'John' })
```

### 5. 事件系统

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
| **HttpClient** | HTTP 客户端（类型安全） |
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
