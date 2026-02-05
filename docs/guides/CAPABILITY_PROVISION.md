# 能力系统指南

> 组件间通过能力系统通信，避免紧耦合

## 核心概念

能力系统是 SPARK 的核心通信机制，基于 **Provider/Consumer** 模式：

- **Provider（提供者）**: 组件提供能力给其他组件使用
- **Consumer（消费者）**: 组件消费其他组件提供的能力
- **Context（上下文）**: 能力的作用域，支持父子关系

## 提供能力

### 基本用法

\\\	ypescript
import { useSparkComponent } from '@spark-view/spark-component'

const { provide } = useSparkComponent({ type: 'my-grid' })

// 提供能力
provide('columnManager', {
  addColumn: (col) => columns.value.push(col),
  removeColumn: (id) => columns.value = columns.value.filter(c => c.id !== id),
  getColumns: () => columns.value
})
\\\

### 提供多个能力

\\\	ypescript
// 提供数据源能力
provide('dataSource', {
  getData: () => rows.value,
  setData: (data) => rows.value = data,
  refresh: async () => {
    const data = await fetchData()
    rows.value = data
  }
})

// 提供选择能力
provide('selectionManager', {
  getSelection: () => selectedRows.value,
  setSelection: (rows) => selectedRows.value = rows,
  clearSelection: () => selectedRows.value = []
})
\\\

## 消费能力

### 立即消费

\\\	ypescript
const { consume } = useSparkComponent({ type: 'my-column' })

// 立即消费（可能为 undefined）
const columnManager = consume('columnManager')

if (columnManager) {
  columnManager.addColumn({ id: '1', field: 'name' })
}
\\\

### 等待能力就绪

\\\	ypescript
const { whenAvailable } = useSparkComponent({ type: 'my-column' })

// 等待能力就绪后执行
whenAvailable('columnManager', (mgr) => {
  mgr.addColumn({
    id: props.id,
    field: props.field,
    title: props.title
  })
})
\\\

### 使用能力（便捷方法）

\\\	ypescript
const { use } = useSparkComponent({ type: 'my-column' })

// 等价于 whenAvailable，但语法更简洁
use('columnManager', (mgr) => {
  mgr.addColumn({ ... })
})
\\\

## 能力查找规则

能力沿父子关系向上查找，就近原则：

\\\
Page (提供 logger)
 Container (提供 dataSet)
     Grid (提供 columnManager)
         Column (消费 columnManager, dataSet, logger)
\\\

**Column 组件消费能力时**：
1. 先在 Grid 中查找  找到 columnManager
2. 再在 Container 中查找  找到 dataSet
3. 最后在 Page 中查找  找到 logger

## 常见能力类型

### 1. 数据能力

\\\	ypescript
provide('dataSource', {
  getData: () => any[],
  setData: (data: any[]) => void,
  refresh: () => Promise<void>
})
\\\

### 2. 管理能力

\\\	ypescript
provide('columnManager', {
  addColumn: (col: ColumnConfig) => void,
  removeColumn: (id: string) => void,
getColumns: () => ColumnConfig[]
})
\\\

### 3. 选择能力

\\\	ypescript
provide('selectionManager', {
  getSelection: () => any[],
  setSelection: (items: any[]) => void,
  clearSelection: () => void
})
\\\

### 4. 事件能力

\\\	ypescript
provide('eventBus', {
  on: (event: string, handler: Function) => void,
  off: (event: string, handler: Function) => void,
  emit: (event: string, data: any) => void
})
\\\

## 能力版本控制

\\\	ypescript
provide('dataSource', {
  version: '2.0.0',
  getData: () => any[],
  // v2 新增方法
  getDataAsync: async () => Promise<any[]>
})

// 消费时检查版本
const dataSource = consume('dataSource')
if (dataSource?.version >= '2.0.0') {
  await dataSource.getDataAsync()
}
\\\

## 能力类型定义

\\\	ypescript
// 定义能力接口
export interface ColumnManagerCapability {
  addColumn: (col: ColumnConfig) => void
  removeColumn: (id: string) => void
  getColumns: () => ColumnConfig[]
}

// 提供时使用类型
provide<ColumnManagerCapability>('columnManager', {
  addColumn: (col) => { ... },
  removeColumn: (id) => { ... },
  getColumns: () => { ... }
})

// 消费时使用类型
const columnManager = consume<ColumnManagerCapability>('columnManager')
\\\

## 最佳实践

### 1. 能力命名

使用清晰的命名约定：
- \dataSource\ - 数据源
- \columnManager\ - 列管理器
- \selectionManager\ - 选择管理器
- \eventBus\ - 事件总线

### 2. 能力粒度

保持能力单一职责：
-  好：\columnManager\（只管理列）
-  差：\gridManager\（管理一切）

### 3. 延迟注册

使用 \whenAvailable\ 处理延迟注册：
\\\	ypescript
whenAvailable('dataSource', (ds) => {
  // 能力就绪后执行
})
\\\

### 4. 清理资源

组件销毁时清理能力：
\\\	ypescript
onUnmounted(() => {
  // 清理订阅、事件监听等
})
\\\

## 完整示例

### Grid 组件（提供能力）

\\\ue
<script setup lang=&quot;ts&quot;>
import { ref } from 'vue'
import { useSparkComponent } from '@spark-view/spark-component'

const columns = ref<ColumnConfig[]>([])

const { provide } = useSparkComponent({ type: 'my-grid' })

provide('columnManager', {
  addColumn: (col) => columns.value.push(col),
  removeColumn: (id) => columns.value = columns.value.filter(c => c.id !== id),
  getColumns: () => columns.value
})
</script>
\\\

### Column 组件（消费能力）

\\\ue
<script setup lang=&quot;ts&quot;>
import { useSparkComponent } from '@spark-view/spark-component'

const props = defineProps<{ id: string, field: string }>()

const { whenAvailable } = useSparkComponent({ type: 'my-column' })

whenAvailable('columnManager', (mgr) => {
  mgr.addColumn({
    id: props.id,
    field: props.field
  })
})

// 清理
onUnmounted(() => {
  const mgr = consume('columnManager')
  mgr?.removeColumn(props.id)
})
</script>
\\\

## 更多信息

- [组件开发指南](COMPONENT_DEVELOPMENT.md)
- [数据管理指南](DATA_MANAGEMENT.md)
- [API 参考手册](API_REFERENCE.md)