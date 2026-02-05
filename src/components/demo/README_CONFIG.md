# 配置驱动递归渲染使用指南

## 概述

将 `demo` 组件改造为配置驱动的递归渲染系统，无需硬编码组件关系，完全由配置文件驱动。

## 核心文件

### 1. `demo-config.ts` - 配置文件

定义渲染配置和预设：

```typescript
import { createSimpleConfig, createCustomFieldsConfig, createReadOnlyConfig } from './demo-config'

// 简单配置
const config = createSimpleConfig(users)

// 自定义字段配置
const customConfig = createCustomFieldsConfig(users, [
  { field: 'name', label: '姓名', icon: '👤' },
  { field: 'email', label: '邮箱', icon: '📧' }
])

// 只读模式（无操作按钮）
const readOnlyConfig = createReadOnlyConfig(users)
```

### 2. `DemoRenderer.vue` - 递归渲染器

根据配置递归渲染组件树：

```vue
<template>
  <DemoRenderer :node="renderConfig" :context="renderContext" />
</template>

<script setup>
import DemoRenderer from './DemoRenderer.vue'
import { createSimpleConfig } from './demo-config'

const renderConfig = createSimpleConfig(users)
const renderContext = { users, dataSet, appServices }
</script>
```

### 3. `ConfigDrivenDemo.vue` - 演示组件

完整的配置驱动演示，支持切换不同预设配置。

## 配置结构

### RenderNode 配置节点

```typescript
interface RenderNode {
  type: 'grid' | 'row' | 'field' | 'container'  // 组件类型
  id?: string                                     // 组件 ID
  props?: Record<string, any>                    // 组件 props
  children?: RenderNode[]                        // 静态子节点
  childrenGenerator?: (context: any) => RenderNode[]  // 动态生成子节点
  condition?: (context: any) => boolean          // 条件渲染
  class?: string | string[]                      // 样式类
  events?: Record<string, (data: any) => void>   // 事件处理
}
```

### 示例配置

```typescript
const config: RenderNode = {
  type: 'grid',
  id: 'user-grid',
  props: { users },
  children: [
    {
      type: 'container',
      class: 'grid-header',
      children: [/* ... */]
    },
    {
      type: 'container',
      class: 'grid-body',
      // 动态生成行
      childrenGenerator: (context) => {
        return context.users.map(user => ({
          type: 'row',
          id: `row-${user.id}`,
          props: { user },
          children: [/* 字段配置 */]
        }))
      }
    }
  ]
}
```

## 使用方式

### 方式1：直接使用 ConfigDrivenDemo

最简单的方式，已内置多个预设配置：

```vue
<template>
  <ConfigDrivenDemo />
</template>

<script setup>
import ConfigDrivenDemo from '@/components/demo/ConfigDrivenDemo.vue'
</script>
```

### 方式2：使用配置工具

自定义配置：

```vue
<template>
  <DemoRenderer :node="config" :context="context" />
</template>

<script setup>
import { ref } from 'vue'
import DemoRenderer from '@/components/demo/DemoRenderer.vue'
import { createSimpleConfig } from '@/components/demo/demo-config'

const users = ref([
  { id: 1, name: 'Alice', age: 28, email: 'alice@example.com', status: 'active' }
])

const config = createSimpleConfig(users.value)
const context = { users: users.value }
</script>
```

### 方式3：完全自定义配置

```vue
<script setup>
import { createDemoConfig } from '@/components/demo/demo-config'

// 完全自定义配置
const config = createDemoConfig(users.value, {
  fields: [
    { field: 'id', label: 'ID', icon: '🔢' },
    { field: 'name', label: '用户名', icon: '👤' },
    { 
      field: 'status', 
      label: '状态', 
      icon: '🔔',
      highlight: (value) => value === 'active'
    }
  ],
  showCheckbox: true,
  showActions: true
})
</script>
```

## 配置预设

### 1. 标准配置

```typescript
createSimpleConfig(users)
```

- 显示所有默认字段（name, age, email, status）
- 包含复选框
- 包含操作按钮

### 2. 自定义字段配置

```typescript
createCustomFieldsConfig(users, [
  { field: 'name', label: '姓名', icon: '👤' },
  { field: 'status', label: '状态', icon: '🟢' }
])
```

- 只显示指定字段
- 包含复选框和操作按钮

### 3. 只读配置

```typescript
createReadOnlyConfig(users)
```

- 显示所有字段
- 无复选框
- 无操作按钮

## 高级特性

### 1. 动态子节点生成

```typescript
{
  type: 'container',
  childrenGenerator: (context) => {
    return context.users
      .filter(u => u.status === 'active')  // 过滤
      .map(user => ({
        type: 'row',
        props: { user }
      }))
  }
}
```

### 2. 条件渲染

```typescript
{
  type: 'field',
  props: { label: '管理员', value: user.isAdmin },
  condition: (context) => context.user.role === 'admin'
}
```

### 3. 事件处理

```typescript
{
  type: 'container',
  props: { text: '删除' },
  events: {
    click: (data) => {
      console.log('删除', data)
    }
  }
}
```

## 优势

### 1. 解耦

- 组件不需要硬编码子组件
- 配置和实现分离
- 易于维护和测试

### 2. 灵活

- 通过配置快速调整 UI 结构
- 支持多个预设配置
- 运行时动态切换配置

### 3. 可扩展

- 新增组件类型只需注册到 componentMap
- 支持自定义渲染逻辑
- 支持插件式扩展

## 对比

### 传统方式（硬编码）

```vue
<template>
  <UserGrid>
    <UserRow v-for="user in users" :key="user.id">
      <UserField field="name" />
      <UserField field="age" />
    </UserRow>
  </UserGrid>
</template>
```

### 配置驱动方式

```vue
<template>
  <DemoRenderer :node="config" :context="context" />
</template>

<script setup>
const config = createSimpleConfig(users)
// 随时切换配置
// const config = createReadOnlyConfig(users)
</script>
```

## 下一步

1. 扩展 `componentMap` 支持更多组件类型
2. 增加配置验证器
3. 支持配置热更新
4. 添加配置可视化编辑器
