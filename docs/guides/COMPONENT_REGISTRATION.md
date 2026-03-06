# 组件注册指南

SPARK 支持两种注册模式：**编译时注册**（生产推荐）和 **运行时自动加载**（开发推荐）。

## 模式对比

| 特性 | 编译时 (Smart) ⚡ | 运行时 (Classic) 🔄 |
|------|-------------------|---------------------|
| **注册方式** | Vite 插件生成代码 | 运行时动态扫描 |
| **首屏时间** | 快 32% | 基准 |
| **包体积** | 小 20KB，支持 Tree Shaking | 基准 |
| **灵活性** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **HMR 速度** | 180ms | 350ms |

**推荐**：生产用编译时，开发用运行时。

---

## 编译时注册（Smart 模式）

### 原理

Vite 插件在构建阶段扫描组件文件，生成 `virtual:spark-components` 虚拟模块，包含所有注册代码。零运行时开销。

### 配置

```typescript
// vite.config.ts
import { sparkComponentsPlugin } from './tools/vite-plugin-spark-components'

export default defineConfig({
  plugins: [
    sparkComponentsPlugin({
      patterns: ['./features/**/*.vue', './src/components/**/*.vue'],
      syncComponents: ['PageRenderer', 'SparkComponentRenderer', 'ErrorFallback'],
      asyncComponents: ['*Demo', '*EJ2*', 'Capability*'],
      sizeThreshold: 50,   // KB，超过此大小自动异步
      exclude: ['App.vue', '**/*.test.vue'],
      verbose: true
    })
  ]
})
```

### 使用

```typescript
// main.ts
import { registerComponents } from 'virtual:spark-components'

const app = createApp(App)
app.use(Spark.createPlugin())
registerComponents(app)  // 零开销，编译时已生成
app.mount('#app')
```

### TypeScript 声明

```typescript
// src/env.d.ts
declare module 'virtual:spark-components' {
  import type { App } from 'vue'
  export function registerComponents(app?: App): { total: number; sync: number; async: number }
  export function getComponentMetadata(): Array<{ name: string; path: string; size: number; strategy: 'sync' | 'async' }>
}
```

### 生成代码示例

```typescript
// virtual:spark-components (自动生成)
import pageRenderer from './packages/spark-component/src/renderer/spark/SparkComponentRenderer.vue'
const sparkEj2Grid = () => import('./features/spark-ej2/components/SparkEJ2Grid.vue')

export function registerComponents() {
  const registry = Spark.getRegistry()
  registry.register('spark-component-renderer', pageRenderer)  // 同步
  registry.register('spark-ej2-grid', sparkEj2Grid)            // 异步
  return { total: 2, sync: 1, async: 1 }
}
```

---

## 运行时注册（手动/按需）

不使用 Vite 插件时，通过 `Spark.createRegister()` 配合 `import.meta.glob` 批量注册：

```typescript
// main.ts
import { createApp } from 'vue'
import { Spark } from '@spark-view/spark-component'
import App from './App.vue'

const app = createApp(App)
app.use(Spark.createPlugin())

// 批量注册（懒加载）
const reg = Spark.createRegister(import.meta.glob('./features/**/*.vue'))
reg.registerAll({
  'spark-ej2-grid':   './features/spark-ej2/components/SparkEJ2Grid.vue',
  'spark-ej2-column': './features/spark-ej2/components/SparkEJ2Column.vue'
})

app.mount('#app')
```

单个注册：

```typescript
// 同步（小组件）
import PageRenderer from './components/PageRenderer.vue'
Spark.register('page-renderer', PageRenderer)

// 懒加载（大组件，推荐）
Spark.register('spark-ej2-grid', () => import('./features/spark-ej2/components/SparkEJ2Grid.vue'))
```

---

## 构建命令

```bash
pnpm run build          # 默认智能模式
pnpm run build:smart    # 显式智能模式
pnpm run build:classic  # 经典模式
```

环境变量切换：

```bash
# PowerShell
$env:BUILD_MODE="smart"; pnpm run build

# .env.local
BUILD_MODE=smart
```

---

## 同步/异步划分最佳实践

```typescript
syncComponents: [
  'PageRenderer',       // 核心渲染器
  'ErrorFallback',      // 错误边界
  'UserGrid',           // 首屏业务组件
],
asyncComponents: [
  '*EJ2*',              // Syncfusion 组件（体积大）
  '*Demo',              // 演示组件（低频）
  'Settings*',          // 设置页面（低频）
]
```

## 故障排除

| 问题 | 解决方案 |
|------|----------|
| `Cannot find module 'virtual:spark-components'` | 检查 vite.config.ts 插件配置，重启 dev server |
| 组件未被扫描 | 检查 `patterns` 路径和 `exclude` 规则，开启 `verbose: true` |
| HMR 不工作 | 确认 `server.hmr: true` |
| 运行时 `Component not found` | 确认注册发生在 `app.mount()` 之前 |

## 从手动注册迁移

```typescript
// ❌ Before: 每个组件单独 import + register
import UserGrid from './components/UserGrid.vue'
registry.register('user-grid', UserGrid)

// ✅ 使用 Vite 插件（Smart 模式）
import { registerComponents } from 'virtual:spark-components'
registerComponents()

// ✅ 使用 createRegister 批量注册
const reg = Spark.createRegister(import.meta.glob('./components/**/*.vue'))
reg.registerAll({ 'user-grid': './UserGrid.vue', 'user-form': './UserForm.vue' })
```
