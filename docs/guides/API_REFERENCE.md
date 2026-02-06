# API 参考手册

> SPARK 核心 API 速查

## Spark 命名空间

### 组件管理

```typescript
import { Spark } from '@spark-view/spark-component'

// 创建管理器
const manager = Spark.createComponentManager()
const registry = Spark.createComponentRegistry()

// 注册组件
Spark.register({
  type: 'my-component',
  name: 'My Component',
  component: MyComponent,           // 静态注册
  loader: () => import('./MyComp')  // 懒加载
})

// Vue 插件（使用全局单例）
app.use(Spark.createVuePlugin())
```

### 组件 Composable

```typescript
import { useSparkComponent } from '@spark-view/spark-component'

const { provide, consume, whenAvailable, logger } = useSparkComponent({
  type: 'my-component'
})

// 提供能力
provide('dataSource', { getData: () => [...] })

// 消费能力
const logger = consume('logger')

// 等待能力
whenAvailable('columnManager', (mgr) => {
  mgr.addColumn({ id: '1', name: 'Name' })
})
```

## SparkData 命名空间

### DataSet

```typescript
import { SparkData } from '@spark-view/spark-data'

// 创建 DataSet
const dataSet = SparkData.createDataSet({
  dataSetName: 'MyData',
  tables: {
    Users: {
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'number' },
        { name: 'name', type: 'string' }
      ],
      rows: []
    }
  }
})

// 数据操作
dataSet.tables.Users.addRow({ id: 1, name: 'Alice' })
dataSet.tables.Users.updateRow(0, { name: 'Bob' })
dataSet.tables.Users.deleteRow(0)

// 订阅变化
dataSet.subscribe('Users', (event) => {
  console.log('数据变化:', event)
})
```

### TreeManager

```typescript
// 创建树管理器
const treeManager = SparkData.createTreeManager({
  idField: 'id',
  parentIdField: 'parentId',
  lazy: true
})

// 扁平转树形
const tree = treeManager.buildTree(flatData)

// 懒加载
await treeManager.loadChildren(parentId, async (pid) => {
  return await fetchChildren(pid)
})
```

### BindingContext

```typescript
// 创建绑定上下文
const context = SparkData.createContext('Users', 'default', dataSet)

// 导航
const current = context.getCurrentRow()
context.moveNext()
context.movePrevious()
context.moveFirst()
context.moveLast()

// 查询
const allRows = context.getRows()
const filtered = context.filter(row => row.age > 18)
```

## Capability 能力系统

```typescript
import { Capability } from '@spark-view/spark-utils'

// 创建管理器
const manager = Capability.create()

// 注册连接器
manager.registerConnector('data', new Capability.DataFlow())

// 提供能力
context.providers.add({
  name: 'userService',
  version: '1.0.0',
  implementation: {
    getUser: (id) => ({ id, name: 'User' })
  }
})

// 消费能力
const consumer = { capabilityName: 'userService' }
manager.connectCapability(provider, consumer, context)
```

## Logger 日志系统

```typescript
import { Logger } from '@spark-view/spark-utils'

// 创建日志器
const logger = Logger.create({
  level: 'info',
  namespace: 'app',
  transports: [
    Logger.consoleTransport(),
    Logger.httpTransport({ url: '/api/logs' })
  ]
})

// 记录日志
logger.debug('调试信息', { data })
logger.info('信息日志')
logger.warn('警告信息')
logger.error('错误信息', { error })
```

## ErrorHandler 错误处理

```typescript
import { handleError, withRetry, AppError } from '@spark-view/spark-utils'

// 创建错误
throw new AppError('NETWORK_ERROR', '网络错误', { url })

// 处理错误
handleError(error, {
  context: 'api',
  onError: (err) => console.error(err)
})

// 自动重试
await withRetry(() => fetchData(), {
  maxRetries: 3,
  delay: 1000,
  backoff: 2
})
```

## PageRenderer 页面渲染

```vue
<template>
  <PageRenderer
    :config="pageConfig"
    @load="handleLoad"
    @error="handleError"
  >
    <template #loading>加载中...</template>
    <template #error="{ error }">错误: {{ error.message }}</template>
  </PageRenderer>
</template>

<script setup lang="ts">
import { PageRenderer } from '@spark-view/spark-renderer'

const pageConfig = {
  pageId: 'home',
  layout: {
    type: 'container',
    children: [...]
  },
  dataSet: { ... }
}
</script>
```

## ConfigLoader 配置加载

```typescript
import { ConfigLoader } from '@spark-view/spark-page-config'

const loader = new ConfigLoader({
  mode: 'local',
  basePath: '/pages-config',
  cache: true
})

// 加载配置
const routes = await loader.loadRoutes()
const pageConfig = await loader.loadPageConfig('home')

// 缓存管理
loader.clearCache()
loader.refreshConfig('home')
```

## 类型定义

所有核心类型都可以从对应包导入：

```typescript
// 组件系统
import type {
  ComponentConfig,
  CapabilityProvider,
  CapabilityConsumer
} from '@spark-view/spark-component'

// 数据管理
import type {
  IDataSet,
  DataRow,
  DataColumn,
  TreeNode
} from '@spark-view/spark-data'

// 工具
import type {
  LogLevel,
  Transport,
  AppError
} from '@spark-view/spark-utils'
```

## 更多信息

- [组件开发指南](COMPONENT_DEVELOPMENT.md)
- [数据管理指南](DATA_MANAGEMENT.md)
- [能力系统指南](CAPABILITY_PROVISION.md)
