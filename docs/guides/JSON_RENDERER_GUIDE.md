# JsonRenderer - JSON 配置驱动渲染器

## 概述

`JsonRenderer` 是 SPARK 组件系统的通用 JSON 配置渲染器，用于从 JSON 配置文件动态渲染组件。与 `PageRenderer`（基于 FormCreate）不同，`JsonRenderer` 是更轻量级的通用方案，适用于任何 SPARK 组件。

## 架构对比

| 特性 | JsonRenderer | PageRenderer |
|------|--------------|--------------|
| **定位** | 通用 JSON 配置渲染器 | FormCreate 页面渲染器 |
| **框架依赖** | 无特定框架依赖 | 依赖 FormCreate |
| **配置格式** | 自由 JSON 格式 | FormCreate Rule 格式 |
| **适用场景** | 通用组件渲染 | 表单/页面渲染 |
| **层次** | 组件级别 | 页面级别 |

## 基本用法

### 1. 远程加载配置

```vue
<template>
  <JsonRenderer configUrl="/user-grid-demo.json" />
</template>

<script setup>
import { JsonRenderer } from '@spark-view/spark-component'
</script>
```

### 2. 直接传入配置

```vue
<template>
  <JsonRenderer :config="gridConfig" />
</template>

<script setup>
import { JsonRenderer } from '@spark-view/spark-component'
import { ref } from 'vue'

const gridConfig = ref({
  type: 'user-grid',
  id: 'demo-grid',
  props: {
    dataset: {
      tables: {
        Users: {
          columns: [
            { field: 'id', title: 'ID' },
            { field: 'name', title: '姓名' }
          ],
          rows: [
            { id: 1, name: '张三' },
            { id: 2, name: '李四' }
          ]
        }
      }
    }
  }
})
</script>
```

### 3. 指定自定义组件

```vue
<template>
  <JsonRenderer 
    :config="config" 
    :component="UserGrid" 
  />
</template>

<script setup>
import { JsonRenderer } from '@spark-view/spark-component'
import UserGrid from './UserGrid.vue'

const config = {
  type: 'user-grid',
  props: { /* ... */ }
}
</script>
```

## 配置格式

### JSON 配置文件结构

```json
{
  "type": "user-grid",           // 组件类型（从 SPARK 注册表查找）
  "id": "demo-grid",              // 组件 ID（可选）
  "props": {                      // 组件 props
    "dataset": {
      "tables": {
        "Users": {
          "tableName": "Users",
          "columns": [...],
          "rows": [...]
        }
      }
    }
  }
}
```

### 配置选项

```typescript
interface JsonRendererOptions {
  // 配置来源（二选一）
  configUrl?: string                    // 远程 URL
  config?: Record<string, unknown>      // 直接传入
  
  // 组件选项
  component?: Component                 // 自定义组件（覆盖注册表查找）
  showConfigViewer?: boolean            // 显示配置查看器（调试）
  
  // 生命周期钩子
  beforeLoad?: (url: string) => void | Promise<void>
  afterLoad?: (config: Record<string, unknown>) => void | Promise<void> | Record<string, unknown>
  onError?: (error: Error) => void
}
```

## 插槽定制

### loading 插槽

```vue
<JsonRenderer configUrl="/config.json">
  <template #loading>
    <div class="custom-loading">
      <span>正在加载配置...</span>
    </div>
  </template>
</JsonRenderer>
```

### error 插槽

```vue
<JsonRenderer configUrl="/config.json">
  <template #error="{ error }">
    <div class="custom-error">
      <h3>加载失败</h3>
      <p>{{ error }}</p>
      <button @click="retry">重试</button>
    </div>
  </template>
</JsonRenderer>
```

### content 插槽

```vue
<JsonRenderer configUrl="/config.json">
  <template #content="{ config }">
    <!-- 完全自定义渲染逻辑 -->
    <div class="custom-wrapper">
      <h2>{{ config.title }}</h2>
      <component :is="MyComponent" v-bind="config.props" />
    </div>
  </template>
</JsonRenderer>
```

## 生命周期钩子

### beforeLoad - 加载前处理

```vue
<JsonRenderer 
  configUrl="/config.json"
  :before-load="handleBeforeLoad"
/>

<script setup>
async function handleBeforeLoad(url) {
  console.log('即将加载:', url)
  // 可以做权限检查、日志记录等
  await checkPermission(url)
}
</script>
```

### afterLoad - 加载后转换

```vue
<JsonRenderer 
  configUrl="/config.json"
  :after-load="transformConfig"
/>

<script setup>
function transformConfig(config) {
  // 转换配置格式
  return {
    ...config,
    props: {
      ...config.props,
      theme: 'dark'  // 注入额外属性
    }
  }
}
</script>
```

### onError - 错误处理

```vue
<JsonRenderer 
  configUrl="/config.json"
  :on-error="handleError"
/>

<script setup>
function handleError(error) {
  console.error('配置加载失败:', error)
  // 上报到监控系统
  reportError(error)
}
</script>
```

## 调试功能

### 显示配置查看器

```vue
<JsonRenderer 
  configUrl="/config.json"
  show-config-viewer
/>
```

显示一个可折叠面板，展示 JSON 配置内容，方便调试。

## 暴露方法

```vue
<template>
  <JsonRenderer ref="rendererRef" configUrl="/config.json" />
</template>

<script setup>
import { ref } from 'vue'

const rendererRef = ref(null)

// 重新加载配置
function reloadConfig() {
  rendererRef.value?.reload()
}

// 手动加载配置
function manualLoad() {
  rendererRef.value?.loadConfig()
}

// 访问当前配置
function getConfig() {
  return rendererRef.value?.config
}
</script>
```

## 实践示例

### 示例 1：用户列表渲染

**配置文件** (`/api/users/grid.json`)：
```json
{
  "type": "spark-ej2-grid",
  "id": "user-grid",
  "props": {
    "dataKey": "UserDS@Users@grid@rows",
    "allowPaging": true,
    "pageSettings": { "pageSize": 20 }
  }
}
```

**组件使用**：
```vue
<template>
  <JsonRenderer 
    configUrl="/api/users/grid.json"
    :before-load="checkAuth"
    :after-load="injectPermissions"
  />
</template>

<script setup>
import { JsonRenderer } from '@spark-view/spark-component'

async function checkAuth() {
  if (!userHasPermission('users.view')) {
    throw new Error('无权限查看用户列表')
  }
}

function injectPermissions(config) {
  return {
    ...config,
    props: {
      ...config.props,
      allowEditing: userHasPermission('users.edit'),
      allowDeleting: userHasPermission('users.delete')
    }
  }
}
</script>
```

### 示例 2：仪表盘组件

**配置文件** (`/api/dashboard/widgets.json`)：
```json
[
  {
    "type": "stats-card",
    "props": { "title": "总用户数", "value": 1234 }
  },
  {
    "type": "chart-widget",
    "props": { "type": "line", "dataKey": "Stats@Sales@chart@rows" }
  }
]
```

**组件使用**：
```vue
<template>
  <div class="dashboard">
    <JsonRenderer 
      v-for="(widget, index) in widgets"
      :key="index"
      :config="widget"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const widgets = ref([])

onMounted(async () => {
  const response = await fetch('/api/dashboard/widgets.json')
  widgets.value = await response.json()
})
</script>
```

### 示例 3：从 JsonRendererDemo 迁移

**原始代码** (`src/components/demo/JsonRendererDemo.vue`)：
```vue
<template>
  <component :is="UserGrid" v-if="config" :config="config" />
</template>

<script setup>
import { ref, onMounted } from 'vue'
import UserGrid from './UserGrid.vue'

const config = ref(null)

onMounted(async () => {
  const response = await fetch('/user-grid-demo.json')
  config.value = await response.json()
})
</script>
```

**迁移后** (使用标准化的 JsonRenderer)：
```vue
<template>
  <JsonRenderer 
    configUrl="/user-grid-demo.json"
    :component="UserGrid"
  />
</template>

<script setup>
import { JsonRenderer } from '@spark-view/spark-component'
import UserGrid from './UserGrid.vue'
</script>
```

## 与 PageRenderer 对比

| 场景 | 推荐方案 | 理由 |
|------|---------|------|
| **表单渲染** | PageRenderer | FormCreate 强大的表单能力 |
| **复杂页面** | PageRenderer | 支持脚本、样式隔离、DataSet |
| **通用组件** | JsonRenderer | 轻量、灵活、无框架绑定 |
| **微组件** | JsonRenderer | 快速渲染、配置简单 |
| **混合场景** | 两者结合 | PageRenderer 作为容器，JsonRenderer 渲染子组件 |

## 常见问题

### Q: 如何注册自定义组件？

A: 使用 SPARK 组件注册系统：

```typescript
import { Spark } from '@spark-view/spark-component'
import UserGrid from './UserGrid.vue'

Spark.register('user-grid', UserGrid)
```

### Q: 配置文件找不到怎么办？

A: 检查：
1. configUrl 路径是否正确（相对 public 目录）
2. 文件是否在 public 文件夹中
3. 使用 onError 钩子捕获错误

### Q: 如何动态切换配置？

A: 使用响应式变量：

```vue
<template>
  <select v-model="selectedConfig">
    <option value="/grid1.json">配置1</option>
    <option value="/grid2.json">配置2</option>
  </select>
  <JsonRenderer :configUrl="selectedConfig" />
</template>

<script setup>
import { ref } from 'vue'
const selectedConfig = ref('/grid1.json')
</script>
```

### Q: 如何传递额外的 props？

A: 使用 afterLoad 钩子：

```vue
<JsonRenderer 
  :config="config"
  :after-load="addExtraProps"
/>

<script setup>
function addExtraProps(config) {
  return {
    ...config,
    props: {
      ...config.props,
      currentUser: userInfo.value
    }
  }
}
</script>
```

## API 总结

### Props

| 名称 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| configUrl | `string` | - | 配置文件 URL |
| config | `Record<string, unknown>` | - | 配置对象 |
| component | `Component` | - | 自定义组件 |
| showConfigViewer | `boolean` | `false` | 显示配置查看器 |
| beforeLoad | `Function` | - | 加载前钩子 |
| afterLoad | `Function` | - | 加载后钩子 |
| onError | `Function` | - | 错误处理 |

### Slots

| 名称 | 参数 | 说明 |
|------|------|------|
| loading | - | 加载状态 |
| error | `{ error: string }` | 错误状态 |
| content | `{ config: Record }` | 主内容 |

### Expose

| 名称 | 类型 | 说明 |
|------|------|------|
| reload | `() => Promise<void>` | 重新加载配置 |
| loadConfig | `() => Promise<void>` | 手动加载配置 |
| config | `Ref<Record<string, unknown> \| null>` | 当前配置对象 |

## 最佳实践

1. ✅ **配置文件放在 public 目录**：便于开发和访问
2. ✅ **使用 TypeScript 定义配置格式**：类型安全
3. ✅ **生产环境从 API 加载**：动态配置、权限控制
4. ✅ **使用 afterLoad 注入运行时数据**：用户信息、权限等
5. ✅ **开发时开启 showConfigViewer**：方便调试
6. ✅ **错误处理使用 onError**：上报监控、用户提示
7. ✅ **组件注册使用统一命名**：kebab-case（如 `user-grid`）
8. ✅ **复杂场景使用 PageRenderer**：FormCreate 更强大
