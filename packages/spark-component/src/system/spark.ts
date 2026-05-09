/**
 * SPARK 命名空间 — 统一 API 入口
 *
 * - `Spark.register(type, component)` — 注册单个已解析组件
 * - `Spark.registerAll(components)` — 批量注册已解析组件
 * - `Spark.createPlugin()` — 创建 Vue 插件
 * - `Spark.createRegistry()` — 创建隔离注册表
 * - `Spark.createSystem()` — 创建测试用隔离系统
 *
 * @module spark
 */

import { createSparkCapabilityContext } from '@spark-view/spark-utils'
import { createComponentRegistry, getGlobalRegistry } from './registry.js'
import { createSparkPlugin } from './plugin.js'
import type { SparkCapabilityContext, ComponentRegistry, SparkNode } from '../core/types.js'
import { nodeId, SPARK_NODE_STRUCT_KEYS, normalizeSparkNode } from '../core/types.js'

/* -------------------------------------------------------------------------- */

/** Spark.createSystem() 返回的隔离测试系统 */
export interface SparkSystem {
  registry: ComponentRegistry
  rootContext: SparkCapabilityContext
  createContext(config: Partial<SparkCapabilityContext> & { type: string }, parent?: SparkCapabilityContext): SparkCapabilityContext
}

/* -------------------------------------------------------------------------- */

export const Spark = {
  /**
   * 注册单个组件到全局注册表
   *
   * 仅接收已经解析好的 Vue 组件。异步组件由调用方显式使用
   * `defineAsyncComponent(loader)` 后再注册，避免把普通零参数函数组件误判为 loader。
   *
   * @example
   * Spark.register('user-grid', UserGrid)
   */
  register(type: string, component: unknown, meta?: Record<string, unknown>): void {
    getGlobalRegistry().register(type, component, meta)
  },

  /**
   * 批量注册已解析组件。
   *
   * @example
   * Spark.registerAll({
   *   'user-grid': UserGrid,
   *   'user-row': UserRow
   * })
   */
  registerAll(components: Record<string, unknown>): void {
    const reg = getGlobalRegistry()
    for (const [type, component] of Object.entries(components)) {
      reg.register(type, component)
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
  normalizeNode(node: SparkNode): SparkNode {
    return normalizeSparkNode(node)
  },

  /**
    * 读取节点 id（只读取顶层 `node.id`）。
   *
   * @example Spark.nodeId(child) ?? `fallback-${i}`
   */
  nodeId(node: SparkNode): string | undefined {
    return nodeId(node)
  },
}
