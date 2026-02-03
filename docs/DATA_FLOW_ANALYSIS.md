# SPARK 数据流向分析

## 架构分层

```
┌─────────────────────────────────────────────────────────────┐
│  消费层 (src/)                                               │
│  - main.ts (应用入口)                                        │
│  - DynamicPage.vue (页面容器)                                │
│  - App.vue (根组件)                                          │
└─────────────────────────────────────────────────────────────┘
                         ▲ 数据向上流
                         │ 配置向下流
┌─────────────────────────────────────────────────────────────┐
│  业务编排层                                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ L2: spark-page-config (页面配置管理)                   │  │
│  │ - PageConfigLoader: 加载配置                           │  │
│  │ - DynamicRouter: 动态路由注册                          │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ L3: spark-renderer (页面渲染引擎)                      │  │
│  │ - PageRenderer.vue: 渲染组件                           │  │
│  │ - usePageDataSet: DataSet 管理                         │  │
│  │ - useRuleBinding: 数据绑定                             │  │
│  │ - useScriptSandbox: 脚本沙箱                           │  │
│  │ - useCssScope: 样式隔离                                │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                         ▲ 数据服务
                         │ API 调用
┌─────────────────────────────────────────────────────────────┐
│  L1: spark-app (基础设施层)                                  │
│  - SparkApp.start(): 应用启动                                │
│  - Bootstrap: 初始化流程                                     │
└─────────────────────────────────────────────────────────────┘
                         ▲
┌─────────────────────────────────────────────────────────────┐
│  L4-L6: spark-core + spark-data (组件内核)                   │
│  - ComponentManager: 组件管理                                │
│  - DataSet: 数据管理                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 数据流详细分析

### 1️⃣ 应用启动流程 (main.ts → spark-app)

**文件**: `src/main.ts` → `packages/spark-app/src/start.ts`

```typescript
// 消费层：main.ts
SparkApp.start({
  rootComponent: App,
  pageConfig: {
    source: 'local',              // ← 声明式配置
    localPrefix: '/pages-config',
    pageComponent: DynamicPage,   // ← 指定页面容器
    homePath: '/home'
  },
  plugins: [ElementPlus, VXETable, formCreate]
})

// ⬇ 流向 L1: spark-app/start.ts
export async function start(options: SparkAppOptions): Promise<void> {
  // 1. 创建 Vue 实例和 Router
  const app = createApp(options.rootComponent)
  const router = createRouter({ history, routes })
  
  // 2. 安装插件
  options.plugins?.forEach(plugin => app.use(plugin))
  
  // 3. 初始化 SPARK 组件系统 (L4-L6)
  if (options.spark?.enabled) {
    const { Spark } = await import('@spark-view/spark-core')
    const manager = Spark.createComponentManager()
    app.use(Spark.createVuePlugin({ manager }))
  }
  
  // 4. 初始化页面配置系统 (L2)
  if (options.pageConfig) {
    const { SparkPageConfig } = await import('@spark-view/spark-page-config')
    
    // 创建配置加载器 ←→ L2
    const configLoader = SparkPageConfig.createConfigLoader({
      source: options.pageConfig.source,
      localPrefix: options.pageConfig.localPrefix
    })
    
    // 创建动态路由器 ←→ L2
    const dynamicRouter = SparkPageConfig.createDynamicRouter({
      router,
      configLoader,
      pageComponent: options.pageConfig.pageComponent // ← DynamicPage.vue
    })
    
    // 注册路由
    await dynamicRouter.registerRoutes()
  }
  
  // 5. 执行 Bootstrap 流程
  await bootstrap({ app, router, config: options.config })
  
  // 6. 挂载应用
  app.mount(options.mountTarget)
}
```

**数据流向**:
```
消费层 main.ts
  │ 配置对象 (SparkAppOptions)
  ▼
L1 SparkApp.start()
  ├─→ 创建 Vue app + router
  ├─→ 初始化 L4-L6 (spark-core)
  ├─→ 初始化 L2 (spark-page-config) ← 重点
  │     ├─ 创建 ConfigLoader
  │     └─ 创建 DynamicRouter
  └─→ 执行 bootstrap()
```

---

### 2️⃣ 页面配置加载流程 (L2: spark-page-config)

**文件**: `packages/spark-page-config/src/loader/index.ts`

```typescript
// L2: PageConfigLoader
export class PageConfigLoader implements ConfigLoader {
  constructor(options: ConfigLoaderOptions) {
    this.options = {
      source: 'local',           // 本地/远程/混合
      localPrefix: '/pages-config',
      apiBaseUrl: '/api',
      enableCache: true
    }
  }
  
  // 加载路由配置
  async loadRoutes(): Promise<ConfigLoadResult<RouteConfig[]>> {
    const cacheKey = 'routes'
    
    // 1. 检查缓存
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)
      if (!this.isCacheExpired(cached)) {
        return { success: true, data: cached.data }
      }
    }
    
    // 2. 尝试远程加载 (hybrid/remote 模式)
    if (this.options.source !== 'local') {
      try {
        const url = `${this.options.apiBaseUrl}/config/routes`
        const response = await fetch(url)
        const data = await response.json()
        
        this.cache.set(cacheKey, { data, timestamp: Date.now() })
        return { success: true, data, source: 'remote' }
      } catch (error) {
        pageLogger.warn('远程加载失败，降级到本地', { error })
      }
    }
    
    // 3. 降级到本地加载
    const localUrl = `${this.options.localPrefix}/routes.json`
    const response = await fetch(localUrl)
    const data = await response.json()
    
    return { success: true, data, source: 'local' }
  }
  
  // 加载页面配置 (rule + data + script)
  async loadPageConfig(pageId: string): Promise<ConfigLoadResult<PageConfig>> {
    const [rule, data, script] = await Promise.all([
      this.fetchRule(pageId),      // rule.json
      this.fetchPageData(pageId),  // pagedata.json
      this.fetchScript(pageId)     // script.js (可选)
    ])
    
    return {
      success: true,
      data: { pageId, rule, data, script }
    }
  }
  
  // 加载 rule.json
  private async fetchRule(pageId: string): Promise<RuleConfig[]> {
    const url = `${this.options.localPrefix}/${pageId}/rule.json`
    const response = await fetch(url)
    return response.json()
  }
  
  // 加载 pagedata.json
  private async fetchPageData(pageId: string): Promise<PageDataConfig> {
    const url = `${this.options.localPrefix}/${pageId}/pagedata.json`
    const response = await fetch(url)
    return response.json()
  }
  
  // 加载 script.js
  private async fetchScript(pageId: string): Promise<PageScriptConfig> {
    const modulePath = `${this.options.localPrefix}/${pageId}/script.js`
    
    try {
      // 动态 import ES 模块
      const module = await import(/* @vite-ignore */ modulePath)
      
      return {
        path: modulePath,
        exports: module.default || module
      }
    } catch (error) {
      pageLogger.error('本地脚本加载失败', { pageId, error })
      throw error
    }
  }
}
```

**数据流向**:
```
HTTP 请求
  │ GET /pages-config/home/rule.json
  │ GET /pages-config/home/pagedata.json
  │ GET /pages-config/home/script.js
  ▼
L2 PageConfigLoader
  ├─ loadRoutes() → RouteConfig[]
  ├─ loadPageConfig(pageId)
  │    ├─ fetchRule() → RuleConfig[]
  │    ├─ fetchPageData() → PageDataConfig
  │    └─ fetchScript() → PageScriptConfig
  │
  └─ 缓存机制
       ├─ 内存缓存 (Map)
       ├─ 过期策略 (cacheExpiry)
       └─ 降级策略 (remote → local)
```

**日志输出 (从用户日志)**:
```javascript
// ✅ 成功流程
[INFO] [Page] ℹ️ 加载配置
[INFO] [Page] ✅ 配置加载成功

// ⚠️ 降级流程
[WARN] [Page] ⚠️ 远程加载失败，降级到本地  ← 你看到的警告
[ERROR] [Page] ❌ 本地脚本加载失败         ← 你看到的错误
```

---

### 3️⃣ 动态路由注册 (L2: spark-page-config)

**文件**: `packages/spark-page-config/src/router/index.ts`

```typescript
// L2: DynamicRouter
export class DynamicRouter {
  constructor(options: DynamicRouterOptions) {
    this.router = options.router         // Vue Router 实例
    this.configLoader = options.configLoader  // PageConfigLoader
    this.pageComponent = options.pageComponent // DynamicPage.vue
  }
  
  async registerRoutes(): Promise<void> {
    // 1. 加载路由配置
    const result = await this.configLoader.loadRoutes()
    
    if (!result.success) {
      throw new Error('路由配置加载失败')
    }
    
    const routes = result.data
    
    // 2. 转换为 Vue Router 格式
    routes.forEach(route => {
      const vueRoute = {
        path: route.path,
        name: route.name,
        component: this.pageComponent,  // ← 统一使用 DynamicPage.vue
        meta: {
          pageId: route.pageId,
          title: route.meta?.title,
          requiresAuth: route.meta?.requiresAuth
        }
      }
      
      // 3. 注册到 Vue Router
      this.router.addRoute(vueRoute)
      
      pageLogger.info('注册动态路由', { path: route.path, pageId: route.pageId })
    })
    
    pageLogger.success('动态路由注册完成', { count: routes.length })
  }
}
```

**数据流向**:
```
L2 ConfigLoader.loadRoutes()
  │ RouteConfig[]
  ▼
L2 DynamicRouter.registerRoutes()
  │ 转换格式
  ▼
Vue Router
  │ addRoute(vueRoute)
  └─→ 所有路由指向同一个组件: DynamicPage.vue
```

**示例配置**:
```json
// /pages-config/routes.json
[
  {
    "path": "/home",
    "name": "home",
    "pageId": "home",
    "meta": { "title": "工作台" }
  },
  {
    "path": "/users",
    "name": "users",
    "pageId": "users",
    "meta": { "title": "用户管理" }
  }
]
```

---

### 4️⃣ 页面渲染流程 (消费层 DynamicPage.vue)

**文件**: `src/views/DynamicPage.vue`

```typescript
// 消费层: DynamicPage.vue
const route = useRoute()
const pageRules = ref<Rule[]>([])
const pageData = reactive<Record<string, unknown>>({})
const formApi = ref<FormCreateAPI | null>(null)
let dataSet: DataSet | null = null

// 页面加载主流程
const loadPageConfig = async () => {
  loading.value = true
  error.value = ''
  
  try {
    // 1. 从路由获取 pageId
    const routePageId = route.meta.pageId || route.name
    pageId.value = routePageId as string
    
    // 2. 使用 L2 ConfigLoader 加载配置
    const result = await SparkPageConfig.loadPageConfig(pageId.value)
    
    if (!result.success) {
      throw new Error(result.error)
    }
    
    const config = result.data
    
    // 3. 设置 rules (表单渲染配置)
    originalRules.value = config.rule as Rule[]
    
    // 4. 设置 pageData (页面数据)
    Object.assign(pageData, config.data)
    
    // 5. 初始化 DataSet (如果有 dataset 配置)
    if (config.data.dataset) {
      initDataSet()
    }
    
    // 6. 加载并执行页面脚本 (script.js)
    if (config.script) {
      await loadAndExecuteScript(config.script)
    }
    
    // 7. 绑定数据到 rules
    pageRules.value = bindDataToRules({
      rules: originalRules.value,
      pageData,
      pageFunctions: pageFunctions.value,
      dataSet,
      formApi: formApi.value
    })
    
    loading.value = false
    
  } catch (err) {
    error.value = String(err)
    loading.value = false
  }
}

// 监听路由变化，重新加载页面
watch(() => route.path, () => {
  loadPageConfig()
}, { immediate: true })
```

**数据流向**:
```
用户访问 /home
  │
  ▼
Vue Router 匹配路由
  │ meta.pageId = 'home'
  ▼
DynamicPage.vue 渲染
  │
  ├─→ 调用 L2 ConfigLoader.loadPageConfig('home')
  │     ├─ rule.json → originalRules
  │     ├─ pagedata.json → pageData
  │     └─ script.js → pageFunctions
  │
  ├─→ 初始化 DataSet (L4: spark-data)
  │     └─ DataSetManager.create(pageData.dataset)
  │
  ├─→ 执行页面脚本
  │     ├─ 注册事件处理器
  │     ├─ 注册 dataLoader
  │     └─ 初始化业务逻辑
  │
  └─→ 绑定数据到 rules
        ├─ 替换占位符 ({{pageData.xxx}})
        ├─ 绑定事件处理器
        └─ 注入 DataSet 监听器
```

---

### 5️⃣ 页面渲染引擎 (L3: spark-renderer)

**文件**: `packages/spark-renderer/src/components/PageRenderer.vue`

> **注意**: 当前项目 **未直接使用** PageRenderer.vue，消费层使用的是自己的 DynamicPage.vue。
> 但 L3 提供的 **composables** 被消费层大量使用。

```typescript
// L3: PageRenderer.vue (标准化渲染流程)
import { useCssScope } from '../composables/useCssScope'
import { useScriptSandbox } from '../composables/useScriptSandbox'
import { usePageDataSet } from '../composables/usePageDataSet'
import { useRuleBinding } from '../composables/useRuleBinding'

export default {
  props: {
    configLoader: { type: Object, required: true },
    pageId: { type: String, required: true }
  },
  
  setup(props) {
    // 1. CSS 隔离
    const { scopedCss, applyCssScope } = useCssScope({
      scopeId: `page-${props.pageId}`
    })
    
    // 2. DataSet 管理
    const { dataSet, initDataSet } = usePageDataSet({
      pageData,
      context: pageContext,
      enableDataSet: true
    })
    
    // 3. 脚本沙箱
    const { executeScript } = useScriptSandbox({
      pageContext,
      pageFunctions
    })
    
    // 4. Rule 绑定
    const { boundRules, rebindRules } = useRuleBinding({
      rules: originalRules,
      pageData,
      dataSet,
      formApi
    })
    
    // 加载流程
    const loadPage = async () => {
      const config = await props.configLoader.loadPageConfig(props.pageId)
      
      Object.assign(pageData, config.data)
      originalRules.value = config.rule
      
      if (config.data.dataset) {
        initDataSet()
      }
      
      if (config.script) {
        await executeScript(config.script)
      }
      
      rebindRules()
    }
    
    return { scopedCss, boundRules, dataSet }
  }
}
```

**Composable 数据流**:

```
┌─ useCssScope ─────────────────────────┐
│ input: css 字符串                      │
│ output: scopedCss (带作用域)           │
│ 功能: 自动添加 [data-page="xxx"] 选择器│
└───────────────────────────────────────┘

┌─ usePageDataSet ──────────────────────┐
│ input: pageData.dataset               │
│ output: dataSet (IDataSet)            │
│ 功能:                                 │
│  - 创建 DataSet 实例                  │
│  - 订阅表数据变化                     │
│  - 同步 UI 选中状态                   │
└───────────────────────────────────────┘

┌─ useScriptSandbox ────────────────────┐
│ input: script.js 模块                 │
│ output: pageFunctions                 │
│ 功能:                                 │
│  - 创建沙箱上下文                     │
│  - 执行页面脚本                       │
│  - 隔离全局作用域                     │
└───────────────────────────────────────┘

┌─ useRuleBinding ──────────────────────┐
│ input: originalRules, pageData        │
│ output: boundRules (绑定后)           │
│ 功能:                                 │
│  - 替换数据占位符                     │
│  - 绑定事件处理器                     │
│  - 注入 DataSet 监听器                │
└───────────────────────────────────────┘
```

---

### 6️⃣ 数据绑定详解 (L3: bindRules)

**文件**: `packages/spark-renderer/src/utils/bindRules.ts`

```typescript
// L3: bindDataToRules
export function bindDataToRules(options: RuleBindingOptions): Rule[] {
  const { rules, pageData, pageFunctions, dataSet, formApi } = options
  
  return rules.map(rule => {
    // 1. 深拷贝 rule (避免修改原始配置)
    const boundRule = JSON.parse(JSON.stringify(rule))
    
    // 2. 替换数据占位符
    replaceDataPlaceholders(boundRule, pageData)
    // 示例: {{ pageData.title }} → "用户管理"
    
    // 3. 绑定事件处理器
    if (rule.on) {
      Object.keys(rule.on).forEach(eventName => {
        const handlerName = rule.on[eventName]
        if (typeof handlerName === 'string') {
          // 从 pageFunctions 查找处理器
          boundRule.on[eventName] = pageFunctions[handlerName]
        }
      })
    }
    
    // 4. 注入 DataSet 事件监听器 (表格组件)
    if (rule.type === 'ElTable' && rule.dataKey && dataSet) {
      injectTableEvents(boundRule, dataSet, formApi)
    }
    
    // 5. 递归处理子 rules
    if (rule.children) {
      boundRule.children = bindDataToRules({
        ...options,
        rules: rule.children
      })
    }
    
    return boundRule
  })
}

// 注入表格事件 (currentChange, selectionChange)
function injectTableEvents(rule: Rule, dataSet: IDataSet, formApi: FormCreateAPI) {
  const tableName = extractTableName(rule.dataKey)
  const contextId = rule.contextId || 'default'
  
  // 监听 currentChange (单选)
  const originalCurrentChange = rule.on?.['currentChange']
  rule.on['currentChange'] = (currentRow: DataRow, oldRow: DataRow) => {
    // 先调用用户处理器
    originalCurrentChange?.(currentRow, oldRow)
    
    // 同步到 DataSet
    const table = dataSet.tables[tableName]
    const context = table?.contexts?.[contextId]
    context?.setCurrentRow?.(currentRow, false) // false = 不触发事件
  }
  
  // 监听 selectionChange (多选)
  const originalSelectionChange = rule.on?.['selectionChange']
  rule.on['selectionChange'] = (selection: DataRow[]) => {
    // 先调用用户处理器
    originalSelectionChange?.(selection)
    
    // 同步到 DataSet
    const table = dataSet.tables[tableName]
    const context = table?.contexts?.[contextId]
    context?.setSelectedRows?.(selection, true) // true = 广播事件
  }
}
```

**数据流向**:
```
原始 rules (RuleConfig[])
  │ [{ type: 'ElInput', props: { value: '{{pageData.username}}' } }]
  ▼
bindDataToRules()
  ├─ 替换占位符
  │   └─ {{pageData.username}} → "admin"
  │
  ├─ 绑定事件
  │   ├─ on: { click: 'handleClick' }
  │   └─→ on: { click: pageFunctions.handleClick }
  │
  ├─ 注入 DataSet 监听器
  │   ├─ currentChange → 同步到 DataSet.currentRow
  │   └─ selectionChange → 同步到 DataSet.selectedRows
  │
  └─ 递归处理 children
  
  ▼
绑定后的 rules (Rule[])
  │ [{ type: 'ElInput', props: { value: 'admin' } }]
  ▼
form-create 渲染
  │ 生成 Vue 组件树
  └─→ 显示在页面
```

---

### 7️⃣ DataSet 数据管理 (L4: spark-data)

**文件**: `packages/spark-data/src/DataSet.ts`

```typescript
// L4: DataSet
export class DataSet implements IDataSet {
  dataSetName: string
  tables: Record<string, IDataTable>
  
  constructor(config: DataSetConfig, dataLoader?: DataLoader) {
    this.dataSetName = config.dataSetName
    this.tables = {}
    
    // 初始化所有表
    Object.entries(config.tables).forEach(([name, tableConfig]) => {
      this.tables[name] = {
        tableName: name,
        columns: tableConfig.columns,
        rows: tableConfig.rows || [],
        contexts: {
          default: {
            currentRow: null,
            selectedRows: [],
            rows: tableConfig.rows || []
          }
        }
      }
    })
  }
  
  // 获取表
  getTable(tableName: string): IDataTable | undefined {
    return this.tables[tableName]
  }
  
  // 设置当前行 (触发 UI 更新)
  setCurrentRow(tableName: string, contextId: string, row: DataRow | null) {
    const context = this.tables[tableName]?.contexts?.[contextId]
    if (context) {
      context.currentRow = row
      this.notifySubscribers(tableName, 'currentRowChange', { row, contextId })
    }
  }
  
  // 设置选中行 (触发 UI 更新)
  setSelectedRows(tableName: string, contextId: string, rows: DataRow[]) {
    const context = this.tables[tableName]?.contexts?.[contextId]
    if (context) {
      context.selectedRows = rows
      this.notifySubscribers(tableName, 'selectedRowsChange', { rows, contextId })
    }
  }
  
  // 订阅数据变化
  subscribe(tableName: string, callback: Function) {
    // 实现发布-订阅模式
  }
}
```

**DataSet 数据流**:
```
┌─ 用户操作 UI ────────────────────────────────┐
│ 点击表格行                                    │
└─────────────────────────────────────────────┘
              │
              ▼
┌─ ElTable 触发事件 ──────────────────────────┐
│ emit('currentChange', row, oldRow)          │
└─────────────────────────────────────────────┘
              │
              ▼
┌─ bindRules 注入的监听器 ────────────────────┐
│ 1. 调用用户处理器 (可选)                    │
│ 2. 同步到 DataSet:                          │
│    dataSet.setCurrentRow(tableName, row)    │
└─────────────────────────────────────────────┘
              │
              ▼
┌─ DataSet 更新状态 ──────────────────────────┐
│ 1. context.currentRow = row                 │
│ 2. 广播事件: notifySubscribers()           │
└─────────────────────────────────────────────┘
              │
              ▼
┌─ 其他订阅者收到通知 ────────────────────────┐
│ - 子表刷新 (依赖父表 currentRow)            │
│ - 详情面板更新                              │
│ - 统计数据重新计算                          │
└─────────────────────────────────────────────┘
```

---

## 完整数据流总览

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 应用启动                                                  │
│    main.ts → SparkApp.start()                               │
│      ├─ 创建 Vue app + router                               │
│      ├─ 初始化 L2 ConfigLoader                              │
│      ├─ 初始化 L2 DynamicRouter                             │
│      └─ 注册动态路由 (所有路由 → DynamicPage.vue)           │
└─────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. 用户访问 /home                                            │
│    Vue Router → DynamicPage.vue                             │
│      └─ route.meta.pageId = 'home'                          │
└─────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. DynamicPage 加载配置                                      │
│    L2 ConfigLoader.loadPageConfig('home')                   │
│      ├─ GET /pages-config/home/rule.json                    │
│      ├─ GET /pages-config/home/pagedata.json                │
│      └─ import('/pages-config/home/script.js')              │
└─────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. 初始化 DataSet                                            │
│    L4 DataSetManager.create(pageData.dataset)               │
│      ├─ 创建 tables                                         │
│      ├─ 创建 contexts (default)                             │
│      └─ 注册 dataLoader                                     │
└─────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. 执行页面脚本                                              │
│    script.js 导出的函数                                      │
│      ├─ onMounted(() => { ... })                            │
│      ├─ registerDataLoader((tableName) => fetch(...))       │
│      └─ registerEventHandlers({ handleClick, handleSubmit })│
└─────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. 绑定数据到 rules                                          │
│    L3 bindDataToRules()                                     │
│      ├─ 替换占位符: {{pageData.xxx}} → 实际值               │
│      ├─ 绑定事件: on.click → pageFunctions.handleClick      │
│      └─ 注入 DataSet 监听器 (currentChange, selectionChange)│
└─────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. 渲染页面                                                  │
│    form-create 渲染 boundRules                              │
│      └─→ 显示页面 UI                                        │
└─────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. 用户交互                                                  │
│    点击按钮、选择行、输入数据...                             │
│      ├─ 触发事件 → pageFunctions                            │
│      ├─ UI 状态变化 → 同步到 DataSet                        │
│      └─ DataSet 变化 → 广播通知订阅者 → UI 更新             │
└─────────────────────────────────────────────────────────────┘
```

---

## 关键问题分析

### 问题 1: ⚠️ 远程加载失败，降级到本地

**根本原因**: 
- main.ts 配置了 `source: 'local'`，但 ConfigLoader 默认是 `'hybrid'` 模式
- 在 hybrid 模式下，会先尝试远程加载，失败后降级到本地

**日志位置**: `packages/spark-page-config/src/loader/index.ts:100`

```typescript
// 尝试远程加载
try {
  const url = `${this.options.apiBaseUrl}/config/routes`
  const response = await fetch(url)
  return { success: true, data, source: 'remote' }
} catch (error) {
  pageLogger.warn('远程加载失败，降级到本地', { error }) // ← 这里
}

// 降级到本地加载
const localUrl = `${this.options.localPrefix}/routes.json`
```

**解决方案**:
1. **配置层修复** (推荐):
   ```typescript
   // main.ts
   pageConfig: {
     source: 'local',  // 明确指定只用本地
     localPrefix: '/pages-config'
   }
   ```

2. **代码层修复**:
   ```typescript
   // PageConfigLoader
   if (this.options.source === 'local') {
     // 直接本地加载，不尝试远程
     return this.fetchLocal()
   }
   ```

---

### 问题 2: ❌ 本地脚本加载失败

**根本原因**: 
- script.js 文件不存在或 import 失败
- Vite 的 glob import 路径匹配问题

**日志位置**: `packages/spark-page-config/src/loader/index.ts:350`

```typescript
private async fetchScript(pageId: string): Promise<PageScriptConfig> {
  const modulePath = `${this.options.localPrefix}/${pageId}/script.js`
  
  try {
    const module = await import(/* @vite-ignore */ modulePath)
    return { path: modulePath, exports: module.default || module }
  } catch (error) {
    pageLogger.error('本地脚本加载失败', { pageId, error }) // ← 这里
    throw error
  }
}
```

**解决方案**:
1. **容错处理** (推荐):
   ```typescript
   async fetchScript(pageId: string): Promise<PageScriptConfig | undefined> {
     try {
       const module = await import(/* @vite-ignore */ modulePath)
       return { path: modulePath, exports: module }
     } catch (error) {
       pageLogger.warn('页面脚本不存在，跳过加载', { pageId })
       return undefined // 不抛出错误
     }
   }
   ```

2. **预检查文件是否存在**:
   ```typescript
   // 先检查文件是否存在
   const exists = await fetch(modulePath, { method: 'HEAD' })
   if (!exists.ok) {
     return undefined
   }
   ```

---

### 问题 3: ⚠️ 页面模块不存在，跳过脚本加载

**根本原因**: 
- DynamicPage.vue 使用 Vite 的 `import.meta.glob` 预加载脚本
- 如果页面没有 script.js，glob 无法匹配

**日志位置**: `src/views/DynamicPage.vue:730`

```typescript
// Vite glob import (编译时预加载)
const pageModules = import.meta.glob('/pages-config/*/script.js', { eager: false })

// 运行时加载
const moduleLoader = pageModules[`/pages-config/${pageId}/script.js`]
if (!moduleLoader) {
  pageLogger.warn('页面模块不存在，跳过脚本加载', { pageId }) // ← 这里
  return
}
```

**解决方案**:
1. **删除 glob import，使用动态 import**:
   ```typescript
   // 替换为动态 import (运行时按需加载)
   const loadScript = async (pageId: string) => {
     try {
       const module = await import(`/pages-config/${pageId}/script.js`)
       return module
     } catch {
       return undefined // 文件不存在，返回 undefined
     }
   }
   ```

2. **保持 glob，但调整日志级别**:
   ```typescript
   if (!moduleLoader) {
     pageLogger.debug('页面无脚本，跳过', { pageId }) // debug 而不是 warn
     return
   }
   ```

---

## 架构优化建议

### 1. 简化消费层，迁移到 PageRenderer.vue

**当前问题**:
- 消费层 DynamicPage.vue 有 942 行代码
- 重复实现了 L3 PageRenderer 的逻辑
- 维护成本高，容易不一致

**优化方案**:
```typescript
// src/views/DynamicPage.vue (简化版)
import { PageRenderer } from '@spark-view/spark-renderer'
import { SparkPageConfig } from '@spark-view/spark-page-config'

const route = useRoute()
const pageId = computed(() => route.meta.pageId as string)
const configLoader = SparkPageConfig.createConfigLoader({
  source: 'local',
  localPrefix: '/pages-config'
})

<template>
  <PageRenderer
    :config-loader="configLoader"
    :page-id="pageId"
  />
</template>
```

**收益**:
- 消费层代码减少 90%
- 逻辑下沉到业务编排层 (L3)
- 更好的可测试性

---

### 2. 统一配置加载策略

**当前问题**:
- 配置分散在 main.ts 和 ConfigLoader
- 默认值不一致

**优化方案**:
```typescript
// packages/spark-page-config/src/defaults.ts
export const DEFAULT_CONFIG = {
  source: 'local' as const,      // 默认本地加载
  localPrefix: '/pages-config',
  enableCache: true,
  cacheExpiry: 5 * 60 * 1000,    // 5分钟
  timeout: 10000                 // 10秒
}

// ConfigLoader 使用
constructor(options: Partial<ConfigLoaderOptions>) {
  this.options = { ...DEFAULT_CONFIG, ...options }
}
```

---

### 3. 脚本加载容错机制

**当前问题**:
- script.js 不存在时抛出错误
- 日志级别不合理 (ERROR → WARN)

**优化方案**:
```typescript
// ConfigLoader.fetchScript()
async fetchScript(pageId: string): Promise<PageScriptConfig | null> {
  try {
    const module = await import(/* @vite-ignore */ modulePath)
    pageLogger.info('页面脚本加载成功', { pageId })
    return { path: modulePath, exports: module }
  } catch (error) {
    // 脚本可选，不存在不是错误
    pageLogger.debug('页面无脚本文件', { pageId })
    return null
  }
}
```

---

### 4. DataSet 事件双向同步

**当前实现**:
- UI → DataSet: 单向同步 ✅
- DataSet → UI: 需要手动调用 `syncSelectedRowsToTable()` ⚠️

**优化方案**:
```typescript
// 自动双向同步
dataSet.subscribe(tableName, (event, data) => {
  if (event === 'selectedRowsChange') {
    syncSelectedRowsToTable(tableName, data.contextId, data.rows, formApi)
  }
})
```

---

## 总结

### 数据流向特点

1. **配置驱动**: 所有页面通过 JSON 配置生成，零代码
2. **分层清晰**: L1→L2→L3→消费层，职责明确
3. **按需加载**: 路由懒加载 + 配置懒加载
4. **双向绑定**: UI ↔ DataSet 自动同步

### 当前警告来源

| 日志 | 位置 | 级别 | 原因 |
|-----|------|-----|------|
| 远程加载失败，降级到本地 | L2 ConfigLoader | WARN | hybrid 模式先尝试远程 |
| 本地脚本加载失败 | L2 ConfigLoader | ERROR | script.js 不存在 |
| 页面模块不存在 | 消费层 DynamicPage | WARN | glob 无法匹配文件 |

### 优化优先级

1. **P0**: 调整日志级别 (ERROR → DEBUG)
2. **P0**: 脚本加载容错 (不抛出错误)
3. **P1**: 简化消费层 (迁移到 PageRenderer)
4. **P2**: 统一配置默认值
5. **P2**: DataSet 双向同步优化
