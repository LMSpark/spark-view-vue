# Spark Core — API 文档

> 版本：基于最新简化后的 SPARK 组件系统（2026-01-31）

## 目录

1. [概述](#概述)
2. [核心概念](#核心概念)
3. [快速开始](#快速开始)
4. [API 参考](#api-参考)
   - [Spark 命名空间](#spark-命名空间)
   - [组件配置](#组件配置)
   - [组件管理器](#组件管理器)
   - [组件注册表](#组件注册表)
   - [能力系统](#能力系统)
   - [组合式函数](#组合式函数)
   - [日志系统](#日志系统)
   - [Vue 集成](#vue-集成)
   - [工厂函数](#工厂函数)
5. [使用示例](#使用示例)
6. [迁移指南](#迁移指南)

---

## 概述

`@spark-view/spark-core` 是 SPARK 组件系统的核心包，提供组件注册、管理、能力系统、依赖注入和日志等功能。系统经过简化，采用统一的 API 设计，支持 Vue 3 应用。

主要特性：
- **统一注册 API**：智能处理多种组件输入类型
- **能力系统**：提供者-消费者模式，支持延迟绑定
- **依赖注入优先**：通过 Vue 插件进行安全注入
- **类型安全**：完整的 TypeScript 支持
- **轻量可测试**：适合不同运行时环境

---

## 核心概念

### 组件系统
SPARK 将组件分为**逻辑组件**和**实际组件**：
- **逻辑组件**：只有配置，无实际 Vue 组件，用于组织结构
- **实际组件**：包含 Vue 组件实现，可直接渲染

### 能力系统 (Capability System)
基于提供者-消费者模式的依赖注入系统：
- **提供者 (Provider)**：提供具体实现
- **消费者 (Consumer)**：声明依赖，支持延迟绑定
- **延迟绑定**：消费者可在提供者注册前声明依赖

### 组件上下文
每个组件实例有独立的上下文，包含：
- 组件配置和状态
- 能力提供者和消费者
- 父子关系
- 生命周期管理

---

## 快速开始

### 安装

```bash
# 在仓库内
pnpm add @spark-view/spark-core
```

### 基本使用

```ts
import { Spark } from '@spark-view/spark-core'
import { createApp } from 'vue'

// 1. 创建管理器实例
const manager = Spark.manager()
const registry = Spark.registry()

// 2. 注册组件
Spark.register({
  type: 'my-button',
  name: 'My Button',
  version: '1.0.0',
  component: MyButtonComponent
})

// 3. 在 Vue 应用中安装
const app = createApp(App)
Spark.install(app, { manager })

// 4. 在组件中使用
import { useSparkComponent } from '@spark-view/spark-core'

export default {
  setup() {
    const { provide, consume } = useSparkComponent({ type: 'my-button' })
    // 使用能力系统
  }
}
```

---

## API 参考

### Spark 命名空间

主要的 API 入口点，提供统一的操作接口。

#### 注册方法

```ts
Spark.register(input: ComponentConfig | ComponentConfig[] | VueComponentWithMeta): void
```
智能注册方法，支持：
- 单个 `ComponentConfig` 对象
- `ComponentConfig` 数组
- 带 `spark` 元数据的 Vue 组件

```ts
Spark.registerLogical(config: ComponentConfig): void
```
注册逻辑组件（无实际 Vue 组件）。

#### 管理器访问

```ts
Spark.manager(): ComponentManager
Spark.capabilities(): CapabilityManager
Spark.registry(): ComponentRegistry
```

#### 组件操作

```ts
Spark.getSparkComponent(type: string): Component | undefined
Spark.render(config: ComponentConfig): ComponentInstance
```

#### 工具方法

```ts
Spark.Logger(context?: any): LoggerApi
Spark.useComponent(config: ComponentConfig, parent?: ComponentContext)
Spark.useSparkComponent(config: ComponentConfig, opts?: UseSparkOptions)
Spark.defineComponent: typeof defineSparkComponent
```

#### Vue 集成

```ts
Spark.createVuePlugin(opts: { manager: ComponentManager, registry?: ComponentRegistry }): Plugin
Spark.install(app: App, opts: { manager?: ComponentManager, registry?: ComponentRegistry }): void
```

#### 插件系统

```ts
Spark.installSparkPlugin(plugin: Plugin): void
Spark.getSparkPlugin(name: string): Plugin | undefined
```

#### 工厂函数

```ts
Spark.createComponentRegistry(): ComponentRegistry
Spark.createComponentManager(registry?: ComponentRegistry): ComponentManager
```

---

### 组件配置

统一的组件配置接口：

```ts
interface ComponentConfig {
  type: string                    // 必需：组件类型标识
  name?: string                   // 可选：显示名称
  version?: string               // 可选：版本号
  component?: Component          // 可选：Vue 组件
  providers?: CapabilityProvider[] // 可选：提供的能力
  validator?: (config: any) => boolean // 可选：配置验证器
  // 其他自定义属性...
}
```

---

### 组件管理器

负责组件的生命周期、上下文管理和渲染。

```ts
interface ComponentManager {
  registerComponent(config: ComponentConfig): void
  createContext(config: ComponentConfig, parent?: ComponentContext): ComponentContext
  render(config: ComponentConfig, parentContext?: ComponentContext): any
  destroyContext(id: string): boolean
  getContext(id: string): ComponentContext | undefined
  registerProvider(context: ComponentContext, provider: CapabilityProvider): void
  getProvider(context: ComponentContext, name: string): any
}
```

---

### 组件注册表

存储和查询组件定义。

```ts
interface ComponentRegistry {
  register(type: string, config: ComponentConfig): void
  get(type: string): ComponentConfig | undefined
  has(type: string): boolean
  getAllTypes(): string[]
  getAllDefinitions(): ComponentConfig[]
  unregister(type: string): boolean
  clear(): void
}
```

---

### 能力系统

#### 提供者

```ts
interface CapabilityProvider {
  name: string
  version?: string
  interface?: CapabilityInterface
  implementation?: Implementation
}
```

#### 消费者

```ts
interface CapabilityConsumer {
  capabilityName: string
  interface?: CapabilityInterface
  implementation?: Implementation
  minVersion?: string
  onProvide?: (provider: CapabilityProvider) => void
}
```

#### 管理器

```ts
interface CapabilityManager {
  connectCapability(provider: CapabilityProvider, consumer: CapabilityConsumer, context: ComponentContext): void
  disconnectCapability(consumer: CapabilityConsumer, context: ComponentContext): void
  autoConnectCapabilities(context: ComponentContext): void
}
```

---

### 组合式函数

在 Vue 组件 setup 中使用的 hook：

```ts
function useSparkComponent(
  config: ComponentConfig,
  options?: {
    manager?: ComponentManager
    registry?: ComponentRegistry
    parentContext?: ComponentContext
  }
): {
  context: ComponentContext
  provide: (name: string, implementation: any) => void
  consume: (name: string) => any
  whenAvailable: (name: string) => Promise<any>
  logger: LoggerApi
  // ... 其他工具方法
}
```

---

### 日志系统

统一的日志 API：

```ts
interface LoggerApi {
  debug: (...args: any[]) => void
  info: (...args: any[]) => void
  warn: (...args: any[]) => void
  error: (...args: any[]) => void
}
```

---

### Vue 集成

通过插件进行依赖注入：

```ts
// 创建插件
const plugin = Spark.createVuePlugin({ manager, registry })
app.use(plugin)

// 或直接安装
Spark.install(app, { manager })
```

---

### 工厂函数

创建实例的工厂函数：

```ts
function createComponentRegistry(): ComponentRegistry
function createComponentManager(registry?: ComponentRegistry): ComponentManager
```

---

## 使用示例

### 注册组件

```ts
// 注册实际组件
Spark.register({
  type: 'spark-button',
  name: 'Spark Button',
  version: '1.0.0',
  component: SparkButton,
  providers: [{
    name: 'button-api',
    implementation: { click: () => console.log('clicked') }
  }]
})

// 注册逻辑组件
Spark.registerLogical({
  type: 'layout-container',
  name: 'Layout Container'
})

// 注册 Vue 组件（带元数据）
const MyComponent = {
  spark: {
    type: 'my-component',
    name: 'My Component',
    providers: [{ name: 'my-api' }]
  },
  // Vue 组件定义...
}
Spark.register(MyComponent)
```

### 在组件中使用

```ts
<template>
  <div>
    <button @click="handleClick">Click me</button>
  </div>
</template>

<script setup lang="ts">
import { useSparkComponent } from '@spark-view/spark-core'

const { provide, consume, whenAvailable } = useSparkComponent({
  type: 'spark-button'
})

// 提供能力
provide('button-api', {
  click: () => console.log('Button clicked')
})

// 消费能力
const gridApi = consume('grid-api')

// 等待能力可用
await whenAvailable('grid-api')
</script>
```

### 能力系统示例

```ts
// 提供者组件
const { provide } = useSparkComponent({ type: 'data-provider' })
provide('data-service', {
  fetchData: async () => { /* ... */ }
})

// 消费者组件
const { consume } = useSparkComponent({ type: 'data-consumer' })
const dataService = consume('data-service')
// 如果提供者还未注册，dataService 为 null
// 系统会自动连接当提供者注册时
```

---

## 迁移指南

### 从旧版迁移

1. **注册 API 简化**
   ```ts
   // 旧
   Spark.registerSparkComponent(config)
   Spark.registerFromComponent(component)

   // 新
   Spark.register(config)  // 智能处理
   ```

2. **移除的 API**
   - `SparkComponentDefinition` → 使用 `ComponentConfig`
   - `renderTree` → 使用 `render`
   - `SparkComponentMeta` → 内联到 `ComponentConfig`

3. **依赖注入强化**
   ```ts
   // 旧：可能使用全局单例
   Spark.install(app)

   // 新：必须显式提供管理器
   Spark.install(app, { manager })
   ```

4. **工厂函数**
   ```ts
   // 旧：直接导入单例
   import { componentManager } from '@spark-view/spark-core'

   // 新：使用工厂或 Spark 访问器
   const manager = Spark.createComponentManager()
   // 或
   const manager = Spark.manager()
   ```

### 最佳实践

- 总是通过 `Spark.install()` 提供管理器实例
- 使用 `useSparkComponent` 在组件中访问上下文
- 优先使用能力系统而非直接导入
- 为组件定义提供验证器确保配置正确

---

*本文档基于 SPARK 组件系统的最新实现。如有问题，请参考源码或测试用例。*