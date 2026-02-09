# 服务访问指南

> ⚠️ **重要更新**：项目已统一 DI 架构到单一管道（SPARK 能力系统）。本文档已更新为推荐的访问方式。

## DI 架构演进

### 旧架构（已废弃）
```typescript
// ❌ 旧方式 1：DI 容器
import { container, ServiceIdentifiers } from '@spark-view/spark-app'
const logger = container.resolve(ServiceIdentifiers.Logger)

// ❌ 旧方式 2：Vue 原生 DI Composables
import { useLogger, useAppContext, useAuth } from '@spark-view/spark-app'
const logger = useLogger()  // ⚠️ 已标记 @deprecated
```

### 新架构（推荐）
```typescript
// ✅ 新方式 1：直接使用标准工具（推荐）
import { useRouter } from 'vue-router'
import { Logger } from '@spark-view/spark-utils'
const router = useRouter()
const logger = Logger('MyComponent')

// ✅ 新方式 2：通过 SPARK 能力系统
import { useSparkComponent } from '@spark-view/spark-component'
import { APP_SERVICES } from '@spark-view/spark-utils'
const { consume } = useSparkComponent({ type: 'my-comp' })
const services = consume(APP_SERVICES)
```

## 架构优势对比

| 特性 | 旧方式（Vue DI） | 新方式（SPARK 能力系统） |
|-----|-----------------|------------------------|
| 管道数量 | 2 条（混乱） | 1 条（统一） |
| 类型安全 | ✅ 自动推断 | ✅ 自动推断 |
| 延迟绑定 | ❌ 不支持 | ✅ 支持 |
| 父链查找 | ❌ 不支持 | ✅ 支持 |
| Tree-shaking | ✅ 按需引入 | ✅ 按需引入 |
| 架构清晰度 | ⚠️ 两套体系 | ✅ 单一体系 |

## 推荐的服务访问方式

### Router 访问

```typescript
// ✅ 推荐：直接使用 vue-router
import { useRouter } from 'vue-router'

export default {
  setup() {
    const router = useRouter()
    router.push('/home')
    return { router }
  }
}
```

### Logger 访问

```typescript
// ✅ 推荐：使用 Logger 工厂函数
import { Logger } from '@spark-view/spark-utils'

export default {
  setup() {
    const logger = Logger('MyComponent')
    logger.info('Component mounted')
    logger.error('Something went wrong', error)
    return { logger }
  }
}
```

### 应用服务访问（组件内）

```typescript
// ✅ 推荐：通过 APP_SERVICES 能力
import { useSparkComponent } from '@spark-view/spark-component'
import { APP_SERVICES } from '@spark-view/spark-utils'

export default {
  setup() {
    const { consume } = useSparkComponent({ type: 'my-comp' })
    const services = consume(APP_SERVICES)
    
    if (services) {
      // 访问路由
      services.router?.push('/home')
      
      // 访问日志
      services.logger?.info('Action')
      
      // 访问认证
      if (services.auth?.isAuthenticated()) {
        console.log('已登录')
      }
      
      // 访问配置加载器
      const config = await services.configLoader?.loadPageConfig('home')
    }
    
    return { services }
  }
}
```

### SPARK 核心服务

```typescript
// ✅ 推荐：使用 useSparkRegistry（核心基础设施）
import { useSparkRegistry } from '@spark-view/spark-app'

export default {
  setup() {
    const registry = useSparkRegistry()
    registry.register('my-component', MyComponent)
    const ComponentClass = registry.get('spark-grid')
    return { registry }
  }
}
```

> 📝 **注意**：`useSparkRegistry` 是唯一保留的 Vue DI composable，因为组件注册表是 SPARK 核心基础设施的一部分。

## 废弃的 Composables（不推荐使用）

以下 composables 已被标记为 `@deprecated`，请使用上述推荐方式替代：

| 废弃的 Composable | 替代方案 |
|-------------------|----------|
| `useAppRouter()` | ✅ `useRouter()` from `vue-router` |
| `useLogger()` | ✅ `Logger('module')` from `@spark-view/spark-utils` |
| `useAppContext()` | ✅ `consume(APP_SERVICES)` |
| `useAuth()` | ✅ `consume(APP_SERVICES)` |
| `useConfigLoader()` | ✅ `consume(APP_SERVICES)` |
| `useCurrentUser()` | ✅ `consume(APP_SERVICES)?.auth?.getCurrentUser()` |
| `useCurrentTenant()` | ✅ `consume(APP_SERVICES)?.auth?.getCurrentTenant()` |
| `usePermissions()` | ✅ `consume(APP_SERVICES)?.auth?.hasPermission()` |
| `tryUseAuth()` | ✅ `consume(APP_SERVICES)` (已支持 undefined 返回) |
| `tryUseAppContext()` | ✅ `consume(APP_SERVICES)` (已支持 undefined 返回) |

## 在组件中使用

### Options API（推荐新方式）

```vue
<script>
import { useRouter } from 'vue-router'
import { Logger } from '@spark-view/spark-utils'
import { useSparkComponent } from '@spark-view/spark-component'
import { APP_SERVICES } from '@spark-view/spark-utils'

export default {
  setup() {
    const router = useRouter()
    const logger = Logger('MyComponent')
    const { consume } = useSparkComponent({ type: 'my-comp' })
    const services = consume(APP_SERVICES)
    
    return { router, logger, services }
  },
  
  mounted() {
    this.logger.info('Component mounted', { 
      user: this.services?.auth?.getCurrentUser()?.username 
    })
  }
}
</script>
```

### Composition API（推荐新方式）

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Logger } from '@spark-view/spark-utils'
import { useSparkComponent } from '@spark-view/spark-component'
import { APP_SERVICES } from '@spark-view/spark-utils'

const router = useRouter()
const logger = Logger('MyComponent')
const { consume } = useSparkComponent({ type: 'my-comp' })
const services = consume(APP_SERVICES)

const user = computed(() => services?.auth?.getCurrentUser())
const hasPermission = (perm: string) => services?.auth?.hasPermission(perm) ?? false

onMounted(() => {
  logger.info('Component mounted', { user: user.value?.username })
})
</script>

<template>
  <div v-if="hasPermission('page:view')">
    <h1>Welcome, {{ user?.displayName }}</h1>
  </div>
</template>
```

## 实战示例

### 条件渲染（基于权限）

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useSparkComponent } from '@spark-view/spark-component'
import { APP_SERVICES } from '@spark-view/spark-utils'

const { consume } = useSparkComponent({ type: 'user-manager' })
const services = consume(APP_SERVICES)

const hasPermission = (perm: string) => services?.auth?.hasPermission(perm) ?? false
const hasRole = (role: string) => services?.auth?.hasRole(role) ?? false
</script>

<template>
  <el-button v-if="hasPermission('user:create')" @click="createUser">
    新增用户
  </el-button>
  
  <el-button v-if="hasPermission('user:delete')" type="danger">
    删除用户
  </el-button>
  
  <el-menu v-if="hasRole('admin')">
    <el-menu-item>系统管理</el-menu-item>
  </el-menu>
</template>
```

### 日志追踪

```vue
<script setup lang="ts">
import { Logger } from '@spark-view/spark-utils'
import { useSparkComponent } from '@spark-view/spark-component'
import { APP_SERVICES } from '@spark-view/spark-utils'

const logger = Logger('UserProfile')
const { consume } = useSparkComponent({ type: 'user-profile' })
const services = consume(APP_SERVICES)
const user = computed(() => services?.auth?.getCurrentUser())

async function saveProfile() {
  logger.info('保存用户资料', { userId: user.value?.userId })
  
  try {
    await api.updateProfile(...)
    logger.success('保存成功')
  } catch (error) {
    logger.error('保存失败', error)
  }
}
</script>
```

### 路由守卫

```typescript
import { useRouter } from 'vue-router'
import { Logger } from '@spark-view/spark-utils'

const router = useRouter()
const logger = Logger('RouteGuard')

router.beforeEach((to, from, next) => {
  // ❌ 不能在路由守卫中使用 composables
  // 因为路由守卫在 setup 外执行
  
  // ✅ 正确做法：通过 services 参数传递
  // 或在组件内使用 onBeforeRouteEnter
  next()
})
```

## 迁移指南

### 从旧 Composables 迁移到新架构

**Before (废弃方式):**
```typescript
import { useLogger, useAppRouter, useAuth } from '@spark-view/spark-app'

const logger = useLogger('MyComponent')  // ⚠️ 已废弃
const router = useAppRouter()  // ⚠️ 已废弃
const auth = useAuth()  // ⚠️ 已废弃
```

**After (推荐方式):**
```typescript
// 方式 1: 直接使用标准工具（推荐）
import { useRouter } from 'vue-router'
import { Logger } from '@spark-view/spark-utils'

const logger = Logger('MyComponent')
const router = useRouter()

// 方式 2: 通过 APP_SERVICES 能力（组件内）
import { useSparkComponent } from '@spark-view/spark-component'
import { APP_SERVICES } from '@spark-view/spark-utils'

const { consume } = useSparkComponent({ type: 'my-comp' })
const services = consume(APP_SERVICES)
```

### 从 DI 容器迁移

**Before:**
```typescript
import { container, ServiceIdentifiers } from '@spark-view/spark-app'

const logger = container.resolve(ServiceIdentifiers.Logger)
const router = container.resolve(ServiceIdentifiers.Router)
```

**After:**
```typescript
import { useRouter } from 'vue-router'
import { Logger } from '@spark-view/spark-utils'

const logger = Logger('MyModule')
const router = useRouter()
```

## 最佳实践

### 1. 优先使用标准工具

```typescript
// ✅ 推荐：直接使用 vue-router
import { useRouter } from 'vue-router'
const router = useRouter()

// ✅ 推荐：使用 Logger 工厂函数
import { Logger } from '@spark-view/spark-utils'
const logger = Logger('MyComponent')
```

### 2. 组件内使用 APP_SERVICES

```typescript
// ✅ 推荐：通过 SPARK 能力系统访问应用服务
import { useSparkComponent } from '@spark-view/spark-component'
import { APP_SERVICES } from '@spark-view/spark-utils'

const { consume } = useSparkComponent({ type: 'my-comp' })
const services = consume(APP_SERVICES)

if (services) {
  services.router?.push('/home')
  services.logger?.info('Action')
  services.auth?.isAuthenticated()
}
```

### 3. 组合使用构建复杂逻辑

```typescript
// ✅ 推荐：组合使用
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Logger } from '@spark-view/spark-utils'
import { useSparkComponent } from '@spark-view/spark-component'
import { APP_SERVICES } from '@spark-view/spark-utils'

export function useUserOperations() {
  const router = useRouter()
  const logger = Logger('UserOperations')
  const { consume } = useSparkComponent({ type: 'user-ops' })
  const services = consume(APP_SERVICES)
  
  const canDelete = computed(() => 
    services?.auth?.hasPermission('user:delete') ?? false
  )
  
  async function deleteUser(userId: string) {
    if (!canDelete.value) {
      logger.warn('权限不足')
      return
    }
    
    logger.info('删除用户', { userId })
    try {
      await api.deleteUser(userId)
      logger.success('删除成功')
      router.push('/users')
    } catch (error) {
      logger.error('删除失败', error)
    }
  }
  
  return {
    canDelete,
    deleteUser
  }
}
```

### 4. 避免在路由守卫中使用 Composables

```typescript
// ❌ 错误：Composables 只能在 setup 中使用
router.beforeEach((to, from, next) => {
  const services = consume(APP_SERVICES)  // ❌ 错误！
  next()
})

// ✅ 正确：在应用启动时传递服务
function setupRouterGuards(services: AppServices) {
  router.beforeEach((to, from, next) => {
    const requiredPermission = to.meta.permission as string
    if (requiredPermission && !services.auth?.hasPermission(requiredPermission)) {
      services.logger?.warn('权限不足', { route: to.path })
      next('/forbidden')
    } else {
      next()
    }
  })
}
```

## 总结

| 场景 | 推荐方式 | 说明 |
|-----|---------|------|
| **路由访问** | `useRouter()` from `vue-router` | 标准 Vue Router composable |
| **日志记录** | `Logger('module')` from `@spark-view/spark-utils` | 工厂函数，无需 DI |
| **组件内服务** | `consume(APP_SERVICES)` | SPARK 能力系统 |
| **组件注册表** | `useSparkRegistry()` | 唯一保留的 Vue DI composable |

**核心原则**：统一到单一 DI 管道（SPARK 能力系统），避免两套体系的混乱。
  const { consume } = useSparkComponent({ type: 'user-ops' })
  const services = consume(APP_SERVICES)
  
  const canDelete = computed(() => 
    services?.auth?.hasPermission('user:delete') ?? false
  )
  
  async function deleteUser(userId: string) {
    if (!canDelete.value) {
      logger.warn('权限不足')
      return
    }
    
    logger.info('删除用户', { userId, operator: user.username })
    await api.deleteUser(userId)
  }
  
  return { canDelete, deleteUser }
}
```

## 向后兼容

DI 容器仍然可用，但推荐新代码使用 Composables：

```typescript
// ✅ 可用但不推荐
import { container } from '@spark-view/spark-app'
const logger = container.resolve('Logger')

// ✅ 推荐
import { useLogger } from '@spark-view/spark-app'
const logger = useLogger()
```
