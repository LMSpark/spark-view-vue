/**
 * SPARK 组件系统 - 核心类型定义
 *
 * 设计原则：
 * - 最小化类型，只定义必要的接口
 * - ComponentContext = 配置 + 运行时状态 的统一表示
 * - 能力系统通过 providers/consumers Map 实现，无需独立接口
 */

import type { InjectionKey } from 'vue'
import type { Provider, Consumer, LoggerApi, CapabilityName } from '@spark-view/spark-utils'

// 能力名称类型（从 spark-utils 重新导出）
export type { CapabilityName } from '@spark-view/spark-utils'

// ============================================================================
// 能力系统类型（直接复用 spark-utils）
// ============================================================================

export type CapabilityProvider<T = unknown> = Provider<T>
export type CapabilityConsumer<T = unknown> = Consumer<T>

// ============================================================================
// 组件定义（注册表使用）
// ============================================================================

/**
 * 组件定义 - Registry 中的条目
 */
export interface ComponentDefinition {
  /** 组件类型（kebab-case，如 'spark-ej2-grid'） */
  type: string
  /** Vue 组件实现 */
  component: unknown
  /** 扩展元数据 */
  meta?: Record<string, unknown>
}

// ============================================================================
// 组件上下文（核心）
// ============================================================================

/**
 * ComponentContext - 组件实例的运行时表示
 *
 * 双重职责：
 * 1. 配置描述（JSON → type + props + children）
 * 2. 运行时管理（id + parent/children + providers/consumers）
 */
export interface ComponentContext {
  /** 实例 ID（运行时自动生成） */
  id: string
  /** 组件类型（对应 ComponentDefinition.type） */
  type: string

  /** 组件属性（JSON 配置传入） */
  props?: Record<string, unknown>
  /** 子组件上下文（递归结构） */
  children?: ComponentContext[]
  /** 父上下文（能力查找用） */
  parent?: ComponentContext

  /** 运行时状态 */
  state: Record<string, unknown>

  /** 能力提供者（键支持 string | symbol） */
  providers: Map<CapabilityName, CapabilityProvider>
  /** 能力消费者（键支持 string | symbol） */
  consumers: Map<CapabilityName, CapabilityConsumer>
  /** Provider 注册监听器（延迟绑定，键支持 string | symbol） */
  providerListeners?: Map<CapabilityName, Set<(provider: CapabilityProvider) => void>>

  /** 日志器 */
  logger?: LoggerApi
}

// ============================================================================
// 组件配置（输入类型）
// ============================================================================

/**
 * ComponentConfig - 组件配置的最小输入类型
 *
 * 用于 useSparkComponent 的泛型约束。
 * 与 ComponentContext 的区别：
 * - Config 是纯数据（JSON 可序列化），不含运行时字段（id, state, providers, consumers）
 * - children 允许任意嵌套配置数组，不要求是完整的 ComponentContext
 */
export interface ComponentConfig {
  /** 组件类型（对应 ComponentDefinition.type） */
  type: string
  /** 实例 ID（可选，运行时自动生成） */
  id?: string
  /** 组件属性 */
  props?: Record<string, unknown>
  /** 子组件配置（递归） */
  children?: ComponentConfig[]
  /** 可见性控制 */
  visible?: boolean
  /** 禁用状态控制 */
  disabled?: boolean
}

// ============================================================================
// 注册表接口
// ============================================================================

export interface ComponentRegistry {
  register(type: string, component: unknown, meta?: Record<string, unknown>): void
  get(type: string): ComponentDefinition | undefined
  has(type: string): boolean
  unregister(type: string): boolean
  getAll(): Map<string, ComponentDefinition>
}

// ============================================================================
// DI Keys
// ============================================================================

/** 组件注册表注入键 */
export const SPARK_REGISTRY_KEY: InjectionKey<ComponentRegistry> = Symbol('sparkRegistry') as InjectionKey<ComponentRegistry>

/** 父级上下文注入键（替代字符串 'sparkParentContext'） */
export const SPARK_PARENT_CONTEXT_KEY: InjectionKey<ComponentContext> = Symbol('sparkParentContext') as InjectionKey<ComponentContext>

/** 能力管理器注入键（可选注入，允许测试/多实例场景替换） */
export const CAPABILITY_MANAGER_KEY = Symbol('sparkCapabilityManager') as InjectionKey<import('../capability/CapabilityManager.js').CapabilityManager>

// ============================================================================
// 向后兼容（用于 spark-app 等包的类型引用）
// ============================================================================

// 日志类型（从 spark-utils 透传）
export type { LogLevel, LoggerApi, Transport } from '@spark-view/spark-utils'
