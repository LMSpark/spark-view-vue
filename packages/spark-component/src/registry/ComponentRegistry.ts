/**
 * SPARK 组件注册表
 *
 * ## 职责
 * - 维护组件类型到组件定义的映射关系
 * - 提供组件注册、查询、注销等基础操作
 * - 支持组件元数据存储
 * - **全局实例管理**：确保应用级别的组件注册一致性
 *
 * ## 设计原则
 * - **纯数据结构**：无副作用，无外部依赖
 * - **同步操作**：无异步加载（异步加载由 Vue 的 `defineAsyncComponent` 处理）
 * - **高效存储**：使用原生 Map，无额外缓存层
 * - **类型安全**：严格的 TypeScript 类型约束
 * - **全局单例**：通过 `getGlobalRegistry()` 确保应用级单例
 *
 * ## 使用场景
 * - **全局组件注册**：通过 `getGlobalRegistry()` 获取应用级注册表
 * - **隔离测试环境**：通过 `createComponentRegistry()` 创建独立实例
 * - **多实例应用**：每个实例使用独立的注册表
 *
 * ## 全局注册表模式
 * ```typescript
 * // 推荐：使用全局注册表
 * import { getGlobalRegistry } from './ComponentRegistry'
 *
 * const registry = getGlobalRegistry()
 * registry.register('user-grid', UserGrid)
 *
 * // 在其他地方获取相同实例
 * const sameRegistry = getGlobalRegistry()
 * const grid = sameRegistry.get('user-grid') // ✅ 获取成功
 * ```
 *
 * @module registry
 */

import { Logger } from '@spark-view/spark-utils'
import type { ComponentRegistry, ComponentDefinition } from '../core/types.js'

/* -----------------------------------------------------------------------------
 * 常量和配置
 * -------------------------------------------------------------------------- */

const logger = Logger('Spark:Registry')

/* -----------------------------------------------------------------------------
 * 全局注册表单例
 * -------------------------------------------------------------------------- */

/**
 * 全局组件注册表实例（惰性创建）
 *
 * 使用单例模式确保整个应用共享同一个注册表实例。
 * 这是 SPARK 系统的核心组件，所有组件注册最终都会存储在这里。
 */
let _globalRegistry: ComponentRegistry | undefined

/**
 * 获取全局注册表实例
 *
 * 如果全局注册表不存在，会自动创建新的实例。
 * 确保整个应用使用同一个注册表，避免组件注册冲突。
 *
 * @returns 全局注册表实例
 *
 * @example
 * // 获取全局注册表
 * const registry = getGlobalRegistry()
 *
 * // 注册组件到全局注册表
 * registry.register('user-grid', UserGridComponent)
 *
 * // 在其他地方获取相同实例
 * const sameRegistry = getGlobalRegistry()
 * const grid = sameRegistry.get('user-grid') // 获取到刚才注册的组件
 */
export function getGlobalRegistry(): ComponentRegistry {
  _globalRegistry ??= createComponentRegistry()
  return _globalRegistry
}

/* -----------------------------------------------------------------------------
 * 注册表工厂
 * -------------------------------------------------------------------------- */

/**
 * 创建组件注册表实例
 *
 * 返回一个全新的注册表实例，包含完整的 CRUD 操作接口。
 * 每次调用都会创建独立的实例，确保隔离性。
 *
 * **注意**：此函数创建的是隔离实例。如果需要全局注册表，请使用 `getGlobalRegistry()`。
 *
 * @returns 新的注册表实例（隔离的）
 *
 * @example
 * // ❌ 不推荐：创建多个隔离实例（会导致组件无法共享）
 * const reg1 = createComponentRegistry()
 * const reg2 = createComponentRegistry()
 * reg1.register('user-grid', UserGrid)
 * const grid = reg2.get('user-grid') // undefined - 组件未找到
 *
 * @example
 * // ✅ 推荐：使用全局注册表
 * const registry = getGlobalRegistry()
 * registry.register('user-grid', UserGrid)
 *
 * // 在其他地方获取相同实例
 * const sameRegistry = getGlobalRegistry()
 * const grid = sameRegistry.get('user-grid') // ✅ 获取成功
 *
 * @example
 * // 测试环境使用隔离实例
 * const testRegistry = createComponentRegistry()
 * testRegistry.register('test-comp', TestComponent)
 * // 测试完成后，testRegistry 与全局注册表互不影响
 */
export function createComponentRegistry(): ComponentRegistry {
  // 内部存储：type -> ComponentDefinition
  const components = new Map<string, ComponentDefinition>()

  /* ---------------------------------------------------------------------------
   * 核心方法实现
   * ------------------------------------------------------------------------ */

  return {
    /**
     * 注册组件到注册表
     *
     * 如果类型已存在，会覆盖原有组件并记录警告日志。
     * 支持存储组件元数据（如图标、描述、分类等）。
     *
     * @param type - 组件类型标识（kebab-case），唯一键
     * @param component - 组件定义（Vue 组件对象或异步组件）
     * @param meta - 可选的组件元数据，用于扩展信息存储
     * @param options - 注册选项
     * @throws {Error} 当 type 为空字符串时抛出错误
     *
     * @example
     * // 注册基础组件
     * registry.register('user-grid', UserGrid)
     *
     * // 注册带元数据的组件
     * registry.register('data-table', DataTable, {
     *   category: 'data',
     *   icon: 'table',
     *   description: '高级数据表格组件'
     * })
     *
     * @example
     * // 覆盖现有组件（会记录警告）
     * registry.register('user-grid', NewUserGrid) // 警告：Overwriting component: user-grid
     * 
     * @example
     * // 静默覆盖（用于 HMR）
     * registry.register('user-grid', NewUserGrid, undefined, { silent: true })
     */
    register(
      type: string, 
      component: unknown, 
      meta?: Record<string, unknown>,
      options?: { silent?: boolean }
    ): void {
      if (!type) throw new Error('Component type is required')

      if (components.has(type) && !options?.silent) {
        logger.warn(`Overwriting component: ${type}`)
      }

      const definition: ComponentDefinition = { type, component }
      if (meta !== undefined) {
        definition.meta = meta
      }
      components.set(type, definition)
      
      if (!options?.silent) {
        logger.debug(`Registered: ${type}`)
      }
    },

    /**
     * 仅在组件未注册时注册（幂等操作）
     * 
     * 用于避免重复注册警告，适用于：
     * - 多次调用的初始化代码
     * - HMR 热更新场景
     * - 模块重新导入场景
     *
     * @param type - 组件类型标识
     * @param component - 组件定义
     * @param meta - 组件元数据（可选）
     * @returns 是否执行了注册（true: 已注册，false: 跳过）
     *
     * @example
     * // 多次调用不会产生警告
     * registry.registerOnce('user-grid', UserGrid) // ✅ 注册成功
     * registry.registerOnce('user-grid', UserGrid) // ✅ 跳过，无警告
     */
    registerOnce(type: string, component: unknown, meta?: Record<string, unknown>): boolean {
      if (components.has(type)) {
        return false
      }

      const definition: ComponentDefinition = { type, component }
      if (meta !== undefined) {
        definition.meta = meta
      }
      components.set(type, definition)
      logger.debug(`Registered: ${type}`)
      return true
    },

    /**
     * 根据类型获取组件定义
     *
     * @param type - 组件类型标识
     * @returns 组件定义对象，如果不存在则返回 undefined
     *
     * @example
     * const def = registry.get('user-grid')
     * if (def) {
     *   // 使用组件
     *   const component = def.component
     *   const meta = def.meta
     * }
     */
    get(type: string): ComponentDefinition | undefined {
      return components.get(type)
    },

    /**
     * 检查组件类型是否存在
     *
     * @param type - 组件类型标识
     * @returns 是否已注册该类型
     *
     * @example
     * if (registry.has('user-grid')) {
     *   console.log('UserGrid 组件已注册')
     * }
     */
    has(type: string): boolean {
      return components.has(type)
    },

    /**
     * 从注册表中移除组件
     *
     * @param type - 要移除的组件类型标识
     * @returns 是否成功移除（true 表示原来存在，false 表示不存在）
     *
     * @example
     * const removed = registry.unregister('user-grid')
     * console.log(removed ? '已移除' : '组件不存在')
     */
    unregister(type: string): boolean {
      const existed = components.delete(type)
      if (existed) logger.debug(`Unregistered: ${type}`)
      return existed
    },

    /**
     * 获取所有已注册组件的副本
     *
     * 返回新的 Map 实例，避免外部直接修改内部存储。
     *
     * @returns 包含所有组件定义的 Map 副本
     *
     * @example
     * // 遍历所有组件
     * for (const [type, def] of registry.getAll()) {
     *   console.log(`${type}:`, def.meta?.description)
     * }
     *
     * @example
     * // 获取组件类型列表
     * const types = Array.from(registry.getAll().keys())
     * console.log('已注册类型:', types)
     */
    getAll(): Map<string, ComponentDefinition> {
      return new Map(components)
    }
  }
}
