# Logger 架构设计 - 应用层统一提供

## 架构原则

<function_calls>
<invoke name="create_file">
<parameter name="content"># Logger 架构设计 - 应用层统一提供

## 架构原则

**Logger 应该从应用层统一提供，而不是在组件内部自动创建。**

### 为什么？

1. **全局统一配置**：应用层可以统一设置日志级别、格式、传输器
2. **生产环境管理**：集中控制日志上报、错误追踪
3. **性能优化**：避免每个组件创建独立的 logger 实例
4. **测试友好**：可以轻松 mock 和替换 logger

## 实现方式

### 应用层（main.ts 或 bootstrap）

```typescript
import { SparkApp, createLogger } from '@spark-view/spark-app'
import { useSparkComponent } from '@spark-view/spark-component'
import { APP_SERVICES } from '@spark-view/spark-utils'
import App from './App.vue'

await SparkApp.start({
  rootComponent: App,
  
  beforeMount: async (context) => {
    const { app, router } = context
    
    // 1. 创建应用层 logger
    const appLogger = createLogger('App', {
      level: import.meta.env.PROD ? 'info' : 'debug',
      enableColors: true,
      showTimestamp: true,
      enableRemote: import.meta.env.PROD,
      remoteEndpoint: '/api/logs'
    })
    
    // 2. 在根组件提供 logger
    app.mixin({
      beforeCreate() {
        if (this.$options.name === 'App') {
          const { provide } = useSparkComponent({ type: 'root' })
          
          // 方式 A：通过 APP_SERVICES 提供（推荐）
          provide(APP_SERVICES, {
            router: {
              push: (to) => router.push(to),
              replace: (to) => router.replace(to),
              back: () => router.back(),
              currentRoute: router.currentRoute.value
            },
            logger: appLogger
          })
          
          // 方式 B：直接提供 logger 能力
          // provide('logger', appLogger)
        }
      }
    })
    
    appLogger.info('✅ 应用启动完成')
  }
})
```

### 组件层使用

```typescript
// 在任何组件中使用
import { useSparkComponent } from '@spark-view/spark-component'

const { logger } = useSparkComponent({ type: 'my-component' })

// logger 会自动继承应用层提供的实例
logger.info('Component initialized', { userId: 123 })
logger.error('Operation failed', { error: err })
```

## 技术实现

### useSparkComponent 中的 Logger 获取策略

```typescript
// packages/spark-component/src/composables/useSparkComponent.ts

const getActiveLogger = () => {
  // 1. 优先从能力系统查找应用层提供的 logger
  const loggerProvider = capabilityManager.getProvider(context, 'logger')
  if (loggerProvider?.implementation) {
    const impl = loggerProvider.implementation as LoggerApi
    if (impl && typeof impl === 'object' && 'info' in impl && 'warn' in impl && 'error' in impl && 'debug' in impl) {
      return impl
    }
  }
  
  // 2. Fallback：简单的 console（应用层应该提供 logger）
  return {
    debug: (...args: unknown[]) => console.debug(...args),
    info: (...args: unknown[]) => console.info(...args),
    warn: (...args: unknown[]) => console.warn(...args),
    error: (...args: unknown[]) => console.error(...args)
  }
}
```

### 关键设计点

1. **能力继承**：使用 `capabilityManager.getProvider(context, 'logger')` 沿 parent 链查找
2. **自动传播**：子组件自动继承父组件提供的 logger
3. **安全 Fallback**：如果应用层未提供，使用简单的 console

## 对比旧架构

### 旧架构（组件内部创建）❌

```typescript
// 每个组件内部自动创建 Logger('Spark:type')
const logger = Logger(`Spark:${config.type}`)
```

**问题**：
- 无法全局统一配置
- 每个组件都有独立实例
- 生产环境难以控制日志行为
- 测试时难以 mock

### 新架构（应用层提供）✅

```typescript
// 应用层提供
const appLogger = createLogger('App', { /* 统一配置 */ })
provide('logger', appLogger)

// 组件访问
const { logger } = useSparkComponent({ type: 'my-component' })
```

**优势**：
- ✅ 全局统一配置
- ✅ 支持多种传输器（console、HTTP、文件）
- ✅ 生产环境可集中控制
- ✅ 测试时易于 mock
- ✅ 性能更好（共享实例）

## 迁移指南

### 1. 现有代码无需修改

组件中的代码保持不变：

```typescript
const { logger } = useSparkComponent({ type: 'my-component' })
logger.info('message')
```

### 2. 在应用层添加 logger 提供

在 `main.ts` 或 `App.vue` 中：

```typescript
import { createLogger } from '@spark-view/spark-app'

const appLogger = createLogger('App', {
  level: 'info',
  enableRemote: import.meta.env.PROD
})

provide('logger', appLogger)
```

### 3. 向后兼容

如果应用层未提供 logger，组件仍然可以工作（fallback 到 console）：

```typescript
// ✅ 有应用层 logger：使用应用配置
logger.info('message') // 使用 createLogger 配置的格式

// ✅ 无应用层 logger：使用 console
logger.info('message') // console.info('message')
```

## 测试验证

所有 84 个测试通过，包括：
- ✅ Logger 上下文集成测试（5 个）
- ✅ 组件系统测试（6 个）
- ✅ EJ2 组件测试（8 个）
- ✅ 能力系统测试（多个）

## 参考文档

- [Logger Provider Example](../examples/logger-provider-example.ts) - 完整应用示例
- [spark-utils README](../../packages/spark-utils/README.md) - Logger API 文档
- [spark-app API](../../packages/spark-app/README.md) - createLogger 用法

## 总结

新架构遵循"控制反转"原则：
- **应用层**：控制全局日志行为（提供 logger）
- **组件层**：消费 logger 服务（使用 logger）
- **工具层**：提供 logger 接口和实现（spark-utils, spark-app）

这样的分层设计使得系统更清晰、更易维护、更易测试。
