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
    const { provide, consume, use } = useSparkComponent({ type: 'my-button' })
    // 使用能力系统 - consume 和 use 是相同的功能
    const capability1 = consume('some-capability')
    const capability2 = use('some-capability') // 更直观的别名
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

#### useSparkComponent

SPARK组件的核心组合式函数，用于在Vue组件中集成SPARK能力系统、上下文管理和生命周期。

```ts
function useSparkComponent<TConfig extends ComponentConfig = ComponentConfig>(
  config: TConfig,
  options?: {
    manager?: ComponentManager
    registry?: ComponentRegistry
    parentContext?: ComponentContext
  }
): SparkComponentHelpers
```

##### 参数

- **config** (`ComponentConfig`): 组件配置对象
  - `type` (string, required): 组件类型标识符，使用kebab-case命名
  - `id` (string, optional): 组件实例唯一ID，自动生成如果未提供
  - `name` (string, optional): 组件显示名称
  - `version` (string, optional): 组件版本，默认为'1.0.0'
  - `children` (ComponentConfig[], optional): 子组件配置
  - `props` (Record<string, any>, optional): 组件属性

- **options** (object, optional): 配置选项
  - `manager` (ComponentManager, optional): 指定组件管理器，默认通过DI注入获取
  - `registry` (ComponentRegistry, optional): 指定组件注册表，默认通过DI注入获取
  - `parentContext` (ComponentContext, optional): 父组件上下文，用于建立组件树关系

##### 返回值 (SparkComponentHelpers)

```ts
interface SparkComponentHelpers {
  // 上下文和状态
  context: ComponentContext          // 当前组件上下文对象
  isVisible: boolean                 // 组件可见性状态
  isDisabled: boolean                // 组件禁用状态

  // 能力系统
  provide: (name: string, implementation?: any) => void
  consume: (name: string) => any | null
  use: (name: string) => any | null     // consume的别名，更直观的命名
  whenAvailable: (name: string) => Promise<CapabilityProvider>
  getProvider: (name: string) => CapabilityProvider | undefined
  getInheritedProvider: <T = unknown>(name: string) => T | undefined

  // 组件系统
  getComponent: (type: string) => any
  isComponentRegistered: (type: string) => boolean

  // 工具方法
  logger: LoggerApi
  getOrCreateNoopProvider: (name: string) => CapabilityProvider
  connectCapability: (provider: CapabilityProvider, consumer: CapabilityConsumer, ctx: ComponentContext) => void
  disconnectCapability: (provider: CapabilityProvider, consumer: CapabilityConsumer, ctx: ComponentContext) => void
}
```

##### 方法详细说明

###### 上下文和状态

- **context**: 当前组件的完整上下文对象，包含组件树关系、能力提供者和消费者等信息
- **isVisible**: 基于配置的`visible`属性计算的响应式可见性状态
- **isDisabled**: 基于配置的`disabled`属性计算的响应式禁用状态

###### 能力系统方法

- **provide(name, implementation?)**: 提供一个能力给子组件或兄弟组件使用
  - `name`: 能力名称
  - `implementation`: 能力实现对象，可选

- **consume(name)**: 消费（使用）一个能力，如果能力不可用返回null
  - `name`: 要消费的能力名称
  - 返回: 能力实现对象或null

- **use(name)**: `consume`方法的别名，提供更直观的API命名
  - 功能与`consume`完全相同，只是命名更友好

- **whenAvailable(name)**: 返回一个Promise，当指定能力变为可用时resolve
  - `name`: 要等待的能力名称
  - 返回: Promise<CapabilityProvider>

- **getProvider(name)**: 获取当前上下文中指定能力的提供者
- **getInheritedProvider<T>(name)**: 从组件树中向上查找指定能力的提供者

###### 组件系统方法

- **getComponent(type)**: 从注册表获取指定类型的组件定义
- **isComponentRegistered(type)**: 检查指定类型的组件是否已注册

###### 工具方法

- **logger**: 结构化日志API，包含debug、info、warn、error方法
- **getOrCreateNoopProvider(name)**: 为测试或可选能力创建空实现提供者

##### 使用示例

###### 基本用法

```ts
<script setup lang="ts">
import { useSparkComponent } from '@spark-view/spark-core'

const props = defineProps<{
  config: { type: string; label?: string }
}>()

// 使用组合式函数
const {
  context,
  provide,
  use,           // 使用更直观的use方法
  whenAvailable,
  logger
} = useSparkComponent(props.config)

// 提供能力
provide('button-api', {
  click: () => logger.info('Button clicked'),
  getLabel: () => props.config.label || 'Button'
})

// 消费能力
const theme = use('theme') || { primaryColor: 'blue' }

// 等待能力可用
const gridApi = await whenAvailable('grid-api')
</script>
```

###### 父子组件通信

```ts
<!-- 父组件 -->
<script setup lang="ts">
import { useSparkComponent } from '@spark-view/spark-core'

const { provide } = useSparkComponent({
  type: 'data-grid',
  children: [{ type: 'data-column', field: 'name' }]
})

// 提供数据能力给子组件
provide('grid-data', {
  rows: [{ name: 'John', age: 30 }],
  sort: (field: string) => { /* ... */ }
})
</script>
```

```ts
<!-- 子组件 -->
<script setup lang="ts">
import { useSparkComponent } from '@spark-view/spark-core'

const { use, context } = useSparkComponent({
  type: 'data-column',
  field: 'name'
}, {
  parentContext: /* 从props传入的父上下文 */
})

// 使用父组件提供的数据能力
const gridData = use('grid-data')
</script>
```

##### 生命周期

`useSparkComponent` 会在组件的 `onMounted` 阶段自动：
1. 初始化组件上下文
2. 注册到组件管理器
3. 建立能力连接

在 `onUnmounted` 阶段自动：
1. 清理上下文
2. 断开能力连接
3. 从管理器注销

##### 注意事项

- 确保在应用入口安装了Spark Vue插件：`app.use(Spark.createVuePlugin({ manager, registry }))`
- 如果不提供manager选项，函数会尝试通过Vue的provide/inject系统获取
- 能力消费是延迟绑定的，如果提供者在消费之后注册，系统会自动建立连接
- 使用`whenAvailable`处理异步能力加载场景

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

const { provide, consume, use, whenAvailable } = useSparkComponent({
  type: 'spark-button'
})

// 提供能力
provide('button-api', {
  click: () => console.log('Button clicked')
})

// 消费能力 (两种方式都可以)
const gridApi1 = consume('grid-api') // 传统方式
const gridApi2 = use('grid-api')     // 更直观的别名

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

// 消费者组件 (两种方式都可以)
const { consume, use } = useSparkComponent({ type: 'data-consumer' })
const dataService1 = consume('data-service') // 传统方式
const dataService2 = use('data-service')     // 更直观的别名
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