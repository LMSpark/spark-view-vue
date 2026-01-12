# Renderer 架构说明

## 架构概述

这是一个基于 Vue 3 的动态渲染架构，实现了 **一份配置，多种渲染** 的设计理念。每个 `type` 对应一个独立的 Vue 组件文件，组件根据 `parentType` 自动选择渲染方式。

## 目录结构

```
src/components/renderers/
├── TextRenderer.vue          # 文本类型渲染器
├── NumberRenderer.vue        # 数字类型渲染器
├── DateRenderer.vue          # 日期类型渲染器
├── TableRenderer.vue         # 表格容器渲染器
├── FormRenderer.vue          # 表单容器渲染器
├── DynamicRenderer.vue       # 动态渲染器（核心）
└── renderer-map.ts           # 类型到组件的映射表
```

## 核心设计

### 1. 统一的配置格式

所有组件（包括列）使用统一的属性：

```json
{
  "type": "text",       // 类型标识
  "name": "姓名",       // 显示标题
  "value": "userName",  // 数据字段
  "width": 180          // 尺寸等其他属性
}
```

### 2. 上下文感知渲染

同一配置根据 `parentType` 渲染成不同形式：

| parentType | 渲染结果 |
|-----------|---------|
| `table` | 表格列 (`<el-table-column>`) |
| `form` | 表单字段 (`<el-form-item>` + `<el-input>`) |
| 其他 | 详情展示 (`<div>`) |

### 3. 递归渲染机制

```
DynamicRenderer
  ↓ 根据 rule.type 选择组件
TableRenderer / FormRenderer / TextRenderer
  ↓ 如果是容器类型
递归渲染 children（传递当前 type 作为 parentType）
```

## 使用示例

### 配置示例

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

### 在 Vue 组件中使用

```vue
<script setup>
import DynamicRenderer from '@/components/renderers/DynamicRenderer.vue'

const rules = ref([{ /* 配置 */ }])
const pageData = reactive({ /* 数据 */ })
</script>

<template>
  <DynamicRenderer
    v-for="rule in rules"
    :rule="rule"
    :data="pageData"
    @update="handleUpdate"
  />
</template>
```

## 添加新的 Renderer

### 1. 创建 Renderer 组件

```vue
<!-- src/components/renderers/SelectRenderer.vue -->
<script setup lang="ts">
interface Props {
  config: {
    type: string
    name: string
    value: string
    options: Array<{ label: string; value: any }>
  }
  parentType?: string
  data?: any
}

const props = defineProps<Props>()
</script>

<template>
  <!-- 作为表格列 -->
  <el-table-column 
    v-if="parentType === 'table'"
    :label="config.name"
    :prop="config.value"
  />
  
  <!-- 作为表单字段 -->
  <el-form-item 
    v-else-if="parentType === 'form'"
    :label="config.name"
  >
    <el-select v-model="data[config.value]">
      <el-option
        v-for="opt in config.options"
        :key="opt.value"
        :label="opt.label"
        :value="opt.value"
      />
    </el-select>
  </el-form-item>
  
  <!-- 作为详情展示 -->
  <div v-else>
    <span>{{ config.name }}: {{ data[config.value] }}</span>
  </div>
</template>
```

### 2. 注册到映射表

```typescript
// src/components/renderers/renderer-map.ts
import SelectRenderer from './SelectRenderer.vue'

export const RENDERER_MAP = {
  // ... 其他渲染器
  select: SelectRenderer
}
```

## 演示页面

访问 `/renderer-demo` 查看完整演示：

- **表格渲染**：相同配置 → 表格列
- **表单渲染**：相同配置 → 表单字段
- **详情展示**：相同配置 → 详情展示

## 架构优势

✅ **文件隔离** - 每个 type 独立维护  
✅ **上下文感知** - 根据 parentType 智能渲染  
✅ **高度复用** - 一份配置多处使用  
✅ **易于扩展** - 新增类型只需添加文件  
✅ **类型安全** - TypeScript 支持完整  
✅ **框架无关** - 配置不依赖具体 UI 框架

## 与原有架构的关系

- **兼容现有项目**：DynamicPage.vue 仍然使用 form-create 渲染
- **独立演示**：RendererDemoPage.vue 展示新架构
- **可选使用**：可以逐步迁移页面到新架构

## 技术栈

- Vue 3 Composition API
- TypeScript
- Element Plus
- 递归组件模式
- 动态组件 (`<component :is>`)
