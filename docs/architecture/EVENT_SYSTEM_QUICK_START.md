# SPARK 三层上下文与事件系统 - 实现指南

## 📌 核心理念

根据你的架构设计：

1. **三层上下文**：应用层（AppContext）→ 页面层（PageContext）→ 组件层（ComponentContext）
2. **上层不知道下层**：通过契约（接口/事件）通信
3. **能力继承**：下层通过 provide/inject 继承上层能力
4. **事件驱动**：上层提供事件，下层实现/监听

## 🎯 已实现的基础设施

### ✅ L1: 应用层 (spark-app)
- [x] `AppContext` 接口和实现  
- [x] `createAppContext` / `provideAppContext` / `useAppContext`
- [x] `APP_CONTEXT_KEY` 符号
- [x] 权限检查 (`hasPermission`)
- [x] 应用事件接口定义 (`AppEvents`)
- [ ] 应用事件总线 (AppEventBus) - 待集成 EventEmitter

### ✅ L2: 页面层 (spark-renderer)
- [x] `PageContext` 接口
- [x] `PageRenderer` 组件
- [x] CSS 隔离 (`useCssScope`)
- [x] 脚本沙箱 (`createSandbox`)
- [x] DataSet 集成 (`usePageDataSet`)
- [x] Rule 绑定 (`useRuleBinding`)
- [x] 页面事件接口定义 (`PageEvents`)
- [ ] 页面事件总线 (PageEventBus) - 待集成 EventEmitter

### ✅ L3: 组件层 (spark-component)
- [x] `ComponentContext` 接口
- [x] `useSparkComponent` composable
- [x] 能力系统 (`CapabilitySystem`)
- [x] 三种连接器 (Method, Event, DataFlow)
- [x] 后期绑定 (`whenAvailable`)
- [x] 组件树管理 (parent/children)
- [x] 组件事件接口 (`ComponentEventProvider`)
- [x] 组件事件发射器 (`createComponentEventEmitter`)

### ⚠️ 待完善：EventEmitter 基类

**位置**：`packages/spark-utils/src/eventEmitter.ts` ✅ 已创建

**状态**：已实现但未正确集成到其他包（TypeScript 路径解析问题）

**临时方案**：
- 可以在各层复制 EventEmitter 实现
- 或者使用现有的 DataSet 中的事件系统（已有 `on`/`off`/`emit`）

## 📋 快速开始指南

### 1. 使用现有能力系统（推荐，无需等待 EventEmitter 集成）

#### 组件层事件通信（已可用）

```typescript
// === 父组件（Grid）提供事件能力 ===
import { createComponentEventEmitter } from '@spark-view/spark-component'

const { provide } = useSparkComponent(config)

// 创建事件发射器
const eventEmitter = createComponentEventEmitter('Grid')

// 提供事件能力
provide('gridEvents', eventEmitter)

// 发射事件
function handleRowClick(row: DataRow) {
  eventEmitter.emit('rowClick', row)
}

// === 子组件（Column）消费事件 ===
const { consume } = useSparkComponent(config)

onMounted(() => {
  const events = consume('gridEvents')
  
  if (events) {
    events.addEventListener('rowClick', (row) => {
      console.log('Row clicked:', row)
    })
  }
})
```

### 2. 页面层事件通信（使用 DataSet 事件系统）

```typescript
// PageRenderer.vue
import { SparkData } from '@spark-view/spark-data'

const pageDataSet = SparkData.createDataSet({ ... })

// 发布事件
pageDataSet.emit('data:loaded', { tableName: 'users', rows: data })

// 监听事件
pageDataSet.on('data:loaded', (eventData) => {
  console.log('Data loaded:', eventData)
})

// 页面间通信（通过 AppContext）
const appContext = useAppContext()

// 在 pageData 中存储回调
pageContext.$data._emitPageEvent = (event, data) => {
  // 向上通知应用层
  console.log('Page event:', event, data)
}
```

### 3. 应用层事件通信（简化版）

```typescript
// === 创建简单的应用事件总线 ===
// packages/spark-app/src/events/simpleEventBus.ts

type EventHandler = (...args: any[]) => void

class SimpleEventBus {
  private listeners = new Map<string, Set<EventHandler>>()
  
  on(event: string, handler: EventHandler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler)
  }
  
  emit(event: string, ...args: any[]) {
    this.listeners.get(event)?.forEach(h => h(...args))
  }
  
  off(event: string, handler: EventHandler) {
    this.listeners.get(event)?.delete(handler)
  }
}

export const appEventBus = new SimpleEventBus()

// === 使用 ===
import { appEventBus } from '@spark-view/spark-app'

// 发布事件
appEventBus.emit('user:login', currentUser)

// 监听事件
appEventBus.on('user:login', (user) => {
  console.log('User logged in:', user)
})
```

## 🔄 完整的三层通信流程示例

```typescript
// === L1: 应用层 ===
// 用户登录成功
import { appEventBus } from '@spark-view/spark-app'

async function handleLogin(credentials) {
  const user = await authService.login(credentials)
  appEventBus.emit('user:login', user)  // 向下广播
}

// === L2: 页面层 ===
// PageRenderer.vue
import { useAppContext } from '@spark-view/spark-app'
import { createPageEventBus } from '@spark-view/spark-renderer'

const appContext = useAppContext()
const pageEventBus = createPageEventBus(pageId)

onMounted(() => {
  // 监听应用事件
  appEventBus.on('user:login', async (user) => {
    // 重新加载页面数据
    await pageContext.dataSet.loadTable('orders', { userId: user.id })
    
    // 向下通知组件
    pageEventBus.emit('data:loaded', 'orders')
  })
})

// === L3: 组件层 ===
// SparkEJ2Grid.vue
const { use } = useSparkComponent(config)

onMounted(() => {
  const dataSet = use('dataSet')  // 从页面消费 DataSet
  
  // 监听页面事件（通过 DataSet）
  dataSet.on('data:loaded', (tableName) => {
    if (tableName === 'orders') {
      refreshGrid()  // 刷新表格
    }
  })
})
```

## 🛠️ 下一步行动

### 优先级 1: 简化实现（本周）
- [ ] 在 spark-app 中创建简化的 EventBus（不依赖 spark-utils）
- [ ] 在 PageRenderer 中集成简化的 EventBus
- [ ] 完善 Grid + Column 示例，演示能力系统
- [ ] 编写三层通信完整示例

### 优先级 2: 完善文档（下周）
- [ ] 三层上下文使用指南
- [ ] 事件命名约定
- [ ] 最佳实践文档

### 优先级 3: 工具支持（未来）
- [ ] 事件流追踪工具
- [ ] 能力可视化工具
- [ ] 架构验证脚本

## 📚 参考文档

- [三层上下文架构设计](./THREE_LAYER_CONTEXT.md) - 完整的架构设计文档
- [SPARK 架构](../SPARK_ARCHITECTURE.md) - 整体架构说明
- [依赖规则](../DEPENDENCY_RULES.md) - 层间依赖约束

## 💡 设计原则总结

1. **上层定义契约，下层实现契约**
   - 应用层定义 `AppEvents` 接口
   - 页面层定义 `PageEvents` 接口
   - 组件层定义 `ComponentEventProvider` 接口

2. **能力向下传递，事件向上冒泡**
   - 通过 `provide/inject` 传递能力
   - 通过 `emit/on` 通知事件

3. **隔离优于共享**
   - 页面级数据隔离（独立 DataSet）
   - 页面级样式隔离（CSS scoped）
   - 页面级脚本隔离（沙箱执行）

4. **显式优于隐式**
   - 明确的事件命名（user:login, data:loaded）
   - 明确的能力名称（columnManager, dataSet）
   - 明确的依赖注入（inject 符号键）

---

**设计者备注**：这是一个渐进式的架构，可以先使用现有的能力系统和 DataSet 事件系统，待 EventEmitter 正确集成后再迁移到统一的事件基础设施。
