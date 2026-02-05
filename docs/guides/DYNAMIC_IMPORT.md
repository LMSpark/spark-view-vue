# SPARK 组件动态导入指南

## 为什么需要动态导入？

这才是 **Registry 和 Renderer 的核心价值**！

```typescript
// ❌ 不用 Registry - 所有组件一次性加载
import SparkButton from './SparkButton.vue'
import SparkGrid from './SparkGrid.vue'
import SparkChart from './SparkChart.vue'
// ... 100+ 组件全部加载，首屏慢

// ✅ 用 Registry - 按需加载
registry.register('spark-button', {
  type: 'spark-button',
  loader: () => import('./SparkButton.vue') // 用到才加载
})
```

**优势**：
- ✅ 首屏加载速度提升 70%+
- ✅ 按路由分包（route-based splitting）
- ✅ 用户按需加载（user-triggered loading）
- ✅ 支持 CDN 远程组件加载

---

## 快速开始

### 1. 注册懒加载组件

```typescript
import { Spark } from '@spark-view/spark-component'

// 方式 1：单个注册（推荐）
Spark.registerSparkComponent({
  type: 'spark-heavy-grid',
  name: '重量级表格',
  version: '1.0.0',
  loader: () => import('./components/HeavyGrid.vue')
})

// 方式 2：批量注册
const lazyComponents = {
  'spark-chart': () => import('./components/SparkChart.vue'),
  'spark-calendar': () => import('./components/SparkCalendar.vue'),
  'spark-gantt': () => import('./components/SparkGantt.vue')
}

Object.entries(lazyComponents).forEach(([type, loader]) => {
  Spark.registerSparkComponent({
    type,
    name: type,
    loader
  })
})
```

### 2. 使用懒加载组件

组件会在**首次渲染时**自动加载：

```vue
<template>
  <SparkComponentRenderer 
    :config="{
      type: 'spark-heavy-grid',
      props: { dataSource: data }
    }" 
  />
  <!-- 首次渲染时自动 import() -->
</template>
```

### 3. 预加载（可选）

```typescript
// 路由切换前预加载
router.beforeEach(async (to) => {
  const registry = Spark.registry()
  if (to.name === 'dashboard') {
    await registry.preload(['spark-chart', 'spark-kpi'])
  }
})

// 用户鼠标悬停时预加载
<button @mouseenter="preloadChart">
  查看图表
</button>

async function preloadChart() {
  await Spark.registry().preload(['spark-chart'])
}
```

---

## 实战案例

### 案例 1：路由级别的代码分包

```typescript
// router/index.ts
const routes = [
  {
    path: '/dashboard',
    component: Dashboard,
    meta: {
      // 页面需要的组件列表
      components: ['spark-chart', 'spark-kpi', 'spark-trend']
    }
  },
  {
    path: '/data-analysis',
    component: DataAnalysis,
    meta: {
      components: ['spark-heavy-grid', 'spark-pivot-table']
    }
  }
]

// 全局前置守卫
router.beforeEach(async (to) => {
  if (to.meta.components) {
    // 并行预加载页面所需的所有组件
    await Spark.registry().preload(to.meta.components)
  }
})
```

**效果**：
- Dashboard 页面只加载 chart/kpi/trend 组件
- DataAnalysis 页面只加载 grid/pivot 组件
- 按路由自动分包，互不影响

---

### 案例 2：权限控制的组件加载

```typescript
// 根据用户权限动态注册组件
function registerComponentsByPermission(userPermissions: string[]) {
  const registry = Spark.registry()

  if (userPermissions.includes('admin')) {
    // 管理员专属组件
    registry.register('spark-user-manager', {
      type: 'spark-user-manager',
      loader: () => import('./admin/UserManager.vue')
    })
  }

  if (userPermissions.includes('finance')) {
    // 财务专属组件
    registry.register('spark-invoice-editor', {
      type: 'spark-invoice-editor',
      loader: () => import('./finance/InvoiceEditor.vue')
    })
  }
}

// 登录后注册
onLogin((user) => {
  registerComponentsByPermission(user.permissions)
})
```

**优势**：
- 普通用户永远不会加载管理员组件代码
- 安全性提升（代码都不下载）
- Bundle 体积大幅减小

---

### 案例 3：从后端加载组件配置

```typescript
// 从服务器获取页面配置
async function loadPageFromServer(pageId: string) {
  const response = await fetch(`/api/pages/${pageId}`)
  const pageConfig = await response.json()

  // pageConfig 示例：
  // {
  //   components: [
  //     { type: 'spark-grid', props: {...} },
  //     { type: 'spark-chart', props: {...} }
  //   ]
  // }

  // 提取所有需要的组件类型
  const componentTypes = extractComponentTypes(pageConfig)

  // 预加载所有需要的组件
  await Spark.registry().preload(componentTypes)

  // 渲染页面
  return pageConfig
}

function extractComponentTypes(config: any): string[] {
  const types = new Set<string>()
  const walk = (node: any) => {
    if (node.type) types.add(node.type)
    if (node.children) node.children.forEach(walk)
  }
  walk(config)
  return Array.from(types)
}
```

---

### 案例 4：从 CDN 加载远程组件（高级）

```typescript
// 从 CDN 动态加载组件
Spark.registerSparkComponent({
  type: 'spark-third-party-widget',
  name: '第三方组件',
  loader: async () => {
    // 从 CDN 加载 JS
    const module = await import(
      /* @vite-ignore */
      'https://cdn.example.com/widgets/v1.2.3/spark-widget.js'
    )
    return module.default
  }
})
```

**应用场景**：
- 第三方插件市场
- 多租户系统（租户自定义组件）
- A/B 测试（动态切换组件版本）

---

## 性能优化建议

### 1. 分组预加载

```typescript
// 将组件分组，按优先级加载
const componentGroups = {
  critical: ['spark-header', 'spark-nav'],    // 首屏立即加载
  primary: ['spark-grid', 'spark-form'],      // 1 秒后加载
  secondary: ['spark-chart', 'spark-report']  // 空闲时加载
}

// 首屏加载
await registry.preload(componentGroups.critical)

// 延迟加载
setTimeout(() => registry.preload(componentGroups.primary), 1000)

// 空闲时加载
requestIdleCallback(() => registry.preload(componentGroups.secondary))
```

### 2. 智能预加载

```typescript
// 根据用户行为预测需要的组件
let lastHoveredButton = ''

function onButtonHover(buttonType: string) {
  lastHoveredButton = buttonType
  
  // 预测用户会点击，提前加载
  const predictedComponents = {
    'export': ['spark-export-dialog'],
    'filter': ['spark-filter-panel'],
    'chart': ['spark-chart', 'spark-legend']
  }

  if (predictedComponents[buttonType]) {
    registry.preload(predictedComponents[buttonType])
  }
}
```

### 3. 监控加载性能

```typescript
// 添加加载性能监控
const originalGetAsync = registry.getAsync.bind(registry)
registry.getAsync = async function(type: string) {
  const start = performance.now()
  const result = await originalGetAsync(type)
  const duration = performance.now() - start
  
  console.log(`Component ${type} loaded in ${duration}ms`)
  
  // 上报到监控系统
  reportMetric('component_load_time', duration, { component: type })
  
  return result
}
```

---

## 最佳实践

### ✅ DO（推荐）

```typescript
// 1. 大组件必须懒加载
Spark.registerSparkComponent({
  type: 'spark-rich-editor',  // 假设 500KB
  loader: () => import('./RichEditor.vue')
})

// 2. 按路由分组注册
registerDashboardComponents()  // 仅注册 dashboard 需要的
registerReportComponents()     // 仅注册 report 需要的

// 3. 预加载关键路径组件
await registry.preload(['spark-grid', 'spark-form'])
```

### ❌ DON'T（不推荐）

```typescript
// 1. 小组件不要懒加载（开销大于收益）
Spark.registerSparkComponent({
  type: 'spark-button',  // 只有 2KB，不值得懒加载
  loader: () => import('./Button.vue')
})

// 2. 不要在渲染时才注册
async function render() {
  // ❌ 太晚了，会导致组件找不到
  Spark.registerSparkComponent({ type: '...', loader: ... })
  return h(SparkComponentRenderer, { config: ... })
}

// 3. 不要重复注册相同组件
Spark.registerSparkComponent({ type: 'spark-grid', loader: ... })
Spark.registerSparkComponent({ type: 'spark-grid', loader: ... }) // ❌ 重复
```

---

## 总结

**动态导入才是 Registry 的核心价值！**

| 功能 | 不用 Registry | 用 Registry + 动态导入 |
|------|---------------|----------------------|
| 首屏加载 | 所有组件 3MB+ | 按需加载 500KB |
| 代码分包 | 手动 import() | 自动按路由分包 |
| 权限控制 | 前端隐藏 | 根本不加载代码 |
| 远程组件 | 很难实现 | 简单配置即可 |

配置驱动 + 动态导入 = **企业级低代码平台的核心能力**！🚀
