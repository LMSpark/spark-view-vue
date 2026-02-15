/**
 * SPARK 命名空间 - 统一 API 入口
 *
 * ## 核心功能
 * - **组件注册**：支持直接组件、动态导入、路径字符串三种方式
 * - **插件系统**：Vue 插件集成，自动管理注册表和能力系统
 * - **隔离系统**：为测试环境提供独立的注册表和上下文
 * - **日志工具**：统一的日志管理接口
 *
 * ## 主要 API
 * - `Spark.register(type, component)` — 注册单个组件
 * - `Spark.registerAll(components)` — 批量注册组件
 * - `Spark.createRegister(modules)` — 创建绑定 glob 模块的注册器
 * - `Spark.createPlugin()` — 创建 Vue 插件
 * - `Spark.createRegistry()` — 创建隔离注册表
 * - `Spark.createSystem()` — 创建测试用隔离系统
 * - `Spark.Logger` — 日志工具
 *
 * @module spark
 */

import { defineAsyncComponent } from 'vue'
import { Logger, createCapabilityManager } from '@spark-view/spark-utils'
import { createComponentRegistry, getGlobalRegistry } from './registry/ComponentRegistry.js'
import { createSparkPlugin } from './plugins/SparkPlugin.js'
import type { ComponentContext, ComponentRegistry, CapabilityProvider, CapabilityConsumer, CapabilityName } from './core/types.js'

/* -----------------------------------------------------------------------------
 * 类型定义
 * -------------------------------------------------------------------------- */

/**
 * 组件加载器 - 返回 Promise<{ default: Component }> 的函数
 *
 * 用于延迟加载组件，支持代码分割和按需加载
 *
 * @example
 * const loader: ComponentLoader = () => import('./MyComponent.vue')
 */
type ComponentLoader = () => Promise<{ default: unknown }>

/**
 * Glob 模块映射 - import.meta.glob() 的返回类型
 *
 * 键为文件路径（如 './UserGrid.vue'），值为组件加载器函数
 *
 * @example
 * const modules: GlobModules = import.meta.glob('./*.vue')
 */
type GlobModules = Record<string, ComponentLoader>

/**
 * 注册器上下文 - 绑定了 glob 模块的便捷注册接口
 *
 * 通过 `Spark.createRegister(modules)` 创建，可直接使用路径字符串注册组件
 *
 * @example
 * const register = Spark.createRegister(import.meta.glob('./*.vue'))
 * register.register('user-grid', './UserGrid.vue')
 * register.registerAll({
 *   'user-row': './UserRow.vue',
 *   'user-field': './UserField.vue'
 * })
 */
interface RegisterContext {
  /**
   * 注册单个组件
   *
   * @param type - 组件类型标识（kebab-case）
   * @param path - 组件文件路径（相对于 glob 根目录）
   * @param meta - 可选的组件元数据
   */
  register(type: string, path: string, meta?: Record<string, unknown>): void

  /**
   * 批量注册组件
   *
   * @param components - 类型到路径的映射对象
   */
  registerAll(components: Record<string, string>): void
}

/* -----------------------------------------------------------------------------
 * 组件解析器
 * -------------------------------------------------------------------------- */

/**
 * 解析组件 - 统一处理三种注册方式
 *
 * 支持的组件类型：
 * 1. **路径字符串**：`'./UserGrid.vue'` → 从 modules 查找并包装为异步组件
 * 2. **动态导入函数**：`() => import('./UserGrid.vue')` → 包装为异步组件
 * 3. **直接组件**：`UserGrid` → 原样返回
 *
 * @param component - 待解析的组件（路径/函数/对象）
 * @param modules - Glob 模块映射（路径字符串方式必需）
 * @returns 解析后的组件定义
 * @throws {Error} 路径字符串模式下未提供 modules 或路径不存在
 *
 * @example
 * // 1. 路径字符串（需要 modules）
 * const comp = resolveComponent('./UserGrid.vue', import.meta.glob('./*.vue'))
 *
 * // 2. 动态导入函数
 * const comp = resolveComponent(() => import('./UserGrid.vue'))
 *
 * // 3. 直接组件
 * const comp = resolveComponent(UserGrid)
 */
function resolveComponent(component: unknown, modules?: GlobModules): unknown {
  // 情况 1：字符串路径 → 从 modules 中查找加载器，包装为异步组件
  if (typeof component === 'string') {
    if (!modules) {
      throw new Error(
        `[Spark] 使用路径字符串注册组件时，必须提供 modules 参数。\n`
        + `用法 1: Spark.register('type', './Comp.vue', { modules: import.meta.glob('./*.vue') })\n`
        + `用法 2: const reg = Spark.createRegister(import.meta.glob('./*.vue')); reg.register('type', './Comp.vue')`
      )
    }
    const loader = modules[component]
    if (!loader) {
      const available = Object.keys(modules).join(', ')
      throw new Error(
        `[Spark] 未找到模块 "${component}"。\n可用模块: ${available || '(无)'}`
      )
    }
    return defineAsyncComponent(loader)
  }

  // 情况 2：无参函数 → 视为动态导入函数，包装为异步组件
  if (typeof component === 'function' && component.length === 0) {
    return defineAsyncComponent(component as ComponentLoader)
  }

  // 情况 3：其他类型 → 视为直接组件定义，原样返回
  return component
}

/* -----------------------------------------------------------------------------
 * SPARK 命名空间 - 公共 API
 * -------------------------------------------------------------------------- */

export const Spark = {
  /* ---------------------------------------------------------------------------
   * 注册器工厂
   * ------------------------------------------------------------------------ */

  /**
   * 创建绑定 Glob 模块的注册器上下文
   *
   * 通过绑定 `import.meta.glob()` 的结果，可以直接使用路径字符串注册组件，
   * 无需手动编写动态导入函数。这是最推荐的注册方式。
   *
   * @param modules - Glob 模块映射，通常来自 `import.meta.glob('./*.vue')`
   * @returns 注册器上下文对象，提供 `register()` 和 `registerAll()` 方法
   *
   * @example
   * // 1. 创建注册器（绑定当前目录所有 .vue 文件）
   * const register = Spark.createRegister(import.meta.glob('./*.vue'))
   *
   * // 2. 使用路径字符串注册单个组件
   * register.register('user-grid', './UserGrid.vue')
   * register.register('user-row', './UserRow.vue', { icon: 'user' })
   *
   * // 3. 批量注册多个组件
   * register.registerAll({
   *   'user-grid': './UserGrid.vue',
   *   'user-row': './UserRow.vue',
   *   'user-field': './UserField.vue'
   * })
   *
   * @remarks
   * - 组件会被包装为异步组件，支持代码分割和懒加载
   * - 路径必须与 glob 模式匹配，否则会抛出错误并列出可用模块
   * - 适用场景：功能模块内批量注册多个相关组件
   */
  createRegister(modules: GlobModules): RegisterContext {
    return {
      register(type: string, path: string, meta?: Record<string, unknown>): void {
        const component = resolveComponent(path, modules)
        getGlobalRegistry().register(type, component, meta)
      },
      registerAll(components: Record<string, string>): void {
        Object.entries(components).forEach(([type, path]) => {
          const component = resolveComponent(path, modules)
          getGlobalRegistry().register(type, component)
        })
      }
    }
  },

  /* ---------------------------------------------------------------------------
   * 全局注册方法
   * ------------------------------------------------------------------------ */

  /**
   * 注册单个组件到全局注册表
   *
   * 支持三种注册方式，适应不同的使用场景：
   *
   * **方式 1：直接组件对象**
   * 适用于已导入的组件，无代码分割
   * ```ts
   * import UserGrid from './UserGrid.vue'
   * Spark.register('user-grid', UserGrid)
   * ```
   *
   * **方式 2：动态导入函数**
   * 适用于单个组件，支持代码分割和懒加载
   * ```ts
   * Spark.register('user-grid', () => import('./UserGrid.vue'))
   * ```
   *
   * **方式 3：路径字符串 + Glob 模块**
   * 适用于与其他组件共享 glob 模块的场景
   * ```ts
   * const modules = import.meta.glob('./*.vue')
   * Spark.register('user-grid', './UserGrid.vue', { modules })
   * Spark.register('user-row', './UserRow.vue', { modules })
   * ```
   *
   * @param type - 组件类型标识（kebab-case），用于 `<spark-component type="...">`
   * @param component - 组件定义（对象/函数/路径字符串）
   * @param options - 可选配置
   * @param options.modules - Glob 模块映射（路径字符串方式必需）
   * @param options.meta - 组件元数据（如图标、描述等）
   *
   * @example
   * // 场景 1：导入单个组件（入口文件）
   * import App from './App.vue'
   * Spark.register('app-root', App)
   *
   * // 场景 2：懒加载单个组件（路由组件）
   * Spark.register('user-detail', () => import('./UserDetail.vue'))
   *
   * // 场景 3：批量注册时逐个调用（与 registerAll 配合）
   * const modules = import.meta.glob('./*.vue')
   * Spark.register('grid', './Grid.vue', { modules, meta: { category: 'data' } })
   *
   * @see {@link registerAll} - 批量注册多个组件
   * @see {@link createRegister} - 推荐：创建绑定 modules 的注册器
   */
  register(
    type: string,
    component: unknown | string | ComponentLoader,
    options?: { modules?: GlobModules; meta?: Record<string, unknown> }
  ): void {
    const finalComponent = resolveComponent(component, options?.modules)
    getGlobalRegistry().register(type, finalComponent, options?.meta)
  },

  /**
   * 批量注册多个组件到全局注册表
   *
   * 支持三种数据格式，自动识别并处理：
   *
   * **格式 1：值为动态导入函数**
   * 适用于少量组件，无需额外配置
   * ```ts
   * Spark.registerAll({
   *   'user-grid': () => import('./UserGrid.vue'),
   *   'user-row': () => import('./UserRow.vue')
   * })
   * ```
   *
   * **格式 2：值为路径字符串 + modules 参数**
   * 适用于同目录大量组件，最简洁（推荐）
   * ```ts
   * Spark.registerAll({
   *   'user-grid': './UserGrid.vue',
   *   'user-row': './UserRow.vue',
   *   'user-field': './UserField.vue'
   * }, import.meta.glob('./*.vue'))
   * ```
   *
   * **格式 3：值为直接组件对象**
   * 适用于已导入的组件集合
   * ```ts
   * import UserGrid from './UserGrid.vue'
   * import UserRow from './UserRow.vue'
   * Spark.registerAll({
   *   'user-grid': UserGrid,
   *   'user-row': UserRow
   * })
   * ```
   *
   * @param components - 类型到组件的映射对象
   * @param modules - 可选的 Glob 模块映射（路径字符串格式必需）
   *
   * @example
   * // 推荐方式：路径字符串 + glob（最简洁）
   * Spark.registerAll({
   *   'user-grid': './UserGrid.vue',
   *   'user-row': './UserRow.vue',
   *   'user-field': './UserField.vue'
   * }, import.meta.glob('./*.vue'))
   *
   * // 或者使用 createRegister（语义更清晰）
   * const register = Spark.createRegister(import.meta.glob('./*.vue'))
   * register.registerAll({
   *   'user-grid': './UserGrid.vue',
   *   'user-row': './UserRow.vue'
   * })
   *
   * @see {@link register} - 注册单个组件
   * @see {@link createRegister} - 创建绑定 modules 的注册器（推荐）
   */
  registerAll(components: Record<string, unknown | string | ComponentLoader>, modules?: GlobModules): void {
    const reg = getGlobalRegistry()
    Object.entries(components).forEach(([type, component]) => {
      const finalComponent = resolveComponent(component, modules)
      reg.register(type, finalComponent)
    })
  },

  /* ---------------------------------------------------------------------------
   * 系统工厂方法
   * ------------------------------------------------------------------------ */

  /**
   * 创建 SPARK Vue 插件
   *
   * 插件会自动注入以下内容到 Vue 应用：
   * - 全局组件注册表（通过 Symbol provide）
   * - 能力管理器（用于跨组件通信）
   * - `<spark-component>` 渲染器组件
   *
   * @param options - 可选配置
   * @param options.registry - 自定义注册表（默认使用全局注册表）
   * @returns Vue 插件对象
   *
   * @example
   * // 标准用法：使用全局注册表
   * import { createApp } from 'vue'
   * import { Spark } from '@spark-view/spark-component'
   *
   * const app = createApp(App)
   * app.use(Spark.createPlugin())
   *
   * @example
   * // 高级用法：使用隔离注册表（多实例场景）
   * const registry = Spark.createRegistry()
   * const plugin = Spark.createPlugin({ registry })
   * app.use(plugin)
   *
   * @see {@link getRegistry} - 获取全局注册表
   * @see {@link createRegistry} - 创建隔离注册表
   */
  createPlugin(options?: { registry?: ComponentRegistry }) {
    return createSparkPlugin(options)
  },

  /**
   * 获取全局组件注册表
   *
   * 返回由 `Spark.register()` 和 `Spark.registerAll()` 使用的全局注册表实例。
   * 插件默认也使用此注册表。
   *
   * @returns 全局注册表实例
   *
   * @example
   * const registry = Spark.getRegistry()
   * const UserGrid = registry.get('user-grid')
   * const allTypes = registry.list()
   */
  getRegistry(): ComponentRegistry {
    return getGlobalRegistry()
  },

  /**
   * 创建隔离的组件注册表
   *
   * 用于测试环境或多实例场景，确保组件注册不会相互干扰。
   * 每次调用都会创建全新的独立实例。
   *
   * @returns 新的注册表实例
   *
   * @example
   * // 测试用例中创建隔离环境
   * const registry = Spark.createRegistry()
   * registry.register('test-comp', TestComponent)
   *
   * const plugin = Spark.createPlugin({ registry })
   * mount(MyComponent, {
   *   global: { plugins: [plugin] }
   * })
   *
   * @see {@link createSystem} - 创建完整的隔离测试系统
   */
  createRegistry(): ComponentRegistry {
    return createComponentRegistry()
  },

  /**
   * 创建隔离的测试系统
   *
   * 返回包含注册表、能力管理器和根上下文的完整测试环境。
   * 适用于需要模拟完整组件树和能力系统的集成测试。
   *
   * @returns 测试系统对象
   * @returns registry - 隔离的组件注册表
   * @returns capabilities - 能力管理器实例
   * @returns rootContext - 测试用根上下文
   * @returns createContext - 便捷方法：创建子上下文
   *
   * @example
   * // 创建隔离测试环境
   * const system = Spark.createSystem()
   *
   * // 注册测试组件
   * system.registry.register('test-grid', TestGrid)
   *
   * // 创建根级上下文
   * const gridCtx = system.createContext({ type: 'test-grid' })
   *
   * // 创建子级上下文
   * const rowCtx = system.createContext({ type: 'test-row' }, gridCtx)
   *
   * // 模拟能力提供
   * gridCtx.providers.set('selection', {
   *   name: 'selection',
   *   context: gridCtx,
   *   implementation: { getSelected() { return [] } }
   * })
   *
   * @see {@link createRegistry} - 仅创建隔离注册表
   */
  createSystem() {
    const registry = createComponentRegistry()
    const capabilities = createCapabilityManager()

    // 创建测试用根上下文
    const rootContext: ComponentContext = {
      id: 'test-root',
      type: 'spark-test-root',
      children: [],
      state: {},
      providers: new Map<CapabilityName, CapabilityProvider>(),
      consumers: new Map<CapabilityName, CapabilityConsumer>()
    }

    return {
      registry,
      capabilities,
      rootContext,

      /**
       * 创建子上下文的便捷方法
       *
       * @param config - 上下文配置（必须包含 type）
       * @param parent - 父上下文（默认为 rootContext）
       * @returns 新创建的子上下文
       */
      createContext(config: Partial<ComponentContext> & { type: string }, parent?: ComponentContext): ComponentContext {
        const ctx: ComponentContext = {
          id: config.id ?? `test-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
          type: config.type,
          parent: parent ?? rootContext,
          children: [],
          props: config.props ?? {},
          state: {},
          providers: new Map<CapabilityName, CapabilityProvider>(),
          consumers: new Map<CapabilityName, CapabilityConsumer>()
        }
        const p = ctx.parent
        if (p?.children) p.children.push(ctx)
        else if (p) p.children = [ctx]
        return ctx
      }
    }
  },

  /* ---------------------------------------------------------------------------
   * 工具集成
   * ------------------------------------------------------------------------ */

  /**
   * 日志工具
   *
   * 统一的日志管理接口，支持日志级别、格式化和传输。
   *
   * @example
   * const logger = Spark.Logger.create({ prefix: 'MyApp' })
   * logger.info('Application started')
   * logger.error('Failed to load', { error })
   *
   * @see {@link @spark-view/spark-utils!Logger}
   */
  Logger
}

