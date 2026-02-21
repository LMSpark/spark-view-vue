/**
 * SPARK 组件注册表
 *
 * - `createComponentRegistry()` 创建隔离实例（测试/多实例）
 * - `getGlobalRegistry()` 返回应用级单例
 *
 * @module registry
 */

import { Logger } from '@spark-view/spark-utils'
import type { ComponentRegistry, ComponentDefinition } from '../core/types.js'

const logger = Logger('Spark:Registry')

/* -------------------------------------------------------------------------- */

let _globalRegistry: ComponentRegistry | undefined

/** 获取全局注册表单例（惰性创建）。 */
export function getGlobalRegistry(): ComponentRegistry {
  _globalRegistry ??= createComponentRegistry()
  return _globalRegistry
}

/* -------------------------------------------------------------------------- */

/** 构造 ComponentDefinition，合并可选 meta。 */
function createDefinition(
  type: string,
  component: unknown,
  meta?: Record<string, unknown>
): ComponentDefinition {
  const def: ComponentDefinition = { type, component }
  if (meta !== undefined) def.meta = meta
  return def
}

/**
 * 创建隔离的组件注册表实例。
 * 需要全局注册表请用 `getGlobalRegistry()`。
 */
export function createComponentRegistry(): ComponentRegistry {
  const components = new Map<string, ComponentDefinition>()

  return {
    /**
     * 注册组件，若 type 已存在则覆盖并打 warn。
     * `options.silent = true` 时静默覆盖（HMR 场景）。
     */
    register(
      type: string,
      component: unknown,
      meta?: Record<string, unknown>,
      options?: { silent?: boolean }
    ): void {
      if (!type) throw new Error('Component type is required')
      if (components.has(type) && !options?.silent) logger.warn(`Overwriting component: ${type}`)
      components.set(type, createDefinition(type, component, meta))
      if (!options?.silent) logger.debug(`Registered: ${type}`)
    },

    /**
     * 仅在 type 未注册时注册（幂等）。
     * @returns true 表示本次注册成功，false 表示已存在跳过。
     */
    registerOnce(type: string, component: unknown, meta?: Record<string, unknown>): boolean {
      if (components.has(type)) return false
      components.set(type, createDefinition(type, component, meta))
      logger.debug(`Registered: ${type}`)
      return true
    },

    /** 按 type 获取组件定义，不存在返回 undefined。 */
    get(type: string): ComponentDefinition | undefined {
      return components.get(type)
    },

    /** 检查 type 是否已注册。 */
    has(type: string): boolean {
      return components.has(type)
    },

    /** 移除组件，返回是否存在（存在才移除）。 */
    unregister(type: string): boolean {
      const existed = components.delete(type)
      if (existed) logger.debug(`Unregistered: ${type}`)
      return existed
    },

    /** 返回所有已注册组件的 Map 副本（防止外部直接修改内部存储）。 */
    getAll(): Map<string, ComponentDefinition> {
      return new Map(components)
    }
  }
}
