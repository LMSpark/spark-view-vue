# AutoLoader 示例代码集合

> **💡 提示**: 可执行的示例代码位于 `src/examples/auto-loader/`，这里是文档形式的完整示例。

## 📋 目录

- [示例 1: 基础使用](#示例-1-基础使用)
- [示例 2: 手动配置 AutoLoader](#示例-2-手动配置-autoloader)
- [示例 3: 开发/生产环境区分](#示例-3-开发生产环境区分)
- [示例 4: 自定义加载策略](#示例-4-自定义加载策略)
- [示例 5: 监听加载进度](#示例-5-监听加载进度)
- [示例 6: 按需手动加载](#示例-6-按需手动加载)
- [示例 7: 与路由集成](#示例-7-与路由集成)
- [示例 8: 完整配置](#示例-8-完整配置)
- [示例 9: 迁移指南](#示例-9-迁移指南)
- [示例 10: 性能对比](#示例-10-性能对比)

---

## 示例 1: 基础使用

**最简单的使用方式（推荐）**

```typescript
import { createApp } from 'vue'
import { Spark } from '@spark-view/spark-component'
import { setupAutoRegister } from '@/bootstrap/auto-register'

const app = createApp({})

// 1. 安装 SPARK 插件
app.use(Spark.createPlugin())

// 2. 自动注册所有组件（一行代码）
await setupAutoRegister(app, {
  mode: 'demand',      // 按需加载模式
  showProgress: true   // 显示加载进度
})

// 3. 挂载应用
app.mount('#app')
```

**特点**：
- ✅ 一行代码完成注册
- ✅ 零配置，自动扫描
- ✅ 按需加载，性能最优

---

## 示例 2: 手动配置 AutoLoader

**完全控制加载行为**

```typescript
import { AutoLoader, Spark } from '@spark-view/spark-component'

const app = createApp({})
app.use(Spark.createPlugin())

const registry = Spark.getRegistry()

// 创建自动加载器
const loader = AutoLoader.create({
  // 使用 Vite glob 扫描组件
  patterns: {
    ...import.meta.glob('../packages/*/src/components/**/*.vue'),
    ...import.meta.glob('../features/**/components/**/*.vue'),
    ...import.meta.glob('./components/**/*.vue')
  },
  
  // 同步加载的核心组件
  syncComponents: [
    'PageRenderer',
    'SparkComponentRenderer',
    'ErrorFallback'
  ],
  
  // 异步加载的组件
  asyncComponents: [
    '*EJ2*',      // Syncfusion 组件
    '*Demo',      // Demo 组件
    'Dashboard',
    'Settings'
  ],
  
  // 文件大小阈值 (KB)
  sizeThreshold: 50,
  
  registry
})

// 按需加载模式
await loader.loadOnDemand()

// 查看统计
console.log('📊 加载统计:', loader.getStats())

app.mount('#app')
```

---

## 示例 3: 开发/生产环境区分

**根据环境优化加载策略**

```typescript
import { setupAutoRegister } from '@/bootstrap/auto-register'

const app = createApp({})
app.use(Spark.createPlugin())

// 根据环境选择加载模式
if (import.meta.env.DEV) {
  // 开发环境：全部加载，方便调试
  await setupAutoRegister(app, { mode: 'all' })
} else {
  // 生产环境：按需加载，优化性能
  await setupAutoRegister(app, { mode: 'demand' })
}

app.mount('#app')
```

---

## 示例 4: 自定义加载策略

**精确控制哪些组件同步/异步加载**

```typescript
const loader = AutoLoader.create({
  patterns: import.meta.glob('./components/**/*.vue'),
  
  // 自定义同步组件列表
  syncComponents: [
    // 核心渲染器
    'PageRenderer',
    'SparkComponentRenderer',
    
    // 布局组件
    'Layout*',
    'Header',
    'Footer',
    
    // 首屏组件
    'Home*',
    'Navigation'
  ],
  
  // 自定义异步组件列表
  asyncComponents: [
    // 重型组件
    '*Chart*',
    '*Heavy*',
    
    // 第三方库
    '*EJ2*',
    '*Editor*',
    
    // 非首屏页面
    'Dashboard',
    'Profile',
    'Settings'
  ],
  
  // 50KB 以上自动异步加载
  sizeThreshold: 50,
  
  registry
})

await loader.loadOnDemand()
```

---

## 示例 5: 监听加载进度

**实时追踪组件加载状态**

```typescript
const loader = AutoLoader.create({
  patterns: import.meta.glob('./components/**/*.vue'),
  registry
})

// 扫描组件
console.log('🔍 开始扫描组件...')
const components = await loader.scan()
console.log(`✅ 发现 ${components.length} 个组件`)

// 加载同步组件
console.log('⚡ 加载同步组件...')
await loader.loadSyncComponents()

// 查看加载统计
const stats = loader.getStats()
console.log('📊 加载完成:')
console.log(`   • 总组件: ${stats.total}`)
console.log(`   • 已加载: ${stats.loaded}`)
console.log(`   • 待加载: ${stats.pending}`)
console.log(`   • 同步: ${stats.sync}`)
console.log(`   • 异步: ${stats.async}`)
```

---

## 示例 6: 按需手动加载

**延迟加载特定组件**

```typescript
const loader = AutoLoader.create({
  patterns: import.meta.glob('./components/**/*.vue'),
  registry
})

// 只加载同步组件
await loader.loadOnDemand()

// 后续按需手动加载特定组件
console.log('📦 按需加载 Dashboard...')
await loader.loadComponent('dashboard')

console.log('📦 按需加载 Settings...')
await loader.loadComponent('settings')
```

---

## 示例 7: 与路由集成

**在路由守卫中预加载组件**

```typescript
import { createRouter } from 'vue-router'

const app = createApp({})
const router = createRouter({ ... })

app.use(Spark.createPlugin())

const { setupAutoRegister } = await import('@/bootstrap/auto-register')
const loader = await setupAutoRegister(app, { mode: 'demand' })

// 路由守卫中预加载组件
router.beforeEach(async (to) => {
  // 根据路由预加载对应组件
  if (to.name === 'dashboard') {
    await loader.loadComponent('dashboard')
  } else if (to.name === 'settings') {
    await loader.loadComponent('settings')
  }
  
  return true
})

app.use(router)
app.mount('#app')
```

---

## 示例 8: 完整配置

**生产环境推荐配置**

```typescript
const fullConfig: AutoLoaderConfig = {
  patterns: {
    ...import.meta.glob('../packages/*/src/components/**/*.vue'),
    ...import.meta.glob('../features/**/components/**/*.vue'),
    ...import.meta.glob('./components/**/*.vue')
  },
  
  // 同步加载：核心组件（立即使用）
  syncComponents: [
    // 渲染引擎
    'PageRenderer',
    'SparkComponentRenderer',
    
    // 错误处理
    'ErrorFallback',
    
    // 布局组件
    'Layout',
    'Header',
    'Footer',
    
    // 首屏组件
    'Home',
    'Login',
    
    // 轻量级组件
    'UserGrid',
    'UserRow',
    'UserField'
  ],
  
  // 异步加载：大型组件和非首屏组件
  asyncComponents: [
    // 第三方大型库
    '*EJ2*',
    '*Editor*',
    '*Chart*',
    
    // 非首屏页面
    'Dashboard',
    'About',
    'Settings',
    
    // Demo 和测试组件
    '*Demo',
    '*Test',
    'JsonRenderer*',
    'Capability*'
  ],
  
  // 50KB 以上自动异步
  sizeThreshold: 50,
  
  // 启用智能分析
  autoAnalyze: true
}
```

---

## 示例 9: 迁移指南

**从手动注册迁移到自动加载**

```typescript
// ❌ 旧方式：手动注册
/*
import UserGrid from './components/UserGrid.vue'
import UserRow from './components/UserRow.vue'

const registry = Spark.getRegistry()
registry.register('user-grid', UserGrid)
registry.register('user-row', UserRow)
*/

// ✅ 新方式：自动加载
const app = createApp({})
app.use(Spark.createPlugin())

await setupAutoRegister(app)

// 完成！所有组件自动注册
app.mount('#app')
```

---

## 示例 10: 性能对比

**测量自动加载的性能优势**

```typescript
console.time('⏱️ 启动时间')

const app = createApp({})
app.use(Spark.createPlugin())

console.time('  📦 组件加载')
await setupAutoRegister(app, { mode: 'demand' })
console.timeEnd('  📦 组件加载')

console.time('  🎨 DOM 挂载')
app.mount('#app')
console.timeEnd('  🎨 DOM 挂载')

console.timeEnd('⏱️ 启动时间')
```

**预期输出**：
```
按需加载模式:
⏱️ 启动时间: 800ms
  📦 组件加载: 200ms (只加载 5 个核心组件)
  🎨 DOM 挂载: 600ms

全部加载模式:
⏱️ 启动时间: 3000ms
  📦 组件加载: 2000ms (加载全部 15 个组件)
  🎨 DOM 挂载: 1000ms
```

---

## 🚀 快速开始

1. **安装依赖** (已包含在项目中)
2. **选择使用方式**:
   - 简单使用: `setupAutoRegister(app)`
   - 完全控制: `AutoLoader.create({ ... })`
3. **运行应用**

## 📚 相关文档

- [AUTO_LOADER.md](../guides/AUTO_LOADER.md) - 完整使用指南
- [可执行示例代码](../../src/examples/auto-loader/) - TypeScript 示例文件

## 💡 最佳实践

1. **生产环境使用 `mode: 'demand'`** - 优化首屏性能
2. **开发环境使用 `mode: 'all'`** - 方便调试
3. **合理配置 `syncComponents`** - 核心组件同步，大组件异步
4. **设置 `sizeThreshold`** - 自动判断大文件组件
