# 业务开发者快速上手 ⚡

> 对业务开发而言，只需要关心两件事：**注册组件** 和 **递归渲染**

## 核心概念

SPARK 让你用配置驱动 UI，无需手写组件树：

1. **注册**：告诉 SPARK 有哪些组件可用
2. **渲染**：用配置自动渲染组件树

---

## 1️⃣ 注册组件

### 基础注册

```typescript
import { Spark } from '@spark-view/spark-component'

// 注册单个组件
Spark.register({
  name: 'UserList',              // 组件名称
  path: './UserList.vue'         // 组件路径（自动懒加载）
})
```

### 批量注册

```typescript
Spark.registerAll([
  { name: 'UserList', path: './UserList.vue' },
  { name: 'UserForm', path: './UserForm.vue' },
  { name: 'DataChart', path: './DataChart.vue' }
])
```

### 完整示例（main.ts）

```typescript
import { createApp } from 'vue'
import { Spark } from '@spark-view/spark-component'
import App from './App.vue'

const app = createApp(App)

// 1. 安装 SPARK 插件
app.use(Spark.install)

// 2. 批量注册业务组件
Spark.registerAll([
  { name: 'UserList', path: './components/UserList.vue' },
  { name: 'UserForm', path: './components/UserForm.vue' },
  { name: 'ProductList', path: './components/ProductList.vue' },
  { name: 'OrderChart', path: './components/OrderChart.vue' }
])

app.mount('#app')
```

---

## 2️⃣ 递归渲染

### 基础用法

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { SparkComponentRenderer } from '@spark-view/spark-component'

// 配置就是组件树
const pageConfig = ref({
  type: 'user-list',           // 对应注册的组件名
  props: {
    title: '用户列表'
  }
})
</script>

<template>
  <!-- 自动根据配置渲染组件 -->
  <SparkComponentRenderer :config="pageConfig" />
</template>
```

### 嵌套渲染

```vue
<script setup lang="ts">
const layoutConfig = ref({
  type: 'layout-container',
  children: [
    {
      type: 'page-header',
      props: { title: '用户管理' }
    },
    {
      type: 'user-list',
      props: { 
        dataSource: '/api/users',
        pagination: true 
      }
    },
    {
      type: 'page-footer'
    }
  ]
})
</script>

<template>
  <!-- 递归渲染整个页面树 -->
  <SparkComponentRenderer :config="layoutConfig" />
</template>
```

### 动态配置

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'

const pageConfig = ref(null)

// 从服务器加载配置
onMounted(async () => {
  const response = await fetch('/api/page-config')
  pageConfig.value = await response.json()
})
</script>

<template>
  <SparkComponentRenderer 
    v-if="pageConfig" 
    :config="pageConfig" 
  />
</template>
```

---

## 完整示例

### 1. 注册组件（main.ts）

```typescript
import { createApp } from 'vue'
import { Spark } from '@spark-view/spark-component'
import App from './App.vue'

const app = createApp(App)

app.use(Spark.install)

// 注册所有业务组件
Spark.registerAll([
  { name: 'PageLayout', path: './components/PageLayout.vue' },
  { name: 'UserList', path: './components/UserList.vue' },
  { name: 'UserForm', path: './components/UserForm.vue' }
])

app.mount('#app')
```

### 2. 渲染页面（App.vue）

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { SparkComponentRenderer } from '@spark-view/spark-component'

const pageConfig = ref({
  type: 'page-layout',
  children: [
    {
      type: 'user-list',
      props: {
        title: '用户列表',
        columns: ['id', 'name', 'email'],
        dataSource: '/api/users'
      }
    }
  ]
})

// 动态切换视图
function showUserForm() {
  pageConfig.value = {
    type: 'user-form',
    props: {
      mode: 'create'
    }
  }
}
</script>

<template>
  <div class="app">
    <button @click="showUserForm">新建用户</button>
    
    <!-- 根据配置渲染 -->
    <SparkComponentRenderer :config="pageConfig" />
  </div>
</template>
```

---

## 配置格式

```typescript
interface ComponentConfig {
  type: string              // 组件类型（注册时的 name 转 kebab-case）
  props?: Record<string, any>   // 组件 props
  children?: ComponentConfig[]  // 子组件配置
  events?: Record<string, Function>  // 事件监听
}
```

### 示例配置

```json
{
  "type": "user-list",
  "props": {
    "title": "用户列表",
    "pageSize": 20
  },
  "children": [
    {
      "type": "search-form",
      "props": {
        "fields": ["name", "email"]
      }
    },
    {
      "type": "data-table",
      "props": {
        "columns": ["id", "name", "email", "role"]
      }
    }
  ]
}
```

---

## 常见问题

### Q: 组件名称和 type 的关系？

A: 自动转换为 kebab-case：
```typescript
注册: name: 'UserList'
配置: type: 'user-list'
```

### Q: 懒加载有什么好处？

A: 
- ✅ 首屏加载速度提升 70%+
- ✅ 按需加载，只加载使用的组件
- ✅ 自动代码分割
- ✅ 有 path 就自动懒加载，无需额外配置

### Q: 能不能不用配置，直接写 Vue 组件？

A: 当然可以！SPARK 不强制使用配置：

```vue
<template>
  <!-- 传统方式 -->
  <UserList title="用户列表" />
  
  <!-- 配置方式 -->
  <SparkComponentRenderer :config="config" />
</template>
```

两种方式可以混用，按需选择。

---

## 总结

业务开发者只需要记住：

1. **注册**：`Spark.register({ name, path })` （有 path 自动懒加载）
2. **渲染**：`<SparkComponentRenderer :config="config" />`

其他复杂功能（能力系统、插件等）只在需要时才学习。
