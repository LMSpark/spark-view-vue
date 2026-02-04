# SPARK 双向事件系统设计

## 🎯 设计原则

### 核心理念
**事件是双向的**：
1. **向下广播（Broadcast Down）**：上层状态变化通知下层
2. **向上冒泡（Bubble Up）**：下层用户交互通知上层

### 类比 DOM 事件模型
```
捕获阶段（Capture）    冒泡阶段（Bubble）
     ↓                      ↑
  window                 window
     ↓                      ↑
  document              document
     ↓                      ↑
   <div>                  <div>
     ↓                      ↑
  <button>  ← 事件触发 →  <button>
```

SPARK 三层事件流：
```
向下广播（状态变化）      向上冒泡（用户交互）
     ↓                         ↑
  AppContext              AppContext
  (user:login)           (track:event)
     ↓                         ↑
  PageContext             PageContext
  (data:refresh)          (form:submit)
     ↓                         ↑
  ComponentContext        ComponentContext
  (props:update)          (button:click)
```

---

## 📐 架构设计

### L1: 应用层事件总线（全局单例）

```typescript
// 应用层既能向下广播，也能接收来自页面的冒泡事件

interface AppEvents {
  // === 向下广播（Broadcast） ===
  'user:login': (user: UserInfo) => void          // 用户登录 → 通知所有页面
  'user:logout': () => void                       // 用户登出 → 清空页面数据
  'config:updated': (config: unknown) => void     // 配置更新 → 页面重新加载
  'theme:changed': (theme: string) => void        // 主题切换 → 页面重新渲染
  
  // === 接收冒泡（From Pages） ===
  'page:error': (pageId: string, error: Error) => void     // 页面错误 → 全局错误处理
  'page:navigation': (from: string, to: string) => void    // 页面导航 → 记录访问轨迹
  'track:event': (event: string, data: unknown) => void    // 埋点事件 → 发送到分析服务
  'api:error': (api: string, error: Error) => void         // API 错误 → 全局监控
}

// 使用示例
import { appEventBus } from '@spark-view/spark-app'

// 应用层向下广播
appEventBus.emit('user:login', currentUser)

// 应用层监听来自页面的冒泡
appEventBus.on('page:error', (pageId, error) => {
  errorMonitor.report(error, { pageId })
})
```

### L2: 页面层事件总线（每页面独立实例）

```typescript
// 页面层是中间层，既监听应用事件，又向应用层冒泡事件

interface PageEvents {
  // === 向下广播（Broadcast to Components） ===
  'data:loaded': (tableName: string) => void      // 数据加载完成 → 通知组件刷新
  'data:refresh': (tableName: string) => void     // 数据刷新 → 强制组件重新渲染
  'form:reset': () => void                        // 表单重置 → 组件清空状态
  
  // === 接收冒泡（From Components） ===
  'form:submit': (formData: unknown) => void      // 表单提交 → 页面保存数据
  'form:validate-error': (errors: unknown) => void // 验证失败 → 页面显示提示
  'grid:selection': (rows: unknown[]) => void     // 表格选择 → 页面更新按钮状态
  
  // === 向上冒泡（Bubble to App） ===
  // 页面可以将重要事件向上冒泡到应用层
}

// 使用示例
const pageEventBus = createPageEventBus(pageId)

// 监听应用层广播
onMounted(() => {
  appEventBus.on('user:login', (user) => {
    // 重新加载页面数据
    pageContext.dataSet.loadTable('orders', { userId: user.id })
    
    // 向下广播给组件
    pageEventBus.emit('data:refresh', 'orders')
  })
})

// 监听组件冒泡
pageEventBus.on('form:submit', async (formData) => {
  try {
    await saveData(formData)
    
    // 向上冒泡到应用层（记录操作日志）
    appEventBus.emit('track:event', 'form:submit', { pageId, formData })
  } catch (error) {
    // 错误向上冒泡
    appEventBus.emit('page:error', pageId, error)
  }
})
```

### L3: 组件层事件（通过能力系统）

```typescript
// 组件层通过能力系统提供事件，主要向上冒泡

interface ComponentEventProvider {
  addEventListener: (event: string, handler: Function) => void
  removeEventListener: (event: string, handler: Function) => void
  emit: (event: string, ...args: unknown[]) => void
}

// === 父组件（Grid）===
const { provide } = useSparkComponent(config)
const eventEmitter = createComponentEventEmitter()

// 提供事件能力给子组件
provide('gridEvents', eventEmitter)

// 监听子组件冒泡的事件
eventEmitter.addEventListener('column:added', (column) => {
  columns.value.push(column)
  
  // 向上冒泡到页面层
  pageEventBus.emit('grid:column-changed', { action: 'add', column })
})

// 处理用户交互，向上冒泡
function handleRowClick(row: DataRow) {
  // 先发射给同级监听者
  eventEmitter.emit('rowClick', row)
  
  // 向上冒泡到页面层
  pageEventBus.emit('grid:selection', [row])
}

// === 子组件（Column）===
const { consume } = useSparkComponent(config)

onMounted(() => {
  const events = consume('gridEvents')
  
  // 向父组件冒泡事件
  events.emit('column:added', {
    field: props.config.field,
    title: props.config.title
  })
})
```

---

## 🔄 完整的双向事件流示例

### 场景 1: 用户登录 → 向下广播

```typescript
// === L1: 应用层 ===
// 用户登录成功，向下广播
async function handleLogin(credentials: LoginCredentials) {
  const user = await authService.login(credentials)
  
  // 更新应用上下文
  appContext.user = user
  
  // 向下广播到所有监听的页面
  appEventBus.emit('user:login', user)
  
  // 记录登录事件
  appEventBus.emit('track:event', 'user:login', { userId: user.id })
}

// === L2: 页面层 ===
// 监听应用层的 user:login 事件
onMounted(() => {
  const unsubscribe = appEventBus.on('user:login', async (user) => {
    // 重新加载页面数据
    await pageContext.dataSet.loadTable('orders', {
      userId: user.id
    })
    
    // 向下广播给组件层
    pageEventBus.emit('data:loaded', 'orders')
  })
  
  onUnmounted(() => unsubscribe())
})

// === L3: 组件层 ===
// 监听页面层的 data:loaded 事件
onMounted(() => {
  const dataSet = use('dataSet')
  
  dataSet.on('data:loaded', (tableName: string) => {
    if (tableName === 'orders') {
      // 刷新表格
      refreshGrid()
    }
  })
})
```

### 场景 2: 表单提交 → 向上冒泡

```typescript
// === L3: 组件层 (Form) ===
// 用户点击提交按钮
async function handleFormSubmit() {
  const formData = formApi.value.formData()
  
  // 向上冒泡到页面层
  pageEventBus.emit('form:submit', formData)
}

// === L2: 页面层 ===
// 监听组件层的 form:submit 事件
pageEventBus.on('form:submit', async (formData) => {
  try {
    // 保存数据
    const result = await pageContext.dataSet.saveRow('users', formData)
    
    // 向下广播保存成功（通知其他组件刷新）
    pageEventBus.emit('data:saved', 'users')
    
    // 向上冒泡到应用层（埋点、日志）
    appEventBus.emit('track:event', 'form:submit:success', {
      pageId: pageContext.pageId,
      tableName: 'users',
      rowId: result.id
    })
    
  } catch (error) {
    // 错误向上冒泡
    appEventBus.emit('page:error', pageContext.pageId, error)
  }
})

// === L1: 应用层 ===
// 监听来自页面的错误事件
appEventBus.on('page:error', (pageId, error) => {
  // 全局错误处理
  errorHandler.handle(error, { pageId })
  
  // 显示通知
  notificationService.error(`页面 ${pageId} 发生错误`)
  
  // 上报到监控平台
  errorMonitor.report(error, { pageId, timestamp: Date.now() })
})

// 监听埋点事件
appEventBus.on('track:event', (eventName, data) => {
  // 发送到分析服务
  analyticsService.track(eventName, {
    ...data,
    userId: appContext.user.id,
    timestamp: Date.now()
  })
})
```

### 场景 3: 组件间协作（同层 + 跨层）

```typescript
// === Grid 组件（父）===
const gridEvents = createComponentEventEmitter()
provide('gridEvents', gridEvents)

// 监听子组件（Column）的事件
gridEvents.addEventListener('column:sort', (field: string, order: string) => {
  // 处理排序
  sortData(field, order)
  
  // 向上冒泡到页面层
  pageEventBus.emit('grid:sorted', { field, order })
})

// === Column 组件（子）===
const events = consume('gridEvents')

function handleHeaderClick() {
  // 向父组件冒泡排序事件
  events.emit('column:sort', props.field, nextSortOrder)
}

// === 页面层监听 Grid 事件 ===
pageEventBus.on('grid:sorted', ({ field, order }) => {
  // 保存排序偏好到用户配置
  saveUserPreference('tableSort', { field, order })
  
  // 向上冒泡到应用层（可选）
  appEventBus.emit('track:event', 'grid:sorted', { field, order })
})

// === 同页面的另一个组件（Statistics）===
pageEventBus.on('grid:sorted', ({ field }) => {
  // 根据排序字段更新统计图表
  updateChart(field)
})
```

---

## 🎨 事件命名约定

### 命名规则

```
[作用域]:[动作]:[状态]

作用域：user, page, data, form, grid, component
动作：  login, submit, load, save, click, change
状态：  success, error, start, complete (可选)
```

### 分类示例

```typescript
// 1. 应用级事件（全局）
'user:login'              // 用户登录
'user:logout'             // 用户登出
'config:updated'          // 配置更新
'theme:changed'           // 主题切换
'error:global'            // 全局错误

// 2. 页面级事件（页面内）
'page:mounted'            // 页面挂载
'page:destroyed'          // 页面销毁
'data:loaded'             // 数据加载完成
'data:refresh'            // 刷新数据
'form:submit'             // 表单提交
'form:reset'              // 表单重置

// 3. 组件级事件（组件树内）
'grid:rowClick'           // 表格行点击
'grid:selection'          // 表格选择变化
'column:added'            // 列添加
'column:sort'             // 列排序
'button:click'            // 按钮点击

// 4. 埋点事件（向上冒泡）
'track:event'             // 通用埋点
'track:pageView'          // 页面访问
'track:buttonClick'       // 按钮点击统计
```

---

## 🔍 事件流向决策表

| 场景 | 发起层 | 事件方向 | 示例 |
|------|--------|---------|------|
| 应用状态变化 | L1 应用层 | 向下广播 | user:login → 所有页面刷新数据 |
| 页面数据加载 | L2 页面层 | 向下广播 | data:loaded → 所有组件刷新 |
| 用户交互操作 | L3 组件层 | 向上冒泡 | button:click → 页面处理 → 应用记录 |
| 表单提交 | L3 组件层 | 向上冒泡 | form:submit → 页面保存 → 应用埋点 |
| 错误处理 | 任何层 | 向上冒泡 | error:* → 层层上报 → 应用层统一处理 |
| 组件间协作 | L3 组件层 | 同层传递 | grid:rowClick → 同页面其他组件响应 |

---

## 🛡️ 最佳实践

### 1. 避免循环事件

❌ **错误示例**：
```typescript
// 应用层监听页面事件，又发射页面会监听的事件
appEventBus.on('page:loaded', (pageId) => {
  appEventBus.emit('user:login', user)  // ❌ 可能导致循环
})
```

✅ **正确做法**：
```typescript
// 使用不同的事件名，明确事件流向
appEventBus.on('page:request-user', (pageId) => {
  appEventBus.emit('app:user-response', user)  // ✅ 明确的请求-响应模式
})
```

### 2. 事件应该携带足够的上下文

❌ **不好**：
```typescript
pageEventBus.emit('data:saved')  // 缺少上下文
```

✅ **推荐**：
```typescript
pageEventBus.emit('data:saved', {
  tableName: 'users',
  rowId: 123,
  action: 'update',
  timestamp: Date.now()
})
```

### 3. 及时取消监听

✅ **推荐**：
```typescript
onMounted(() => {
  const unsubscribe = appEventBus.on('user:login', handler)
  
  onUnmounted(() => {
    unsubscribe()  // 清理监听器，避免内存泄漏
  })
})
```

### 4. 使用 TypeScript 类型安全

```typescript
// 定义事件接口
interface AppEvents {
  'user:login': (user: UserInfo) => void
  'page:error': (pageId: string, error: Error) => void
}

// 类型安全的事件发射
function emitAppEvent<K extends keyof AppEvents>(
  event: K,
  ...args: Parameters<AppEvents[K]>
): void {
  appEventBus.emit(event, ...args)
}

// 使用时会有类型检查和自动补全
emitAppEvent('user:login', currentUser)  // ✅ 类型正确
emitAppEvent('user:login', 'invalid')    // ❌ 编译错误
```

---

## 📊 完整的事件流向图

```
┌─────────────────────────────────────────────────────────┐
│                    L1: AppContext                        │
│  ┌─────────────┐              ┌──────────────┐          │
│  │ Emit Down   │              │ Listen Up    │          │
│  │ user:login  │              │ page:error   │          │
│  │ config:*    │              │ track:event  │          │
│  └──────┬──────┘              └──────▲───────┘          │
└─────────┼─────────────────────────────┼──────────────────┘
          │ ⬇ Broadcast                │ ⬆ Bubble
┌─────────┼─────────────────────────────┼──────────────────┐
│         ▼                             │                   │
│  ┌─────────────┐              ┌──────┴───────┐          │
│  │ Listen Down │              │ Emit Up      │          │
│  │ user:login  │              │ form:submit  │          │
│  └──────┬──────┘              └──────▲───────┘          │
│         │                             │                   │
│  ┌──────▼──────┐              ┌──────┴───────┐          │
│  │ Emit Down   │              │ Listen Up    │          │
│  │ data:loaded │              │ grid:*       │          │
│  └──────┬──────┘              └──────▲───────┘          │
│         │    L2: PageContext          │                  │
└─────────┼─────────────────────────────┼──────────────────┘
          │ ⬇ Broadcast                │ ⬆ Bubble
┌─────────┼─────────────────────────────┼──────────────────┐
│         ▼                             │                   │
│  ┌─────────────┐              ┌──────┴───────┐          │
│  │ Listen Down │              │ Emit Up      │          │
│  │ data:loaded │              │ rowClick     │          │
│  └──────┬──────┘              └──────▲───────┘          │
│         │                             │                   │
│         ▼                             │                   │
│   [Update Props]              [User Interaction]         │
│         │    L3: ComponentContext     │                  │
└─────────┴─────────────────────────────┴──────────────────┘
```

---

## ✅ 总结

### 双向事件的核心价值

1. **向下广播**：状态变化自动通知所有下层
   - 用户登录 → 所有页面刷新
   - 配置更新 → 所有组件重新渲染
   - 主题切换 → 全局样式更新

2. **向上冒泡**：用户交互层层上报
   - 按钮点击 → 表单提交 → 数据保存 → 埋点上报
   - 表格选择 → 页面状态更新 → 全局统计
   - 错误发生 → 页面捕获 → 应用处理 → 监控上报

3. **解耦和扩展**：
   - 上层不需要知道下层细节
   - 下层不需要知道上层实现
   - 新增功能只需监听现有事件

### 实现要点

- ✅ 每层都有独立的事件总线
- ✅ 事件命名清晰（作用域:动作:状态）
- ✅ 提供 TypeScript 类型安全
- ✅ 及时清理监听器（防止内存泄漏）
- ✅ 携带足够的事件上下文
- ✅ 避免循环事件

---

**设计精髓**：向下广播状态变化，向上冒泡用户交互，层间解耦通信，系统灵活扩展。
