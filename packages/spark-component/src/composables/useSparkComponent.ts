/**
 * @file useSparkComponent - SPARK 组件核心 Composable
 * 
 * ## 概述
 * SPARK 组件系统的唯一组件开发 API，提供完整的组件能力管理和生命周期控制。
 * 
 * ## 核心功能
 * - **上下文管理**：响应式上下文创建、父子关系自动建立
 * - **能力系统**：提供/消费能力、延迟绑定、事件系统
 * - **生命周期**：自动初始化和清理、Vue 生命周期集成
 * - **注册表访问**：组件查询、动态加载支持
 * - **调试工具**：上下文链追踪、能力树可视化
 * 
 * ## 设计原则
 * - **能力委托**：通过 CapabilityManager 管理 provider/consumer 连接
 * - **依赖注入**：通过 Vue provide/inject 获取 registry 和 parent context
 * - **自动化**：parent/children 关系通过 Vue DI 自动建立
 * - **类型安全**：完整的 TypeScript 支持和泛型约束
 * 
 * ## 使用示例
 * ```ts
 * const { context, provide, consume, logger } = useSparkComponent({
 *   type: 'my-component',
 *   props: { id: 1 }
 * })
 * 
 * // 提供能力
 * provide('selection', { getSelected: () => [...] })
 * 
 * // 消费能力
 * const gridInstance = consume<GridAPI>('gridInstance')
 * ```
 * 
 * @module composables/useSparkComponent
 */

/* -----------------------------------------------------------------------------
 * 依赖导入
 * -------------------------------------------------------------------------- */

// Vue 核心
import { reactive, computed, onMounted, onUnmounted, markRaw, inject, provide as vueProvide } from 'vue'

// SPARK 工具库
import { Logger, createEventProvider } from '@spark-view/spark-utils'
import type { EventProvider, CapabilityKey, LoggerApi } from '@spark-view/spark-utils'

// SPARK 能力系统
import { createCapabilityManager } from '../capability/CapabilityManager.js'

// SPARK 核心类型
import type { ComponentContext, ComponentConfig, CapabilityProvider, CapabilityConsumer, ComponentRegistry, CapabilityName } from '../core/types.js'
import { SPARK_REGISTRY_KEY, SPARK_PARENT_CONTEXT_KEY, CAPABILITY_MANAGER_KEY } from '../core/types.js'

/* -----------------------------------------------------------------------------
 * 全局实例
 * -------------------------------------------------------------------------- */

/**
 * 共享能力管理器实例（默认）
 * 
 * 所有 useSparkComponent 调用共享同一个管理器实例，因为管理器本身无状态，
 * 所有状态存储在各个 context 的 providers/consumers Map 中。
 * 
 * 可通过 CAPABILITY_MANAGER_KEY 注入替代实例（测试/多实例场景）。
 */
const defaultCapabilityManager = createCapabilityManager()

/* -----------------------------------------------------------------------------
 * 类型定义
 * -------------------------------------------------------------------------- */

/**
 * useSparkComponent 返回值接口
 * 
 * 提供组件开发所需的完整 API 集合，按功能分组：
 * - 核心状态：context, isVisible, isDisabled
 * - 能力提供：provide, provideEvents, getProvider
 * - 能力消费：consume, consumeEvents, whenAvailable
 * - 生命周期：initialize, destroy
 * - 工具方法：logger, getComponent, 调试工具等
 */
export interface UseSparkComponentReturn {
  /* 核心状态 */
  /** 响应式组件上下文（包含 id, type, parent, children, props, state, providers, consumers） */
  context: ComponentContext
  /** 可见性计算属性（基于 config.visible，默认 true） */
  isVisible: { readonly value: boolean }
  /** 禁用状态计算属性（基于 config.disabled，默认 false） */
  isDisabled: { readonly value: boolean }

  /* 能力提供 API */
  /** 提供能力实现（类型安全重载：CapabilityKey<T> 自动推断 T） */
  provide: {
    <T>(name: CapabilityKey<T>, implementation: T): void
    (name: string | symbol, implementation?: unknown): void
  }
  /** 提供事件能力，返回事件发射器（EventEmitter 模式） */
  provideEvents: (name?: string | symbol) => EventProvider
  /** 获取当前 context 的本地 provider（不查找父级） */
  getProvider: (name: string | symbol) => CapabilityProvider | undefined
  /** 沿 parent 链向上查找 provider 实现（支持继承） */
  getInheritedProvider: <T = unknown>(name: string | symbol, ctx?: ComponentContext) => T | undefined

  /* 能力消费 API */
  /** 消费能力（类型安全重载：CapabilityKey<T> 自动推断 T） */
  consume: {
    <T>(name: CapabilityKey<T>): T | null
    (name: string | symbol): unknown
  }
  /** 消费事件能力，自动绑定多个事件处理器 */
  consumeEvents: (name: string | symbol, handlers: Record<string, (...args: unknown[]) => void>) => EventProvider | null
  /** 等待能力注册（异步），用于解决时序依赖问题 */
  whenAvailable: {
    <T>(name: CapabilityKey<T>, timeout?: number): Promise<T>
    (name: string | symbol, timeout?: number): Promise<unknown>
  }

  /* 生命周期 API */
  /** 初始化方法（onMounted 时自动调用，也可手动调用） */
  initialize: () => void
  /** 清理方法（onUnmounted 时自动调用，清理 providers/consumers 和父子关系） */
  destroy: () => void

  /* 工具 API */
  /** 日志器实例（带 type 前缀，如 "Spark:my-component"） */
  logger: ReturnType<typeof Logger>
  /** 从注册表获取组件定义（返回 markRaw 包装的组件，避免响应式开销） */
  getComponent: (type: string) => unknown
  /** 检查组件是否已注册 */
  isComponentRegistered: (type: string) => boolean

  /* 调试工具 */
  /** 获取从当前 context 到根的上下文链（用于调试和追踪） */
  getContextChain: () => ComponentContext[]
  /** 打印完整的能力树结构（显示所有 context 和它们提供的能力） */
  printCapabilityTree: () => void
}

/* -----------------------------------------------------------------------------
 * 主函数 - useSparkComponent
 * -------------------------------------------------------------------------- */

/**
 * SPARK 组件核心 Composable
 * 
 * 创建并管理 SPARK 组件的完整生命周期和能力系统。每个 SPARK 组件在 setup 中
 * 调用此函数一次，获得上下文、能力管理和工具方法的完整访问权限。
 * 
 * @template TConfig - 组件配置类型，必须包含 type 字段
 * @param config - 组件配置对象（至少包含 type，可选 id/props）
 * @param options - 可选配置
 * @param options.registry - 自定义注册表（默认从 Vue DI 获取）
 * @param options.parentContext - 自定义父级上下文（默认从 Vue DI 获取）
 * 
 * @returns 组件 API 对象，包含 context、能力管理、生命周期和工具方法
 * 
 * @example
 * ```ts
 * // 基础用法
 * const { context, provide, consume, logger } = useSparkComponent({
 *   type: 'user-grid',
 *   props: { dataSource: [] }
 * })
 * 
 * // 提供能力
 * provide('gridInstance', { refresh: () => {...} })
 * 
 * // 消费能力
 * const dataSet = consume<DataSet>('dataSet')
 * 
 * // 延迟消费（异步等待）
 * const selection = await whenAvailable('selection')
 * ```
 * 
 * @see {@link UseSparkComponentReturn} - 返回值类型定义
 */
export function useSparkComponent<TConfig extends ComponentConfig = ComponentContext>(
  config: TConfig,
  options?: {
    registry?: ComponentRegistry
    parentContext?: ComponentContext
  }
): UseSparkComponentReturn {
  /* ---------------------------------------------------------------------------
   * 初始化：依赖注入和上下文创建
   * ------------------------------------------------------------------------ */

  /**
   * 从 Vue DI 获取父级上下文
   * 父组件通过 vueProvide('sparkParentContext', context) 传递
   */
  const parentContext = options?.parentContext ?? inject(SPARK_PARENT_CONTEXT_KEY, undefined)

  /**
   * 从 Vue DI 获取组件注册表
   * 由 SparkPlugin 在根级别 provide
   */
  const registry = options?.registry ?? inject(SPARK_REGISTRY_KEY, undefined)

  /**
   * 从 Vue DI 获取能力管理器（可选）
   * 允许测试或多实例场景注入自定义管理器，默认使用模块级单例
   */
  const capabilityManager = inject(CAPABILITY_MANAGER_KEY, defaultCapabilityManager)

  /**
   * 创建组件上下文
   * - id: 唯一标识符（自动生成或使用配置值）
   * - type: 组件类型（kebab-case，如 'spark-ej2-grid'）
   * - parent: 父级上下文引用
   * - children: 子级上下文列表（动态维护）
   * - props: 组件属性（来自配置或 Vue props）
   * - state: 组件内部状态
   * - providers: 当前 context 提供的能力 Map
   * - consumers: 当前 context 消费的能力 Map
   */
  const ctxRaw: ComponentContext = {
    id: config.id ?? `spark-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
    type: config.type,
    children: [],
    props: config.props ?? {},
    state: {},
    providers: new Map<CapabilityName, CapabilityProvider>(),
    consumers: new Map<CapabilityName, CapabilityConsumer>()
  }
  
  if (parentContext !== undefined) {
    ctxRaw.parent = parentContext
  }

  /**
   * 包装为响应式对象
   * 使 context 的变化可以被 Vue 追踪，支持 computed/watch 等
   */
  const context = reactive(ctxRaw)

  /**
   * 建立父子关系
   * 将当前 context 添加到父级的 children 列表中
   */
  if (parentContext?.children) {
    parentContext.children.push(context)
  }

  /**
   * 向子组件提供当前 context
   * 子组件通过 inject('sparkParentContext') 获取
   */
  vueProvide(SPARK_PARENT_CONTEXT_KEY, context)

  /**
   * 创建日志器（从应用层获取）
   * 
   * 架构设计：
   * 1. Logger 应该从应用层统一提供（通过 APP_SERVICES 或直接提供 'logger' 能力）
   * 2. 使用 capabilityManager.getProvider() 沿 parent 链查找 logger provider
   * 3. 如果应用层未提供 logger，则 fallback 到简单的 console（静默模式）
   * 4. 避免在组件内部创建独立的 logger 实例，保持全局统一配置
   * 
   * 推荐用法：
   * - 在 main.ts 中：provide('logger', createLogger('App'))
   * - 或通过 APP_SERVICES：provide(APP_SERVICES, { logger: createLogger('App') })
   */
  const getActiveLogger = () => {
    // 优先从能力系统查找应用层提供的 logger
    const loggerProvider = capabilityManager.getProvider(context, 'logger')
    if (loggerProvider?.implementation) {
      const impl = loggerProvider.implementation as LoggerApi
      // 验证是否为有效的 LoggerApi
      if (impl && typeof impl === 'object' && 'info' in impl && 'warn' in impl && 'error' in impl && 'debug' in impl) {
        return impl
      }
    }
    // Fallback：使用静默 logger（应用层应该提供 logger）
    return {
      debug: () => undefined,
      info: (...args: unknown[]) => console.info(...args),
      warn: (...args: unknown[]) => console.warn(...args),
      error: (...args: unknown[]) => console.error(...args)
    }
  }

  const logger = {
    debug: (...args: unknown[]) => getActiveLogger().debug(...args),
    info: (...args: unknown[]) => getActiveLogger().info(...args),
    warn: (...args: unknown[]) => getActiveLogger().warn(...args),
    error: (...args: unknown[]) => getActiveLogger().error(...args)
  }

  /**
   * 将 logger 存储到 context（供外部访问）
   */
  context.logger = logger

  /* ---------------------------------------------------------------------------
   * 计算属性：可见性和禁用状态
   * ------------------------------------------------------------------------ */

  /**
   * 可见性状态（基于 config.visible）
   * - 未设置或 true → 可见
   * - false → 隐藏
   */
  const isVisible = computed(() => config.visible !== false)

  /**
   * 禁用状态（基于 config.disabled）
   * - 未设置或 false → 启用
   * - true → 禁用
   */
  const isDisabled = computed(() => config.disabled === true)

  /* ---------------------------------------------------------------------------
   * 能力提供 API
   * ------------------------------------------------------------------------ */

  /**
   * 提供能力实现
   * 
   * 将能力注册到当前 context 的 providers Map，子组件可通过 consume() 获取。
   * 能力会沿着 parent 链向上查找，支持跨层级传递。
   * 
   * 支持两种调用方式：
   * 1. 类型安全：`provide(APP_SERVICES, { router, logger })` — 自动推断 T
   * 2. 动态键：`provide('myCapability', impl)` — 向后兼容
   * 
   * @param name - 能力名称（CapabilityKey<T>、字符串或 Symbol）
   * @param implementation - 能力实现对象
   */
  function provide(name: string | symbol, implementation?: unknown): void {
    const provider: CapabilityProvider = { name, implementation }
    capabilityManager.registerProvider(context, provider)
    logger.info(`🔌 Provided: ${String(name)}`)
  }

  /**
   * 提供事件能力
   * 
   * 创建并注册事件发射器，返回 EventProvider 供当前组件发射事件。
   * 子组件可通过 consumeEvents() 订阅这些事件。
   * 
   * @param name - 能力名称（默认为 'events'）
   * @returns EventProvider 事件发射器（支持 on/off/emit）
   * 
   * @example
   * ```ts
   * // 提供事件能力
   * const events = provideEvents('gridEvents')
   * 
   * // 发射事件
   * events.emit('rowSelected', { row: selectedRow })
   * events.emit('dataChanged', { newData })
   * ```
   */
  function provideEvents(name: string | symbol = 'events'): EventProvider {
    const { provider, emitter } = createEventProvider(String(name))
    // 用原始 name 作为 provider 的名称，保留 Symbol 唯一性
    const capProvider: CapabilityProvider = { name, implementation: provider.implementation }
    capabilityManager.registerProvider(context, capProvider)
    logger.info(`🎉 Provided events: ${String(name)}`)
    return emitter
  }

  /* ---------------------------------------------------------------------------
   * 能力消费 API
   * ------------------------------------------------------------------------ */

  /**
   * 消费能力
   * 
   * 从当前 context 开始沿 parent 链向上查找能力实现。如果找到，将实现对象
   * 绑定到 consumer 并返回；如果未找到，注册 consumer 等待延迟绑定。
   * 
   * 支持两种调用方式：
   * 1. 类型安全：`const svc = consume(APP_SERVICES)` — 返回 AppServicesCapability | null
   * 2. 动态键：`const data = consume('myCapability')` — 返回 unknown
   * 
   * @param name - 能力名称
   * @returns 能力实现对象，未找到返回 null
   */
  function consume(name: string | symbol): unknown {
    const consumer: CapabilityConsumer = { capabilityName: name, implementation: undefined }
    capabilityManager.registerConsumer(context, consumer)

    // registerConsumer 内部已执行 getProvider + connectCapability，
    // 直接检查 consumer.implementation 即可，无需二次查找
    if (consumer.implementation !== null && consumer.implementation !== undefined) {
      logger.info(`🔌 Consumed: ${String(name)}`)
      return consumer.implementation
    }

    logger.warn(`⚠️ Capability not found (late-binding): ${String(name)}`)
    return null
  }

  /**
   * 消费事件能力
   * 
   * 查找事件能力并批量绑定事件处理器。返回 EventProvider 供组件后续
   * 手动订阅/取消订阅事件。
   * 
   * @param name - 事件能力名称
   * @param handlers - 事件处理器映射（事件名 → 处理函数）
   * @returns EventProvider 事件发射器，未找到返回 null
   * 
   * @example
   * ```ts
   * // 消费并订阅事件
   * const events = consumeEvents('gridEvents', {
   *   rowSelected: (row) => console.log('Selected:', row),
   *   dataChanged: (data) => this.handleDataChange(data)
   * })
   * 
   * // 后续可手动订阅更多事件
   * events?.on('columnResized', (col) => {...})
   * ```
   */
  function consumeEvents(
    name: string | symbol,
    handlers: Record<string, (...args: unknown[]) => void>
  ): EventProvider | null {
    const provider = capabilityManager.getProvider(context, name)
    if (provider) {
      const emitter = provider.implementation as EventProvider
      Object.entries(handlers).forEach(([event, handler]) => {
        emitter.on(event, handler)
      })
      logger.info(`🎉 Consumed events: ${String(name)}`)
      return emitter
    }
    logger.warn(`⚠️ Event capability not found: ${String(name)}`)
    return null
  }

  /* ---------------------------------------------------------------------------
   * 能力查找 API
   * ------------------------------------------------------------------------ */

  /**
   * 获取当前 context 的本地 provider
   * 
   * 仅查找当前 context 的 providers Map，不向父级查找。
   * 用于检查本组件是否提供了某个能力。
   * 
   * @param name - 能力名称
   * @returns CapabilityProvider 对象，未找到返回 undefined
   * 
   * @example
   * ```ts
   * const localProvider = getProvider('gridInstance')
   * if (localProvider) {
   *   console.log('当前组件提供了 gridInstance')
   * }
   * ```
   */
  function getProvider(name: string | symbol): CapabilityProvider | undefined {
    return context.providers.get(name)
  }

  /**
   * 沿 parent 链向上查找 provider 实现
   * 
   * 从指定 context（默认当前）开始向上遍历，返回第一个找到的实现。
   * 支持泛型指定返回类型，提供类型安全。
   * 
   * @template T - 实现对象的类型
   * @param name - 能力名称
   * @param ctx - 起始 context（默认为当前 context）
   * @returns 实现对象，未找到返回 undefined
   * 
   * @example
   * ```ts
   * // 查找 DataSet（带类型）
   * const dataSet = getInheritedProvider<DataSet>('dataSet')
   * if (dataSet) {
   *   const users = dataSet.getTable('Users')
   * }
   * 
   * // 从指定 context 开始查找
   * const parentDS = getInheritedProvider<DataSet>('dataSet', parentContext)
   * ```
   */
  function getInheritedProvider<T = unknown>(name: string | symbol, ctx?: ComponentContext): T | undefined {
    let current: ComponentContext | undefined = ctx ?? context
    while (current) {
      const p = current.providers.get(name)
      if (p?.implementation !== undefined) return p.implementation as T
      current = current.parent
    }
    return undefined
  }

  /**
   * 等待能力注册（异步）
   * 
   * 如果能力已存在，立即 resolve；否则注册监听器，等待能力被提供时 resolve。
   * 用于解决组件初始化顺序问题，确保能力可用后再执行逻辑。
   * 
   * 支持两种调用方式：
   * 1. 类型安全：`const svc = await whenAvailable(APP_SERVICES)` — 返回 AppServicesCapability
   * 2. 动态键：`const prov = await whenAvailable('myCapability')` — 返回 CapabilityProvider
   * 
   * @param name - 能力名称
   * @param timeout - 超时时间（毫秒），默认 10000ms，0 表示不超时
   * @returns Promise 能力实现 / 提供者对象
   */
  function whenAvailable(name: string | symbol, timeout = 10000): Promise<unknown> {
    const existing = capabilityManager.getProvider(context, name)
    if (existing) return Promise.resolve(existing.implementation)

    return new Promise((resolve, reject) => {
      context.providerListeners = context.providerListeners ?? new Map()
      if (!context.providerListeners.has(name)) context.providerListeners.set(name, new Set())
      const listeners = context.providerListeners.get(name)
      if (!listeners) {
        reject(new Error(`Failed to create listeners for capability: ${String(name)}`))
        return
      }

      let settled = false
      let timer: ReturnType<typeof setTimeout> | undefined

      const cleanup = () => {
        settled = true
        listeners.delete(cb)
        if (timer !== undefined) clearTimeout(timer)
      }

      const cb = (prov: CapabilityProvider) => {
        if (settled) return
        cleanup()
        resolve(prov.implementation)
      }
      listeners.add(cb)

      // 超时处理
      if (timeout > 0) {
        timer = setTimeout(() => {
          if (settled) return
          cleanup()
          reject(new Error(`whenAvailable("${String(name)}") timed out after ${timeout}ms`))
        }, timeout)
      }

      // 组件卸载时自动清理，避免内存泄漏
      onUnmounted(() => {
        if (settled) return
        cleanup()
        // 静默丢弃，不 reject（组件已销毁，无人关心结果）
      })
    })
  }

  /* ---------------------------------------------------------------------------
   * 注册表访问 API
   * ------------------------------------------------------------------------ */

  /**
   * 从注册表获取组件定义
   * 
   * 查询全局或自定义注册表，返回 markRaw 包装的组件定义，避免不必要的响应式开销。
   * 
   * @param type - 组件类型（kebab-case）
   * @returns 组件定义对象，未找到返回 undefined
   * 
   * @example
   * ```ts
   * const UserGrid = getComponent('user-grid')
   * if (UserGrid) {
   *   // 动态渲染组件
   *   return h(UserGrid, { props: {...} })
   * }
   * ```
   */
  function getComponent(type: string): unknown {
    if (!registry) return undefined
    const def = registry.get(type)
    return def?.component ? markRaw(def.component) : undefined
  }

  /**
   * 检查组件是否已注册
   * 
   * @param type - 组件类型
   * @returns true 已注册，false 未注册或无注册表
   * 
   * @example
   * ```ts
   * if (isComponentRegistered('user-detail')) {
   *   const UserDetail = getComponent('user-detail')
   * } else {
   *   console.warn('User detail component not registered')
   * }
   * ```
   */
  function isComponentRegistered(type: string): boolean {
    return registry?.has(type) ?? false
  }

  /* ---------------------------------------------------------------------------
   * 生命周期管理
   * ------------------------------------------------------------------------ */

  /**
   * 初始化组件
   * 
   * 由 onMounted 自动调用，也可手动调用（用于测试或特殊场景）。
   * 主要用于记录组件初始化日志。
   */
  const initialize = () => logger.info(`🚀 Init: ${context.type} (${context.id})`)

  /**
   * 清理组件
   * 
   * 由 onUnmounted 自动调用，也可手动调用（用于测试或特殊场景）。
   * 执行以下清理操作：
   * 1. 从父级 children 列表中移除当前 context
   * 2. 清空 providers 和 consumers Map
   * 3. 记录销毁日志
   */
  const destroy = () => {
    // 从父 children 中移除
    if (parentContext?.children) {
      const idx = parentContext.children.indexOf(context)
      if (idx !== -1) parentContext.children.splice(idx, 1)
    }
    context.providers.clear()
    context.consumers.clear()
    logger.info(`🗑️ Destroyed: ${context.type} (${context.id})`)
  }

  /**
   * 绑定 Vue 生命周期钩子
   * - onMounted: 自动调用 initialize()
   * - onUnmounted: 自动调用 destroy()
   */
  onMounted(() => {
    initialize()
  })

  onUnmounted(() => {
    destroy()
  })

  /* ---------------------------------------------------------------------------
   * 调试工具 API
   * ------------------------------------------------------------------------ */

  /**
   * 获取上下文链
   * 
   * 从当前 context 向上遍历到根节点，返回完整的上下文链数组。
   * 用于调试和追踪组件层次结构。
   * 
   * @returns ComponentContext[] 上下文数组（当前 → 父级 → ... → 根）
   * 
   * @example
   * ```ts
   * const chain = getContextChain()
   * console.log('组件层级:', chain.map(c => c.type).join(' → '))
   * // 输出: user-field → user-row → user-grid → app-root
   * ```
   */
  function getContextChain(): ComponentContext[] {
    const chain: ComponentContext[] = []
    let current: ComponentContext | undefined = context
    while (current) {
      chain.push(current)
      current = current.parent
    }
    return chain
  }

  /**
   * 打印能力树
   * 
   * 从根节点开始，递归打印整个组件树结构，包括每个 context 提供的能力列表。
   * 用于可视化调试能力系统，查看能力在组件树中的分布。
   * 
   * @example
   * ```ts
   * printCapabilityTree()
   * // 输出示例：
   * // 🌲 Capability Tree:
   * // ├─ app-root (spark-xxx)
   * //    Provides: [appServices, router]
   * //   ├─ user-grid (spark-yyy)
   * //      Provides: [gridInstance, dataSource, selection]
   * //     ├─ user-row (spark-zzz)
   * //        Provides: [rowData]
   * ```
   */
  function printCapabilityTree(): void {
    const print = (ctx: ComponentContext, indent = 0) => {
      const prefix = '  '.repeat(indent)
      const providers = Array.from(ctx.providers.keys()).map(String).join(', ')
      logger.info(`${prefix}├─ ${ctx.type} (${ctx.id})`)
      if (providers) logger.info(`${prefix}   Provides: [${providers}]`)
      ctx.children?.forEach(child => print(child, indent + 1))
    }

    let root: ComponentContext = context
    while (root.parent) root = root.parent
    logger.info('🌲 Capability Tree:')
    print(root)
  }

  /* ---------------------------------------------------------------------------
   * 返回值构建
   * ------------------------------------------------------------------------ */

  /**
   * 返回组件 API 对象
   * 
   * 按功能分组提供完整的组件能力访问接口：
   * - 核心状态：context, isVisible, isDisabled
   * - 能力提供：provide, provideEvents, getProvider, getInheritedProvider
   * - 能力消费：consume, consumeEvents, whenAvailable
   * - 生命周期：initialize, destroy
   * - 工具方法：logger, getComponent, isComponentRegistered
   * - 调试工具：getContextChain, printCapabilityTree
   */
  return {
    // 核心状态
    context,
    isVisible,
    isDisabled,

    // 能力提供
    provide,
    provideEvents,
    getProvider,
    getInheritedProvider,

    // 能力消费
    consume,
    consumeEvents,

    // 异步能力
    whenAvailable,

    // 生命周期
    initialize,
    destroy,

    // 工具方法
    logger,
    getComponent,
    isComponentRegistered,

    // 调试工具
    getContextChain,
    printCapabilityTree
  }
}
