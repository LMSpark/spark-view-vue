# SPARK API 简化说明 ⚡

## 问题

旧 API 对业务开发者暴露了过多内部概念：
- `Spark.manager()` - 管理器
- `Spark.registry()` - 注册器
- `Spark.capabilities()` - 能力管理器
- `createVuePlugin({ manager, registry })` - 需要手动传参

业务开发者只关心：**注册组件、渲染组件、事件机制**

---

## 解决方案

### 1. 业务开发者 API（推荐使用）

```typescript
import { Spark } from '@spark-view/spark-component'
import { SparkComponentRenderer } from '@spark-view/spark-component'

// ✅ 安装插件（自动处理内部管理器）
app.use(Spark.install)

// ✅ 注册组件（支持简化配置）
Spark.register({
  name: 'MyButton',              // 自动转为 type: 'my-button'
  path: './MyButton.vue',
  lazy: true,                    // 懒加载
  onLoad: (comp) => console.log('Loaded!')
})

// ✅ 批量注册
Spark.registerAll([
  { name: 'Chart', path: './Chart.vue', lazy: true },
  { name: 'Calendar', path: './Calendar.vue', lazy: true }
])

// ✅ 渲染组件
<SparkComponentRenderer :config="{ type: 'my-button' }" />

// ✅ 在组件中使用 SPARK 功能
const { context, provide, consume } = Spark.useComponent(config)
```

### 2. 内部 API（不推荐直接使用）

仅用于高级场景或内部实现：

```typescript
// ⚠️ 高级用法 - 访问内部管理器
const manager = Spark._manager()
const registry = Spark._registry()
const capabilities = Spark._capabilities()

// ⚠️ 高级用法 - 创建独立实例
const customManager = Spark.createComponentManager()
const customPlugin = Spark.createVuePlugin({ manager: customManager })
```

---

## API 对比

### 旧 API（暴露底层概念）

```typescript
❌ 业务开发者需要了解管理器、注册器等概念
import { Spark } from '@spark-view/spark-component'

// 需要手动创建管理器
const manager = Spark.createComponentManager()

// 需要手动传递管理器
app.use(Spark.createVuePlugin({ manager }))

// 注册组件时需要传递管理器
Spark.register({
  type: 'my-button',
  name: 'My Button',
  version: '1.0.0',
  loader: () => import('./MyButton.vue')
}, manager)

// 业务开发者被迫了解内部实现
const registry = Spark.registry()
const componentDef = registry.get('my-button')
```

### 新 API（隐藏底层实现）

```typescript
✅ 业务开发者只需要关心注册和渲染
import { Spark } from '@spark-view/spark-component'

// 自动处理内部管理器
app.use(Spark.install)

// 简化配置，自动转换
Spark.register({
  name: 'MyButton',              // 自动转为 type: 'my-button'
  path: './MyButton.vue',
  lazy: true
})

// 内部实现对业务开发者透明
<SparkComponentRenderer :config="{ type: 'my-button' }" />
```

---

## 完整示例

### main.ts（应用入口）

```typescript
import { createApp } from 'vue'
import { Spark } from '@spark-view/spark-component'
import App from './App.vue'

const app = createApp(App)

// ✅ 安装 SPARK 插件
app.use(Spark.install)

// ✅ 注册业务组件
Spark.register({
  name: 'UserList',
  path: './components/UserList.vue',
  lazy: true
})

Spark.register({
  name: 'DataChart',
  path: './components/DataChart.vue',
  lazy: true
})

app.mount('#app')
```

### App.vue（使用组件）

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { SparkComponentRenderer } from '@spark-view/spark-component'

const currentView = ref('user-list')
</script>

<template>
  <div class="app">
    <button @click="currentView = 'user-list'">用户列表</button>
    <button @click="currentView = 'data-chart'">数据图表</button>
    
    <!-- ✅ 渲染组件 -->
    <SparkComponentRenderer :config="{ type: currentView }" />
  </div>
</template>
```

---

## 设计原则

### 1. 关注点分离
- 业务开发者：注册、渲染、事件
- 框架内部：管理器、注册器、生命周期

### 2. 渐进式增强
- 基础使用：只需要 `Spark.install` + `Spark.register`
- 高级定制：可以访问 `Spark._manager()` 等内部 API

### 3. 零配置默认
- 内部自动创建管理器和注册器
- 开发者不需要手动管理实例

---

## 迁移指南

### 从旧 API 迁移

```typescript
// ❌ 旧代码
const manager = Spark.createComponentManager()
const registry = Spark.createComponentRegistry()
app.use(Spark.createVuePlugin({ manager, registry }))

Spark.registerSparkComponent({
  type: 'my-button',
  name: 'My Button',
  version: '1.0.0',
  loader: () => import('./MyButton.vue')
}, manager)

// ✅ 新代码（代码减少 70%）
app.use(Spark.install)

Spark.register({
  name: 'MyButton',
  path: './MyButton.vue',
  lazy: true
})
```

### 高级场景

如果确实需要访问内部 API（例如插件开发、测试等）：

```typescript
// ✅ 使用带下划线的内部 API
const manager = Spark._manager()
const registry = Spark._registry()
const capabilities = Spark._capabilities()

// 或者创建独立实例
const customManager = Spark.createComponentManager()
```

---

## 总结

- ✅ 业务 API：`install`、`register`、`registerAll`、`useComponent`
- ⚠️ 内部 API：`_manager`、`_registry`、`_capabilities`（带 `_` 前缀）
- 🎯 设计目标：让业务开发者专注于业务逻辑，而不是框架内部实现
