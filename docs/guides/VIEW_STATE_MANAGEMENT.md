# 视图状态管理 - 非阻塞响应式数据流

## 📖 概述

视图状态管理是 SPARK DataSet 架构的核心特性，实现了**视图驱动的响应式数据流**。视图（DataView）不仅仅是数据的容器，更是 UI 和后端之间的**智能桥梁**，管理着数据加载的完整生命周期。

### 核心理念

```
视图 = 数据容器 + 状态机 + 事件中心

UI 不直接等待数据，而是订阅视图状态变化
```

## 🎯 设计目标

1. **非阻塞体验**：UI 请求数据后立即返回，不阻塞界面响应
2. **状态透明**：视图状态清晰可见（loading/ready/error/empty）
3. **事件驱动**：状态变化自动通知 UI 更新
4. **依赖管理**：自动处理视图间的依赖关系
5. **错误可恢复**：加载失败后可以重试

## 📊 视图状态流转

视图有 4 种核心状态：

| 状态 | 字段值 | 说明 |
|------|--------|------|
| `loading` | `isLoading=true` | 数据加载中 |
| `ready` | `isLoading=false`, `rows.length > 0` | 数据已就绪 |
| `error` | `loadingError !== null` | 加载失败 |
| `empty` | `isLoading=false`, `rows.length === 0` | 无数据 |

### 状态字段

```typescript
interface DataView {
  isLoading: boolean         // 是否正在加载数据
  loadingError: Error | null // 加载错误对象
  lastLoadTime: number | null // 上次成功加载时间戳
}
```

### 状态转换方法

```typescript
interface DataView {
  setLoading(): void           // 标记为加载中
  setReady(): void             // 标记为就绪
  setError(error: Error): void // 标记为错误
  getState(): 'loading' | 'ready' | 'error' | 'empty'
}
```

## 🔄 完整数据流程

```
┌─────────┐                ┌──────────┐               ┌──────────┐
│  UI 层  │                │ 视图层   │               │ 后端 API │
└────┬────┘                └────┬─────┘               └────┬─────┘
     │                          │                          │
     │ 1. requestTableData()    │                          │
     │─────────────────────────>│                          │
     │                          │ setLoading()             │
     │                          │ emit('viewStateChanged') │
     │<─────────────────────────┤                          │
     │ 2. 显示 loading          │                          │
     │                          │                          │
     │                          │ 3. 检查依赖条件          │
     │                          │                          │
     │                          │ 4. 依赖满足，加载数据    │
     │                          │─────────────────────────>│
     │                          │                          │
     │                          │<─────────────────────────┤
     │                          │ 5. 数据返回              │
     │                          │ setReady()               │
     │                          │ emit('viewStateChanged') │
     │<─────────────────────────┤                          │
     │ 6. 渲染数据内容          │                          │
     │                          │                          │
     │                          │ 7. 通知子视图            │
     │                          │ (递归处理依赖链)         │
```

## 💻 使用示例

### 1. 基础用法：订阅视图状态变化

```typescript
import { DataSet } from '@spark-view/spark-data'

// 创建 DataSet
const dataSet = new DataSet({
  dataSetName: 'Demo',
  dataLoader: async (tableName) => {
    // 从 API 加载数据
    const response = await fetch(`/api/${tableName}`)
    return response.json()
  }
})

// 订阅视图状态变化
dataSet.on('viewStateChanged', ({ tableName, contextId, state, error, rowCount }) => {
  console.log(`[${tableName}.${contextId}] 状态变化: ${state}`)
  
  switch (state) {
    case 'loading':
      // UI 显示 loading spinner
      showLoading(tableName)
      break
    
    case 'ready':
      // UI 显示数据（rowCount 条记录）
      hideLoading(tableName)
      renderData(tableName, rowCount)
      break
    
    case 'error':
      // UI 显示错误信息
      hideLoading(tableName)
      showError(tableName, error)
      break
  }
})

// UI 请求数据（非阻塞）
dataSet.requestTableData('Users')  // 立即返回，不等待数据加载
```

### 2. Vue 组件示例：响应式状态显示

```vue
<template>
  <div>
    <!-- Loading 状态 -->
    <div v-if="viewState.isLoading" class="loading">
      <spinner />
      <p>正在加载 {{ tableName }} 数据...</p>
    </div>
    
    <!-- Error 状态 -->
    <div v-else-if="viewState.error" class="error">
      <p>加载失败: {{ viewState.error }}</p>
      <button @click="retry">重试</button>
    </div>
    
    <!-- Ready 状态 -->
    <div v-else-if="viewState.ready">
      <data-grid :data="tableData.rows" />
      <p class="meta">
        共 {{ tableData.rows.length }} 条记录
        ({{ formatTime(viewState.lastLoadTime) }})
      </p>
    </div>
    
    <!-- Empty 状态 -->
    <div v-else class="empty">
      <p>暂无数据</p>
      <button @click="loadData">加载数据</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useDataSet } from '@spark-view/spark-data'

const props = defineProps<{ tableName: string }>()

// 获取 DataSet 实例
const dataSet = useDataSet()
const tableData = computed(() => dataSet.getTable(props.tableName))

// 视图状态（响应式）
const viewState = computed(() => {
  const table = tableData.value
  if (!table) return { isLoading: false, error: null, ready: false }
  
  return {
    isLoading: table.isLoading,
    error: table.loadingError?.message,
    ready: !table.isLoading && !table.loadingError && table.rows.length > 0,
    lastLoadTime: table.lastLoadTime
  }
})

// 加载数据
function loadData() {
  dataSet.requestTableData(props.tableName)
}

// 重试
function retry() {
  loadData()
}

// 时间格式化
function formatTime(timestamp: number | null) {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleTimeString()
}

// 组件挂载时自动加载
onMounted(() => {
  loadData()
})
</script>
```

### 3. 高级用法：依赖链管理

```typescript
// 定义表关系（父子依赖）
dataSet.addRelations([
  {
    parentTable: 'Departments',
    childTable: 'Users',
    parentKey: 'id',
    childKey: 'departmentId',
    autoLoad: true  // 父表数据加载后自动加载子表
  }
])

// 订阅视图状态，观察依赖链的加载顺序
dataSet.on('viewStateChanged', ({ tableName, state }) => {
  console.log(`[${tableName}] → ${state}`)
})

// 请求子表数据（会自动处理依赖）
dataSet.requestTableData('Users')

// 控制台输出：
// [Departments] → loading  (先加载父表)
// [Departments] → ready
// [Users] → loading        (父表就绪后才加载子表)
// [Users] → ready
```

### 4. 手动状态管理（低级 API）

```typescript
// 获取视图实例
const usersView = dataSet.getTable('Users')

// 手动标记状态
usersView.setLoading()  // UI 立即显示 loading

try {
  // 自定义数据加载逻辑
  const data = await myCustomLoader()
  usersView.rows.splice(0, usersView.rows.length, ...data)
  usersView.setReady()  // 标记为就绪
} catch (error) {
  usersView.setError(error)  // 标记为错误
}

// 获取当前状态
console.log(usersView.getState())  // 'loading' | 'ready' | 'error' | 'empty'
```

## 🎨 状态事件

视图状态变化会触发 `viewStateChanged` 事件：

```typescript
interface ViewStateChangedEvent {
  tableName: string      // 表名
  contextId: string      // 上下文 ID
  state: 'loading' | 'ready' | 'error'
  error?: string         // 错误信息（仅 error 状态）
  rowCount?: number      // 行数（仅 ready 状态）
}

// 订阅事件
dataSet.on('viewStateChanged', (event) => {
  console.log(event)
})
```

## ⚡ 性能优化建议

### 1. 避免重复加载

```typescript
// ❌ 错误：每次点击都请求
button.addEventListener('click', () => {
  dataSet.requestTableData('Users')  // 可能触发多次加载
})

// ✅ 正确：检查状态，避免重复加载
button.addEventListener('click', () => {
  const usersView = dataSet.getTable('Users')
  if (!usersView.isLoading) {  // 未加载中才请求
    dataSet.requestTableData('Users')
  }
})
```

### 2. 使用缓存数据

```typescript
const usersView = dataSet.getTable('Users')

// 如果数据已加载且未过期，直接使用缓存
const CACHE_DURATION = 5 * 60 * 1000 // 5分钟
const now = Date.now()

if (
  usersView.rows.length > 0 && 
  usersView.lastLoadTime && 
  (now - usersView.lastLoadTime) < CACHE_DURATION
) {
  console.log('使用缓存数据')
} else {
  dataSet.requestTableData('Users')  // 缓存过期，重新加载
}
```

### 3. 批量订阅

```typescript
// ❌ 错误：每个视图单独订阅
dataSet.on('viewStateChanged', (e) => {
  if (e.tableName === 'Users') handleUsersState(e)
})
dataSet.on('viewStateChanged', (e) => {
  if (e.tableName === 'Departments') handleDepartmentsState(e)
})

// ✅ 正确：统一处理，减少监听器数量
const stateHandlers = {
  'Users': handleUsersState,
  'Departments': handleDepartmentsState
}

dataSet.on('viewStateChanged', (e) => {
  const handler = stateHandlers[e.tableName]
  if (handler) handler(e)
})
```

## 🔍 调试技巧

### 1. 监控所有状态变化

```typescript
dataSet.on('viewStateChanged', (event) => {
  console.log(`[${event.tableName}] ${event.state}`, {
    contextId: event.contextId,
    error: event.error,
    rowCount: event.rowCount,
    timestamp: new Date().toISOString()
  })
})
```

### 2. 使用 getState() 检查当前状态

```typescript
const usersView = dataSet.getTable('Users')
console.log('Users 当前状态:', usersView.getState())
console.log('详细信息:', {
  isLoading: usersView.isLoading,
  error: usersView.loadingError,
  rows: usersView.rows.length,
  lastLoadTime: usersView.lastLoadTime
})
```

### 3. 可视化状态流转

```typescript
// 在 DevTools 中跟踪状态流转
const stateHistory = []

dataSet.on('viewStateChanged', (e) => {
  stateHistory.push({
    time: Date.now(),
    table: e.tableName,
    state: e.state
  })
  
  // 打印状态链
  console.table(stateHistory.slice(-10))
})
```

## 📚 相关文档

- [数据空间架构](../SPARK_ARCHITECTURE.md)
- [依赖分析器](../packages/spark-data/src/core/dependency-analyzer.ts)
- [数据加载器](../packages/spark-data/src/core/data-loader.ts)
- [事件管理器](../packages/spark-data/src/core/event-manager.ts)

## 🎉 总结

视图状态管理让数据加载从**同步阻塞**变为**异步响应式**：

| 传统方式 | SPARK 视图状态管理 |
|---------|-------------------|
| UI 调用 API → 等待 → 渲染 | UI 请求 → 立即返回 → 订阅状态 → 响应式更新 |
| 阻塞体验，loading 状态不明确 | 非阻塞体验，状态清晰可见 |
| 错误处理复杂 | 统一的错误状态和重试机制 |
| 无依赖管理 | 自动处理视图依赖链 |

通过视图状态管理，SPARK DataSet 实现了真正的**视图驱动的响应式数据流**，让 UI 开发更加简洁、高效、可维护。
