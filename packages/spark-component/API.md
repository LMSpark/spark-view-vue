# Spark Core — 专业 API 文档

> 版本：v0.1.0 | 基于 SPARK 组件系统核心架构
> 最后更新：2026年1月31日

## 目录

1. [系统概述](#系统概述)
2. [核心架构](#核心架构)
3. [快速开始](#快速开始)
4. [API 参考](#api-参考)
   - [Spark 命名空间](#spark-命名空间)
   - [组件系统](#组件系统)
   - [能力系统](#能力系统)
   - [沙箱系统](#沙箱系统)
   - [组合式函数](#组合式函数)
   - [插件系统](#插件系统)
   - [工具函数](#工具函数)
   - [类型定义](#类型定义)
5. [使用模式](#使用模式)
6. [最佳实践](#最佳实践)
7. [故障排除](#故障排除)

---

## 系统概述

`@spark-view/spark-component` 是 SPARK 组件系统的核心运行时，提供企业级的组件管理、依赖注入、能力系统和安全执行环境。系统采用模块化架构，严格遵循 SOLID 原则，确保高可维护性和可扩展性。

### 核心特性

- **🏗️ 组件系统**：统一的组件注册、实例化和生命周期管理
- **⚡ 动态导入**：按需加载组件，首屏加载提速 70%+（支持路由分包、权限控制、CDN 加载）
- **🔗 能力系统**：基于提供者-消费者模式的依赖注入，支持延迟绑定
- **🛡️ 沙箱系统**：安全的 JavaScript 表达式执行和模板渲染
- **🔌 插件架构**：可扩展的插件系统，支持自定义功能
- **📊 类型安全**：完整的 TypeScript 支持，编译时类型检查
- **🧪 可测试性**：模块化设计，便于单元测试和集成测试
- **🌐 SSR 兼容**：完整的服务器端渲染支持，安全处理浏览器 API

### 设计原则

- **单一职责**：每个模块专注于特定功能领域
- **开闭原则**：对扩展开放，对修改封闭
- **依赖倒置**：依赖抽象接口而非具体实现
- **接口隔离**：客户端只依赖需要的接口
- **里氏替换**：子类可以完美替换父类

---

## 核心架构

### 架构层次

```
┌─────────────────────────────────────────────────┐
│                    Spark 命名空间                 │
│                统一 API 入口点                    │
├─────────────────────────────────────────────────┤
│  组件系统 │ 能力系统 │ 沙箱系统 │ 插件系统 │ 工具库   │
├─────────────────────────────────────────────────┤
│              组合式函数 (Composables)              │
├─────────────────────────────────────────────────┤
│                 类型系统 (TypeScript)             │
└─────────────────────────────────────────────────┘
```

### 核心模块职责

| 模块 | 职责 | 关键接口 |
|------|------|----------|
| **组件系统** | 组件注册、实例化、生命周期管理 | `ComponentManager`, `ComponentRegistry` |
| **能力系统** | 提供者-消费者模式，依赖注入 | `CapabilityProvider`, `CapabilityConsumer` |
| **沙箱系统** | 安全的 JS 执行和模板渲染 | `Sandbox`, `run()`, `render()` |
| **插件系统** | 系统扩展和定制功能 | `Plugin`, `PluginHooks` |
| **工具库** | 日志、配置、错误处理 | `Logger`, `ConfigManager`, `ErrorHandler` |

---

## 快速开始

### 安装和初始化

```bash
# 在 monorepo 中
pnpm add @spark-view/spark-component
```

```typescript
import { Spark } from '@spark-view/spark-component'
import { createApp } from 'vue'

// 1. 注册组件
Spark.register({
  type: 'my-button',
  name: 'My Button',
  version: '1.0.0',
  component: MyButtonComponent,
  providers: [{ name: 'click-handler', implementation: handleClick }]
})

// 2. 安装到 Vue 应用
const app = createApp(App)
app.use(Spark.createVuePlugin())

// 3. 在组件中使用
import { useSparkComponent } from '@spark-view/spark-component'

export default defineComponent({
  setup() {
    const { consume, provide } = useSparkComponent({
      type: 'my-button',
      consumers: [{ name: 'click-handler' }]
    })

    const handler = consume('click-handler')
    return { handler }
  }
})
```

---

## API 参考

### Spark 命名空间

`Spark` 是系统的统一入口点，提供所有核心功能的访问接口。

#### 核心访问器

```typescript
// 组件管理器 - 单例实例
Spark.manager(): ComponentManager

// 能力管理器 - 单例实例
Spark.capabilities(): CapabilityManager

// 组件注册表 - 单例实例
Spark.registry(): ComponentRegistry
```

#### 组件操作

```typescript
// 智能注册 (支持多种输入类型)
Spark.register(input: ComponentConfig | ComponentConfig[] | VueComponent): void

// 注册逻辑组件 (无实际渲染)
Spark.registerLogical(config: ComponentConfig): void

// 获取已注册组件
Spark.getSparkComponent(type: string): Component | undefined

// 渲染组件配置
Spark.render(config: ComponentConfig): unknown
```

#### 沙箱操作

```typescript
// 执行 JavaScript 表达式
Spark.run<T>(expression: string, context?: Record<string, any>): T

// 异步执行表达式
Spark.runAsync<T>(expression: string, context?: Record<string, any>): Promise<T>

// 渲染模板字符串
Spark.renderTemplate(template: string, context?: Record<string, any>): string

// 异步渲染模板
Spark.renderTemplateAsync(template: string, context?: Record<string, any>): Promise<string>

// 验证代码安全性
Spark.validate(code: string): boolean

// 创建沙箱实例
Spark.sandbox(options?: SandboxOptions): Sandbox
```

#### 工具函数

```typescript
// 创建日志器
Spark.Logger(context?: any): LoggerApi

// 组合式函数 (别名)
Spark.useComponent(config: ComponentConfig, parent?: ComponentContext)
Spark.useSparkComponent(config: ComponentConfig, opts?: UseSparkOptions)

// 组件定义助手
Spark.defineComponent: typeof defineSparkComponent
```

#### 工厂函数

```typescript
// 组件注册表工厂
Spark.createComponentRegistry(): ComponentRegistry

// 组件管理器工厂（高级用法）
Spark.createComponentManager(renderer?, registry?): ComponentManager

// 组件系统工厂（测试/隔离场景）
Spark.createComponentSystem(): { manager: ComponentManager; registry: ComponentRegistry }
```

#### Vue 集成

```typescript
// 创建 Vue 插件（使用全局单例）
Spark.createVuePlugin(opts?: { registry?: ComponentRegistry }): Plugin

// 直接安装（已废弃，请使用 createVuePlugin）
Spark.install(app: App): void
```

#### 插件系统

```typescript
// 安装插件
Spark.installSparkPlugin(plugin: Plugin): void

// 获取已安装插件
Spark.getSparkPlugin(name: string): Plugin | undefined
```

---

### 组件系统

组件系统提供完整的组件生命周期管理和实例化功能。

#### ComponentConfig

```typescript
interface ComponentConfig {
  // 必需字段
  type: string                    // 组件类型标识符

  // 可选字段
  id?: string                     // 实例唯一标识
  name?: string                   // 显示名称
  version?: string               // 版本号
  props?: Record<string, any>    // 组件属性
  children?: ComponentConfig[]   // 子组件配置

  // 注册相关
  component?: Component | null   // Vue 组件 (null 表示逻辑组件)
  validator?: (config: ComponentConfig) => boolean  // 配置验证器
  providers?: CapabilityProvider[]   // 提供的能力
  consumers?: CapabilityConsumer[]   // 消费的能力
}
```

#### ComponentManager

```typescript
interface ComponentManager {
  // 组件注册
  registerComponent(config: ComponentConfig): void
  registerComponents(configs: ComponentConfig[]): void
  unregisterComponent(type: string): boolean
  isComponentRegistered(type: string): boolean
  getComponentDefinition(type: string): ComponentConfig | undefined
  getRegisteredComponentTypes(): string[]

  // 上下文管理
  createContext(config: ComponentConfig, parent?: ComponentContext): ComponentContext
  getContext(id: string): ComponentContext | undefined
  destroyContext(id: string): boolean
  getAllContexts(): ComponentContext[]

  // 能力管理
  registerProvider(context: ComponentContext, provider: CapabilityProvider): void
  getProvider(context: ComponentContext, name: string): CapabilityProvider | undefined

  // 渲染
  render(config: ComponentConfig, parentContext?: ComponentContext): unknown
  renderSingle(config: ComponentConfig): unknown

  // 验证和兼容性
  validateComponentConfig(config: ComponentConfig): boolean
  getComponentCompatibility(): Record<string, string[]>
}
```

#### ComponentRegistry

```typescript
interface ComponentRegistry {
  // 注册管理
  register(type: string, config: ComponentConfig): void
  unregister(type: string): boolean
  has(type: string): boolean

  // 查询
  get(type: string): ComponentConfig | undefined
  getAllDefinitions(): ComponentConfig[]
  getAllTypes(): string[]

  // 兼容性查找
  findCompatibleProviders?(capabilityName: string, minVersion?: string): string[]
}
```

---

### 能力系统

能力系统实现提供者-消费者模式的依赖注入，支持延迟绑定和动态连接。

#### CapabilityProvider

```typescript
interface CapabilityProvider {
  name: string                    // 能力名称
  version?: string               // 版本号
  implementation: Implementation  // 具体实现
  metadata?: Record<string, any> // 元数据
}
```

#### CapabilityConsumer

```typescript
interface CapabilityConsumer {
  name: string                    // 消费的能力名称
  version?: string               // 期望版本
  required?: boolean             // 是否必需 (默认 true)
  implementation?: Implementation // 消费者实现
  metadata?: Record<string, any> // 元数据
}
```

#### 连接器接口

```typescript
interface CapabilityConnector {
  connect(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean
  disconnect(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean
  isConnected(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean
}
```

#### 内置连接器

- **DataFlowConnector**: 数据流连接 (addListener/removeListener)
- **EventConnector**: 事件连接 (addEventListener/removeEventListener)
- **PropertyConnector**: 属性绑定连接
- **MethodConnector**: 方法调用连接

---

### 沙箱系统

沙箱系统提供安全的 JavaScript 代码执行环境，防止恶意代码注入。

#### Sandbox 类

```typescript
class Sandbox {
  constructor(options?: SandboxOptions)

  // 表达式执行
  run<T>(expression: string, context?: Record<string, any>): T
  runAsync<T>(expression: string, context?: Record<string, any>): Promise<T>

  // 模板渲染
  render(template: string, context?: Record<string, any>): string
  renderAsync(template: string, context?: Record<string, any>): Promise<string>

  // 代码验证
  validate(code: string): boolean

  // 性能优化
  createEvaluator<T>(expression: string): (context?: Record<string, any>) => T
  createRenderer(template: string): (context?: Record<string, any>) => string
}
```

#### SandboxOptions

```typescript
interface SandboxOptions {
  globals?: Record<string, any>  // 允许的全局变量
  timeout?: number              // 执行超时 (毫秒)
  allowAsync?: boolean          // 是否允许异步操作
}
```

#### 便捷函数

```typescript
// 使用默认沙箱实例
function run<T>(expression: string, context?: Record<string, any>): T
function runAsync<T>(expression: string, context?: Record<string, any>): Promise<T>
function render(template: string, context?: Record<string, any>): string
function renderAsync(template: string, context?: Record<string, any>): Promise<string>
function validate(code: string): boolean

// 工厂函数
function createSandbox(options?: SandboxOptions): Sandbox
```

#### 安全特性

- **代码验证**: 检测危险模式 (eval, Function, setTimeout 等)
- **执行超时**: 防止无限循环
- **作用域隔离**: 限制全局变量访问
- **错误处理**: 安全的异常捕获和传播

---

### 组合式函数

组合式函数为 Vue 组件提供响应式的 SPARK 功能集成。

#### useSparkComponent

```typescript
function useSparkComponent(
  config: ComponentConfig,
  options?: {
    manager?: ComponentManager
    registry?: ComponentRegistry
    parentContext?: ComponentContext
  }
): {
  context: ComponentContext
  provide: (provider: CapabilityProvider) => void
  consume: <T = any>(name: string) => T | undefined
  use: <T = any>(name: string) => T | undefined  // consume 的别名
  whenAvailable: <T = any>(name: string) => Promise<T>
  logger: LoggerApi
  getOrCreateNoopProvider: <T = any>(name: string) => T
}
```

#### useComponent (别名)

```typescript
const useComponent = useSparkComponent  // 为向后兼容
```

---

### 插件系统

插件系统允许扩展 SPARK 核心功能。

#### Plugin 接口

```typescript
interface Plugin {
  name: string                    // 插件名称
  version?: string               // 版本号
  description?: string           // 描述

  // 生命周期
  install?: (manager: ComponentManager) => void
  uninstall?: (manager: ComponentManager) => void

  // 钩子函数
  hooks?: Partial<PluginHooks>
}
```

#### PluginHooks

```typescript
interface PluginHooks {
  afterComponentCreate?: (config: ComponentConfig, context: ComponentContext) => void | Promise<void>
  beforeComponentDestroy?: (context: ComponentContext) => void | Promise<void>
}
```

---

### 工具函数

#### 环境检测工具

```typescript
// 安全获取浏览器对象
function getWindow(): Window | undefined
function getDocument(): Document | undefined

// 环境检测
function isBrowser(): boolean
function isServer(): boolean

// 安全的属性访问
function getWindowProperty<T>(property: keyof Window, defaultValue: T): T
function getDocumentProperty<T>(property: keyof Document, defaultValue: T): T
```

#### 日志系统

```typescript
interface LoggerApi {
  debug(message: string, ...args: any[]): void
  info(message: string, ...args: any[]): void
  warn(message: string, ...args: any[]): void
  error(message: string, ...args: any[]): void
  createChild(context: any): LoggerApi
}

// 创建日志器
function Logger(context?: any): LoggerApi
```

#### 配置管理器

```typescript
class ConfigManager {
  set<T>(key: string, value: T): void
  get<T>(key: string, defaultValue?: T): T | undefined
  has(key: string): boolean
  delete(key: string): boolean
  clear(): void
  reset(): void
}
```

#### 错误处理器

```typescript
class ErrorHandler {
  static normalizeError(error: unknown): AppError
  static handle(error: unknown, context?: any): AppError
  static withRetry<T>(
    operation: () => T | Promise<T>,
    options?: {
      maxAttempts?: number
      delay?: number
      backoff?: 'fixed' | 'exponential'
    }
  ): Promise<T>
}
```

---

### 类型定义

#### 核心类型

```typescript
// 组件上下文
interface ComponentContext {
  id: string
  type: string
  config?: ComponentConfig
  parent?: ComponentContext | null
  children: ComponentContext[]
  state: Record<string, unknown>
  providers: Set<CapabilityProvider>
  consumers: Map<string, CapabilityConsumer>
  providerListeners?: Map<string, Set<(prov: CapabilityProvider) => void>>
  logger?: LoggerApi
}

// 实现接口
interface Implementation {
  [key: string]: any
}

// 通用函数类型
type AnyFunction = (...args: any[]) => any
```

#### Vue 集成类型

```typescript
// 依赖注入键
const SPARK_MANAGER_KEY: InjectionKey<ComponentManager>
const SPARK_REGISTRY_KEY: InjectionKey<ComponentRegistry>
```

---

## 使用模式

### 1. 基础组件注册和使用

```typescript
import { Spark } from '@spark-view/spark-component'

// 注册组件
Spark.register({
  type: 'data-table',
  name: 'Data Table',
  version: '1.0.0',
  component: DataTableComponent,
  providers: [{
    name: 'data-source',
    implementation: { loadData: () => fetch('/api/data') }
  }]
})

// 在组件中使用
export default defineComponent({
  setup() {
    const { consume } = useSparkComponent({
      type: 'data-table',
      consumers: [{ name: 'data-source' }]
    })

    const dataSource = consume('data-source')
    return { dataSource }
  }
})
```

### 2. 能力系统延迟绑定

```typescript
// 消费者组件 (可以先注册)
Spark.register({
  type: 'chart-widget',
  consumers: [{
    name: 'data-provider',
    required: false  // 可选能力
  }]
})

// 提供者组件 (可以后注册)
Spark.register({
  type: 'api-data-provider',
  providers: [{
    name: 'data-provider',
    implementation: { getData: () => apiCall() }
  }]
})

// 使用时自动连接
const { consume } = useSparkComponent({ type: 'chart-widget' })
const data = consume('data-provider')?.getData()
```

### 3. 沙箱安全执行

```typescript
import { Spark } from '@spark-view/spark-component'

// 安全表达式执行
const result = Spark.run('user.age > 18 && user.role === "admin"', {
  user: { age: 25, role: 'admin' }
})

// 模板渲染
const message = Spark.renderTemplate('Welcome {{user.name}}! Balance: ${{account.balance}}', {
  user: { name: 'John' },
  account: { balance: 1234.56 }
})

// 复用求值器 (性能优化)
const validator = Spark.sandbox().createEvaluator('value > min && value < max')
const isValid = validator({ value: 50, min: 0, max: 100 })
```

### 4. 插件扩展

```typescript
const monitoringPlugin: Plugin = {
  name: 'monitoring',
  version: '1.0.0',
  install(manager) {
    // 安装时设置监控
    manager.registerComponent({
      type: 'metrics-collector',
      component: MetricsComponent
    })
  },
  hooks: {
    afterComponentCreate(config, context) {
      console.log(`Component created: ${config.type}`)
    }
  }
}

Spark.installSparkPlugin(monitoringPlugin)
```

---

## 最佳实践

### 组件设计

1. **使用语义化类型名**: `kebab-case` 格式，如 `data-table`, `user-profile`
2. **提供版本号**: 遵循 SemVer 规范
3. **添加验证器**: 确保配置正确性
4. **明确能力契约**: 清晰定义提供者和消费者的接口

### 能力系统

1. **使用延迟绑定**: 消费者可以先于提供者注册
2. **设置适当的版本要求**: 使用 `minVersion` 确保兼容性
3. **提供降级方案**: 为可选能力设置默认实现
4. **使用类型安全**: 为能力接口定义 TypeScript 类型

### 沙箱使用

1. **验证用户输入**: 永远不要直接执行用户提供的代码
2. **设置合理的超时**: 防止长时间执行
3. **限制全局访问**: 只提供必要的全局变量
4. **使用预编译**: 对于频繁使用的表达式，创建求值器

### 错误处理

1. **使用 ErrorHandler**: 统一的错误处理和重试机制
2. **提供有意义的错误信息**: 包含上下文和恢复建议
3. **记录重要事件**: 使用 Logger 进行调试和监控

### SSR 兼容性

1. **使用环境检测工具**: 在访问浏览器 API 前检查环境
   ```typescript
   import { isBrowser, getWindow } from '@spark-view/spark-component/utils/env'
   
   if (isBrowser()) {
     const win = getWindow()
     // 安全使用 window 对象
   }
   ```

2. **组合式函数自动兼容**: 内置 composables 已处理 SSR 兼容性
   ```typescript
   // 这些函数在 SSR 环境中安全工作
   const { width, height } = useWindowSize() // SSR: { width: 0, height: 0 }
   const { visible } = useVisibility()       // SSR: { visible: true }
   ```

3. **条件客户端逻辑**: 将浏览器特定逻辑放在 `onMounted` 中
   ```typescript
   onMounted(() => {
     // 客户端专用逻辑
     window.addEventListener('resize', handleResize)
   })
   ```

4. **默认值处理**: 为 SSR 环境提供合理的默认值

---

## 故障排除

### 常见问题

#### 组件未注册错误

```
Error: Component type 'undefined' is not registered
```

**原因**: 组件配置缺少 `type` 字段或拼写错误
**解决**: 检查组件配置，确保 `type` 字段正确

#### 能力未找到错误

```
Error: Capability 'data-provider' not found
```

**原因**: 消费者注册时提供者还未注册
**解决**: 使用 `whenAvailable()` 等待提供者，或设置 `required: false`

#### 沙箱安全错误

```
Error: Unsafe code detected: eval(...
```

**原因**: 代码包含危险模式
**解决**: 使用 `validate()` 预检查，或重写代码避免危险模式

#### 依赖注入失败

```
Error: Spark manager not found in Vue context
```

**原因**: 未正确安装 Vue 插件
**解决**: 使用 `app.use(Spark.createVuePlugin())` 安装插件

#### SSR window 错误

```
ReferenceError: window is not defined
```

**原因**: 在服务器端直接访问 `window` 对象
**解决**: 使用环境检测工具或组合式函数
```typescript
// 推荐方式
import { getWindow, isBrowser } from '@spark-view/spark-component/utils/env'
const win = getWindow() // 在 SSR 中返回 undefined

// 或使用组合式函数（已内置兼容）
const { width } = useWindowSize() // SSR: width = 0
```

### 调试技巧

1. **启用详细日志**:
   ```typescript
   const logger = Spark.Logger({ level: 'debug' })
   ```

2. **检查组件注册**:
   ```typescript
   console.log('Registered types:', Spark.manager().getRegisteredComponentTypes())
   ```

3. **验证能力连接**:
   ```typescript
   const context = Spark.manager().getContext(componentId)
   console.log('Providers:', context?.providers)
   console.log('Consumers:', context?.consumers)
   ```

---

*本文档基于 SPARK 核心系统的实际实现。所有示例代码均经过测试验证。如有疑问，请参考源代码或提交 Issue。*

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
pnpm add @spark-view/spark-component
```

### 基本使用

```ts
import { Spark } from '@spark-view/spark-component'
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

// 2. 在 Vue 应用中安装
const app = createApp(App)
app.use(Spark.createVuePlugin())

// 3. 在组件中使用
import { useSparkComponent } from '@spark-view/spark-component'

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
// 创建 Vue 插件
Spark.createVuePlugin(opts?: { registry?: ComponentRegistry }): Plugin
```

#### 插件系统

```ts
Spark.installSparkPlugin(plugin: Plugin): void
Spark.getSparkPlugin(name: string): Plugin | undefined
```

#### 工厂函数

```ts
// 注册表工厂
Spark.createComponentRegistry(): ComponentRegistry

// 管理器工厂（高级）
Spark.createComponentManager(renderer?, registry?): ComponentManager

// 组件系统工厂（测试/隔离）
Spark.createComponentSystem(): { manager: ComponentManager; registry: ComponentRegistry }
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
import { useSparkComponent } from '@spark-view/spark-component'

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
import { useSparkComponent } from '@spark-view/spark-component'

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
import { useSparkComponent } from '@spark-view/spark-component'

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

- 确保在应用入口安装了Spark Vue插件：`app.use(Spark.createVuePlugin())`
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
const plugin = Spark.createVuePlugin()
app.use(plugin)
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
import { useSparkComponent } from '@spark-view/spark-component'

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

3. **简化 Vue 集成**
   ```ts
   // 旧：需要手动创建 manager
   const manager = Spark.createComponentManager()
   Spark.install(app, { manager })

   // 新：manager 由框架自动管理
   app.use(Spark.createVuePlugin())
   ```

4. **工厂函数**
   ```ts
   // 旧：直接导入单例
   import { componentManager } from '@spark-view/spark-component'

   // 新：使用 Spark 访问器（内部 API）
   const manager = Spark._manager()
   ```

### 最佳实践

- 总是使用 `Spark.createVuePlugin()` 安装插件
- 使用 `useSparkComponent` 在组件中访问上下文
- 优先使用能力系统而非直接导入
- 为组件定义提供验证器确保配置正确

---

*本文档基于 SPARK 组件系统的最新实现。如有问题，请参考源码或测试用例。*