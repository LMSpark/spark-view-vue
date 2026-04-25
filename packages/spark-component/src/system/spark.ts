/**
 * SPARK 命名空间 — 统一 API 入口
 *
 * - `Spark.register(type, component)` — 注册单个组件
 * - `Spark.registerAll(components, modules?)` — 批量注册
 * - `Spark.createRegister(modules)` — 创建绑定 glob 的注册器
 * - `Spark.createPlugin()` — 创建 Vue 插件
 * - `Spark.createRegistry()` — 创建隔离注册表
 * - `Spark.createSystem()` — 创建测试用隔离系统
 *
 * @module spark
 */

import { defineAsyncComponent } from 'vue'
import { createComponentRegistry, getGlobalRegistry } from './registry.js'
import { createSparkPlugin } from './plugin.js'
import type { SparkCapabilityContext, ComponentRegistry, SparkNode } from '../core/types.js'
import { nodeId, SPARK_NODE_STRUCT_KEYS, normalizeSparkNode } from '../core/types.js'
import { createSparkCapabilityContext } from '../core/capability-system.js'

/* -------------------------------------------------------------------------- */

/** 单个懒加载组件 loader 类型（与 import.meta.glob 配合使用） */
export type ComponentLoader = () => Promise<{ default: unknown }>

/** Vite import.meta.glob 返回的模块映射类型 */
export type GlobModules = Record<string, ComponentLoader>

/** Spark.createRegister() 返回的注册器上下文 */
export interface RegisterContext {
  /** 注册单个组件（路径 → type 映射） */
  register(type: string, path: string, meta?: Record<string, unknown>): void
  /** 批量注册（{ type: path } 映射表） */
  registerAll(components: Record<string, string>): void
}

/** Spark.createSystem() 返回的隔离测试系统 */
export interface SparkSystem {
  registry: ComponentRegistry
  rootContext: SparkCapabilityContext
  createContext(config: Partial<SparkCapabilityContext> & { type: string }, parent?: SparkCapabilityContext): SparkCapabilityContext
}

/* -------------------------------------------------------------------------- */

/**
 * 解析组件：路径字符串 → 异步组件，动态导入函数 → 异步组件，其他 → 原样返回
 */
function resolveComponent(component: unknown, modules?: GlobModules): unknown {
  if (typeof component === 'string') {
    if (!modules) {
      throw new Error(
        `[Spark] 使用路径字符串注册组件时，必须提供 modules 参数。\n`
        + `用法: const reg = Spark.createRegister(import.meta.glob('./*.vue')); reg.register('type', './Comp.vue')`
      )
    }
    const loader = modules[component]
    if (!loader) {
      throw new Error(
        `[Spark] 未找到模块 "${component}"。\n可用: ${Object.keys(modules).join(', ') || '(无)'}`
      )
    }
    return defineAsyncComponent(loader)
  }

  if (typeof component === 'function' && component.length === 0) {
    return defineAsyncComponent(component as ComponentLoader)
  }

  return component
}

/* -------------------------------------------------------------------------- */

export const Spark = {
  /**
   * 创建绑定 Glob 模块的注册器（推荐方式）
   *
   * @example
   * const reg = Spark.createRegister(import.meta.glob('./*.vue'))
   * reg.registerAll({ 'user-grid': './UserGrid.vue' })
   */
  createRegister(modules: GlobModules): RegisterContext {
    return {
      register(type: string, path: string, meta?: Record<string, unknown>): void {
        getGlobalRegistry().register(type, resolveComponent(path, modules), meta)
      },
      registerAll(components: Record<string, string>): void {
        const reg = getGlobalRegistry()
        for (const [type, path] of Object.entries(components)) {
          reg.register(type, resolveComponent(path, modules))
        }
      }
    }
  },

  /**
   * 注册单个组件到全局注册表
   *
   * 支持直接组件对象和动态导入函数两种方式。
   * 路径字符串请使用 `Spark.createRegister()` 注册。
   *
   * 框架能力支持动态 loader（`() => import(...)`），但当前生产代码路径主要使用同步注册。
   * 如需运行时动态注册组件，可传递 loader 函数；实际的动态加载由 `defineAsyncComponent` 处理。
   *
   * @example
   * Spark.register('user-grid', UserGrid)                                // 同步注册
   * Spark.register('user-grid', () => import('./UserGrid.vue'))       // 动态 loader（框架能力，非当前路径）
   */
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- documents accepted types even though ComponentLoader ⊆ unknown
  register(type: string, component: unknown | ComponentLoader, meta?: Record<string, unknown>): void {
    getGlobalRegistry().register(type, resolveComponent(component), meta)
  },

  /**
   * 批量注册组件
   *
   * 框架支持多种注册策略：
   * 1. 同步注册 — `Spark.registerAll({ 'type': Component, ... })` — 当前主要路径
   * 2. Glob 路径字符串 — `Spark.registerAll({ 'type': './path' }, import.meta.glob(...))`
   * 3. 动态 loader — `Spark.registerAll({ 'type': () => import(...) })` — 框架能力，不在当前代码路径中
   *
   * @example
   * // 同步批量注册（当前路径）
   * Spark.registerAll({
   *   'user-grid': UserGrid,
   *   'user-row': UserRow
   * })
   *
   * // Glob 路径注册
   * Spark.registerAll({
   *   'user-grid': './UserGrid.vue',
   *   'user-row': './UserRow.vue'
   * }, import.meta.glob('./*.vue'))
   */
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- documents accepted types even though ComponentLoader ⊆ unknown
  registerAll(components: Record<string, unknown | ComponentLoader>, modules?: GlobModules): void {
    const reg = getGlobalRegistry()
    for (const [type, component] of Object.entries(components)) {
      reg.register(type, resolveComponent(component, modules))
    }
  },

  /** 创建 SPARK Vue 插件 */
  createPlugin(options?: { registry?: ComponentRegistry }) {
    return createSparkPlugin(options)
  },

  /** 获取全局组件注册表 */
  getRegistry(): ComponentRegistry {
    return getGlobalRegistry()
  },

  /** 创建隔离注册表（用于测试或多实例） */
  createRegistry(): ComponentRegistry {
    return createComponentRegistry()
  },

  /**
   * 创建隔离的测试系统（用于单元测试，不影响全局注册表）
   *
   * @returns SparkSystem — { registry, rootContext, createContext }
   */
  createSystem(): SparkSystem {
    const registry = createComponentRegistry()
    let _testCounter = 0

    const rootContext = createSparkCapabilityContext({ id: 'test-root', type: 'spark-test-root' })

    return {
      registry,
      rootContext,
      createContext(config: Partial<SparkCapabilityContext> & { type: string }, parent?: SparkCapabilityContext): SparkCapabilityContext {
        const parentCtx = parent ?? rootContext
        return createSparkCapabilityContext({
          id: config.id ?? `test-${++_testCounter}`,
          type: config.type,
        }, parentCtx)
      }
    }
  },

  // ── SparkNode 工具方法 ────────────────────────────────────────────────────

  /** SparkNode 结构键集合（type/props/children） */
  STRUCT_KEYS: SPARK_NODE_STRUCT_KEYS,

  /** 归一化节点结构语义（type/children） */
  normalizeNode(node: SparkNode, fallbackType?: string): SparkNode {
    return normalizeSparkNode(node, fallbackType)
  },

  /**
   * 读取节点 id（顶层 `node.id` 为标准；未归一化输入回退读取 `node.props.id`）。
   *
   * @example Spark.nodeId(child) ?? `fallback-${i}`
   */
  nodeId(node: SparkNode): string | undefined {
    return nodeId(node)
  },
}
