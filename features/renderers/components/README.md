# Renderer 架构说明 (Vue 3 + SLOT 递归架构)

## 🏗️ 架构概述

这是一个基于 **Vue 3 + SLOT 递归**的动态渲染架构，实现了 **一份配置，多种渲染** 的设计理念。

### 核心特性
- ✅ **统一 SLOT 接口**：所有渲染器支持 slot 定制
- ✅ **作用域 slot**：传递上下文数据给父组件
- ✅ **递归渲染**：DynamicRenderer 自动处理嵌套子节点
- ✅ **上下文感知**：根据 parentType 自动适配渲染方式
- ✅ **灵活扩展**：轻松注册自定义渲染器

## 目录结构

```
src/components/renderers/
├── DynamicRenderer.vue       # 动态渲染器（核心递归组件）
├── TableRenderer.vue         # 表格容器渲染器（支持多个 slot）
├── FormRenderer.vue          # 表单容器渲染器（支持方法暴露）
├── HtmlRenderer.vue          # HTML 元素渲染器（通用容器）
├── TextRenderer.vue          # 文本类型渲染器（多场景适配）
├── NumberRenderer.vue        # 数字类型渲染器（多场景适配）
├── DateRenderer.vue          # 日期类型渲染器（多场景适配）
├── renderer-map.ts           # 类型到组件的映射表
└── README.md                 # 本文档
```

## 核心设计

### 1. SLOT 递归架构

**所有渲染器都通过 slot 支持内容定制和递归渲染：**

```
DynamicRenderer (核心递归)
  ↓ 选择对应渲染器
TableRenderer / FormRenderer / HtmlRenderer (容器)
  ↓ 通过 <slot> 接收递归内容
DynamicRenderer (递归处理子节点)
  ↓ 继续选择渲染器
TextRenderer / NumberRenderer / DateRenderer (叶子)
  ↓ 提供 slot 供自定义显示
```

### 2. 统一的配置格式

所有组件使用统一的属性结构：

```json
{
  "type": "text",       // 类型标识（映射到渲染器）
  "name": "姓名",       // 显示标题
  "value": "userName",  // 数据字段
  "width": 180,         // 尺寸等其他属性
  "children": [...]     // 子节点（可递归）
}
```

### 3. 上下文感知渲染

同一配置根据 `parentType` 渲染成不同形式：

| parentType | 渲染结果 | 可用 Slot |
|-----------|---------|----------|
| `table` | 表格列 (`<el-table-column>`) | `default({ row, column, $index })` |
| `form` | 表单字段 (`<el-form-item>` + 控件) | `default({ value, update })` |
| 其他 | 详情展示 (`<div>`) | `default({ value, label })` |

### 4. 作用域 Slot 数据传递

**渲染器通过作用域 slot 向父组件传递上下文：**

- **TableRenderer**: `<slot :data="tableData" />`
- **FormRenderer**: `<slot :model="formData" :validate="handleValidate" />`
- **TextRenderer (table)**: `<slot :row="row" :column="column" :$index="$index" />`
- **TextRenderer (form)**: `<slot :value="currentValue" :update="handleUpdate" />`
- **HtmlRenderer**: `<slot :config="config" :data="data" :parentType="parentType" />`

## 🎯 使用示例

### 1. 基础配置（自动递归）

```json
{
  "type": "table",
  "dataSource": "users",
  "border": true,
  "children": [
    {
      "type": "text",
      "name": "姓名",
      "value": "name",
      "width": 150
    },
    {
      "type": "number",
      "name": "年龄",
      "value": "age",
      "width": 100
    }
  ]
}
```

### 2. 使用作用域 Slot 自定义列内容

```vue
<template>
  <DynamicRenderer :rule="tableRule" :data="pageData">
    <!-- 自定义表格列的显示 -->
    <template #default="{ row }">
      <el-tag :type="row.status === 'active' ? 'success' : 'danger'">
        {{ row.name }}
      </el-tag>
    </template>
  </DynamicRenderer>
</template>

<script setup>
import DynamicRenderer from '@/components/renderers/DynamicRenderer.vue'

const tableRule = ref({
  type: 'table',
  dataSource: 'users',
  children: [
    { type: 'text', name: '姓名', value: 'name' }
  ]
})

const pageData = reactive({
  users: [
    { name: 'Alice', status: 'active' },
    { name: 'Bob', status: 'inactive' }
  ]
})
</script>
```

### 3. 使用表单方法

```vue
<template>
  <DynamicRenderer ref="formRendererRef" :rule="formRule" :data="formData">
    <template #footer="{ submit }">
      <el-button @click="handleValidateAndSubmit">提交</el-button>
    </template>
  </DynamicRenderer>
</template>

<script setup>
const formRendererRef = ref()

async function handleValidateAndSubmit() {
  try {
    // 调用 FormRenderer 暴露的方法
    await formRendererRef.value?.validate()
    console.log('验证通过！')
  } catch (error) {
    console.log('验证失败！', error)
  }
}
</script>
```

### 4. 嵌套容器递归渲染

```vue
<template>
  <DynamicRenderer :rule="nestedRule" :data="pageData" />
</template>

<script setup>
const nestedRule = {
  type: 'div',
  class: 'page-container',
  children: [
    { type: 'h1', children: ['用户管理'] },
    { 
      type: 'form',
      labelWidth: '80px',
      children: [
        { type: 'text', name: '姓名', value: 'name' },
        { type: 'number', name: '年龄', value: 'age' }
      ]
    },
    {
      type: 'table',
      dataSource: 'users',
      children: [
        { type: 'text', name: '姓名', value: 'name' },
        { type: 'date', name: '创建时间', value: 'createdAt' }
      ]
    }
  ]
}
</script>
```

## 🔧 扩展自定义渲染器

### 1. 创建 Renderer 组件（带 SLOT 支持）

```vue
<!-- src/components/renderers/SelectRenderer.vue -->
<script setup lang="ts">
import { computed } from 'vue'

defineOptions({ name: 'SelectRenderer' })

interface Props {
  config: {
    type: string
    name: string
    value: string
    options: Array<{ label: string; value: any }>
    width?: number | string
  }
  parentType?: string
  data?: any
}

const props = withDefaults(defineProps<Props>(), {
  parentType: '',
  data: () => ({})
})

const emit = defineEmits<{
  update: [field: string, value: any]
}>()

const currentValue = computed(() => {
  if (!props.data || !props.config.value) return ''
  return props.data[props.config.value] || ''
})

function handleUpdate(value: any) {
  emit('update', props.config.value, value)
}
</script>

<template>
  <!-- 作为表格列 -->
  <el-table-column 
    v-if="parentType === 'table'"
    :label="config.name"
    :prop="config.value"
    :width="config.width"
  >
    <template #default="scope">
      <!-- 提供 slot 供自定义 -->
      <slot :row="scope.row" :options="config.options">
        <el-tag>{{ scope.row[config.value] }}</el-tag>
      </slot>
    </template>
  </el-table-column>
  
  <!-- 作为表单字段 -->
  <el-form-item 
    v-else-if="parentType === 'form'"
    :label="config.name"
  >
    <!-- 提供 slot 供自定义 -->
    <slot :value="currentValue" :update="handleUpdate" :options="config.options">
      <el-select 
        :model-value="currentValue"
        @update:model-value="handleUpdate"
      >
        <el-option
          v-for="opt in config.options"
          :key="opt.value"
          :label="opt.label"
          :value="opt.value"
        />
      </el-select>
    </slot>
  </el-form-item>
  
  <!-- 作为详情展示 -->
  <div v-else class="select-renderer">
    <slot :value="currentValue" :label="config.name" :options="config.options">
      <span class="label">{{ config.name }}:</span>
      <span class="value">{{ currentValue }}</span>
    </slot>
  </div>
</template>

<style scoped>
.select-renderer {
  display: flex;
  gap: 8px;
  padding: 4px 0;
}

.label {
  font-weight: 500;
  color: #606266;
}

.value {
  color: #303133;
}
</style>
```
### 2. 注册到映射表

```typescript
// src/components/renderers/renderer-map.ts
import SelectRenderer from './SelectRenderer.vue'

export const RENDERER_MAP: RendererMap = {
  // 现有渲染器
  text: TextRenderer,
  number: NumberRenderer,
  date: DateRenderer,
  table: TableRenderer,
  form: FormRenderer,
  
  // 新增渲染器
  select: SelectRenderer,
}
```

### 3. 在配置中使用

```json
{
  "type": "form",
  "labelWidth": "100px",
  "children": [
    {
      "type": "select",
      "name": "状态",
      "value": "status",
      "options": [
        { "label": "激活", "value": "active" },
        { "label": "禁用", "value": "inactive" }
      ]
    }
  ]
}
```

### 4. 使用 SLOT 自定义

```vue
<template>
  <DynamicRenderer :rule="formRule" :data="formData">
    <!-- 自定义下拉框显示 -->
    <template #default="{ value, update, options }">
      <el-select :model-value="value" @update:model-value="update">
        <el-option
          v-for="opt in options"
          :key="opt.value"
          :label="opt.label"
          :value="opt.value"
        >
          <el-icon><Check /></el-icon>
          {{ opt.label }}
        </el-option>
      </el-select>
    </template>
  </DynamicRenderer>
</template>
```

## 📋 最佳实践

### ✅ DO（推荐做法）

1. **为所有场景提供 SLOT**
```vue
<!-- 提供作用域 slot 传递上下文 -->
<slot :value="currentValue" :update="handleUpdate">
  <el-input :model-value="currentValue" @update:model-value="handleUpdate" />
</slot>
```

2. **使用作用域 slot 传递数据**
```vue
<!-- ✅ 好：传递所有相关上下文 -->
<slot :row="row" :column="column" :$index="$index">

<!-- ❌ 差：没有传递上下文 -->
<slot>
```

3. **提供有意义的默认内容**
```vue
<slot :value="value">
  <!-- 默认显示值 -->
  <span>{{ value }}</span>
</slot>
```

4. **容器组件暴露有用方法**
```typescript
// FormRenderer
expose({
  validate: () => formRef.value?.validate(),
  resetFields: () => formRef.value?.resetFields()
})
```

5. **使用计算属性提取逻辑**
```typescript
const displayValue = computed(() => {
  return formatDate(props.data?.[props.config.value])
})
```

### ❌ DON'T（避免做法）

1. ❌ **不要在 slot 中硬编码业务逻辑**
```vue
<!-- ❌ 差：硬编码权限判断 -->
<slot v-if="user.role === 'admin'">

<!-- ✅ 好：通过 props 传递 -->
<slot v-if="config.visible">
```

2. ❌ **不要过度嵌套 slot**
```vue
<!-- ❌ 差：嵌套太深 -->
<slot>
  <div>
    <slot name="inner">
      <slot name="deepest">
```

3. ❌ **不要忘记 emit update 事件**
```vue
<!-- ❌ 差：直接修改数据 -->
props.data[field] = value

<!-- ✅ 好：通过事件通知 -->
emit('update', field, value)
```

4. ❌ **不要在渲染器内操作外部状态**
```vue
<!-- ❌ 差：直接访问全局状态 -->
import { useUserStore } from '@/stores'
const userStore = useUserStore()

<!-- ✅ 好：通过 props 接收数据 -->
const props = defineProps<{ data: any }>()
```

## 🚀 架构优势

| 特性 | 传统方式 | SLOT 递归架构 |
|-----|---------|--------------|
| **灵活性** | 固定渲染逻辑 | 通过 slot 完全自定义 |
| **可组合性** | 组件独立 | 递归嵌套无限层级 |
| **上下文传递** | 手动 props | 作用域 slot 自动传递 |
| **代码复用** | 需要包装组件 | 直接使用 slot 覆盖 |
| **类型安全** | 弱类型 | TypeScript 完整支持 |
| **维护性** | 分散在多处 | 集中在渲染器组件 |

## 🔗 相关文档

- [DynamicPage 核心组件](../../views/DynamicPage.vue)
- [项目架构说明](../../../docs/architecture/README_ARCHITECTURE.md)
- [最佳实践](../../../docs/BEST_PRACTICES.md)
- [Form Create 集成指南](../../../docs/guides/README_FORMCREATE.md)

## 📝 技术栈

- **Vue 3** - Composition API + `<script setup>`
- **TypeScript** - 完整类型支持
- **Element Plus** - UI 组件库
- **递归组件** - 动态嵌套渲染
- **作用域 Slot** - 灵活的内容分发
- **动态组件** - `<component :is>` 动态选择渲染器
