---
sidebar: auto
---

# 组件开发指南（Component Developer Guide）

欢迎阅读 SPARK 项目的组件开发指南。本指南面向想要在 `apps/spark-view` 中新增或维护组件的前端工程师，覆盖从目录结构、组件定义、能力（capability）接口，到测试与调试的完整工作流。

## 目录

- 概览
- 代码组织与约定
- 创建一个新组件（步骤）
- 能力系统（Provider / Consumer）
- 生命周期与上下文管理
- 注册与渲染（Registry / Renderer）
- 测试与调试
- 最佳实践与常见问题

---

## 概览

SPARK 使用基于配置和能力系统的插件化组件架构：

- 组件由 `SparkComponentConfig` 描述（`type`、`id`、`children`、`props` 等）。
- 运行时会创建 `SparkComponentContext`，包含 `providers` 与 `consumers`，用于能力交换与上下文树管理。
- `SparkComponentManager` 负责创建/注册/销毁上下文与组件的渲染。


## 代码组织与约定

项目关键目录（相对 `apps/spark-view`）：

- `src/components/spark/` - SPARK 组件实现（`SparkEJ2Grid.vue`、`SparkEJ2Column.vue` 等）
- `src/components/renderers/` - 渲染器与通用渲染工具
- `src/composables/` - 组合式工具（`useSparkComponent`）
- `src/utils/spark/` - 管理器、注册器与能力系统（`SparkComponentManager.ts`、`SparkCapabilitySystem.ts`）
- `src/types/` - 核心类型（`spark-component.ts`）

> 已迁移：通用工具已移入 `@spark-view/spark-core`。请从包中导入工具与类型（例如 `import { Logger, asyncUtils } from '@spark-view/spark-core'`），不要直接导入或修改 `shared/utils`。
- `tests/` - 单元与集成测试目录

命名规范与风格：

- 组件类型使用 `kebab-case`，例如 `spark-ej2-grid`。
- 组件定义导出为 `SparkComponentDefinition` 并通过 `Spark.registerSparkComponent()` 注册。
- **必须**在应用入口注入 manager：在 `main.ts` 使用 `app.provide('sparkManager', globalSparkComponentManager)`，并在组件中通过 `useSparkComponent()` 自动 `inject('sparkManager')` 使用。该项目不再支持 `globalThis` 回退，统一采用单一依赖注入风格。

### Late-binding（能力延迟绑定）
- `consumeCapability(name)` 现在会**始终注册一个 consumer**（即便 provider 尚不存在），这支持子组件在父组件 provider 注册之前就消费能力。Kernel 会在 provider 注册时自动连接（`autoConnectCapabilities`）。
- 如需以 Promise 方式等待 provider，可使用 `whenProviderAvailable(name)`，示例：

```js
const impl = consumeCapability('columnManager')
if (!impl) {
  whenProviderAvailable('columnManager').then(provider => {
    // provider.available
  })
}
```

### Default no-op provider
- 项目提供 `getOrCreateNoopProvider(name)`（在 `SparkCapabilitySystem` 中导出），用于为某些能力创建默认的 no-op provider，避免空值错误。


## 创建一个新组件（步骤）

1. **定义组件实现**
   - 在 `src/components/spark/` 新建组件文件，例如 `MyFeature.vue`。
   - 使用 `useSparkComponent(props)` 组合式工具或继承 `SparkComponentBase.vue`（若存在）来获得上下文与能力管理的标准行为。

   示例（简化）：
   ```ts
   <script setup lang="ts">
   import { useSparkComponent } from '@/composables/useSparkComponent'
   const props = defineProps<{ config: any }>()
const { context, registerProvider, consumeCapability } = useSparkComponent({ config: props.config })
   // 注册能力示例
   registerProvider('my-feature', { /* implementation */ })

   // 消费能力示例
   const columnManager = consumeCapability('columnManager')
   </script>
   ```

2. **导出组件定义并注册**
   - 在 `src/utils/componentRegistry.ts` 或组件模块初始化中，调用 `registerSparkComponent({ type: '...', name: '...', component: YourVueComponent, ... })`。

3. **实现能力接口（如需要）**
   - 提供者实现 `SparkCapabilityProvider`，消费者实现 `SparkCapabilityConsumer`。
   - 若需要跨上下文方法调用，请确保定义 `interface` 和 `implementation`。

4. **添加测试**
   - 在 `tests/` 下添加单元/集成测试，使用 `vitest` 与 `@vue/test-utils`。推荐模拟外部依赖（如 EJ2）并断言能力注册与消费行为。

5. **文档与示例**
   - 在 `docs/` 中补充该组件的使用示例与配置片段。


## 能力系统（Provider / Consumer）

能力系统是 SPARK 的核心扩展点：

- 提供者（Provider）注册到上下文：`context.providers.set(name, provider)` 或通过 `registerProvider(name, impl)`。
- 消费者（Consumer）通过 `consumeCapability(name)` 请求能力，框架会查找最近的提供者并调用连接器（connector）来建立绑定。
- 内置连接器：`data-flow`、`event`、`method`。你也可以注册自定义连接器到 `globalCapabilityManager`。

示例：注册列管理能力（父列提供）
```ts
// 在父列组件中（SparkEJ2Column.vue）提供 columnManager，供子列注册自身
registerProvider('columnManager', {
  name: 'columnManager',
  version: '1.0.0',
  implementation: {
    addColumn: (c) => { /* 将子列追加到 parent.config.children */ },
    removeColumn: (field) => { /* 从 parent.config.children 移除 */ }
  }
})
```

子列消费并注册：
```ts
const columnManager = consumeCapability('columnManager')
if (columnManager && typeof columnManager.addColumn === 'function') {
  columnManager.addColumn({ field: 'age' })
}
```

注意：为避免“Capability not found”警告，尽量在父组件 setup 阶段尽早注册 provider，或在子组件 mounted 时再消费（延迟消费）。


## 生命周期与上下文管理

- `createContext(config, parent?)` → 会生成 `SparkComponentContext` 并自动插入到父 `children`。
- `destroyContext(id)` → 断开能力、从父移除并递归删除子上下文。
- 组合式 `useSparkComponent` 会在 `onMounted` 时注册上下文（可通过 `globalThis` 可见的 manager 注册），在 `onUnmounted` 时销毁或清理本地状态。

注意循环依赖：`useSparkComponent` 不应直接 require manager 模块（在测试环境模块解析可能失败），优先使用 `globalThis.__globalSparkComponentManager`。


## 注册与渲染（Registry / Renderer）

- 在 `src/utils/componentRegistry.ts` 中注册组件定义。
- 渲染器（`SparkComponentRenderer`）负责把 `SparkComponentConfig` 渲染成 Vue 组件树或第三方组件（EJ2）。
- 推荐：实现 `renderChildren()` 来递归渲染 `config.children`，并让渲染器负责插槽/props 的传递。


## 测试与调试

- 使用 `vitest` + `@vue/test-utils`。
- 测试要点：
  - 上下文 id 是否生成及注册（`getContext(id)`）
  - 能力是否被正确注册（`registerProvider`）及消费（`consumeCapability`）
  - `destroyContext()` 是否能正确断开连接并删除上下文
  - 对于 EJ2 等外部组件，mock 外部库以便断言渲染行为

示例测试片段：
```ts
const wrapper = mount(MyGrid, { props: { config } })
expect(globalSparkComponentManager.getContext(ctxId)).toBeTruthy()
```


## 最佳实践

- 能力接口要小且明确，避免一项能力承担太多职责。
- 提前注册父能力，或把消费放到 `onMounted` 中以避免时序问题。
- 使用 `splice()` 修改数组以保持 Vue 的响应性（不要直接赋值 `rows = []`）。
- 写单元测试覆盖注册/消费/销毁流程。
- 在组件实现中尽量少做副作用，保持事件/数据的纯粹性。


## 日志（Logger）

- 框架提供了一个通用的 `logger` 能力（全局 provider），组件与非组件场景推荐使用组合式 API 获取 logger：

```ts
// 非组件场景（页面脚本、工具、测试）
import { Spark } from '@spark-view/spark-core'
const logger = Spark.Logger() // context 可选，Spark.Logger(context)

// 组件内部（推荐）：
import { useSparkComponent } from '@/composables/useSparkComponent'
const { logger } = useSparkComponent({ config: props.config })

// 组件组合式函数还提供了其它 helper，建议从组合式函数解构获取：
// const { getSparkComponent, isComponentRegistered, getRegisteredComponentTypes, getOrCreateNoopProvider } = useSparkComponent({ config: props.config })
// - `getRegisteredComponentTypes()`：返回已注册组件类型列表，便于调试
// - `getOrCreateNoopProvider(name)`：确保存在一个全局 no-op provider（避免空能力错误）
// - `getGlobalProvider(name)` / `registerGlobalProvider(name, provider)`：访问或注册全局 provider（例如 `logger`）


logger.info('message')
logger.warn('warning')
logger.error('error')
```

> ⚠️ 注意：库/核心工具（例如 `SparkComponentManager`、`SparkCapabilitySystem` 等）应使用 `Logger()` 或在运行期通过 `Spark.Logger()` 获取日志实例，避免在模块顶层调用 `useSpark()` 或其他组合式函数。（在模块初始化时调用组合式 API 可能导致运行时或测试环境中的时序/依赖问题。）


- `logger` 默认会回退到安全的 `console` 实现（SSR 安全：会检查 `console` 是否存在），也可以通过 `registerGlobalProvider('logger', provider)` 注册自定义实现。


## 常见问题（FAQ）

Q: 为什么在测试中找不到 manager？
A: 测试中可能触发了循环依赖或 alias 解析问题，已采用在 manager 中暴露 `globalThis.__globalSparkComponentManager` 的方式兼容测试环境。

Q: 出现 “Capability not found” 警告怎么办？
A: 检查父组件是否在子组件消费之前完成 `registerProvider`。最好把重要 provider 在 setup 开头就注册，或把消费放到 `onMounted`。


---

## 需要我帮你做的事？

- 我可以把一个 **模板组件**（包含示例、能力接口和测试）添加到 `src/components/spark/` 并提交一个 PR。 
- 我也可以把这份文档拆成多个子页面（快速开始 / 能力系统 / 示例 / API），并自动更新 VitePress 侧栏。

请选择：
1. 生成模板组件 + 测试（推荐）
2. 拆分为多页文档并更新侧栏
3. 仅保留当前单页文档（已完成）

回复对应序号即可。