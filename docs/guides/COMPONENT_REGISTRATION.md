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
import pageRenderer from './features/spark/components/PageRenderer.vue'
const sparkEj2Grid = () => import('./features/spark-ej2/components/SparkEJ2Grid.vue')

export function registerComponents() {
  const registry = Spark.getRegistry()
  registry.register('page-renderer', pageRenderer)       // 同步
  registry.register('spark-ej2-grid', sparkEj2Grid)      // 异步
  return { total: 2, sync: 1, async: 1 }
}
```

---

## 运行时自动加载（Classic 模式）

### 快速使用

```typescript
// main.ts
import { setupAutoRegister } from './bootstrap/auto-register'

const app = createApp(App)
app.use(Spark.createPlugin())

await setupAutoRegister(app, {
  mode: 'demand',      // 'all' | 'demand'（按需推荐）
  showProgress: true
})

app.mount('#app')
```

### 高级配置

```typescript
import { AutoLoader } from '@spark-view/spark-component'

const loader = AutoLoader.create({
  patterns: {
    ...import.meta.glob('./components/**/*.vue'),
    ...import.meta.glob('./features/**/*.vue')
  },
  syncComponents: ['PageRenderer', 'SparkComponentRenderer', 'ErrorFallback'],
  asyncComponents: ['*EJ2*', '*Demo', 'Heavy*'],
  sizeThreshold: 50,
  autoAnalyze: true
})

await loader.loadOnDemand()
```

### 加载策略

| 策略 | 规则 | 示例 |
|------|------|------|
| **同步** | 配置白名单 / `Page*` `Spark*` `Core*` / < 50KB | `PageRenderer` |
| **异步** | 配置黑名单 / `*Demo` `*EJ2*` / > 50KB | `SparkEJ2Grid` |

### 模式选择

- **按需加载** `mode: 'demand'`：仅加载核心组件，其余使用时自动加载（推荐生产）
- **全部加载** `mode: 'all'`：启动时加载所有组件（推荐开发）

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
| 首屏加载慢（Classic） | 切换到 `mode: 'demand'` 或使用 Smart 模式 |

## 从手动注册迁移

```typescript
// ❌ Before: 手动 import + register
import UserGrid from './components/UserGrid.vue'
registry.register('user-grid', UserGrid)

// ✅ After (Smart): 一行搞定
import { registerComponents } from 'virtual:spark-components'
registerComponents(app)

// ✅ After (Classic): 一行搞定
await setupAutoRegister(app)
```
