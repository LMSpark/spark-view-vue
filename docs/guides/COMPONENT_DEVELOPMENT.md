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

## 更多信息

- [能力系统指南](CAPABILITY_PROVISION.md)
- [数据管理指南](DATA_MANAGEMENT.md)
- [API 参考手册](API_REFERENCE.md)
