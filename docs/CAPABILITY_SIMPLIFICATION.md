# 能力系统简化方案

## 🎯 核心问题

当前设计过于复杂，引入了太多概念：
- `Provider<T>` / `StrictProvider<T>` / `TypedProvider<T>`
- `Consumer` / `Connector` / `Manager`  
- `ExtractImplementation<P>` 等工具类型
- 各种 create 函数、类型守卫、访问器

**用户反馈：能力不外乎3种**
1. **字面量** - 简单值（少用）
2. **方法** - 函数集合
3. **事件** - on/off/emit

其他都是上下文内部的实现细节，通过这种方式实现解耦。

## 🔍 当前架构分析

### 对外 API (useSparkComponent)
```typescript
// 组件开发者使用的 API
const { provide, consume, use, whenAvailable } = useSparkComponent(config)

// 提供能力 - 只需要名称和实现
provide('columnManager', {
  addColumn: (col) => { ... },
  removeColumn: (id) => { ... }
})

// 消费能力 - 只需要名称
const manager = consume('columnManager')
manager?.addColumn({ ... })
```

### 内部实现（当前复杂度）
```typescript
// types.ts - 7种类型
Provider<T> 
StrictProvider<T>
TypedProvider<T>
Consumer
Context<T>
Connector
Manager

// typeUtils.ts - 11个工具函数
createTypedProvider()
createStrictProvider()
hasImplementation()
getImplementation()
assertImplementation()
// ... 等等

// EventCapability.ts - 事件专用
EventProvider
EventConsumer
EventConnector
```

## ✅ 简化建议

### 方案 A：**隐藏内部类型，暴露简单接口**

#### 1. 对外 API 保持极简

```typescript
// packages/spark-component/src/types/simple-capability.ts

/**
 * 能力实现 - 3种类型
 */
export type CapabilityImpl =
  | any                          // 字面量（少用）
  | Record<string, Function>     // 方法集
  | EventEmitter                 // 事件

/**
 * 上下文 API（组件开发者使用）
 */
export interface CapabilityContext {
  // 提供能力
  provide(name: string, impl: CapabilityImpl): void
  
  // 消费能力
  consume(name: string): CapabilityImpl | null
  use(name: string): CapabilityImpl | null  // 别名
  
  // 等待能力就绪
  whenAvailable(name: string): Promise<CapabilityImpl>
  
  // 提供事件（快捷方式）
  provideEvents(name?: string): EventEmitter
  
  // 消费事件（快捷方式）
  consumeEvents(name: string, handlers: Record<string, Function>): EventEmitter | null
}
```

#### 2. 内部保留完整类型（不导出）

```typescript
// packages/spark-utils/src/capability/internal-types.ts

/**
 * 内部使用的精确类型（不导出）
 */
interface InternalProvider<T = unknown> {
  name: string
  version: string
  implementation?: T
}

interface InternalConsumer {
  capabilityName: string
  implementation?: unknown
}

// Context 内部使用这些类型
interface InternalContext {
  parent?: InternalContext | null
  providers: Set<InternalProvider>
  consumers: Map<string, InternalConsumer>
}
```

#### 3. 事件系统专用接口

```typescript
// packages/spark-utils/src/capability/event-system.ts

/**
 * 事件发射器（对外接口）
 */
export interface EventEmitter {
  on(event: string, handler: (...args: any[]) => void): void
  off(event: string, handler: (...args: any[]) => void): void
  emit(event: string, ...args: any[]): void
}

/**
 * 创建事件发射器（内部实现）
 */
export function createEventEmitter(name: string): EventEmitter {
  const listeners = new Map<string, Set<Function>>()
  
  return {
    on: (event, handler) => {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(handler)
    },
    off: (event, handler) => {
      listeners.get(event)?.delete(handler)
    },
    emit: (event, ...args) => {
      listeners.get(event)?.forEach(h => h(...args))
    }
  }
}
```

### 方案 B：**移除类型工具层**

删除以下文件/导出：
- ❌ `packages/spark-utils/src/capability/typeUtils.ts` (126行)
- ❌ `StrictProvider<T>` / `TypedProvider<T>` 
- ❌ `ExtractImplementation<P>` 等工具类型
- ❌ `createTypedProvider()` / `hasImplementation()` 等11个工具函数
- ❌ `Capability.Utils` 命名空间

保留：
- ✅ `Provider<T>` (内部使用，不导出)
- ✅ `Consumer` (内部使用，不导出)
- ✅ `Context<T>` (内部使用)
- ✅ `CapabilityManager` (核心逻辑)
- ✅ `EventCapability` 系统

### 方案 C：**合并 Provider/Consumer 概念**

**当前问题：** Provider 和 Consumer 概念分离，增加理解成本

**简化思路：** 统一为 "Capability Registration"

```typescript
// 内部只有一个概念：能力注册
interface CapabilityRegistration {
  name: string               // 能力名称
  implementation: unknown    // 实现（可以是任何东西）
  version: string            // 版本
  context: Context           // 所属上下文
}

// 上下文维护能力注册表
interface Context {
  parent?: Context
  capabilities: Map<string, CapabilityRegistration>  // 合并 providers + consumers
}

// 查找逻辑简化
function getCapability(ctx: Context, name: string): unknown | null {
  // 当前上下文查找
  const cap = ctx.capabilities.get(name)
  if (cap?.implementation) return cap.implementation
  
  // 向上查找
  return ctx.parent ? getCapability(ctx.parent, name) : null
}
```

## 🎯 推荐方案：**方案 A + B**

### 1. 对外暴露极简 API

```typescript
// @spark-view/spark-component
export interface ComponentHelpers {
  // 能力系统（只暴露4个方法）
  provide(name: string, impl: any): void
  consume(name: string): any | null
  whenAvailable(name: string): Promise<any>
  provideEvents(name?: string): EventEmitter
}
```

### 2. 内部保留必要结构

```typescript
// @spark-view/spark-utils (internal)
interface Provider<T> { name: string; version: string; implementation?: T }
interface Consumer { capabilityName: string; implementation?: unknown }
class CapabilityManager { /* 完整逻辑 */ }
```

### 3. 移除过度设计

- ❌ 删除 `typeUtils.ts`
- ❌ 删除 `StrictProvider` / `TypedProvider`
- ❌ 删除类型提取工具
- ❌ 删除 `Capability.Utils` 命名空间
- ❌ 删除 `TYPE_SAFE_PROVIDERS.md` 文档

### 4. 文档重构

```markdown
# 能力系统使用指南

## 核心概念

能力系统让组件通过**名称**解耦通信，有3种能力类型：

1. **方法** - 最常用
2. **事件** - on/off/emit
3. **值** - 简单数据

## API

### provide(name, implementation)
提供能力给子组件使用

### consume(name)  
消费父组件提供的能力

### whenAvailable(name)
等待能力就绪（延迟绑定）

### provideEvents(name?)
快捷创建事件发射器

## 示例

// Grid 提供 columnManager
provide('columnManager', {
  addColumn: (col) => { ... },
  removeColumn: (id) => { ... }
})

// Column 消费 columnManager
const manager = consume('columnManager')
manager?.addColumn({ field: 'name' })

// 事件
const emitter = provideEvents('events')
emitter.emit('rowClick', row)
```

## 🚀 迁移路径

### Phase 1: 标记废弃（当前版本）
```typescript
/** @deprecated 内部类型，不建议直接使用 */
export type StrictProvider<T> = ...

/** @deprecated 使用 provide() 代替 */
export function createTypedProvider<T>(...) { ... }
```

### Phase 2: 移除导出（下个版本）
```typescript
// index.ts - 只导出核心类型
export type { Provider, Consumer, Context, Manager } from './types.js'
export { CapabilityManager, createManager } from './CapabilitySystem.js'
export type { EventEmitter } from './EventCapability.js'

// ❌ 不再导出 StrictProvider, TypedProvider, typeUtils 等
```

### Phase 3: 清理代码（未来版本）
- 删除 `typeUtils.ts`
- 精简 `types.ts`
- 更新所有文档

## 📊 对比

### 当前（复杂）
```typescript
import { createTypedProvider, hasImplementation } from '@spark-view/spark-utils'

const provider = createTypedProvider('service', '1.0.0', {
  getData: () => [1, 2, 3]
})

if (hasImplementation(provider)) {
  provider.implementation.getData()
}
```

### 简化后
```typescript
const { provide, consume } = useSparkComponent(config)

provide('service', {
  getData: () => [1, 2, 3]
})

const service = consume('service')
service?.getData()
```

## ✅ 结论

**核心原则：**
1. 对外接口极简 - 只暴露 `provide/consume/whenAvailable/provideEvents`
2. 内部实现完整 - 保留 Provider/Consumer/Manager 用于系统实现
3. 类型推断简化 - 移除显式类型参数，依赖 TypeScript 自动推断
4. 文档聚焦使用 - 不暴露内部设计细节

**好处：**
- 🎯 降低学习成本 - 4个 API vs 20+ 类型/函数
- 🚀 提升开发效率 - 不需要理解 Provider/Consumer/Connector 概念
- 🔧 保持灵活性 - 内部仍保留完整能力系统
- 📦 减少打包体积 - 移除不必要的工具函数
