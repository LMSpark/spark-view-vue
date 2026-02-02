# 迁移到 @spark-view/spark-page-config

本指南帮助你将现有的页面配置系统迁移到新的 `@spark-view/spark-page-config` 包。

## 📋 当前架构

**旧方式** - 直接在 src/services/page-config.ts 中加载配置：

```typescript
// src/services/page-config.ts
export const getPageConfig = async (pageId: string) => {
  const [ruleResponse, dataResponse] = await Promise.all([
    fetch(`/pages-config/${pageId}/rule.json`),
    fetch(`/pages-config/${pageId}/pagedata.json`)
  ])
  const rule = await ruleResponse.json()
  const data = await dataResponse.json()
  return { rule, data }
}

// src/router/index.ts
const routes = await fetch('/pages-config/routes.json').then(r => r.json())
routes.forEach(route => {
  router.addRoute({
    path: route.path,
    name: route.name,
    component: DynamicPage
  })
})
```

## 🎯 新架构

**新方式** - 使用 `@spark-view/spark-page-config`：

```typescript
import { SparkPageConfig } from '@spark-view/spark-page-config'
import DynamicPage from '@/views/DynamicPage.vue'

// 1. 创建配置加载器
const configLoader = SparkPageConfig.createLoader({
  source: 'local',
  localPrefix: '/pages-config',
  enableCache: true
})

// 2. 设置动态路由
await SparkPageConfig.setupRoutes(router, configLoader, DynamicPage)
```

## 🔄 迁移步骤

### Step 1: 安装依赖

```bash
pnpm add @spark-view/spark-page-config
```

### Step 2: 更新 router/index.ts

**旧代码：**
```typescript
// src/router/index.ts
import { getRoutes } from '@/services/page-config'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    // 静态路由
    { path: '/login', component: Login }
  ]
})

// 加载动态路由
const dynamicRoutes = await getRoutes()
dynamicRoutes.forEach(route => {
  router.addRoute({
    path: route.path,
    name: route.name,
    component: DynamicPage,
    meta: route.meta
  })
})
```

**新代码：**
```typescript
// src/router/index.ts
import { createRouter, createWebHistory } from 'vue-router'
import { SparkPageConfig } from '@spark-view/spark-page-config'
import DynamicPage from '@/views/DynamicPage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: Login }
  ]
})

// 创建配置加载器
export const configLoader = SparkPageConfig.createLoader({
  source: 'local',
  localPrefix: '/pages-config',
  enableCache: true,
  cacheExpiry: 5 * 60 * 1000
})

// 设置动态路由
export const dynamicRouter = await SparkPageConfig.setupRoutes(
  router,
  configLoader,
  DynamicPage
)

export default router
```

### Step 3: 更新 DynamicPage.vue

**旧代码：**
```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getPageConfig } from '@/services/page-config'

const route = useRoute()
const pageConfig = ref(null)

onMounted(async () => {
  const pageId = route.meta.pageId as string
  pageConfig.value = await getPageConfig(pageId)
})
</script>
```

**新代码：**
```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { configLoader } from '@/router'

const route = useRoute()
const pageConfig = ref(null)

onMounted(async () => {
  const pageId = route.meta.pageId as string
  const result = await configLoader.loadPageConfig(pageId)
  
  if (result.success) {
    pageConfig.value = result.data
  } else {
    console.error('加载页面配置失败:', result.error)
  }
})
</script>
```

### Step 4: 删除旧代码

可以删除以下文件：
```bash
rm src/services/page-config.ts
```

## 🎨 高级配置

### 混合模式（优先 API，降级本地）

适用于生产环境，支持配置热更新：

```typescript
const configLoader = SparkPageConfig.createLoader({
  source: 'hybrid',
  apiBaseUrl: import.meta.env.VITE_API_URL || '/api',
  localPrefix: '/pages-config',
  enableCache: true,
  timeout: 3000
})
```

### 权限过滤

在路由注册前过滤无权限路由：

```typescript
import { useAppContext } from '@spark-view/spark-app'

const dynamicRouter = SparkPageConfig.createRouter({
  router,
  configLoader,
  pageComponent: DynamicPage,
  
  beforeRegister: async (routes) => {
    const { user } = useAppContext()
    
    return routes.filter(route => {
      // 无需权限的路由
      if (!route.meta?.permissions) return true
      
      // 检查用户权限
      return route.meta.permissions.every(p => 
        user?.permissions?.includes(p)
      )
    })
  }
})
```

### 配置验证

```typescript
import { SparkPageConfig } from '@spark-view/spark-page-config'

const result = await configLoader.loadRoutes()

if (result.success) {
  const errorMap = SparkPageConfig.validate.routes(result.data)
  
  if (errorMap.size > 0) {
    console.error('配置验证失败:', errorMap)
  }
}
```

### 配置刷新

支持配置热更新（WebSocket）：

```typescript
// 监听配置更新事件
socket.on('config-updated', async ({ type, pageId }) => {
  if (type === 'routes') {
    // 刷新所有路由
    await dynamicRouter.refreshRoutes()
  } else if (type === 'page') {
    // 清除特定页面缓存
    configLoader.clearCache(`page:${pageId}`)
  }
})
```

## 🔍 对比总结

| 特性 | 旧方式 | 新方式 |
|-----|-------|-------|
| **配置加载** | 手动 fetch | ConfigLoader 自动 |
| **路由注册** | 手动 addRoute | 自动注册 |
| **缓存** | ❌ 无 | ✅ 内置缓存 |
| **验证** | ❌ 无 | ✅ Schema 验证 |
| **错误处理** | 手动处理 | 统一错误处理 |
| **远程配置** | 需手动切换 | 支持 hybrid 模式 |
| **热更新** | ❌ 不支持 | ✅ 支持 |
| **TypeScript** | ⚠️ 部分 | ✅ 完整类型 |

## ✅ 迁移检查清单

- [ ] 安装 `@spark-view/spark-page-config`
- [ ] 创建 ConfigLoader
- [ ] 更新 router/index.ts 使用 setupRoutes
- [ ] 更新 DynamicPage.vue 使用 configLoader
- [ ] 删除旧的 page-config.ts
- [ ] 测试本地模式运行正常
- [ ] （可选）配置混合模式
- [ ] （可选）添加权限过滤
- [ ] （可选）添加配置验证
- [ ] （可选）添加热更新支持

## 📚 参考文档

- [完整 API 文档](../README.md)
- [架构说明](../../../docs/architecture/SPARK_ARCHITECTURE.md)
- [示例代码](../../../examples/)
