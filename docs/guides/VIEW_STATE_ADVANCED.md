# 视图状态管理 - 高级特性

## 📖 概述

本文档介绍 SPARK DataSet 视图状态管理的高级特性，包括：

- **加载取消机制**：支持取消正在进行的数据加载
- **智能重试逻辑**：自动/手动重试，带指数退避
- **状态历史记录**：追踪状态变化，便于调试
- **生命周期钩子**：在关键时刻插入自定义逻辑
- **性能统计**：加载时间、成功率等指标

这些特性让视图状态管理更加强大和灵活，适应复杂的业务场景。

## 🎯 核心特性详解

### 1. 加载取消机制

#### 基本概念

每个视图在加载数据时会创建一个 `AbortController`，可以随时取消正在进行的加载操作。

#### 使用场景

- 用户切换页面时取消未完成的加载
- 用户点击"取消"按钮
- 组件卸载时清理资源
- 新请求到来时取消旧请求

#### 示例代码

```typescript
import { DataSet } from '@spark-view/spark-data'

const dataSet = new DataSet({
  dataSetName: 'Demo',
  dataLoader: async (tableName) => {
    // 模拟耗时操作
    await new Promise(resolve => setTimeout(resolve, 5000))
    return [{ id: 1, name: 'Test' }]
  }
})

// 开始加载数据
const usersView = dataSet.getTable('Users')
dataSet.requestTableData('Users')

// 用户点击取消按钮（2秒后）
setTimeout(() => {
  usersView.cancelLoad()  // 取消加载
  console.log('✅ 加载已取消')
}, 2000)
```

#### Vue 组件示例

```vue
<template>
  <div>
    <div v-if="viewState.isLoading">
      <p>加载中... {{ loadingProgress }}%</p>
      <button @click="cancelLoad">取消加载</button>
    </div>
    <div v-else-if="viewState.error">
      <p>加载失败: {{ viewState.error }}</p>
      <button @click="retryLoad">重试</button>
    </div>
    <div v-else>
      <data-grid :data="tableData.rows" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useDataSet } from '@spark-view/spark-data'

const props = defineProps<{ tableName: string }>()
const dataSet = useDataSet()
const tableData = computed(() => dataSet.getTable(props.tableName))

const viewState = computed(() => ({
  isLoading: tableData.value?.isLoading || false,
  error: tableData.value?.loadingError?.message
}))

const loadingProgress = ref(0)

// 取消加载
function cancelLoad() {
  tableData.value?.cancelLoad()
}

// 重试加载
function retryLoad() {
  dataSet.requestTableData(props.tableName)
}

// 组件卸载时取消加载
onUnmounted(() => {
  if (viewState.value.isLoading) {
    cancelLoad()
  }
})
</script>
```

### 2. 智能重试逻辑

#### 重试策略

SPARK 支持**指数退避**（Exponential Backoff）重试策略：

```
第1次重试: 延迟 1000ms
第2次重试: 延迟 2000ms (1000 * 2^1)
第3次重试: 延迟 4000ms (1000 * 2^2)
```

#### 配置参数

```typescript
const usersView = dataSet.getTable('Users')

// 配置重试参数
usersView.maxRetries = 3       // 最大重试次数（默认3次）
usersView.retryDelay = 1000    // 初始重试延迟（默认1000ms）
```

#### 自动重试

加载失败时自动重试（默认启用）：

```typescript
// setError 的第二个参数控制是否自动重试
await viewContext.setError(error, true)  // 自动重试（默认）
await viewContext.setError(error, false) // 不自动重试
```

#### 手动重试

用户点击"重试"按钮时：

```typescript
// 重试（继续累计重试次数）
viewContext.retryLoad()

// 重试并重置重试计数
viewContext.retryLoad(true)  // 从 0 开始计数
```

#### 监听重试状态

```typescript
dataSet.on('viewStateChanged', ({ tableName, state, retryCount, maxRetries, willRetry }) => {
  if (state === 'error') {
    console.log(`加载失败，重试 ${retryCount}/${maxRetries}`)
    
    if (willRetry) {
      console.log('将自动重试...')
    } else {
      console.log('已达到最大重试次数')
    }
  }
})
```

#### 完整示例

```typescript
import { DataSet } from '@spark-view/spark-data'

const dataSet = new DataSet({
  dataSetName: 'Demo',
  dataLoader: async (tableName) => {
    // 模拟 70% 概率失败的 API
    if (Math.random() < 0.7) {
      throw new Error('Network error')
    }
    return [{ id: 1, name: 'Success' }]
  }
})

const usersView = dataSet.getTable('Users')

// 配置重试策略
usersView.maxRetries = 5
usersView.retryDelay = 500

// 监听状态变化
dataSet.on('viewStateChanged', ({ state, retryCount }) => {
  if (state === 'error') {
    console.log(`❌ 第 ${retryCount} 次重试失败`)
  } else if (state === 'ready') {
    console.log(`✅ 加载成功（共重试 ${usersView.retryCount} 次）`)
  }
})

// 开始加载
dataSet.requestTableData('Users')
```

### 3. 状态历史记录

#### 基本用法

视图会自动记录所有状态变化，用于调试和审计：

```typescript
const usersView = dataSet.getTable('Users')

// 配置历史记录大小（默认 20 条）
usersView.maxHistorySize = 50

// 获取状态历史
const history = usersView.getStateHistory()
console.table(history)

// 输出示例：
// ┌─────────┬───────────────┬──────────┬──────────┬──────────┬────────────┐
// │ (index) │  timestamp    │  state   │ rowCount │ duration │ retryCount │
// ├─────────┼───────────────┼──────────┼──────────┼──────────┼────────────┤
// │    0    │ 1707825600000 │ 'loading'│          │          │     0      │
// │    1    │ 1707825601234 │ 'error'  │          │  1234    │     0      │
// │    2    │ 1707825602345 │ 'loading'│          │          │     1      │
// │    3    │ 1707825603456 │ 'ready'  │   150    │  1111    │     1      │
// └─────────┴───────────────┴──────────┴──────────┴──────────┴────────────┘
```

#### 获取最近N条记录

```typescript
// 获取最近 5 条状态变化
const recentStates = usersView.getStateHistory(5)
```

#### 清空历史记录

```typescript
usersView.clearStateHistory()
```

#### Vue DevTools 集成

```typescript
// 在开发环境中暴露到 window，方便调试
if (import.meta.env.DEV) {
  window.inspectViewState = (tableName: string) => {
    const view = dataSet.getTable(tableName)
    return {
      state: view.getState(),
      history: view.getStateHistory(),
      stats: view.getPerformanceStats()
    }
  }
}

// 在浏览器控制台使用：
// > inspectViewState('Users')
// { state: 'ready', history: [...], stats: {...} }
```

### 4. 生命周期钩子

#### 可用钩子

| 钩子 | 触发时机 | 参数 |
|------|---------|------|
| `onBeforeLoad` | 加载开始前 | `context: DataView` |
| `onAfterLoad` | 加载完成后（成功或失败） | `context: DataView, success: boolean` |
| `onLoadError` | 加载失败时 | `context: DataView, error: Error` |
| `onLoadCancel` | 加载被取消时 | `context: DataView` |

#### 基本用法

```typescript
const usersView = dataSet.getTable('Users')

// 加载前验证权限
usersView.onBeforeLoad = async (context) => {
  console.log(`🔐 [钩子] 检查用户权限: ${context.tableName}`)
  const hasPermission = await checkPermission('read', context.tableName)
  
  if (!hasPermission) {
    throw new Error('No permission to load data')
  }
}

// 加载完成后记录日志
usersView.onAfterLoad = async (context, success) => {
  console.log(`📝 [钩子] 加载${success ? '成功' : '失败'}: ${context.tableName}`)
  
  // 上报统计数据
  await reportAnalytics({
    table: context.tableName,
    success,
    duration: context.loadDuration
  })
}

// 加载失败时发送通知
usersView.onLoadError = async (context, error) => {
  console.error(`🚨 [钩子] 加载错误: ${error.message}`)
  
  // 发送错误报告
  await sendErrorReport({
    table: context.tableName,
    error: error.message,
    retryCount: context.retryCount
  })
}

// 加载取消时清理资源
usersView.onLoadCancel = async (context) => {
  console.log(`🛑 [钩子] 加载已取消: ${context.tableName}`)
  
  // 清理临时资源
  await cleanupTempResources(context.tableName)
}
```

#### 全局钩子

如果需要为所有视图设置统一的钩子，可以在创建 DataSet 时配置：

```typescript
import { DataSet } from '@spark-view/spark-data'

// 创建 DataSet 时配置全局钩子
const dataSet = new DataSet({
  dataSetName: 'Demo',
  dataLoader: async (tableName) => {
    const response = await fetch(`/api/${tableName}`)
    return response.json()
  }
})

// 为所有表设置统一钩子
Object.values(dataSet.tables).forEach(table => {
  table.onBeforeLoad = async (context) => {
    console.log(`⏱️ [全局] 开始加载: ${context.tableName}`)
  }
  
  table.onAfterLoad = async (context, success) => {
    console.log(`✅ [全局] 加载${success ? '完成' : '失败'}: ${context.tableName}`)
  }
})
```

### 5. 性能统计

#### 获取性能指标

```typescript
const usersView = dataSet.getTable('Users')
const stats = usersView.getPerformanceStats()

console.log(stats)
// 输出：
// {
//   totalLoadCount: 5,         // 总加载次数
//   successCount: 3,           // 成功次数
//   errorCount: 2,             // 失败次数
//   cancelCount: 0,            // 取消次数
//   totalAttempts: 5,          // 总尝试次数
//   successRate: 60,           // 成功率 (%)
//   avgLoadDuration: 1234,     // 平均加载时间 (ms)
//   lastLoadTime: 1707825603456, // 上次加载时间戳
//   lastLoadDuration: 1111,    // 上次加载耗时 (ms)
//   currentRetryCount: 0,      // 当前重试次数
//   maxRetries: 3              // 最大重试次数
// }
```

#### 性能监控面板示例

```vue
<template>
  <div class="performance-dashboard">
    <h3>{{ tableName }} 性能统计</h3>
    
    <div class="stats-grid">
      <div class="stat">
        <span class="label">总加载次数</span>
        <span class="value">{{ stats.totalLoadCount }}</span>
      </div>
      
      <div class="stat">
        <span class="label">成功率</span>
        <span class="value success-rate">{{ stats.successRate.toFixed(1) }}%</span>
      </div>
      
      <div class="stat">
        <span class="label">平均耗时</span>
        <span class="value">{{ stats.avgLoadDuration }}ms</span>
      </div>
      
      <div class="stat">
        <span class="label">失败次数</span>
        <span class="value error-count">{{ stats.errorCount }}</span>
      </div>
    </div>
    
    <div class="history-chart">
      <h4>状态历史</h4>
      <state-timeline :history="history" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useDataSet } from '@spark-view/spark-data'

const props = defineProps<{ tableName: string }>()
const dataSet = useDataSet()
const tableData = computed(() => dataSet.getTable(props.tableName))

const stats = computed(() => tableData.value?.getPerformanceStats() || {})
const history = computed(() => tableData.value?.getStateHistory() || [])
</script>
```

#### 性能优化建议

根据统计数据优化加载策略：

```typescript
const usersView = dataSet.getTable('Users')
const stats = usersView.getPerformanceStats()

// 如果成功率低于 50%，增加重试次数
if (stats.successRate < 50) {
  usersView.maxRetries = 5
  console.log('⚠️ 成功率偏低，增加重试次数')
}

// 如果平均加载时间超过 3 秒，启用缓存
if (stats.avgLoadDuration > 3000) {
  console.log('⚠️ 加载较慢，建议启用缓存')
  // 实现缓存策略...
}

// 监控失败率
if (stats.errorCount > stats.successCount * 2) {
  console.error('🚨 错误率过高，需要检查 API 或网络状况')
}
```

## 🎨 综合示例

### 完整的企业级数据加载方案

```typescript
import { DataSet } from '@spark-view/spark-data'

// 创建 DataSet
const dataSet = new DataSet({
  dataSetName: 'Enterprise',
  dataLoader: async (tableName) => {
    const response = await fetch(`/api/${tableName}`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  }
})

// 获取视图
const usersView = dataSet.getTable('Users')

// ========== 配置重试策略 ==========
usersView.maxRetries = 3
usersView.retryDelay = 1000

// ========== 设置生命周期钩子 ==========

// 加载前权限检查
usersView.onBeforeLoad = async (context) => {
  console.log(`🔐 检查权限: ${context.tableName}`)
  
  const token = localStorage.getItem('token')
  if (!token) {
    throw new Error('未登录，无法加载数据')
  }
}

// 加载完成后处理
usersView.onAfterLoad = async (context, success) => {
  if (success) {
    console.log(`✅ 加载成功: ${context.rows.length} 条记录`)
    
    // 更新本地缓存
    localStorage.setItem(
      `cache_${context.tableName}`,
      JSON.stringify(context.rows)
    )
  } else {
    console.error(`❌ 加载失败，重试次数: ${context.retryCount}`)
  }
}

// 加载错误处理
usersView.onLoadError = async (context, error) => {
  console.error(`🚨 错误: ${error.message}`)
  
  // 错误上报
  await fetch('/api/log-error', {
    method: 'POST',
    body: JSON.stringify({
      table: context.tableName,
      error: error.message,
      retryCount: context.retryCount,
      timestamp: Date.now()
    })
  })
  
  // 尝试使用缓存数据
  const cachedData = localStorage.getItem(`cache_${context.tableName}`)
  if (cachedData && context.retryCount >= context.maxRetries) {
    console.log('📦 使用缓存数据兜底')
    context.rows.splice(0, context.rows.length, ...JSON.parse(cachedData))
    await context.setReady()
  }
}

// 取消加载时清理
usersView.onLoadCancel = async (context) => {
  console.log(`🛑 加载已取消: ${context.tableName}`)
  // 清理临时资源...
}

// ========== 监听状态变化 ==========
dataSet.on('viewStateChanged', ({ tableName, state, retryCount, willRetry }) => {
  console.log(`📊 [${tableName}] 状态: ${state}`)
  
  if (state === 'error' && willRetry) {
    console.log(`🔄 将在 ${usersView.retryDelay * Math.pow(2, retryCount - 1)}ms 后重试`)
  }
})

// ========== 开始加载 ==========
dataSet.requestTableData('Users')

// ========== 定时输出性能统计 ==========
setInterval(() => {
  const stats = usersView.getPerformanceStats()
  console.log('📈 性能统计:', {
    成功率: `${stats.successRate.toFixed(1)}%`,
    平均耗时: `${stats.avgLoadDuration}ms`,
    总加载次数: stats.totalLoadCount,
    失败次数: stats.errorCount
  })
}, 10000) // 每10秒输出一次
```

## 📚 相关文档

- [视图状态管理基础](./VIEW_STATE_MANAGEMENT.md)
- [DataView API 参考](../../packages/spark-data/src/data-view.ts)
- [SPARK 架构概览](../SPARK_ARCHITECTURE.md)

## 🎉 总结

通过这些高级特性，SPARK 视图状态管理提供了：

| 特性 | 价值 |
|------|------|
| **加载取消** | 避免资源浪费，提升用户体验 |
| **智能重试** | 提高成功率，应对网络抖动 |
| **状态历史** | 便于调试，追踪状态变化 |
| **生命周期钩子** | 灵活扩展，集成业务逻辑 |
| **性能统计** | 数据驱动优化，量化用户体验 |

这些特性共同构成了一个**企业级的数据加载方案**，让前端应用更加健壮、可靠、易维护。
