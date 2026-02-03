# 能力系统现状与优化方案

## 📊 当前状态

### ✅ 已实现的核心功能

#### 1. **三层架构中的能力系统位置**

```
L1: AppContext (应用层)
    └─ 提供全局能力（认证、配置、主题等）
    
L2: PageContext (页面层)  
    └─ 提供页面级能力（数据集、表单、路由等）
    
L3: ComponentContext (组件层)
    └─ 能力系统核心（Capability System）
        ├─ Provider（能力提供者）
        ├─ Consumer（能力消费者）
        └─ Connector（连接器）
```

#### 2. **能力连接器类型**

| 连接器 | 用途 | 示例 |
|--------|------|------|
| `DataFlowConnector` | 数据流订阅 | Grid 数据源 → Column 消费 |
| `EventConnector` | 事件监听 | Grid 事件 → 外部监听器 |
| `MethodConnector` | 方法调用 | ColumnManager → Column |

#### 3. **能力管理器功能**

- ✅ 自动连接（auto-connect）
- ✅ 延迟绑定（late-binding）
- ✅ 能力查找（provider lookup）
- ✅ 上下文传播（context chain）
- ✅ 生命周期管理（disconnect on destroy）

---

## 🔍 当前问题分析

### ⚠️ 问题 1：能力系统与事件系统的关系不清晰

**现状**：
- 能力系统有 `EventConnector`
- 事件系统有独立的 `EventEmitter`
- 两者功能重叠，职责不明

**影响**：
- 开发者不知道该用哪个
- 代码重复，维护成本高

### ⚠️ 问题 2：三层架构中能力系统的应用范围模糊

**现状**：
- 能力系统主要在 L3（组件层）使用
- L1（应用层）和 L2（页面层）没有明确的能力定义

**影响**：
- 跨层交互不统一
- 无法复用能力系统的优势

### ⚠️ 问题 3：能力系统缺少可观测性

**现状**：
- 只有基础日志
- 无法追踪能力连接状态
- 调试困难

**影响**：
- 问题排查困难
- 无法监控能力使用情况

---

## 🎯 优化方案

### 方案 A：整合能力系统与事件系统（推荐）

#### 设计思路

```typescript
// 事件系统作为能力系统的一种能力类型
interface EventCapability {
  name: 'events'
  version: '1.0.0'
  implementation: EventEmitter
}

// 组件提供事件能力
provide('events', componentEventEmitter)

// 消费者订阅事件
const events = consume('events') as EventEmitter
events.on('rowClick', handler)
```

#### 优势
- ✅ 统一接口，概念清晰
- ✅ 复用能力系统的连接/断开机制
- ✅ 自动生命周期管理
- ✅ 支持跨层事件传播

---

### 方案 B：扩展能力系统到三层架构

#### 1. **应用层能力（AppCapability）**

```typescript
// packages/spark-app/src/capabilities/AppCapabilities.ts

export interface AppCapabilities {
  // 认证能力
  auth: {
    login(credentials: Credentials): Promise<User>
    logout(): Promise<void>
    getCurrentUser(): User | null
  }
  
  // 配置能力
  config: {
    get(key: string): unknown
    set(key: string, value: unknown): void
  }
  
  // 主题能力
  theme: {
    setTheme(name: string): void
    getTheme(): string
  }
  
  // 路由能力
  router: {
    push(path: string): void
    replace(path: string): void
    go(delta: number): void
  }
}

// AppContext 提供这些能力
class AppContext {
  constructor() {
    this.provide('auth', authService)
    this.provide('config', configService)
    this.provide('theme', themeService)
    this.provide('router', routerService)
  }
}
```

#### 2. **页面层能力（PageCapability）**

```typescript
// packages/spark-renderer/src/capabilities/PageCapabilities.ts

export interface PageCapabilities {
  // 数据集能力
  dataSet: {
    getTable(name: string): DataTable
    createTable(config: TableConfig): DataTable
    refresh(): Promise<void>
  }
  
  // 表单能力
  form: {
    getValues(): FormData
    setValues(data: FormData): void
    validate(): Promise<ValidationResult>
    submit(): Promise<void>
  }
  
  // 页面状态能力
  pageState: {
    get(key: string): unknown
    set(key: string, value: unknown): void
  }
}

// PageContext 提供这些能力
class PageContext {
  constructor(appContext: AppContext) {
    this.parent = appContext
    this.provide('dataSet', dataSetManager)
    this.provide('form', formManager)
    this.provide('pageState', stateManager)
  }
}
```

#### 3. **组件层能力（ComponentCapability）**

```typescript
// packages/spark-component/src/capabilities/ComponentCapabilities.ts

export interface GridCapabilities {
  // Grid 提供的能力
  gridInstance: {
    refresh(): void
    clearSelection(): void
  }
  
  dataSource: {
    getData(): Array<unknown>
    setData(data: Array<unknown>): void
  }
  
  columnManager: {
    addColumn(config: ColumnConfig): void
    removeColumn(id: string): void
  }
}

export interface ColumnCapabilities {
  // Column 提供的能力
  columnConfig: {
    getField(): string
    getHeaderText(): string
  }
}
```

---

### 方案 C：添加能力系统可观测性

#### 1. **能力追踪器**

```typescript
// packages/spark-component/src/utils/CapabilityTracker.ts

export class CapabilityTracker {
  private connections = new Map<string, ConnectionInfo>()
  
  trackConnection(
    provider: CapabilityProvider,
    consumer: CapabilityConsumer,
    context: ComponentContext
  ) {
    const id = `${context.id}:${provider.name}`
    this.connections.set(id, {
      provider,
      consumer,
      context,
      connectedAt: Date.now(),
      status: 'connected'
    })
  }
  
  getConnectionStatus(): ConnectionStatus[] {
    return Array.from(this.connections.values())
  }
  
  getCapabilityUsage(): CapabilityUsageReport {
    // 统计能力使用情况
  }
}
```

#### 2. **能力调试工具**

```typescript
// packages/spark-component/src/devtools/CapabilityDebugger.ts

export class CapabilityDebugger {
  // 可视化能力连接图
  visualizeConnections(): string {
    // 返回 DOT 格式的图
  }
  
  // 检测能力问题
  diagnose(context: ComponentContext): DiagnosticResult[] {
    const issues: DiagnosticResult[] = []
    
    // 检查未连接的消费者
    for (const consumer of context.consumers.values()) {
      if (!this.isConnected(consumer)) {
        issues.push({
          severity: 'warning',
          message: `Consumer '${consumer.capabilityName}' not connected`
        })
      }
    }
    
    return issues
  }
}
```

---

## 🚀 实施步骤

### 阶段 1：整合事件系统与能力系统（优先级：高）

1. ✅ 将 `EventEmitter` 作为一种能力类型
2. ✅ 创建 `EventCapabilityConnector`
3. ✅ 更新文档和示例

### 阶段 2：扩展到三层架构（优先级：中）

1. ✅ 定义 `AppCapabilities` 接口
2. ✅ 定义 `PageCapabilities` 接口
3. ✅ 在各层实现能力提供
4. ✅ 更新 `useSparkComponent` 支持跨层能力查找

### 阶段 3：添加可观测性（优先级：中）

1. ✅ 实现 `CapabilityTracker`
2. ✅ 实现 `CapabilityDebugger`
3. ✅ 创建 DevTools 面板

---

## 📝 使用示例

### 示例 1：组件消费应用层能力

```typescript
// Grid 组件消费应用层的认证能力
import { useSparkComponent } from '@spark-view/spark-component'

export default {
  setup(props) {
    const { getInheritedProvider } = useSparkComponent(props.config)
    
    // 从父级（可能是 AppContext）获取认证能力
    const auth = getInheritedProvider<AppCapabilities['auth']>('auth')
    
    onMounted(() => {
      const user = auth?.getCurrentUser()
      if (!user) {
        // 根据权限控制显示
      }
    })
  }
}
```

### 示例 2：页面层提供数据集能力

```typescript
// PageRenderer 提供数据集能力给子组件
import { useSparkComponent } from '@spark-view/spark-component'
import { createDataSet } from '@spark-view/spark-data'

export default {
  setup() {
    const { provide } = useSparkComponent(config)
    
    const dataSet = createDataSet({
      dataSetName: 'PageData',
      tables: { Users: { /* ... */ } }
    })
    
    // 提供数据集能力
    provide('dataSet', {
      getTable: (name) => dataSet.getTable(name),
      refresh: () => dataSet.refresh()
    })
  }
}
```

### 示例 3：组件消费页面层能力

```typescript
// Grid 消费页面的数据集能力
export default {
  setup(props) {
    const { consume } = useSparkComponent(props.config)
    
    // 消费 dataSet 能力
    const dataSet = consume('dataSet')
    
    const users = computed(() => {
      return dataSet?.getTable('Users')?.rows || []
    })
  }
}
```

---

## 🎯 总结

### 当前能力系统的优势
- ✅ 解耦设计（Provider/Consumer 模式）
- ✅ 延迟绑定（late-binding）
- ✅ 自动连接（auto-connect）
- ✅ 上下文传播（context chain）

### 需要优化的方向
- ⚠️ 与事件系统整合
- ⚠️ 扩展到三层架构
- ⚠️ 添加可观测性
- ⚠️ 改进文档和示例

### 推荐优先级
1. **高优先级**：整合事件系统与能力系统
2. **中优先级**：扩展到三层架构
3. **中优先级**：添加可观测性工具
