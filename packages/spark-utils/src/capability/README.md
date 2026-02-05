# 能力系统（Capability System）

> 位置: `packages/spark-utils/src/capability/`

## 📁 目录结构

```
capability/
├── types.ts              # 核心类型定义
├── CapabilitySystem.ts   # 管理器和连接器实现
├── EventCapability.ts    # 事件能力专用实现
└── index.ts             # 统一导出（命名空间 API）
```

---

## 🎯 核心概念

能力系统基于**三大核心**：

1. **能力树（Capability Tree）** - 通过 `parent` 链构建上下文层级
2. **按名称查找（Find by Name）** - 沿 `parent` 链向上查找（就近原则）
3. **解耦供需（Decouple）** - 供方不关心谁使用，需方不关心谁提供

---

## 📄 文件说明

### types.ts

定义核心接口，保持最小化：

- **Provider** - 能力提供者（name + version + implementation）
- **Consumer** - 能力消费者（capabilityName + implementation）
- **Context** - 上下文（parent + providers）
- **Connector** - 连接器接口（connect/disconnect/isConnected）
- **Manager** - 管理器接口（registerConnector/connectCapability/disconnectCapability）

### CapabilitySystem.ts

实现核心逻辑：

- **CapabilityManager** - 能力管理器，协调提供者和消费者的连接
- **DataFlowConnector** - 数据流连接器，直接传递实现
- **EventConnector** - 事件连接器，连接事件发送和接收
- **MethodConnector** - 方法连接器，选择性连接方法
- **createManager()** - 工厂函数，创建管理器实例

### EventCapability.ts

事件能力的专用实现：

- **EventProvider** - 事件提供者接口（on/off/emit）
- **EventConsumer** - 事件消费者接口（handlers Map）
- **EventConnector** - 事件专用连接器（完整实现）
- **createProvider()** - 创建事件提供者
- **createConsumer()** - 创建事件消费者

### index.ts

统一导出，提供两种使用方式：

1. **命名空间 API**（推荐）
   ```typescript
   import { Capability } from '@spark-view/spark-utils'
   Capability.create()
   Capability.Events.createProvider()
   ```

2. **直接导入**
   ```typescript
   import { Provider, CapabilityManager } from '@spark-view/spark-utils'
   ```

---

## 🚀 快速开始

### 1. 创建管理器

```typescript
import { Capability } from '@spark-view/spark-utils'

const manager = Capability.create()
```

### 2. 注册连接器

```typescript
manager.registerConnector('data', new Capability.DataFlow())
manager.registerConnector('event', new Capability.Event())
manager.registerConnector('method', new Capability.Method())
```

### 3. 创建上下文

```typescript
const context = {
  parent: null,
  providers: new Set()
}
```

### 4. 提供能力

```typescript
const provider: Capability.ProviderType = {
  name: 'myService',
  version: '1.0.0',
  implementation: {
    doSomething: () => 'result'
  }
}
context.providers.add(provider)
```

### 5. 消费能力

```typescript
const consumer: Capability.ConsumerType = {
  capabilityName: 'myService',
  implementation: undefined
}

manager.connectCapability(provider, consumer, context)
const result = consumer.implementation.doSomething()
```

---

## 🔌 内置连接器

### DataFlowConnector

**用途**: 直接传递实现对象

**适用场景**: 服务、API、工具函数

```typescript
const provider = {
  name: 'userService',
  version: '1.0.0',
  implementation: {
    getUser: (id) => ({ id, name: 'User' }),
    updateUser: (user) => Promise.resolve(user)
  }
}

// 连接后 consumer.implementation === provider.implementation
```

### EventConnector

**用途**: 连接事件发送方和接收方

**适用场景**: 组件通信、状态变化通知

```typescript
// 提供方
const { provider, emitter } = Capability.Events.createProvider('events')
emitter.emit('change', data)

// 消费方
const consumer = Capability.Events.createConsumer('events', {
  change: (data) => console.log(data)
})
```

### MethodConnector

**用途**: 选择性连接特定方法

**适用场景**: 只需要部分功能时

```typescript
const provider = {
  name: 'math',
  version: '1.0.0',
  implementation: {
    add: (a, b) => a + b,
    subtract: (a, b) => a - b,
    multiply: (a, b) => a * b
  }
}

const consumer = {
  capabilityName: 'math',
  implementation: {
    add: undefined,      // 只连接 add
    multiply: undefined  // 只连接 multiply
  }
}
```

---

## 📊 能力查找机制

```
Root Context
 ├─ providers: [globalService]
 └─ Parent Context
      ├─ providers: [userService, dataService]
      └─ Child Context
           ├─ providers: [localCache]
           └─ ...

查找 'userService':
1. Child Context.providers? ❌
2. Parent Context.providers? ✅ 找到！

查找 'globalService':
1. Child Context.providers? ❌
2. Parent Context.providers? ❌
3. Root Context.providers? ✅ 找到！
```

**原则**: 从当前层级开始，沿 parent 链向上查找（就近原则）

---

## 🎨 命名空间 API

### Capability 主命名空间

```typescript
Capability.ProviderType<T>    // Provider 类型
Capability.ConsumerType       // Consumer 类型
Capability.ContextType<T>     // Context 类型
Capability.ConnectorType      // Connector 类型
Capability.ManagerType        // Manager 类型

Capability.DataFlow           // DataFlowConnector 类
Capability.Event              // EventConnector 类
Capability.Method             // MethodConnector 类

Capability.create()           // 创建管理器
Capability.ManagerClass       // CapabilityManager 类
```

### Capability.Events 子命名空间

```typescript
Capability.Events.ProviderType     // EventProvider 类型
Capability.Events.ConsumerType     // EventConsumer 类型
Capability.Events.Connector        // EventConnector 类

Capability.Events.createProvider(name)            // 创建事件提供者
Capability.Events.createConsumer(name, handlers)  // 创建事件消费者
```

---

## 🧪 测试

相关测试文件位于 `tests/` 目录：

- `capability-late-binding.test.ts` - 延迟绑定测试
- `provider-listener.test.ts` - 提供者监听器测试
- `dataset-capability-manager.test.ts` - 数据集能力管理器测试

运行测试：
```bash
pnpm test
```

---

## 📖 文档资源

- [完整 API 文档](../../CAPABILITY_SYSTEM_API.md) - 详细的 API 说明和示例
- [快速参考](../../CAPABILITY_QUICK_REF.md) - 快速查阅常用 API
- [架构文档](../../../../docs/SPARK_ARCHITECTURE.md) - 整体架构设计

---

## 🔄 设计原则

1. **最小接口** - 类型定义保持最简，只包含必要字段
2. **单一职责** - 每个连接器专注一种连接方式
3. **开放扩展** - 支持自定义连接器
4. **类型安全** - 完整的 TypeScript 类型支持
5. **易于调试** - 内置日志输出

---

## ⚙️ 扩展性

### 自定义连接器

```typescript
import { Connector, Provider, Consumer } from '@spark-view/spark-utils'

class MyConnector implements Connector {
  connect(provider: Provider, consumer: Consumer): boolean {
    // 自定义连接逻辑
    consumer.implementation = transform(provider.implementation)
    return true
  }

  disconnect(provider: Provider, consumer: Consumer): boolean {
    consumer.implementation = undefined
    return true
  }

  isConnected(provider: Provider, consumer: Consumer): boolean {
    return consumer.implementation !== undefined
  }
}

// 注册使用
manager.registerConnector('custom', new MyConnector())
```

---

## 📝 代码规范

### 命名规范

- **能力名称**: 使用 `kebab-case`（如 `user-service`, `data-source`）
- **版本号**: 使用语义化版本（如 `1.0.0`, `2.1.3`）
- **类型**: 使用 PascalCase（如 `Provider`, `Consumer`）
- **函数**: 使用 camelCase（如 `createProvider`, `connectCapability`）

### 注释规范

- 使用中文注释说明核心逻辑
- 对外 API 提供详细的 JSDoc
- 复杂算法添加行内注释

---

## 🚀 性能考虑

- **Set 存储**: `providers` 使用 Set 提高查找性能
- **Map 缓存**: 连接器使用 Map 缓存连接状态
- **惰性连接**: 只在需要时建立连接
- **及时清理**: 断开连接时清理缓存

---

## 🔧 调试技巧

### 启用日志

```typescript
import { Logger } from '@spark-view/spark-utils'
Logger.setLevel('debug')
```

### 检查能力树

```typescript
function printTree(ctx, level = 0) {
  console.log(' '.repeat(level * 2) + 'Context:')
  ctx.providers.forEach(p => {
    console.log(' '.repeat(level * 2 + 2) + `- ${p.name} v${p.version}`)
  })
  if (ctx.parent) printTree(ctx.parent, level + 1)
}
```

### 验证连接

```typescript
const connector = manager.getConnector('data')
console.log(connector?.isConnected(provider, consumer))
```

---

## 🎓 最佳实践

1. ✅ 使用 `Capability` 命名空间 API（清晰、统一）
2. ✅ 为能力定义 TypeScript 接口（类型安全）
3. ✅ 合理组织上下文树（反映组件层级）
4. ✅ 及时断开不再使用的连接（释放资源）
5. ✅ 使用日志跟踪能力连接状态（便于调试）
6. ❌ 避免循环依赖（检查 parent 链）
7. ❌ 避免重复注册同名能力（可能导致混淆）

---

## 📮 反馈

如有问题或建议，请提交 Issue 或 PR！
