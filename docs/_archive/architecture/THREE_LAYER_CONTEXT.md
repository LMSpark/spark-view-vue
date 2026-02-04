# SPARK 三层上下文架构设计

## 📐 架构原则

### 核心理念
1. **上层不知道下层**：上层定义契约（接口/事件），不依赖下层具体实现
2. **能力继承**：下层可继承上层提供的能力（通过 provide/inject）
3. **事件驱动**：层间通过事件通信，上层提供事件，下层实现/监听
4. **上下文隔离**：业务页面层实现完整隔离（CSS、JS、数据）

### 三层结构

```
┌─────────────────────────────────────┐
│   L1: 应用层上下文 (AppContext)      │ ← 全局单例，提供应用级能力
│   - 用户信息、租户、环境配置          │
│   - 全局事件总线、路由、权限          │
└─────────────────────────────────────┘
            ↓ provide 能力
            ↓ emit 事件
┌─────────────────────────────────────┐
│   L2: 页面层上下文 (PageContext)     │ ← 页面级隔离，继承应用能力
│   - 页面配置、DataSet、表单 API       │
│   - CSS 隔离、脚本沙箱               │
│   - 页面级事件总线                   │
└─────────────────────────────────────┘
            ↓ provide 能力
            ↓ emit 事件
┌─────────────────────────────────────┐
│   L3: 组件层上下文 (ComponentContext)│ ← 树状结构，组件级能力
│   - 组件配置、状态、生命周期          │
│   - 能力提供/消费（capability system）│
│   - 组件间事件通信                   │
└─────────────────────────────────────┘
```

---

## 🎯 L1: 应用层上下文 (AppContext)

### 职责
- 提供全局应用状态（用户、租户、环境）
- 提供全局能力（路由、权限、日志、错误处理）
- 发布应用级事件（用户登录、配置更新、全局错误）

### 实现位置
`packages/spark-app/src/context/AppContext.ts`

### 核心 API

```typescript
// 1. 上下文数据
interface AppContext {
  user: UserInfo           // 当前用户
  tenant: TenantInfo       // 租户信息
  env: EnvironmentInfo     // 环境配置
  config: Record<string, unknown>  // 全局配置
}

// 2. 提供能力（通过 provide）
app.provide(APP_CONTEXT_KEY, appContext)
app.provide(APP_ROUTER_KEY, router)
app.provide(APP_PERMISSIONS_KEY, permissionService)

// 3. 发布事件（通过全局事件总线）
interface AppEvents {
  'user:login': (user: UserInfo) => void
  'user:logout': () => void
  'config:updated': (config: Record<string, unknown>) => void
  'error:global': (error: Error) => void
  'route:changed': (route: RouteLocationNormalized) => void
}

// 使用
appEventBus.emit('user:login', currentUser)
```

### 特点
- ✅ **全局单例**：整个应用唯一实例
- ✅ **只向下提供**：不监听下层事件
- ✅ **职责单一**：只管理应用级状态

---

## 🎯 L2: 页面层上下文 (PageContext)

### 职责
- 继承应用层能力（inject AppContext）
- 提供页面级能力（DataSet、表单 API、查询/操作 API）
- 实现页面隔离（CSS scoped、脚本沙箱、独立数据空间）
- 发布页面级事件（数据加载、表单提交、页面生命周期）

### 实现位置
`packages/spark-renderer/src/types/index.ts` (已有)
`packages/spark-renderer/src/components/PageRenderer.vue` (已有)

### 核心 API

```typescript
// 1. 页面上下文接口
interface PageContext {
  // 继承应用能力
  app: AppContext          // inject 应用上下文
  
  // 页面级数据
  $api: FormCreateAPI      // 表单 API
  $route: RouteLocation    // 当前路由
  $data: Record<string, unknown>  // 页面数据
  
  // 页面级能力
  dataSet: DataSet         // 页面独立数据空间
  $el: () => HTMLElement   // 页面容器
  $query: (selector: string) => Element | null
  $queryAll: (selector: string) => NodeListOf<Element>
  
  // 事件总线（页面级）
  $on: (event: string, handler: Function) => void
  $emit: (event: string, ...args: unknown[]) => void
  $off: (event: string, handler?: Function) => void
}

// 2. 页面级事件
interface PageEvents {
  'page:mounted': () => void
  'page:destroyed': () => void
  'data:loaded': (tableName: string, rows: DataRow[]) => void
  'data:changed': (tableName: string, row: DataRow) => void
  'form:submit': (formData: Record<string, unknown>) => void
}

// 3. 沙箱执行（已实现）
const sandbox = createSandbox({
  context: pageContext,
  scripts: pageConfig.script,
  enableIsolation: true
})
```

### 隔离机制

#### CSS 隔离
```typescript
// 已实现：useCssScope.ts
const scopedCss = useCssScope(
  pageConfig.styles,
  pageId,  // 页面唯一 ID
  options
)

// 生成：
// .spark-page[data-page="page-123"] .my-class { ... }
```

#### JS 隔离
```typescript
// 已实现：createSandbox.ts
const sandbox = {
  // 受限全局对象
  window: proxyWindow,    // 代理 window，拦截危险操作
  document: proxyDocument, // 代理 document，限制 DOM 访问
  
  // 页面 API
  $api: pageContext.$api,
  $data: pageContext.$data,
  $route: pageContext.$route,
  
  // 禁止访问
  eval: undefined,        // 禁用 eval
  Function: undefined,    // 禁用 new Function
}
```

#### 数据隔离
```typescript
// 已实现：packages/spark-data
const pageDataSet = SparkData.createDataSet({
  dataSetName: `page-${pageId}`,  // 页面独立命名空间
  tables: { ... },
  relations: [ ... ]
})

// 每个页面有独立的 DataSet 实例
```

### 特点
- ✅ **继承应用能力**：inject AppContext
- ✅ **完整隔离**：CSS、JS、数据独立
- ✅ **双向通信**：
  - 向上：监听应用事件 (`appEventBus.on`)
  - 向下：向组件提供能力 (`provide`)

---

## 🎯 L3: 组件层上下文 (ComponentContext)

### 职责
- 继承页面能力（inject PageContext）
- 提供组件级能力（通过 capability system）
- 实现组件树通信（父子组件事件）
- 管理组件生命周期

### 实现位置
`packages/spark-component/src/types/spark-component.ts` (已有)
`packages/spark-component/src/composables/useSparkComponent.ts` (已有)

### 核心 API

```typescript
// 1. 组件上下文接口（已实现）
interface ComponentContext {
  id: string
  type: string
  parent: ComponentContext | null  // 父组件上下文
  children: ComponentContext[]     // 子组件上下文
  config: ComponentConfig
  state: Record<string, unknown>
  
  // 能力系统
  providers: Set<CapabilityProvider>
  consumers: Map<string, CapabilityConsumer>
}

// 2. 能力提供/消费（已实现）
const { provide, consume, use, whenAvailable } = useSparkComponent(config)

// 提供能力
provide('columnManager', columnManagerImpl)

// 消费能力（从父组件或页面）
const columnManager = consume('columnManager')

// 等待能力可用
await whenAvailable('dataSource')

// 3. 组件事件（通过 capability system）
// 事件提供者（父组件）
provide('gridEvents', {
  addEventListener: (handler) => { ... },
  removeEventListener: (handler) => { ... }
})

// 事件消费者（子组件）
const events = consume('gridEvents')
events.addEventListener('rowClick', (row) => {
  console.log('行点击', row)
})
```

### 能力系统（Capability System）

#### 能力类型
```typescript
// 1. 方法能力（Method Capability）
interface ColumnManager {
  addColumn: (config: ColumnConfig) => void
  removeColumn: (field: string) => void
  getColumns: () => ColumnConfig[]
}

// 2. 事件能力（Event Capability）
interface EventEmitter {
  addEventListener: (event: string, handler: Function) => void
  removeEventListener: (event: string, handler: Function) => void
}

// 3. 数据流能力（DataFlow Capability）
interface DataSource {
  addListener: (callback: (data: unknown) => void) => void
  removeListener: (callback: Function) => void
}
```

#### 连接器（已实现）
```typescript
// packages/spark-component/src/utils/SparkCapabilitySystem.ts

// 方法连接器
class MethodConnector {
  connect(provider, consumer) {
    // 将 provider 的方法绑定到 consumer
    Object.keys(consumer.interface).forEach(key => {
      consumer.implementation[key] = provider.implementation[key].bind(provider)
    })
  }
}

// 事件连接器
class EventConnector {
  connect(provider, consumer) {
    // 连接 addEventListener 和 onEvent
    provider.implementation.addEventListener(consumer.implementation.onEvent)
  }
}

// 数据流连接器
class DataFlowConnector {
  connect(provider, consumer) {
    // 连接 addListener 和 onData
    provider.implementation.addListener(consumer.implementation.onData)
  }
}
```

### 组件树通信

```typescript
// 父组件（Grid）
const { provide } = useSparkComponent({ type: 'spark-ej2-grid', ... })

// 提供能力给子组件
provide('columnManager', {
  addColumn: (config) => { columns.value.push(config) },
  removeColumn: (field) => { ... },
  getColumns: () => columns.value
})

provide('gridEvents', {
  addEventListener: (event, handler) => { ... },
  removeEventListener: (event, handler) => { ... }
})

// 子组件（Column）
const { consume } = useSparkComponent({ type: 'spark-ej2-column', ... })

// 消费父组件能力
onMounted(() => {
  const manager = consume('columnManager')
  manager?.addColumn({ field: 'name', title: '姓名' })
  
  const events = consume('gridEvents')
  events?.addEventListener('rowClick', handleRowClick)
})
```

### 特点
- ✅ **树状结构**：parent/children 关系
- ✅ **能力继承**：子组件可消费父组件/页面/应用的能力
- ✅ **后期绑定**：支持 `whenAvailable` 异步等待
- ✅ **自动连接**：通过 connector 自动完成能力连接

---

## 🔄 层间通信流程

### 场景 1: 用户登录 → 页面数据刷新

```typescript
// === L1: 应用层 ===
// 用户登录成功后发布事件
async function handleLogin(credentials) {
  const user = await authService.login(credentials)
  appContext.user = user
  
  // 发布应用级事件
  appEventBus.emit('user:login', user)
}

// === L2: 页面层 ===
// 页面监听登录事件，刷新数据
onMounted(() => {
  const app = inject(APP_CONTEXT_KEY)
  
  // 监听应用事件
  appEventBus.on('user:login', async (user) => {
    // 重新加载页面数据
    await pageContext.dataSet.loadTable('orders', {
      userId: user.id
    })
    
    // 发布页面级事件
    pageEventBus.emit('data:loaded', 'orders')
  })
})

// === L3: 组件层 ===
// 组件消费页面数据
const { use } = useSparkComponent(config)

onMounted(() => {
  const dataSet = use('dataSet')  // 消费页面提供的 DataSet
  
  // 监听数据变化
  dataSet.on('data:changed', (tableName, row) => {
    if (tableName === 'orders') {
      // 更新组件状态
      refreshGrid()
    }
  })
})
```

### 场景 2: 表单提交 → 数据保存 → 通知刷新

```typescript
// === L3: 组件层（Form） ===
async function handleFormSubmit() {
  const formData = formApi.value.formData()
  
  // 向上发布事件（通过页面事件总线）
  pageEventBus.emit('form:submit', formData)
}

// === L2: 页面层 ===
onMounted(() => {
  // 监听表单提交
  pageEventBus.on('form:submit', async (formData) => {
    try {
      // 保存数据
      await pageContext.dataSet.saveRow('users', formData)
      
      // 通知组件刷新（通过能力系统）
      pageEventBus.emit('data:saved', 'users')
      
      // 向上发布应用事件（可选）
      appEventBus.emit('user:updated', formData)
      
    } catch (error) {
      // 错误向上传递
      appEventBus.emit('error:global', error)
    }
  })
})

// === L3: 组件层（Grid） ===
onMounted(() => {
  // 监听数据保存事件
  pageEventBus.on('data:saved', (tableName) => {
    if (tableName === 'users') {
      // 刷新表格
      gridApi.value.refreshData()
    }
  })
})

// === L1: 应用层 ===
// 全局错误处理
appEventBus.on('error:global', (error) => {
  errorHandler.handle(error)
  notificationService.error(error.message)
})
```

---

## 📊 完整数据流示意图

```
┌─────────────────────────────────────────────────┐
│  L1: AppContext                                 │
│  - provide: APP_CONTEXT_KEY, router, permissions│
│  - emit: user:login, config:updated, error:global│
└─────────────────────────────────────────────────┘
      ↓ inject(APP_CONTEXT_KEY)
      ↓ appEventBus.on('user:login')
┌─────────────────────────────────────────────────┐
│  L2: PageContext (page-123)                     │
│  - inherit: app                                 │
│  - provide: PAGE_CONTEXT_KEY, dataSet, formApi  │
│  - emit: data:loaded, form:submit, data:saved   │
│  - isolate: CSS, JS, Data                       │
└─────────────────────────────────────────────────┘
      ↓ inject(PAGE_CONTEXT_KEY)
      ↓ pageEventBus.on('data:loaded')
┌─────────────────────────────────────────────────┐
│  L3: ComponentContext (spark-ej2-grid)          │
│  - inherit: pageContext                         │
│  - provide: columnManager, gridEvents           │
│  - consume: dataSet, formApi                    │
│  - emit: rowClick, selectionChanged             │
└─────────────────────────────────────────────────┘
      ↓ consume('columnManager')
┌─────────────────────────────────────────────────┐
│  L3: ComponentContext (spark-ej2-column)        │
│  - inherit: parent context                      │
│  - consume: columnManager                       │
└─────────────────────────────────────────────────┘
```

---

## 🛠️ 实现清单

### ✅ 已完成

#### L1: 应用层
- [x] AppContext 接口和实现
- [x] createAppContext / provideAppContext / useAppContext
- [x] APP_CONTEXT_KEY 符号
- [x] 权限检查（hasPermission）

#### L2: 页面层
- [x] PageContext 接口
- [x] PageRenderer 组件
- [x] CSS 隔离（useCssScope）
- [x] 脚本沙箱（createSandbox）
- [x] DataSet 集成（usePageDataSet）
- [x] Rule 绑定（useRuleBinding）

#### L3: 组件层
- [x] ComponentContext 接口
- [x] useSparkComponent composable
- [x] 能力系统（CapabilitySystem）
- [x] 三种连接器（Method, Event, DataFlow）
- [x] 后期绑定（whenAvailable）
- [x] 组件树管理（parent/children）

### ⚠️ 需要增强

#### L1: 应用层事件总线
```typescript
// 📁 packages/spark-app/src/events/AppEventBus.ts (新建)
import { EventEmitter } from '@spark-view/spark-utils'

export interface AppEvents {
  'user:login': (user: UserInfo) => void
  'user:logout': () => void
  'config:updated': (config: Record<string, unknown>) => void
  'error:global': (error: Error) => void
  'route:changed': (route: RouteLocationNormalized) => void
}

class AppEventBus extends EventEmitter<AppEvents> {
  // 类型安全的事件发射
  emit<K extends keyof AppEvents>(
    event: K,
    ...args: Parameters<AppEvents[K]>
  ): void {
    super.emit(event, ...args)
  }
  
  // 类型安全的事件监听
  on<K extends keyof AppEvents>(
    event: K,
    handler: AppEvents[K]
  ): () => void {
    return super.on(event, handler)
  }
}

export const appEventBus = new AppEventBus()
```

#### L2: 页面层事件总线
```typescript
// 📁 packages/spark-renderer/src/events/PageEventBus.ts (新建)
import { EventEmitter } from '@spark-view/spark-utils'

export interface PageEvents {
  'page:mounted': () => void
  'page:destroyed': () => void
  'data:loaded': (tableName: string, rows: DataRow[]) => void
  'data:changed': (tableName: string, row: DataRow) => void
  'data:saved': (tableName: string) => void
  'form:submit': (formData: Record<string, unknown>) => void
}

class PageEventBus extends EventEmitter<PageEvents> {
  // 页面级事件总线，每个页面独立实例
}

export function createPageEventBus(): PageEventBus {
  return new PageEventBus()
}
```

#### PageContext 增强
```typescript
// 📁 packages/spark-renderer/src/types/index.ts
export interface PageContext {
  // ... 现有属性 ...
  
  // 新增：应用上下文引用
  app: AppContext  // inject(APP_CONTEXT_KEY)
  
  // 新增：页面事件总线
  $on: <K extends keyof PageEvents>(event: K, handler: PageEvents[K]) => void
  $emit: <K extends keyof PageEvents>(event: K, ...args: Parameters<PageEvents[K]>) => void
  $off: <K extends keyof PageEvents>(event: K, handler?: PageEvents[K]) => void
}
```

#### L3: 组件事件提供者
```typescript
// 📁 packages/spark-component/src/utils/ComponentEventEmitter.ts (新建)
export interface ComponentEventProvider {
  addEventListener: (event: string, handler: Function) => void
  removeEventListener: (event: string, handler: Function) => void
  emit: (event: string, ...args: unknown[]) => void
}

export function createComponentEventEmitter(): ComponentEventProvider {
  const listeners = new Map<string, Set<Function>>()
  
  return {
    addEventListener(event, handler) {
      if (!listeners.has(event)) {
        listeners.set(event, new Set())
      }
      listeners.get(event)!.add(handler)
    },
    
    removeEventListener(event, handler) {
      listeners.get(event)?.delete(handler)
    },
    
    emit(event, ...args) {
      listeners.get(event)?.forEach(handler => {
        try {
          handler(...args)
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error)
        }
      })
    }
  }
}
```

---

## 📝 使用示例

### 完整示例：Grid + Column 组件

```vue
<!-- SparkEJ2Grid.vue -->
<script setup lang="ts">
import { useSparkComponent } from '@spark-view/spark-component'
import { createComponentEventEmitter } from '@spark-view/spark-component'

const props = defineProps<{ config: ComponentConfig }>()

const { 
  provide, 
  context,
  logger 
} = useSparkComponent(props.config)

// 列管理能力
const columns = ref<ColumnConfig[]>([])
const columnManager = {
  addColumn: (config: ColumnConfig) => {
    columns.value.push(config)
    logger.info('Column added:', config.field)
  },
  removeColumn: (field: string) => {
    const index = columns.value.findIndex(col => col.field === field)
    if (index > -1) {
      columns.value.splice(index, 1)
      logger.info('Column removed:', field)
    }
  },
  getColumns: () => columns.value
}

// 事件能力
const eventEmitter = createComponentEventEmitter()

// 提供能力给子组件
provide('columnManager', columnManager)
provide('gridEvents', eventEmitter)

// 处理行点击
function handleRowClick(row: DataRow) {
  eventEmitter.emit('rowClick', row)
}
</script>
```

```vue
<!-- SparkEJ2Column.vue -->
<script setup lang="ts">
import { useSparkComponent } from '@spark-view/spark-component'

const props = defineProps<{ config: ColumnConfig }>()

const { 
  consume,
  whenAvailable,
  logger 
} = useSparkComponent(props.config)

// 等待父组件的列管理器可用
onMounted(async () => {
  const manager = await whenAvailable('columnManager')
  
  // 向父组件注册列
  manager.addColumn({
    field: props.config.field,
    title: props.config.title,
    width: props.config.width
  })
  
  logger.info('Column registered:', props.config.field)
})

// 监听父组件事件
onMounted(() => {
  const events = consume('gridEvents')
  
  if (events) {
    events.addEventListener('rowClick', (row) => {
      logger.info('Row clicked in column:', row)
    })
  }
})
</script>
```

---

## ✅ 架构优势总结

1. **解耦性**：层间不直接依赖，通过契约（接口/事件）通信
2. **可测试性**：每层可独立测试，可 mock 上层能力
3. **可扩展性**：新增能力只需定义接口，不影响现有代码
4. **隔离性**：页面级完整隔离，避免冲突
5. **类型安全**：TypeScript 接口约束，编译时检查
6. **后期绑定**：组件可异步等待能力，支持动态加载

---

## 🎯 下一步行动

### 阶段 1: 事件系统完善（优先级：高）
- [ ] 创建 `spark-app/src/events/AppEventBus.ts`
- [ ] 创建 `spark-renderer/src/events/PageEventBus.ts`
- [ ] 创建 `spark-component/src/utils/ComponentEventEmitter.ts`
- [ ] 在 PageContext 中集成应用上下文和事件总线
- [ ] 编写事件系统单元测试

### 阶段 2: 示例和文档（优先级：中）
- [ ] 创建完整示例：Grid + Column + Form 联动
- [ ] 编写三层通信流程图
- [ ] 编写最佳实践指南

### 阶段 3: 工具和验证（优先级：低）
- [ ] 创建架构验证工具（检查依赖方向）
- [ ] 创建事件流追踪工具（调试事件传递）
- [ ] 创建能力可视化工具（查看能力树）

---

**设计原则**：上层定义契约，下层实现契约；上层发布事件，下层监听事件；能力向下传递，事件向上冒泡。
