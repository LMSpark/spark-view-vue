# 动态导入快速参考 ⚡

> 5 分钟掌握 SPARK 组件动态导入

## 基本用法

### 注册懒加载组件
```typescript
Spark.registerSparkComponent({
  type: 'spark-heavy-grid',
  loader: () => import('./HeavyGrid.vue')
})
```

### 自动加载（首次渲染时）
```vue
<SparkComponentRenderer :config="{ type: 'spark-heavy-grid' }" />
```

### 预加载
```typescript
await registry.preload(['spark-chart', 'spark-calendar'])
```

---

## 常见场景

### 1. 路由级分包
```typescript
router.beforeEach(async (to) => {
  if (to.meta.components) {
    await Spark.registry().preload(to.meta.components)
  }
})
```

### 2. 按权限加载
```typescript
if (user.isAdmin) {
  Spark.registerSparkComponent({
    type: 'admin-panel',
    loader: () => import('./admin/Panel.vue')
  })
}
```

### 3. 批量注册
```typescript
const lazyComponents = {
  'spark-chart': () => import('./Chart.vue'),
  'spark-calendar': () => import('./Calendar.vue')
}

Object.entries(lazyComponents).forEach(([type, loader]) => {
  Spark.registerSparkComponent({ type, loader })
})
```

---

## API 速查

| API | 用途 | 示例 |
|-----|------|------|
| `loader` | 注册时指定 | `loader: () => import('./Comp.vue')` |
| `getAsync()` | 手动加载 | `await registry.getAsync('type')` |
| `preload()` | 批量预加载 | `await registry.preload(['a', 'b'])` |

---

## 性能优化

### 分组加载
```typescript
// 立即加载
await registry.preload(['critical-comp'])

// 1秒后加载
setTimeout(() => registry.preload(['primary-comp']), 1000)

// 空闲时加载
requestIdleCallback(() => registry.preload(['secondary-comp']))
```

### 智能预测
```typescript
// 用户鼠标悬停时预加载
<button @mouseenter="() => registry.preload(['chart'])">
  查看图表
</button>
```

---

## 最佳实践

### ✅ 应该懒加载
- 大组件（>100KB）
- 低频组件（管理面板、报表）
- 权限相关组件

### ❌ 不应该懒加载
- 小组件（<10KB）
- 首屏组件
- 高频组件（按钮、输入框）

---

## 故障排查

### 问题：组件未加载
```typescript
// ❌ 错误：忘记 await
const def = registry.getAsync('type')  // 返回 Promise

// ✅ 正确
const def = await registry.getAsync('type')
```

### 问题：重复加载
```typescript
// Registry 自动防止重复加载
await registry.getAsync('type')  // 加载
await registry.getAsync('type')  // 返回缓存，不会重复加载
```

---

## 完整示例

```typescript
// 1. 注册
Spark.registerSparkComponent({
  type: 'my-chart',
  name: '图表组件',
  version: '1.0.0',
  loader: () => import('./Chart.vue')
})

// 2. 路由预加载
router.beforeEach(async (to) => {
  if (to.name === 'dashboard') {
    await Spark.registry().preload(['my-chart'])
  }
})

// 3. 使用
<template>
  <SparkComponentRenderer :config="{ type: 'my-chart' }" />
</template>
```

---

📖 **完整文档**：[DYNAMIC_IMPORT.md](./DYNAMIC_IMPORT.md)
