# SPARK 能力系统工具包

> @spark-view/spark-utils 提供的通用能力系统基础设施

## 核心组件

### 1. CapabilityManager

通用能力管理器，负责能力的注册、查找、连接。

```typescript
import { CapabilityManager, createCapabilityManager } from '@spark-view/spark-utils'

// 创建管理器
const manager = createCapabilityManager()

// 注册提供者
manager.registerProvider(context, provider)

// 查找能力
const provider = manager.getProvider(context, 'selection')

// 连接能力
manager.connectCapability(provider, consumer, context)
```

### 2. EventCapabilityProvider

标准事件能力提供者接口：

```typescript
interface EventCapabilityProvider {
  on(event: string, handler: Function): void
  off(event: string, handler: Function): void
  emit(event: string, ...args: unknown[]): void
  once?(event: string, handler: Function): void
}
```

### 3. createEventCapabilityProvider

便捷工厂函数，创建事件能力提供者：

```typescript
import { createEventCapabilityProvider } from '@spark-view/spark-utils'

const { provider, emitter } = createEventCapabilityProvider('events')

// emitter 是 EventCapabilityProvider 实例
emitter.on('click', () => console.log('Clicked!'))
emitter.emit('click')
emitter.off('click', handler)
emitter.once('load', () => console.log('Loaded!'))

// provider 是标准 CapabilityProvider
manager.registerProvider(context, provider)
```

### 4. createEventCapabilityConsumer

便捷工厂函数，创建事件能力消费者：

```typescript
import { createEventCapabilityConsumer } from '@spark-view/spark-utils'

const consumer = createEventCapabilityConsumer('events', {
  click: (e) => console.log('Clicked:', e),
  change: (value) => console.log('Changed:', value)
})

// 自动连接到提供者
manager.connectCapability(provider, consumer, context)
// → provider.on('click', handlers.click)
// → provider.on('change', handlers.change)
```

### 5. CapabilityConnector

能力连接器接口，支持自定义连接逻辑：

```typescript
interface CapabilityConnector {
  connect(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean
  disconnect(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean
  isConnected(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean
}
```

**内置连接器：**
- `EventCapabilityConnector`: 事件能力连接器
- `DataFlowConnector`: 数据流连接器
- `MethodConnector`: 方法调用连接器

---

## 使用示例

### 完整流程

```typescript
import {
  createCapabilityManager,
  createEventCapabilityProvider,
  createEventCapabilityConsumer,
  EventCapabilityConnector
} from '@spark-view/spark-utils'

// 1. 创建管理器并注册连接器
const manager = createCapabilityManager()
manager.registerConnector('events', new EventCapabilityConnector())

// 2. 提供者创建事件能力
const { provider, emitter } = createEventCapabilityProvider('myEvents')
manager.registerProvider(providerContext, provider)

// 触发事件
emitter.emit('dataLoaded', { count: 100 })

// 3. 消费者监听事件
const consumer = createEventCapabilityConsumer('myEvents', {
  dataLoaded: (data) => {
    console.log('Data loaded:', data)
  }
})

// 4. 自动连接
manager.connectCapability(provider, consumer, consumerContext)
// → 内部调用 EventCapabilityConnector.connect()
// → 自动执行 emitter.on('dataLoaded', handler)
```

---

## SPARK 组件系统集成

### useSpark 封装

SPARK 组件系统封装了这些工具：

```typescript
// packages/spark-component/src/composables/useSparkComponent.ts
import {
  createEventCapabilityProvider,
  createEventCapabilityConsumer
} from '@spark-view/spark-utils'

export function useSpark(config) {
  // ...
  
  function provideEvents(name = 'events') {
    const { provider, emitter } = createEventCapabilityProvider(name)
    manager.registerProvider(context, provider)
    return emitter
  }
  
  function consumeEvents(name, handlers) {
    const consumer = createEventCapabilityConsumer(name, handlers)
    const provider = manager.getProvider(context, name)
    
    if (provider) {
      capabilityManager.connectCapability(provider, consumer, context)
    }
    
    return provider?.implementation
  }
  
  return { provideEvents, consumeEvents, ... }
}
```

### 组件中使用

```vue
<script setup lang="ts">
import { useSpark } from '@spark-view/spark-component'

const { provideEvents, consumeEvents } = useSpark(props.config)

// 提供事件能力（内部使用 createEventCapabilityProvider）
const emitter = provideEvents('events')
emitter.emit('click', data)

// 消费事件能力（内部使用 createEventCapabilityConsumer + 自动连接）
consumeEvents('parentEvents', {
  refresh: () => reload(),
  update: (data) => updateData(data)
})
</script>
```

---

## 自定义连接器

可以扩展 CapabilityConnector 实现自定义连接逻辑：

```typescript
import { CapabilityConnector } from '@spark-view/spark-utils'

class MyCustomConnector implements CapabilityConnector {
  connect(provider, consumer) {
    // 自定义连接逻辑
    const impl = provider.implementation
    consumer.implementation = impl
    return true
  }
  
  disconnect(provider, consumer) {
    consumer.implementation = undefined
    return true
  }
  
  isConnected(provider, consumer) {
    return consumer.implementation !== undefined
  }
}

// 注册到管理器
manager.registerConnector('myCapability', new MyCustomConnector())
```

---

## 最佳实践

### ✅ 推荐做法

1. **使用工具包提供的工厂函数**
   ```typescript
   // ✅ 推荐
   const { provider, emitter } = createEventCapabilityProvider('events')
   
   // ❌ 避免手动构造
   const provider = { name: 'events', implementation: { on, off, emit } }
   ```

2. **利用自动连接机制**
   ```typescript
   // ✅ 推荐 - 自动连接
   const consumer = createEventCapabilityConsumer('events', handlers)
   manager.connectCapability(provider, consumer, context)
   
   // ❌ 避免手动连接
   provider.implementation.on('click', handlers.click)
   ```

3. **使用 useSpark 封装**
   ```typescript
   // ✅ 推荐 - 业务代码
   const { provideEvents, consumeEvents } = useSpark(props.config)
   
   // ❌ 避免直接使用底层 API（除非组件系统开发）
   import { createEventCapabilityProvider } from '@spark-view/spark-utils'
   ```

---

## 类型安全

完整的 TypeScript 类型支持：

```typescript
import type {
  CapabilityProvider,
  CapabilityConsumer,
  EventCapabilityProvider,
  EventCapabilityConsumer,
  CapabilityConnector
} from '@spark-view/spark-utils'

// 自定义能力接口
interface MyCapability {
  getData(): any[]
  refresh(): void
}

// 类型安全的提供者
const provider: CapabilityProvider<any, MyCapability> = {
  name: 'dataSource',
  version: '1.0.0',
  interface: {},
  implementation: {
    getData: () => data,
    refresh: () => load()
  }
}
```

---

## 总结

**@spark-view/spark-utils 提供：**

| 工具 | 用途 | 使用场景 |
|------|------|---------|
| `CapabilityManager` | 管理能力 | 组件系统核心 |
| `createEventCapabilityProvider` | 创建事件提供者 | 组件提供事件 |
| `createEventCapabilityConsumer` | 创建事件消费者 | 组件监听事件 |
| `EventCapabilityConnector` | 事件自动连接 | 自动绑定处理器 |
| `CapabilityConnector` | 自定义连接器 | 扩展能力系统 |

**SPARK 组件系统封装：**

| API | 内部实现 | 业务使用 |
|-----|---------|---------|
| `provideEvents()` | createEventCapabilityProvider | 提供事件 |
| `consumeEvents()` | createEventCapabilityConsumer + 自动连接 | 监听事件 |
| `provide()` | 直接注册到 CapabilityManager | 提供普通能力 |
| `consume()` | 从 CapabilityManager 查找 | 消费普通能力 |

**设计理念：**
- **分层架构**：utils 提供通用基础设施，component 提供业务封装
- **自动化**：连接器自动处理连接/断开逻辑
- **可扩展**：支持自定义连接器和能力类型
- **类型安全**：完整的 TypeScript 类型支持
