# 组件开发指南

> 使用 SPARK 框架创建自定义组件

## 快速开始

### 1. 创建组件

```vue
<template>
  <div class="my-grid">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { useSparkComponent } from '@spark-view/spark-component'

const props = defineProps<{
  id: string
  dataSource?: any[]
}>()

const { provide, consume, logger } = useSparkComponent({
  type: 'my-grid',
  config: props
})

// 提供能力
provide('columnManager', {
  addColumn: (col) => console.log('Add column:', col),
  removeColumn: (id) => console.log('Remove column:', id)
})
</script>
```

### 2. 注册组件

```typescript
import { Spark } from '@spark-view/spark-component'
import MyGrid from './MyGrid.vue'

// 静态注册
Spark.register({
  type: 'my-grid',
  name: 'My Grid',
  component: MyGrid
})

// 懒加载注册
Spark.register({
  type: 'my-chart',
  name: 'My Chart',
  loader: () => import('./MyChart.vue')
})
```

### 3. 使用组件

```vue
<template>
  <my-grid id="grid1" :dataSource="users">
    <my-column field="name" title="姓名" />
    <my-column field="age" title="年龄" />
  </my-grid>
</template>
```

## 能力系统

组件通过能力系统通信，避免直接依赖。

### 提供能力

```typescript
const { provide } = useSparkComponent({ type: 'my-grid' })

provide('columnManager', {
  addColumn: (col) => columns.value.push(col),
  removeColumn: (id) => columns.value = columns.value.filter(c => c.id !== id),
  getColumns: () => columns.value
})
```

### 消费能力

```typescript
const { consume, whenAvailable } = useSparkComponent({ type: 'my-column' })

// 立即消费（可能为 undefined）
const columnManager = consume('columnManager')

// 等待能力就绪
whenAvailable('columnManager', (mgr) => {
  mgr.addColumn({
    id: props.id,
    field: props.field,
    title: props.title
  })
})
```

## 组件生命周期

```vue
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useSparkComponent } from '@spark-view/spark-component'

const { context, logger } = useSparkComponent({ type: 'my-grid' })

onMounted(() => {
  logger.info('Component mounted')
  // 初始化逻辑
})

onUnmounted(() => {
  logger.info('Component unmounting')
  // 清理逻辑
})
</script>
```

## 数据绑定

### 绑定 DataSet

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSparkComponent } from '@spark-view/spark-component'

const { consume } = useSparkComponent({ type: 'my-grid' })

// 消费 DataSet 能力
const dataSet = consume('dataSet')

// 绑定表数据
const rows = computed(() => {
  return dataSet?.tables.Users?.rows || []
})

// 订阅变化
dataSet?.subscribe('Users', (event) => {
  console.log('数据变化:', event)
})
</script>
```

## 事件处理

```vue
<script setup lang="ts">
const emit = defineEmits<{
  rowClick: [row: any]
  rowSelect: [rows: any[]]
}>()

function handleRowClick(row: any) {
  emit('rowClick', row)
}

function handleRowSelect(rows: any[]) {
  emit('rowSelect', rows)
}
</script>
```

## 样式隔离

```vue
<style scoped>
.my-grid {
  border: 1px solid #ddd;
  border-radius: 4px;
}

.my-grid__header {
  background: #f5f5f5;
  padding: 8px;
}
</style>
```

## 类型定义

```typescript
export interface MyGridProps {
  id: string
  dataSource?: any[]
  columns?: ColumnConfig[]
  pageSize?: number
}

export interface ColumnConfig {
  id: string
  field: string
  title: string
  width?: number
}

export interface ColumnManager {
  addColumn: (col: ColumnConfig) => void
  removeColumn: (id: string) => void
  getColumns: () => ColumnConfig[]
}
```

## 完整示例

参考项目中的 EJ2 组件实现：
- [features/spark/components/ej2/SparkEJ2Grid.vue](../../../features/spark/components/ej2/SparkEJ2Grid.vue)
- [features/spark/components/ej2/SparkEJ2Column.vue](../../../features/spark/components/ej2/SparkEJ2Column.vue)

## 构建时组件库生成与AI集成

### 概述

在Vite打包过程中，可以自动生成完整的Vue组件资源库，提取组件的属性配置信息（如props、events、slots等），并上传到服务端。这为AI提供组件元数据的上下文，通过MCP协议让AI了解和使用这些组件，增强低代码开发中的辅助能力。

### 可行性分析

- **技术基础**：
  - Vite插件支持：在打包生命周期中钩入，扫描Vue组件文件并提取元数据。
  - 组件元数据提取：使用`vue-docgen`或自定义AST解析提取props、events等信息。
  - 资源库生成：生成JSON文件包含所有组件元数据。
  - 上传到服务端：在打包完成后通过HTTP上传数据。
  - AI边界与MCP：将元数据作为MCP工具上下文，让AI查询组件信息。

- **潜在挑战**：
  - 动态组件：确保覆盖所有注册组件。
  - 性能：大型项目可通过缓存优化。
  - 安全性：确保上传时的认证安全。

### 实现方案

#### 步骤1: 安装依赖

```bash
pnpm add -D vue-docgen-api axios
```

#### 步骤2: 配置Vite插件

在`vite.config.ts`中添加插件：

```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import fs from 'fs'
import axios from 'axios'
import { buildComponentDocs } from 'vue-docgen-api'

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'generate-component-library',
      buildStart() {
        console.log('开始生成Vue组件资源库...')
      },
      async generateBundle(options, bundle) {
        const componentLibrary = {}
        
        // 扫描组件目录
        const componentDir = resolve(__dirname, 'packages/spark-component/src/components')
        const files = fs.readdirSync(componentDir).filter(f => f.endsWith('.vue'))
        
        for (const file of files) {
          const filePath = resolve(componentDir, file)
          
          // 提取元数据
          const docs = await buildComponentDocs(filePath)
          componentLibrary[file.replace('.vue', '')] = {
            props: docs.props || [],
            events: docs.events || [],
            slots: docs.slots || [],
            description: docs.description || ''
          }
        }
        
        // 生成JSON文件
        const libraryPath = 'component-library.json'
        fs.writeFileSync(libraryPath, JSON.stringify(componentLibrary, null, 2))
        
        // 上传到服务端
        try {
          await axios.post('https://your-server.com/api/upload-component-library', {
            data: componentLibrary
          }, {
            headers: { 'Authorization': 'Bearer YOUR_API_KEY' }
          })
          console.log('组件资源库已上传到服务端')
        } catch (error) {
          console.error('上传失败:', error)
        }
      }
    }
  ]
})
```

#### 步骤3: 配置MCP工具

在MCP服务器中添加工具查询组件元数据，例如：
- 工具名：`get-component-info`
- 输入：组件名
- 输出：JSON数据

#### 步骤4: 测试与优化

运行`pnpm run build`测试，验证生成和上传。

### 潜在扩展

- 集成到SPARK系统：与`Spark.register()`结合。
- AI增强：提供组件推荐和代码生成。
- 其他工具：使用`vue-component-meta`提取TypeScript类型。

## 更多信息

- [能力系统指南](CAPABILITY_PROVISION.md)
- [数据管理指南](DATA_MANAGEMENT.md)
- [API 参考手册](API_REFERENCE.md)
