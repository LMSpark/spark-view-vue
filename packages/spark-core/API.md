# Spark Core — API 使用说明（完整）

> 版本信息：本说明对应项目内 `packages/spark-core` 当前实现（2026-01-30）。

---

## 目录

1. 概览
2. 安装与引入
3. 主要导出与快速示例
4. 详细 API 参考
   - 4.1 组件注册 / `componentRegistry`
   - 4.2 组件管理器 / `componentManager`
   - 4.3 组件上下文组合式函数 / `useComponent`（在代码中导出为 `useComponent`）
   - 4.4 能力系统 / `capabilityManager`
   - 4.5 全局能力注册 / `GlobalProviderRegistry`
   - 4.6 日志 / `Logger` 与 transport
   - 4.7 错误处理 / `ErrorHandler`, `withRetry`, `AppError`
   - 4.8 异步工具 / `asyncUtils`
   - 4.9 插件系统 / `SparkPlugin` & `installSparkPlugin`
   - 4.10 辅助类型
5. 深度清理 & 改进建议（行动计划）
6. FAQ & 注意事项

---

## 1) 概览 🌟
`packages/spark-core` 提供 SPARK 组件系统的核心运行时：组件注册、管理、能力(provider/consumer)连接、日志、错误/重试策略、以及若干实用工具与插件接口。本包被设计为轻量、可测试、且用于在不同运行时（测试、浏览器、SSR）下安全工作。

---

## 2) 安装与引入

在本仓库中直接使用：

```ts
import { componentManager, componentRegistry, useComponent, Logger, capabilityManager, asyncUtils, withRetry, installSparkPlugin } from '@spark-view/spark-core'
// 或者直接相对路径引用： 'packages/spark-core/src'
```

---

## 3) 主要导出与快速示例 ✅

- `componentRegistry` — 注册/查询组件定义
- `componentManager` — 创建/销毁组件上下文、渲染占位实例、注册组件定义
- `useSparkComponent(config, opts?)` — 组合式 hook，用于组件 setup() 内的上下文、能力提供/消费、生命周期管理；严格依赖传入或通过 Spark 插件注入的 `manager`（DI-first）
- `capabilityManager` — 连接/断开 provider 与 consumer

- `Logger(context?)` — 统一日志 API
- `withRetry` / `handleError` — 错误处理与重试工具
- `asyncUtils` — debounce / throttle / timeout / race controller
- 插件系统：`installSparkPlugin`、`globalPluginManager`
- Vue 插件：`createVuePlugin({ manager, registry? })` 与 `Spark.install(app, { manager })`（**严格**要求显式提供 manager；不再隐式使用单例）


**Vue 安装（严格 DI）示例：**

```ts
import { createComponentManager, createComponentRegistry, Spark } from '@spark-view/spark-core'
import { createApp } from 'vue'

const registry = createComponentRegistry()
const manager = createComponentManager(undefined, registry)
const app = createApp(App)

// 方式 1：使用 plugin 工厂并安装
const plugin = Spark.createVuePlugin({ manager, registry })
app.use(plugin)

// 或者方式 2：直接调用 install 并传入 manager
Spark.install(app, { manager })
```

**迁移说明（破坏性）**：`Spark.install(app)` 在本版本将**不再**隐式使用内置单例 `componentManager`。必须显式传入 `manager`（例如 `createComponentManager(registry)`）；该策略保证应用级生命周期与测试隔离更明确。 

快速例子：注册组件 + 渲染

```ts
// 注册
componentManager.registerComponent({
  type: 'my-button',
  name: 'My Button',
  version: '1.0.0',
  component: MyButtonVueComponent
})

// 渲染（测试工具/占位）
const instance = componentManager.render({ type: 'my-button', id: 'btn-1', props: { text: 'OK' } })
```

组件内部使用 `useSparkComponent`:

```ts
import { useSparkComponent } from '@spark-view/spark-core'

export default {
  setup(props) {
    const { context, provide, consume, whenAvailable, logger } = useSparkComponent({ type: 'my-button' })

    provide('button-api', { click() { ... } })
    const api = consume('grid-api') // 如果可用则返回实现，否则为 null（或延迟绑定）
  }
}
```

---

## 4) 详细 API 参考 📚

### 4.1 componentRegistry

- `componentRegistry.register(type: string, def: SparkComponentDefinition): void`
  - 注册组件定义（type, component, name?, version?, providers?, consumers?, validator?）
  - 会验证 `type | name | version | component` 存在性
- `componentRegistry.get(type: string): SparkComponentDefinition | undefined`
- `componentRegistry.has(type: string): boolean`
- `componentRegistry.getAllTypes(): string[]`
- `componentRegistry.getAllDefinitions(): SparkComponentDefinition[]`
- `componentRegistry.unregister(type: string): boolean`
- `componentRegistry.clear(): void`
- `componentRegistry.findCompatibleProviders?(capabilityName: string, minVersion?: string): string[]`
  - 注意：当前实现使用了一个**简单**的 semver 比较（仅比较 major.minor.patch），建议用 `semver` 包替换以支持预发行、元数据等完整规则。

示例：

```ts
componentRegistry.register('spark-grid', { type: 'spark-grid', component: ExampleGridComponent, version: '1.0.0' })
const def = componentRegistry.get('spark-grid')
```

---

### 4.2 componentManager

- `componentManager.registerComponent(def)` / `registerComponents(defs)`
- `createContext(config, parent?)` → 返回 `SparkComponentContext`
- `render(config, parentContext?)` → 返回占位组件实例（内部用于测试/渲染判定）
- `destroyContext(id)`, `getContext(id)`, `getAllContexts()`
- `registerProvider(context, provider)` — 将 capability provider 注册到 context
- `getProvider(context, name)` — 向上查找 provider
- `createComponentTree(cfg)` — 深拷贝并展开 children
- `validateComponentConfig(cfg)` — 以注册定义的 validator 验证 config

使用建议：在应用入口 (app) 中创建或使用 `componentManager` 并将其提供给顶层（若需要）：

```ts
// app setup
// Prefer: install Spark Vue plugin with manager: `app.use(Spark.createVuePlugin({ manager, registry }))` (Symbol-based DI)
```

---

### 4.3 useComponent (组合式工具)

签名：`useComponent(config: SparkComponentConfig, parentContext?: SparkComponentContext)`

返回对象（常用）：
- `context: reactive SparkComponentContext` — id/type/parent/children/providers/consumers
- `isVisible`, `isDisabled` — computed
- `provide(name: string, implementation: any)` — 在当前 context 上提供 capability
- `consume(name: string)` — 注册 consumer 并自动尝试连接可用 provider；如果 provider 尚未注册，会返回 null，并记录 consumer 以便之后自动绑定（late-binding）
- `whenAvailable(name)` — 当 provider 可用时的 Promise
- `getComponent(type)` — 从 registry 拿到组件定义并返回 `markRaw(component)`（用于避免 Vue 将组件定义设为响应式）
- `getOrCreateNoopProvider(name)`、`getProviderFromGlobal(name)` — global provider helper
- `connectCapability`, `disconnectCapability` — 直接使用 capability 管理器执行连接/断开

示例：

```ts
const { provide, consume, whenAvailable } = useComponent({ type: 'spark-grid' })
provide('gridInstance', { addRow() { ... } })
const columns = consume('columnManager')
await whenAvailable('columnManager') // 等待 provider
```

注意：`useComponent` 会在 `onMounted` 时将 context 注册到 `componentManager` 并在 `onUnmounted` 时销毁。

---

### 4.4 capabilityManager

- `registerConnector(name, connector)` — 注册连接器（例如 DataFlow/Method/Event）
- `connectCapability(provider, consumer, context)` / `disconnectCapability(...)`
- `autoConnectCapabilities(context)` — 递归自动连接上下文中的 consumers

默认内置了三种 connector：DataFlowConnector, EventConnector, MethodConnector。你可以为新能力注册自定义 connector。

---

<!-- Global provider helpers removed. Use context-level providers attached to component contexts via `useSparkComponent` or `componentManager.registerProvider` -->

---

### 4.6 Logger

- `Logger(context?)` → 返回 `{ debug, info, warn, error }`。
- 内部优先使用 context 中名为 `logger` 的 provider，再使用全局 provider，最后回退到 `console`。
- 提供创建 transport 的便捷函数：`createConsoleTransport`, `createHttpTransport`, `createMemoryTransport`（这些是 transport 形状的帮助构建函数，但需要包裹为 provider 实现）。

注册为全局 logger：

```ts
// Global provider helpers were removed; attach providers to component contexts or register via manager instead.
```

---

### 4.7 错误处理与重试

- 导出 `AppError`、`ErrorHandler`（静态方法）与便捷函数 `handleError`, `withRetry`, `getUserFriendlyMessage`

示例：

```ts
// 简单重试
await withRetry(asyncOp, { maxAttempts: 3, delay: 100, backoff: 'fixed' })
```

`withRetry` 在达到最大次数后会调用 `ErrorHandler.handle`（抛出 `AppError` 并记录到监控）。

---

### 4.8 asyncUtils

提供：`debounce`, `throttle`, `timeout`, `retry`（wraps withRetry）, `createRaceController`, `delay`, `raceSafe` 等。

示例：

```ts
const debounced = asyncUtils.debounce((q)=>search(q), 300)
await asyncUtils.timeout(promise, { timeout: 2000 })
```

---

### 4.9 插件系统

- `installSparkPlugin(plugin: SparkPlugin)`，`uninstallSparkPlugin(name)`，`getSparkPlugin(name)`
- `SparkPlugin` 接口具有 `install(manager)`/`uninstall(manager)` 和可选 `hooks`。
- 内置示例：`SparkDebugPlugin`, `SparkPerformancePlugin`, `SparkErrorHandlingPlugin`。

插件可以在运行时注册 hook（`afterComponentCreate`, `beforeComponentDestroy`）来拓展行为。

---

### 4.10 重要类型（摘要）

- `SparkComponentConfig` — 组件配置（必有 `type`，可选 `id`/`name`/任意自定义字段）
- `SparkCapabilityProvider` — { name, version?, interface?, implementation? }
- `SparkCapabilityConsumer` — { capabilityName, interface?, implementation?, minVersion?, onProvide? }
- `SparkComponentContext` — 组件运行时上下文，包含 providers / consumers / children / parent 等
- `SparkPlugin` / `SparkPluginHooks`

---

## 5) 深度清理 & 改进建议（行动计划）🔧

下面列出可执行的清理与强化步骤（优先级按推荐顺序）：

1. **替换当前的简单 semver 实现**（高优先级）
   - 问题：`SparkComponentRegistry.compareSemver` 为简单数值比较，不支持 pre-release/build metadata。
   - 操作：引入 `semver`（或等价库），添加单元测试覆盖 edge cases（pre-release、带 metadata、缺失部分等）。

2. **增强 API 文档 & 导出清单**（中优先级）
   - 将本 `API.md` 放入包根，并在 `README` 中显式链接；为每个导出添加 TS doc 注释以生成自动 API 文档。 

3. **完善插件 hook 的测试**（中优先级）
   - 添加插件安装/卸载、hook 执行成功/失败的单元测试；示例 plugin 与文档化常见用例。

4. **增强 capability 连接器的可观察性**（中优先级）
   - 在 `capabilityManager` 中为关键操作添加调试日志或事件（便于排查连接失败）。

5. **完善 `useComponent` 的类型约束与示例**（低优先级）
   - 为 `provide`/`consume` 的 interface 参数增加可选的类型签名示例；增加交互样例测试。

6. **发布与兼容性策略**
   - 由于 shim 已移除（breaking change），请在下次发布中增加变更日志与迁移指南（`DEPRECATION.md` 已添加）。

7. **增加 API 验证测试与示例项目**
   - 增加一个最小 demo（在 `packages/spark-core/examples`）演示组件注册、能力提供/消费、插件、日志和错误处理。

---

## 6) FAQ & 注意事项 ℹ️

- Q: 为什么 `getComponent` 返回 `markRaw(component)`？
  - A: 防止 Vue 将组件定义设为响应式，从而避免生命周期警告与性能问题。

- Q: `findCompatibleProviders` 是否支持复杂版本范围？
  - A: 当前实现为简单比较。请参照第 5) 的清理建议替换为 `semver` 支持完整语义化版本范围匹配。

- Q: 外部消费者受 shim 移除 影响吗？
  - A: 会是 breaking change。已在仓库中添加 `packages/spark-core/DEPRECATION.md`，请在发布说明中强调此变更并提供迁移示例。
  
  - 迁移示例（常见）：如果你的应用或测试曾经在启动时调用 `initializeApp()`，请改为显式传入 manager：

    ```ts
    // 旧：
    await Spark.initializeApp()

    // 新：
    await Spark.initializeApp(Spark.manager())
    // 或者传入你创建的实例
    await Spark.initializeApp(createComponentManager())
    ```

- Q: `getSparkMetaFromComponent` 被删除了，我如何迁移使用？
  - A: `getSparkMetaFromComponent` 已被永久移除以简化公共 API。迁移方式如下：

    ```ts
    // 推荐迁移：将 Vue 组件对象直接注册
    import { Spark } from '@spark-view/spark-core'
    Spark.registerSparkComponentFromComponent(MyComponent)

    // 或者手动提取并注册：
    // const meta = (MyComponent as any).spark
    // Spark.registerSparkComponent({ ...meta, component: MyComponent })

    // 或者手动构造定义并注册：
    const meta = MyComponent.spark
    Spark.registerSparkComponent({ ...meta, component: MyComponent })
    ```

  - 说明：推荐使用 `Spark.registerSparkComponentFromComponent(component)`，它会验证组件上的 `spark` 元数据并生成注册定义；如果需要更细粒度控制，也可以手动构造并调用 `Spark.registerSparkComponent(def)`。

- Q: `packages/spark-core` 是否可以包含具体的组件实现或示例？
  - A: 不可以。`packages/spark-core` 仅应包含抽象的核心运行时与工具；具体组件（例如基于特定 UI 库的实现）应放在 `features/*` 或示例/插件包中。文档示例应使用通用占位符（例如 `spark-grid` 或 `ExampleGridComponent`）。

---

如果你愿意，我可以：
- 立刻实现第 1 点（引入 `semver` 并添加全面测试与类型声明），✅
- 或者先把本 `API.md` 合并到仓库并提交 PR（包含 README 链接与 TODO 清单）。✅

需要我现在开始哪个任务？（回复：`1` = 替换 semver 并写测试；`2` = 提交文档 PR + README 链接；`3` = 两项都做）

---

*文档由 GitHub Copilot 自动生成，基于当前 `packages/spark-core` 源码（2026-01-30）。*