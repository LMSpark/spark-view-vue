# APP 服务能力统一提供 - 使用指南

## 🎯 目标

在业务页面层统一提供 APP 服务能力（router, logger, configLoader, authService），避免每个组件重复导入。

## 📦 架构设计

```
┌─────────────────────────────────────┐
│  页面层 (PageRenderer/DataSet)       │
│  ✅ 提供 appServices 能力            │
│  - router, logger, configLoader     │
└─────────────────────────────────────┘
              ↓ 能力传递
┌─────────────────────────────────────┐
│  业务组件层 (UserGrid, etc.)         │
│  ✅ 通过 consume('appServices')       │
│  - 无需导入，直接消费                 │
└─────────────────────────────────────┘
```

## 🔧 实现步骤

### 1. 在 PageRenderer 中注入 APP 服务

```typescript
// packages/spark-renderer/src/components/PageRenderer.vue

import { useRouter } from 'vue-router'
import { useLogger, useConfigLoader } from '@spark-view/spark-app'
import { SparkData } from '@spark-view/spark-data'

// 获取 APP 服务
const router = useRouter()
const logger = useLogger()
const configLoader = useConfigLoader()

// 创建 DataSet 能力管理器时注入 APP 服务
const capabilityManager = SparkData.createCapabilityManager(pageId, {
  dataSet: myDataSet,
  
  // 🎯 关键：注入 APP 服务
  appServices: {
    router: {
      push: (to) => router.push(to),
      replace: (to) => router.replace(to),
      back: () => router.back(),
      currentRoute: router.currentRoute
    },
    logger: {
      debug: (...args) => logger.debug(...args),
      info: (...args) => logger.info(...args),
      warn: (...args) => logger.warn(...args),
      error: (...args) => logger.error(...args)
    },
    configLoader: {
      loadPageConfig: (id) => configLoader.loadPageConfig(id),
      loadRoutes: () => configLoader.loadRoutes(),
      clearCache: () => configLoader.clearCache()
    }
  }
})

// 将 DataSet 上下文注入到 SPARK 组件树
const dataSetContext = capabilityManager.getContext()
// TODO: 将 dataSetContext 设置为页面级父上下文
```

### 2. 在业务组件中消费 APP 服务

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { Spark } from '@spark-view/spark-component'
import type { AppServices } from '@spark-view/spark-data'

const { consume, logger } = Spark.useSpark(props.config)

// ✅ 通过能力系统消费 APP 服务（无需导入）
const appServices = consume<AppServices>('appServices')

// 便捷访问
const appRouter = computed(() => appServices.value?.router)
const appLogger = computed(() => appServices.value?.logger)

// 使用 APP 服务
const handleNavigate = () => {
  appLogger.value?.info('🏠 Navigating to home')
  appRouter.value?.push('/')
}

const handleAction = () => {
  appLogger.value?.info('📝 Action triggered')
  // ... 业务逻辑
}
</script>
```

## 📝 对比

### ❌ 之前：每个组件都要导入

```typescript
// UserGrid.vue
import { useRouter } from 'vue-router'
import { useLogger } from '@spark-view/spark-app'

const router = useRouter()
const logger = useLogger()

// UserRow.vue
import { useRouter } from 'vue-router'
import { useLogger } from '@spark-view/spark-app'

const router = useRouter()
const logger = useLogger()

// UserField.vue
import { useRouter } from 'vue-router'
import { useLogger } from '@spark-view/spark-app'

const router = useRouter()
const logger = useLogger()
```

### ✅ 现在：页面层统一提供

```typescript
// PageRenderer.vue（页面层，提供一次）
appServices: {
  router, logger, configLoader, authService
}

// UserGrid.vue（业务组件，直接消费）
const appServices = consume<AppServices>('appServices')
const router = computed(() => appServices.value?.router)
const logger = computed(() => appServices.value?.logger)

// UserRow.vue（业务组件，直接消费）
const appServices = consume<AppServices>('appServices')
const router = computed(() => appServices.value?.router)

// UserField.vue（业务组件，直接消费）
const appServices = consume<AppServices>('appServices')
const router = computed(() => appServices.value?.router)
```

## 🎨 优势

1. **DRY 原则**：避免重复导入代码
2. **统一管理**：APP 服务在页面层统一注入，便于维护
3. **测试友好**：Mock APP 服务只需在页面层替换
4. **类型安全**：通过 `AppServices` 接口保证类型约束
5. **按需注入**：不同页面可以注入不同的服务集合

## 🔍 类型定义

```typescript
// packages/spark-data/src/capability/DataSetCapabilityManager.ts

export interface AppServices {
  /** Vue Router 实例 */
  router?: {
    push(to: string | { path: string; query?: Record<string, unknown> }): Promise<void>
    replace(to: string | { path: string; query?: Record<string, unknown> }): Promise<void>
    back(): void
    currentRoute: { value: { path: string; query: Record<string, unknown> } }
  }
  
  /** APP Logger */
  logger?: {
    debug(message: string, ...args: unknown[]): void
    info(message: string, ...args: unknown[]): void
    warn(message: string, ...args: unknown[]): void
    error(message: string, ...args: unknown[]): void
  }
  
  /** 配置加载器 */
  configLoader?: {
    loadPageConfig(pageId: string): Promise<unknown>
    loadRoutes(): Promise<unknown>
    clearCache(): void
  }
  
  /** 认证服务 */
  authService?: {
    getUser(): { id: string; name: string; roles: string[] } | null
    login(credentials: { username: string; password: string }): Promise<boolean>
    logout(): Promise<void>
    checkAuth(): Promise<boolean>
  }
}
```

## 🚀 快速开始

查看演示组件：
- `src/components/demo/AppServicesDemo.vue` - 页面层如何提供 APP 服务
- `src/components/demo/UserGrid.vue` - 业务组件如何消费 APP 服务

运行演示：
```bash
pnpm run dev
# 访问 http://localhost:5173/capability-demo
```

## 📖 相关文档

- [DataSetCapabilityManager API](../../packages/spark-data/src/capability/DataSetCapabilityManager.ts)
- [能力系统架构](../../docs/SPARK_ARCHITECTURE.md)
- [组件开发指南](../../docs/guides/COMPONENT_DEVELOPMENT.md)
