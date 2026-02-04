# API 文档

> 各模块公共 API 参考

## spark-app

应用程序启动和配置管理。

### SparkApp.start()

```typescript
interface SparkAppConfig {
  el: string                        // 挂载元素选择器
  authService: IAuthService         // 认证服务
  apiService: IApiService           // API 服务
  requestInterceptor?: (config: any) => any  // 请求拦截器
  router?: Router                   // Vue Router 实例
  pinia?: Pinia                     // Pinia 实例
}

// 启动应用
const app = await SparkApp.start(config)
```

**示例：**

```typescript
import { SparkApp } from '@spark-view/spark-app'
import { AuthService } from './services/auth'
import { ApiService } from './services/api'

await SparkApp.start({
  el: '#app',
  authService: new AuthService(),
  apiService: new ApiService(),
  requestInterceptor: (config) => {
    config.headers['X-Token'] = localStorage.getItem('token')
    return config
  }
})
```

---

## spark-component

组件注册与能力系统。

### SparkComponent.registerSparkComponent()

```typescript
interface ComponentRegistration {
  type: string                      // 组件类型（kebab-case）
  component: Component              // Vue 组件
  capabilities?: string[]           // 提供的能力列表
  dependencies?: string[]           // 依赖的能力列表
}

// 注册组件
SparkComponent.registerSparkComponent(config)
```

**示例：**

```typescript
import { SparkComponent } from '@spark-view/spark-component'

SparkComponent.registerSparkComponent({
  type: 'spark-ej2-grid',
  component: SparkEJ2Grid,
  capabilities: ['dataSource', 'columnManager'],
  dependencies: []
})
```

### useSparkComponent()

```typescript
interface SparkComponentConfig {
  id: string                        // 组件唯一 ID
  type: string                      // 组件类型
  config?: Record<string, any>      // 组件配置
}

interface SparkComponentAPI {
  context: ComponentContext         // 组件上下文
  provide: (name: string, provider: Provider) => void
  consume: (name: string, callback: (impl: any) => void) => () => void
  use: (name: string) => any
  whenAvailable: (name: string, callback: (impl: any) => void) => void
  logger: Logger
}

// 使用组件系统
const api = useSparkComponent(config)
```

**示例：**

```typescript
const { provide, whenAvailable, logger } = useSparkComponent({
  id: 'myGrid',
  type: 'spark-ej2-grid'
})

// 提供能力
provide('columnManager', {
  implementation: {
    addColumn(config) { /* ... */ }
  }
})

// 消费能力
whenAvailable('dataSource', (ds) => {
  logger.info('Data source ready')
})
```

---

## spark-data

数据集与树形数据管理。

### SparkData.createDataSet()

```typescript
interface DataSetConfig {
  dataSetName: string
  tables: Record<string, TableConfig>
  relations?: RelationConfig[]
}

interface TableConfig {
  tableName: string
  columns: ColumnDef[]
  rows: DataRow[]
}

interface RelationConfig {
  parentTable: string
  childTable: string
  type: 'one-to-many' | 'many-to-one'
  filterExpression: string
}

// 创建 DataSet
const dataSet = SparkData.createDataSet(config)
```

**示例：**

```typescript
import { SparkData } from '@spark-view/spark-data'

const dataSet = SparkData.createDataSet({
  dataSetName: 'MyApp',
  tables: {
    Users: {
      tableName: 'Users',
      columns: [
        { name: 'id', type: 'number', primaryKey: true },
        { name: 'name', type: 'string' }
      ],
      rows: []
    }
  }
})
```

### DataSet API

```typescript
interface DataSet {
  // 表操作
  getTable(name: string): Table
  
  // 数据加载
  dataLoader?: (tableName: string) => Promise<any[]>
  requestTableData(tableName: string): Promise<void>
  
  // 级联操作
  cascadeUpdate(tableName: string, newValues: any, oldValues: any): void
  cascadeDelete(tableName: string, row: any): void
  
  // 事件系统
  on(event: string, handler: Function): void
  off(event: string, handler: Function): void
  
  // 订阅者模式
  notifySubscribers(tableName: string): void
}
```

### Table API

```typescript
interface Table {
  tableName: string
  columns: ColumnDef[]
  rows: DataRow[]
  currentRow: DataRow | null
  
  // 行操作
  addRow(row: DataRow): void
  updateRow(oldRow: DataRow, newRow: DataRow): void
  deleteRow(row: DataRow): void
  getRow(index: number): DataRow
  
  // 当前行
  setCurrentRow(row: DataRow): void
  
  // 原始数据（未过滤）
  _originalRows?: DataRow[]
}
```

### SparkData.createTreeManager()

```typescript
interface TreeManagerConfig {
  idField: string
  parentIdField: string
  childrenField?: string            // 默认 'children'
}

// 创建 TreeManager
const treeManager = SparkData.createTreeManager(config)
```

**示例：**

```typescript
const treeManager = SparkData.createTreeManager({
  idField: 'id',
  parentIdField: 'parentId'
})

treeManager.loadData([
  { id: 1, name: 'Root', parentId: null },
  { id: 2, name: 'Child', parentId: 1 }
])

const tree = treeManager.buildNestedTree()
```

### TreeManager API

```typescript
interface TreeManager {
  // 数据加载
  loadData(data: any[]): void
  
  // 树操作
  enrichNodes(): void
  buildNestedTree(): any[]
  getChildren(parentId: any): any[]
  getNodeById(id: any): any | null
  getNodePath(id: any): { pathNodes: any[], pathIds: any[] }
}
```

### FilterParser

```typescript
interface SQLResult {
  sql: string
  params: any[]
}

// 解析为 SQL
const result = SparkData.FilterParser.toSQL(expression)

// 解析为 MongoDB
const query = SparkData.FilterParser.toMongoDB(expression)
```

**示例：**

```typescript
const expression = 'age > 18 && name == "张三"'

// SQL
const sql = SparkData.FilterParser.toSQL(expression)
console.log(sql.sql)      // "age > ? AND name = ?"
console.log(sql.params)   // [18, "张三"]

// MongoDB
const mongo = SparkData.FilterParser.toMongoDB(expression)
console.log(mongo)        // { age: { $gt: 18 }, name: "张三" }
```

---

## spark-page-config

页面配置加载与解析。

### PageConfig.load()

```typescript
interface PageMetadata {
  title?: string
  description?: string
  keywords?: string
  [key: string]: any
}

// 加载页面配置
const config = await PageConfig.load(pageName)
```

**返回值：**

```typescript
interface LoadedPageConfig {
  rule: RuleConfig              // 渲染规则
  pageData: PageData            // 页面数据
  script?: PageScript           // 页面脚本
  metadata?: PageMetadata       // 页面元信息
}
```

---

## spark-renderer

页面渲染引擎。

### PageRenderer 组件

```vue
<template>
  <PageRenderer :config="config" />
</template>

<script setup>
import { PageRenderer } from '@spark-view/spark-renderer'

defineProps<{
  config: LoadedPageConfig
}>()
</script>
```

### 页面脚本 API

在 `script.js` 中可用的全局变量：

```typescript
// 数据访问
$data: Record<string, any>         // 响应式数据对象
$dataSet: DataSet                  // DataSet 实例

// 网络请求
$api: IApiService                  // API 服务

// 路由
$route: RouteLocationNormalizedLoaded

// DOM 操作
$el: (id: string) => ComponentContext | undefined
$query: (selector: string) => Element | null
$queryAll: (selector: string) => Element[]

// 数据操作
$rebindRules: (newData: any) => void
$refreshData: () => Promise<void>

// UI 库（Element Plus）
ElMessage: typeof ElMessage
ElMessageBox: typeof ElMessageBox

// 工具函数
SparkData: typeof SparkData       // DataSet, TreeManager, FilterParser
h: typeof h                        // Vue h 函数
```

**页面脚本生命周期：**

```javascript
// 页面初始化
function __init__() {
  console.log('页面加载完成')
  console.log('数据:', $data)
}

// 数据加载成功
function __loadSuccess__() {
  console.log('数据加载成功')
}

// 数据加载失败
function __loadError__(error) {
  console.error('数据加载失败:', error)
  ElMessage.error('加载失败: ' + error.message)
}

// 自定义事件处理函数
async function handleSubmit() {
  const result = await $api.post('/submit', $data.form)
  ElMessage.success('提交成功')
}
```

---

## spark-utils

通用工具函数。

### PathResolver

```typescript
// 解析路径
SparkUtils.PathResolver.resolve(obj, 'user.profile.name')

// 设置值
SparkUtils.PathResolver.set(obj, 'user.profile.name', '张三')
```

### Logger

```typescript
// 创建 Logger
const logger = SparkUtils.createLogger('MyModule')

logger.debug('Debug message')
logger.info('Info message')
logger.warn('Warning message')
logger.error('Error message', new Error())
```

---

## 事件系统

### DataSet 事件

```typescript
dataSet.on('loadSuccess', ({ tableName }) => {
  console.log(`${tableName} 加载成功`)
})

dataSet.on('loadError', ({ tableName, error }) => {
  console.error(`${tableName} 加载失败:`, error)
})

dataSet.on('currentRowChanged', ({ tableName, row }) => {
  console.log(`${tableName} 当前行变化:`, row)
})

dataSet.on('data:changed', ({ tableName, row, operation }) => {
  console.log(`${tableName} 数据变化:`, operation)
})
```

---

## 类型定义

### DataRow

```typescript
type DataRow = Record<string, any>
```

### ColumnDef

```typescript
interface ColumnDef {
  name: string
  type: 'string' | 'number' | 'boolean' | 'date'
  primaryKey?: boolean
  nullable?: boolean
  defaultValue?: any
}
```

### ComponentContext

```typescript
interface ComponentContext {
  id: string
  type: string
  props: Record<string, any>
  capabilities: Record<string, Provider>
  
  // 能力管理
  provideCapability(name: string, provider: Provider): void
  getCapability(name: string): any
  consumeCapability(name: string, callback: Function): () => void
}
```

### Provider

```typescript
interface Provider {
  implementation: any
}
```

---

## 版本兼容性

所有包均使用 `workspace:*` 依赖版本，确保：
- 统一的 API 接口
- 协同的功能升级
- 一致的类型定义

建议使用最新版本以获得最佳体验。
