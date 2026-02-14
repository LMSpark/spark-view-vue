# 组件开发指南

> 使用 SPARK 框架创建自定义组件

## 📖 概述

SPARK 组件系统基于 Vue 3 Composition API，支持类型安全的组件注册、能力驱动的通信机制和声明式的配置系统。本指南将帮助你创建符合 SPARK 架构的自定义组件。

## 🚀 快速开始

### 1. 创建基础组件

```vue
<template>
  <div class="my-component">
    <h3>{{ config.title || 'My Component' }}</h3>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { useSparkComponent } from '@spark-view/spark-component'
import type { ComponentContext } from '@spark-view/spark-component'

interface MyComponentConfig {
  title?: string
  theme?: 'light' | 'dark'
}

const props = defineProps<{
  config: ComponentContext<MyComponentConfig>
}>()

// 获取 SPARK 上下文
const { provide, consume, logger, context } = useSparkComponent(props.config)

// 组件初始化日志
logger.info('MyComponent initialized', { config: props.config })
</script>

<style scoped>
.my-component {
  padding: 1rem;
  border: 1px solid #ddd;
  border-radius: 4px;
}
</style>
```

### 2. 注册组件

SPARK 支持三种组件注册方式：

```typescript
import { Spark } from '@spark-view/spark-component'
import MyComponent from './MyComponent.vue'

// 方式 1：直接注册（同步加载）
Spark.register('my-component', MyComponent)

// 方式 2：动态导入（代码分割）
Spark.register('user-detail', () => import('./UserDetail.vue'))

// 方式 3：路径注册（推荐用于批量管理）
const register = Spark.createRegister(import.meta.glob('./components/*.vue'))
register.registerAll({
  'my-component': './MyComponent.vue',
  'user-grid': './UserGrid.vue',
  'data-table': './DataTable.vue'
})
```

### 3. 使用组件

```vue
<template>
  <div class="page">
    <!-- 使用 kebab-case 类型名 -->
    <spark-component type="my-component" :config="componentConfig" />
  </div>
</template>

<script setup lang="ts">
import { Spark } from '@spark-view/spark-component'

// 注册组件（通常在应用启动时完成）
Spark.register('my-component', () => import('./MyComponent.vue'))

const componentConfig = {
  type: 'my-component',
  title: '示例组件',
  theme: 'light' as const
}
</script>
```

## 🔗 能力系统

SPARK 的核心特性是基于 Symbol 的能力系统，支持组件间的松耦合通信。

### 定义能力

```typescript
// types/capabilities.ts
import { defineCapability } from '@spark-view/spark-utils'

export interface SelectionApi {
  getSelectedItems(): any[]
  selectItem(item: any): void
  clearSelection(): void
}

export const GRID_SELECTION = defineCapability<SelectionApi>('grid-selection')
export const DATA_PROVIDER = defineCapability<DataProvider>('data-provider')
```

### 提供能力

```vue
<template>
  <div class="data-grid">
    <div v-for="item in selectedItems" :key="item.id">
      {{ item.name }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSparkComponent } from '@spark-view/spark-component'
import { GRID_SELECTION } from './capabilities'

const props = defineProps<{
  config: ComponentContext
}>()

const { provide, logger } = useSparkComponent(props.config)

const selectedItems = ref<any[]>([])

// 提供选择能力
provide(GRID_SELECTION, {
  getSelectedItems: () => selectedItems.value,
  selectItem: (item: any) => {
    selectedItems.value.push(item)
    logger.info('Item selected:', item)
  },
  clearSelection: () => {
    selectedItems.value = []
    logger.info('Selection cleared')
  }
})
</script>
```

### 消费能力

```vue
<template>
  <div class="action-bar">
    <button @click="selectAll">全选</button>
    <button @click="clearAll">清空</button>
    <span>已选择 {{ selectedCount }} 项</span>
  </div>
</template>

<script setup lang="ts">
import { useSparkComponent } from '@spark-view/spark-component'
import { GRID_SELECTION } from './capabilities'

const props = defineProps<{
  config: ComponentContext
}>()

const { consume } = useSparkComponent(props.config)

// 消费选择能力（支持延迟绑定）
const selectionApi = consume(GRID_SELECTION)

const selectedCount = computed(() => {
  return selectionApi.value?.getSelectedItems().length ?? 0
})

const selectAll = () => {
  // 这里需要从数据源获取所有项
  // selectionApi.value?.selectAll()
}

const clearAll = () => {
  selectionApi.value?.clearSelection()
}
</script>
```

## 📊 组件生命周期

SPARK 组件具有完整的生命周期管理：

```vue
<script setup lang="ts">
import { useSparkComponent } from '@spark-view/spark-component'
import { onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  config: ComponentContext
}>()

const { logger, context } = useSparkComponent(props.config)

// 组件挂载
onMounted(() => {
  logger.info('Component mounted', {
    type: context.type,
    id: context.id
  })

  // 初始化逻辑
  initComponent()
})

// 组件卸载
onUnmounted(() => {
  logger.info('Component unmounted')

  // 清理逻辑
  cleanupComponent()
})

const initComponent = () => {
  // 组件初始化逻辑
}

const cleanupComponent = () => {
  // 资源清理逻辑
}
</script>
```

## 🎨 样式和主题

SPARK 支持灵活的样式定制：

```vue
<template>
  <div :class="componentClasses">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { useSparkComponent } from '@spark-view/spark-component'
import { computed } from 'vue'

const props = defineProps<{
  config: ComponentContext<{ theme?: string; size?: string }>
}>()

const { consume } = useSparkComponent(props.config)

// 消费主题能力（如果有的话）
const themeProvider = consume('theme-provider')

const componentClasses = computed(() => {
  const classes = ['spark-component']

  // 从配置获取样式
  if (props.config.theme) {
    classes.push(`theme-${props.config.theme}`)
  }

  if (props.config.size) {
    classes.push(`size-${props.config.size}`)
  }

  // 从全局主题获取样式
  if (themeProvider.value?.currentTheme) {
    classes.push(`global-theme-${themeProvider.value.currentTheme}`)
  }

  return classes
})
</script>

<style scoped>
.spark-component {
  /* 基础样式 */
}

.theme-dark {
  background: #1a1a1a;
  color: #ffffff;
}

.theme-light {
  background: #ffffff;
  color: #333333;
}

.size-small {
  padding: 0.5rem;
  font-size: 0.875rem;
}

.size-large {
  padding: 1.5rem;
  font-size: 1.125rem;
}
</style>
```

## 🔧 高级特性

### 条件渲染和权限控制

```vue
<template>
  <div v-if="isVisible" class="conditional-component">
    <component :is="dynamicComponent" :config="config" />
  </div>
</template>

<script setup lang="ts">
import { useSparkComponent } from '@spark-view/spark-component'
import { computed } from 'vue'

const props = defineProps<{
  config: ComponentContext<{
    condition?: string
    permissions?: string[]
    componentType?: string
  }>
}>()

const { consume } = useSparkComponent(props.config)

// 消费权限系统
const permissionProvider = consume('permission-provider')

const isVisible = computed(() => {
  // 检查显示条件
  if (props.config.condition) {
    // 这里可以实现复杂的条件判断逻辑
    return evaluateCondition(props.config.condition)
  }

  // 检查权限
  if (props.config.permissions && permissionProvider.value) {
    return props.config.permissions.every(perm =>
      permissionProvider.value.hasPermission(perm)
    )
  }

  return true
})

const dynamicComponent = computed(() => {
  if (!props.config.componentType) return null

  // 根据类型动态加载组件
  return () => import(`./components/${props.config.componentType}.vue`)
})

const evaluateCondition = (condition: string): boolean => {
  // 实现条件表达式解析
  // 这里可以集成表达式引擎
  return true
}
</script>
```

### 错误处理

```vue
<template>
  <div class="error-boundary">
    <slot v-if="!hasError" />
    <div v-else class="error-message">
      <h3>组件加载失败</h3>
      <p>{{ error.message }}</p>
      <button @click="retry">重试</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSparkComponent } from '@spark-view/spark-component'
import { ref, onErrorCaptured } from 'vue'

const props = defineProps<{
  config: ComponentContext
}>()

const { logger } = useSparkComponent(props.config)

const hasError = ref(false)
const error = ref<Error | null>(null)

// 捕获子组件错误
onErrorCaptured((err, instance, info) => {
  hasError.value = true
  error.value = err as Error

  logger.error('Component error captured', {
    error: err,
    component: instance,
    info
  })

  // 阻止错误继续向上传播
  return false
})

const retry = () => {
  hasError.value = false
  error.value = null

  logger.info('Retrying component after error')
}
</script>
```

## 📚 最佳实践

### 1. 类型安全

```typescript
// ✅ 推荐：明确的类型定义
interface UserGridConfig {
  title: string
  columns: ColumnConfig[]
  dataSource: string
}

const props = defineProps<{
  config: ComponentContext<UserGridConfig>
}>()

// ❌ 避免：使用 any
const props = defineProps<{
  config: any // 不推荐
}>()
```

### 2. 能力命名

```typescript
// ✅ 推荐：使用 Symbol 和描述性名称
export const USER_GRID_DATA = defineCapability<UserGridData>('user-grid-data')
export const COLUMN_MANAGER = defineCapability<ColumnManager>('column-manager')

// ❌ 避免：使用字符串常量
provide('data', data) // 不推荐，容易冲突
```

### 3. 错误处理

```typescript
// ✅ 推荐：优雅的错误处理
const { logger } = useSparkComponent(props.config)

try {
  await loadData()
} catch (error) {
  logger.error('Failed to load data', { error })
  // 显示用户友好的错误信息
}

// ❌ 避免：静默失败
try {
  await loadData()
} catch (error) {
  // 静默处理，可能导致调试困难
}
```

### 4. 性能优化

```typescript
// ✅ 推荐：使用计算属性缓存
const processedData = computed(() => {
  return props.config.data?.map(item => ({
    ...item,
    displayName: formatName(item)
  }))
})

// ❌ 避免：在模板中进行复杂计算
<template>
  <div v-for="item in config.data" :key="item.id">
    {{ item.firstName + ' ' + item.lastName }} <!-- 每次渲染都计算 -->
  </div>
</template>
```

## 🔍 调试技巧

### 启用调试日志

```typescript
import { Logger } from '@spark-view/spark-utils'

// 创建组件专用 logger
const logger = Logger('MyComponent')

// 在组件中使用
logger.debug('Component initialized', { props, config })
logger.info('Data loaded', { count: data.length })
logger.warn('Deprecated prop used', { prop: 'oldProp' })
logger.error('Failed to save', { error })
```

### 检查能力连接

```typescript
const { consume, logger } = useSparkComponent(props.config)

const dataProvider = consume('data-provider')

// 检查能力是否可用
if (dataProvider.value) {
  logger.debug('Data provider connected')
} else {
  logger.warn('Data provider not available, using fallback')
}
```

## 📖 相关文档

- [能力系统详解](CAPABILITY_PROVISION.md) - 深入了解能力系统的设计和使用
- [数据管理](DATA_MANAGEMENT.md) - 学习 DataSet 和数据操作
- [插件配置](PLUGIN_CONFIGURATION.md) - 集成第三方 UI 库
- [页面配置](MULTI_TENANT_CONFIG.md) - 配置驱动的页面开发
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
