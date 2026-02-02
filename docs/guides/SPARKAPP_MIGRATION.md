# SPARK-APP 迁移指南

## 当前 main.ts 分析

### ✅ 已在 spark-app 的功能
1. **认证系统** - auth 配置完全由 spark-app 处理
2. **路由守卫** - setupRouterGuards 在 bootstrap 中自动执行
3. **错误处理** - setupErrorHandler 在 bootstrap 中自动执行
4. **AppContext** - 由 bootstrap 自动创建和提供

### ❌ 应该移入 spark-app 的功能

#### 1. SPARK 组件系统注册
**当前位置：** main.ts `registerSparkServices()`
```typescript
function registerSparkServices(app: VueApp): void {
  const manager = Spark.createComponentManager()
  const registry = Spark.createComponentRegistry()
  app.use(Spark.createVuePlugin({ manager, registry }))
  container.register('SparkManager', () => manager, ServiceLifetime.SINGLETON)
  container.register('SparkRegistry', () => registry, ServiceLifetime.SINGLETON)
}
```

**理由：**
- ✅ 每个 SPARK 项目都需要
- ✅ 属于基础设施，不是业务逻辑
- ✅ 配置化即可（是否启用）

**建议方案：**
```typescript
// main.ts - 简化后
await SparkApp.bootstrap({
  spark: { enabled: true },  // 自动初始化 SPARK 组件系统
  // ...
})
```

---

#### 2. 动态路由系统
**当前位置：** main.ts `registerDynamicRoutes()`
```typescript
async function registerDynamicRoutes(router: Router): Promise<void> {
  const configLoader = SparkPageConfig.createConfigLoader({ ... })
  const dynamicRouter = SparkPageConfig.createDynamicRouter({ ... })
  container.register('ConfigLoader', () => configLoader, ServiceLifetime.SINGLETON)
  container.register('DynamicRouter', () => dynamicRouter, ServiceLifetime.SINGLETON)
  await dynamicRouter.registerRoutes()
  router.addRoute({ path: '/', redirect: APP_CONFIG.homePath })
}
```

**理由：**
- ✅ 零代码页面配置是 SPARK 核心特性
- ✅ 大部分项目需要此功能
- ✅ 代码高度模板化，适合抽象

**建议方案：**
```typescript
// main.ts - 简化后
await SparkApp.bootstrap({
  pageConfig: {
    source: 'hybrid',
    apiBaseUrl: APP_CONFIG.apiBaseUrl,
    localPrefix: '/pages-config',
    enableCache: true,
    cacheExpiry: APP_CONFIG.cacheExpiry,
    timeout: APP_CONFIG.timeout,
    pageComponent: DynamicPage,
    homePath: APP_CONFIG.homePath
  },
  // ...
})
```

---

#### 3. 错误降级处理
**当前位置：** main.ts `try-catch`
```typescript
try {
  await SparkApp.bootstrap({ ... })
} catch (error) {
  logger.error('系统初始化失败', error as Error)
  logger.warn('尝试降级启动...')
  app.use(router)
  await router.isReady()
  app.mount('#app')
}
```

**理由：**
- ✅ 健壮性保障，所有项目都需要
- ✅ 降级逻辑固定，无需定制
- ✅ 用户只需控制是否降级

**建议方案：**
```typescript
// main.ts - 简化后
await SparkApp.bootstrap({
  onError: async (error, fallback) => {
    logger.error('初始化失败', error)
    logger.warn('降级启动...')
    await fallback()  // 执行默认降级逻辑
  },
  // ...
})
```

---

### ✅ 应该保留在 main.ts 的功能

#### 1. UI 库注册
```typescript
;[ElementPlus, VXETable, formCreate].forEach(plugin => app.use(plugin))
```
**理由：**
- ❌ 不是每个项目都用相同 UI 库
- ❌ Element Plus vs Ant Design vs Naive UI 是业务选择
- ✅ 保持灵活性

**可选优化：** 提供 `plugins` 选项
```typescript
await SparkApp.bootstrap({
  plugins: [ElementPlus, VXETable, formCreate],  // 自动注册
  // ...
})
```

#### 2. 应用配置
```typescript
const APP_CONFIG = { version: '1.0.0', ... }
const MOCK_DATA = { user: {...}, tenant: {...} }
const AUTH_CONFIG = { ... }
```
**理由：**
- ❌ 每个项目配置不同（API 路径、Mock 数据等）
- ✅ 声明式配置已足够简洁
- ✅ 保留在 main.ts 可见性高

---

## 📋 迁移清单

### Phase 1: SPARK 组件系统集成 ✅ 推荐
```typescript
// bootstrap 增强
export interface BootstrapOptions {
  spark?: {
    enabled?: boolean      // 默认 true
    manager?: any          // 自定义管理器
    registry?: any         // 自定义注册表
  }
}
```

**收益：**
- main.ts 减少 10 行代码
- 所有 SPARK 项目自动初始化组件系统

---

### Phase 2: 动态路由集成 ✅ 推荐
```typescript
// bootstrap 增强
export interface BootstrapOptions {
  pageConfig?: {
    source?: 'api' | 'local' | 'hybrid'
    apiBaseUrl?: string
    localPrefix?: string
    enableCache?: boolean
    cacheExpiry?: number
    timeout?: number
    pageComponent?: Component
    homePath?: string
    beforeRegister?: (routes: any[]) => Promise<any[]>
    afterRegister?: (routes: any[]) => void
  }
}
```

**收益：**
- main.ts 减少 40 行代码
- 零代码配置页面路由

---

### Phase 3: 错误降级增强 ✅ 推荐
```typescript
// bootstrap 增强
export interface BootstrapOptions {
  onError?: (error: Error, fallback: () => Promise<void>) => void | Promise<void>
}

// bootstrap 内部
try {
  // 初始化流程
} catch (error) {
  if (onError) {
    await onError(error, async () => {
      app.use(router)
      await router.isReady()
      app.mount('#app')
    })
  } else {
    // 默认降级
    app.use(router)
    await router.isReady()
    app.mount('#app')
  }
}
```

**收益：**
- 自动降级处理
- 可自定义降级行为

---

### Phase 4: UI 插件注册 ⚠️ 可选
```typescript
// bootstrap 增强
export interface BootstrapOptions {
  plugins?: { install: (app: App) => void }[]
}

// bootstrap 内部
options.plugins?.forEach(plugin => app.use(plugin))
```

**收益：**
- main.ts 减少 2 行代码
- 统一插件注册入口

---

## 🎯 最终效果对比

### Before（当前 main.ts - 206 行）
```typescript
const logger = createLogger('main')

const APP_CONFIG = { ... }
const MOCK_DATA = { ... }
const AUTH_CONFIG = { ... }

function createVueApp() { ... }
function registerSparkServices(app) { ... }  // 10 行
async function registerDynamicRoutes(router) { ... }  // 40 行

async function initApp() {
  const { app, router } = createVueApp()
  registerSparkServices(app)  // 手动调用
  await registerDynamicRoutes(router)  // 手动调用
  
  try {
    await SparkApp.bootstrap({ ... })
  } catch (error) {
    // 手动降级处理
    logger.error('系统初始化失败', error)
    app.use(router)
    await router.isReady()
    app.mount('#app')
  }
}
```

### After（优化后 main.ts - ~130 行，减少 37%）
```typescript
const logger = createLogger('main')

const APP_CONFIG = { ... }
const MOCK_DATA = { ... }
const AUTH_CONFIG = { ... }

async function initApp() {
  const app = createApp(App)
  const router = createRouter({ history: createWebHistory(), routes: [] })
  
  await SparkApp.bootstrap({
    app,
    router,
    config: APP_CONFIG,
    auth: AUTH_CONFIG,
    
    // ✅ 自动初始化 SPARK 组件系统
    spark: { enabled: true },
    
    // ✅ 自动注册动态路由
    pageConfig: {
      source: 'hybrid',
      apiBaseUrl: APP_CONFIG.apiBaseUrl,
      localPrefix: '/pages-config',
      enableCache: true,
      cacheExpiry: APP_CONFIG.cacheExpiry,
      timeout: APP_CONFIG.timeout,
      pageComponent: DynamicPage,
      homePath: APP_CONFIG.homePath,
      afterRegister: (routes) => logger.success('动态路由注册完成', { count: routes.length })
    },
    
    // ✅ 可选：UI 插件
    plugins: [ElementPlus, VXETable, formCreate],
    
    // ✅ 自动降级处理
    onError: async (error, fallback) => {
      logger.error('初始化失败', error)
      logger.warn('降级启动...')
      await fallback()
    },
    
    beforeMount: async (context) => { ... },
    afterMount: async (context) => { ... }
  })
}
```

---

## 📊 收益分析

| 项目 | Before | After | 减少 |
|-----|--------|-------|------|
| 代码行数 | 206 | ~130 | -37% |
| 函数定义 | 4 | 1 | -75% |
| 手动调用 | 3 | 0 | -100% |
| 配置行数 | 85 | 85 | 0% |
| 错误处理 | 手动 | 自动 | ✅ |

**关键收益：**
1. ✅ **代码减少 37%** - 从 206 行降至 130 行
2. ✅ **函数减少 75%** - 只保留 initApp()
3. ✅ **零手动调用** - 全部声明式配置
4. ✅ **自动降级** - 内置健壮性保障
5. ✅ **类型安全** - TypeScript 完整支持

---

## 🚀 实施建议

### 优先级
1. **P0（立即）**：Phase 1 + Phase 2 - SPARK 组件 + 动态路由
2. **P1（本周）**：Phase 3 - 错误降级增强
3. **P2（可选）**：Phase 4 - UI 插件统一注册

### 兼容性
- ✅ 保持向后兼容
- ✅ 旧写法仍然可用
- ✅ 渐进式迁移

### 风险
- ⚠️ 需要更新 bootstrap 实现
- ⚠️ 需要测试覆盖所有场景
- ✅ 不影响已有项目

---

## 📝 实施步骤

1. 更新 `BootstrapOptions` 类型定义
2. 实现 Phase 1-3 功能
3. 更新 main.ts 使用新配置
4. 编写测试用例
5. 更新文档
6. 发布新版本
