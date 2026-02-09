# 应用层 Logger 提供示例

> 本文档展示如何在应用层统一提供 Logger，供所有组件使用。

## 📋 目录

- [方式 1：使用 SparkApp.start()（推荐）](#方式-1使用-sparkappstart推荐)
- [方式 2：手动创建 App 实例](#方式-2手动创建-app-实例)
- [方式 3：在 App.vue 中提供（小型应用）](#方式-3在-appvue-中提供小型应用)
- [方式 4：组件中使用 Logger](#方式-4组件中使用-logger)
- [类型定义](#类型定义)

---

## 方式 1：使用 SparkApp.start()（推荐）

这是推荐的方式，logger 会自动传递给所有组件。

```typescript
import { SparkApp, createLogger } from '@spark-view/spark-app'
import { useSparkComponent } from '@spark-view/spark-component'
import { APP_SERVICES } from '@spark-view/spark-utils'
import App from './App.vue'

await SparkApp.start({
  rootComponent: App,
  plugins: [/* UI 插件 */],
  
  /**
   * beforeMount 钩子中提供全局 logger
   */
  beforeMount: async (context) => {
    const { app, router } = context
    
    // 创建应用层 logger
    const appLogger = createLogger('App', {
      level: 'info',
      enableColors: true,
      showTimestamp: true,
      enableRemote: true,  // 生产环境上报错误
      remoteEndpoint: '/api/logs'
    })
    
    // 在根组件提供 logger
    app.mixin({
      beforeCreate(this: { $options: { name?: string } }) {
        if (this.$options.name === 'App') {
          const { provide } = useSparkComponent({ type: 'root' })
          
          // 方式 1a：通过 APP_SERVICES 提供（推荐）
          provide(APP_SERVICES, {
            router: {
              push: (to) => router.push(to),
              replace: (to) => router.replace(to),
              back: () => router.back(),
              currentRoute: router.currentRoute.value
            },
            logger: appLogger
          })
          
          // 方式 1b：或直接提供 logger 能力
          // provide('logger', appLogger)
          
          appLogger.info('✅ 应用层 Logger 已提供，所有子组件可使用')
        }
      }
    })
  }
})
```

**优势**：
- ✅ 统一的应用启动流程
- ✅ Logger 自动传递给所有组件
- ✅ 支持完整的生命周期钩子
- ✅ 支持插件自动加载

---

## 方式 2：手动创建 App 实例

适用于需要更细粒度控制的场景。

```typescript
import { createApp } from 'vue'
import { createLogger } from '@spark-view/spark-app'
import App from './App.vue'

const app = createApp(App)

// 创建应用层 logger
const appLogger = createLogger('App')

// 在根组件挂载
app.mount('#app')
```

**注意**：这种方式需要在 `App.vue` 的 `setup` 中使用 `provide` 提供 logger。

```vue
<!-- App.vue -->
<script setup lang="ts">
import { useSparkComponent } from '@spark-view/spark-component'
import { APP_SERVICES } from '@spark-view/spark-utils'

const { provide } = useSparkComponent({ type: 'root' })

// 假设 appLogger 通过某种方式传入
provide('logger', appLogger)
</script>
```

---

## 方式 3：在 App.vue 中提供（小型应用）

适用于小型应用，简单直接。

```vue
<!-- App.vue -->
<template>
  <router-view />
</template>

<script setup lang="ts">
import { createLogger } from '@spark-view/spark-app'
import { useSparkComponent } from '@spark-view/spark-component'
import { APP_SERVICES } from '@spark-view/spark-utils'
import { useRouter } from 'vue-router'

const { provide } = useSparkComponent({ type: 'root' })
const appLogger = createLogger('App')
const router = useRouter()

provide(APP_SERVICES, {
  router: {
    push: (to) => router.push(to),
    replace: (to) => router.replace(to),
    back: () => router.back(),
    currentRoute: router.currentRoute.value
  },
  logger: appLogger
})

appLogger.info('应用启动')
</script>
```

**优势**：
- ✅ 代码集中在根组件
- ✅ 结构简单清晰
- ✅ 适合小型项目快速上手

---

## 方式 4：组件中使用 Logger

在任何组件中使用应用层提供的 logger。

```vue
<template>
  <div>
    <button @click="handleClick">执行操作</button>
  </div>
</template>

<script setup lang="ts">
import { useSparkComponent } from '@spark-view/spark-component'

const { logger } = useSparkComponent({ type: 'my-comp' })

// logger 会自动从父级继承应用层提供的实例
logger.info('组件初始化')

function handleClick() {
  try {
    // 执行操作
    logger.info('操作成功', { action: 'click' })
  } catch (error) {
    logger.error('操作失败', error as Error)
  }
}
</script>
```

**优势**：
- ✅ 全局统一的日志配置
- ✅ 统一的日志格式和传输器
- ✅ 生产环境可以集中控制日志级别
- ✅ 支持远程日志上报
- ✅ 自动继承父组件的 logger 配置

---

## 类型定义

### LoggerProviderOptions

```typescript
interface LoggerProviderOptions {
  /** 日志级别 */
  level?: 'debug' | 'info' | 'warn' | 'error'
  /** 是否启用颜色 */
  enableColors?: boolean
  /** 是否显示时间戳 */
  showTimestamp?: boolean
  /** 是否启用远程上报 */
  enableRemote?: boolean
  /** 远程上报端点 */
  remoteEndpoint?: string
}
```

### AppServicesCapability

```typescript
interface AppServicesCapability {
  router?: {
    push: (to: string | { path: string }) => Promise<void>
    replace: (to: string | { path: string }) => Promise<void>
    back: () => void
    currentRoute: { path: string; params: Record<string, string> }
  }
  logger?: ReturnType<typeof createLogger>
}
```

---

## 最佳实践

### 1. 使用 APP_SERVICES 提供（推荐）

```typescript
provide(APP_SERVICES, {
  router: routerService,
  logger: appLogger
})
```

**原因**：
- 统一的服务提供方式
- 类型安全
- 便于扩展新服务

### 2. 生产环境配置

```typescript
const appLogger = createLogger('App', {
  level: import.meta.env.PROD ? 'warn' : 'debug',
  enableColors: !import.meta.env.PROD,
  showTimestamp: true,
  enableRemote: import.meta.env.PROD,
  remoteEndpoint: '/api/logs'
})
```

### 3. 模块化 Logger

为不同模块创建专用 logger：

```typescript
// 在应用启动时
const authLogger = createLogger('Auth')
const apiLogger = createLogger('API')
const uiLogger = createLogger('UI')

provide(APP_SERVICES, {
  router,
  logger: appLogger,
  authLogger,
  apiLogger,
  uiLogger
})
```

---

## 相关文档

- [Logger API 文档](../packages/spark-app/src/logger/README.md)
- [能力系统文档](../guides/CAPABILITY_PROVISION.md)
- [组件开发指南](../guides/COMPONENT_DEVELOPMENT.md)
