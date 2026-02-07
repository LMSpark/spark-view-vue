# Composables 使用指南

## 为什么用 Composables？

**旧方式（DI 容器）：**
```typescript
import { container, ServiceIdentifiers } from '@spark-view/spark-app'

const logger = container.resolve(ServiceIdentifiers.Logger)  // ❌ 冗长、类型不安全
```

**新方式（Composables）：**
```typescript
import { useLogger } from '@spark-view/spark-app'

const logger = useLogger()  // ✅ 简洁、类型安全、IDE 友好
```

## 优势对比

| 特性 | DI 容器 | Composables |
|-----|--------|------------|
| 代码长度 | `container.resolve(ServiceIdentifiers.Logger)` | `useLogger()` |
| 类型安全 | ⚠️ 需要手动标注 | ✅ 自动推断 |
| IDE 支持 | ⚠️ 跳转到接口 | ✅ 跳转到实现 |
| Tree-shaking | ❌ 全量引入 | ✅ 按需引入 |
| Vue 生态 | ❌ 非标准 | ✅ 标准实践 |

## 核心 Composables

### 应用上下文

```typescript
import { useAppContext, useCurrentUser, useCurrentTenant } from '@spark-view/spark-app'

// 完整上下文
const { user, tenant, env, config } = useAppContext()

// 快捷访问
const user = useCurrentUser()
const tenant = useCurrentTenant()
```

### 权限检查

```typescript
import { usePermissions } from '@spark-view/spark-app'

const { hasPermission, hasRole, hasAnyPermission } = usePermissions()

if (hasPermission('user:delete')) {
  // 显示删除按钮
}

if (hasRole('admin')) {
  // 显示管理菜单
}

if (hasAnyPermission('user:read', 'user:write')) {
  // 显示用户模块
}
```

### 路由和日志

```typescript
import { useAppRouter, useLogger } from '@spark-view/spark-app'

// 路由
const router = useAppRouter()
router.push('/home')

// 日志（自动带组件名称）
const logger = useLogger('MyComponent')
logger.info('Component mounted')
logger.error('Something went wrong', error)
```

### 认证服务

```typescript
import { useAuth } from '@spark-view/spark-app'

const auth = useAuth()

// 登录
await auth.login({ username: 'admin', password: '123' })

// 检查状态
if (auth.isAuthenticated()) {
  console.log('已登录')
}

// 登出
await auth.logout()
```

### SPARK 服务

```typescript
import { useSparkManager, useSparkRegistry } from '@spark-view/spark-app'

// 组件管理器
const manager = useSparkManager()
const component = manager.getComponent('spark-grid')

// 组件注册表
const registry = useSparkRegistry()
registry.register('my-component', MyComponent)
```

### 配置加载

```typescript
import { useConfigLoader } from '@spark-view/spark-app'

const configLoader = useConfigLoader()
const pageConfig = await configLoader.loadPageConfig('home')
```

## 可选访问（不抛出异常）

某些场景下，服务可能未提供，使用 `tryUseXxx` 避免异常：

```typescript
import { tryUseAuth, tryUseAppContext } from '@spark-view/spark-app'

const auth = tryUseAuth()
if (auth) {
  // 有认证服务
  await auth.login(...)
} else {
  // 无认证服务，使用其他方式
}
```

## 在组件中使用

### Options API

```vue
<script>
import { useCurrentUser, useLogger, usePermissions } from '@spark-view/spark-app'

export default {
  setup() {
    const user = useCurrentUser()
    const logger = useLogger('MyComponent')
    const { hasPermission } = usePermissions()
    
    return { user, logger, hasPermission }
  },
  
  mounted() {
    this.logger.info('Component mounted', { user: this.user.username })
  }
}
</script>
```

### Composition API

```vue
<script setup lang="ts">
import { useCurrentUser, useLogger, usePermissions } from '@spark-view/spark-app'

const user = useCurrentUser()
const logger = useLogger('MyComponent')
const { hasPermission } = usePermissions()

onMounted(() => {
  logger.info('Component mounted', { user: user.username })
})
</script>

<template>
  <div v-if="hasPermission('page:view')">
    <h1>Welcome, {{ user.displayName }}</h1>
  </div>
</template>
```

## 实战示例

### 条件渲染（基于权限）

```vue
<script setup lang="ts">
import { usePermissions } from '@spark-view/spark-app'

const { hasPermission, hasRole } = usePermissions()
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
import { useLogger, useCurrentUser } from '@spark-view/spark-app'

const logger = useLogger('UserProfile')
const user = useCurrentUser()

async function saveProfile() {
  logger.info('保存用户资料', { userId: user.userId })
  
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
import { usePermissions, useAppRouter, useLogger } from '@spark-view/spark-app'

const router = useAppRouter()
const logger = useLogger('RouteGuard')

router.beforeEach((to, from, next) => {
  const { hasPermission } = usePermissions()
  
  const requiredPermission = to.meta.permission as string
  
  if (requiredPermission && !hasPermission(requiredPermission)) {
    logger.warn('权限不足', { 
      route: to.path, 
      required: requiredPermission 
    })
    next('/forbidden')
  } else {
    next()
  }
})
```

## 迁移指南

### 从 DI 容器迁移

**Before:**
```typescript
import { container, ServiceIdentifiers } from '@spark-view/spark-app'

const logger = container.resolve(ServiceIdentifiers.Logger)
const router = container.resolve(ServiceIdentifiers.Router)
const context = container.resolve(ServiceIdentifiers.AppContext)
```

**After:**
```typescript
import { useLogger, useAppRouter, useAppContext } from '@spark-view/spark-app'

const logger = useLogger()
const router = useAppRouter()
const context = useAppContext()
```

### 从 inject() 迁移

**Before:**
```typescript
import { inject } from 'vue'

const appContext = inject('appContext')  // ❌ 无类型、字符串 key
const auth = inject('authService')
```

**After:**
```typescript
import { useAppContext, useAuth } from '@spark-view/spark-app'

const appContext = useAppContext()  // ✅ 类型安全
const auth = useAuth()
```

## 最佳实践

1. **优先使用 Composables**：在组件中使用 `useXxx()` 而非直接访问容器
2. **按需导入**：只导入需要的 composables，支持 tree-shaking
3. **明确错误处理**：可选服务使用 `tryUseXxx()`，必需服务使用 `useXxx()`
4. **组合使用**：组合多个 composables 实现复杂逻辑

```typescript
// ✅ 推荐：组合使用
import { useCurrentUser, useLogger, usePermissions } from '@spark-view/spark-app'

export function useUserOperations() {
  const user = useCurrentUser()
  const logger = useLogger('UserOperations')
  const { hasPermission } = usePermissions()
  
  const canDelete = computed(() => hasPermission('user:delete'))
  
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
