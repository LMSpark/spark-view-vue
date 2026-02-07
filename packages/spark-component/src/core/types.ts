/**
 * SPARK 组件系统 - 核心类型定义
 *
 * 设计原则：
 * - 最小化类型，只定义必要的接口
 * - ComponentContext = 配置 + 运行时状态 的统一表示
 * - 能力系统通过 providers/consumers Map 实现，无需独立接口
 */

import type { InjectionKey } from 'vue'
import type { Provider, Consumer, LoggerApi } from '@spark-view/spark-utils'

// ============================================================================
// 能力系统类型（直接复用 spark-utils）
// ============================================================================

export type CapabilityProvider = Provider
export type CapabilityConsumer = Consumer

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

  /** 能力提供者 */
  providers: Map<string, CapabilityProvider>
  /** 能力消费者 */
  consumers: Map<string, CapabilityConsumer>
  /** Provider 注册监听器（延迟绑定） */
  providerListeners?: Map<string, Set<(provider: CapabilityProvider) => void>>

  /** 日志器 */
  logger?: LoggerApi

  /** 索引签名（支持 visible, disabled 等扩展字段） */
  [key: string]: unknown
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

export const SPARK_REGISTRY_KEY: InjectionKey<ComponentRegistry> = Symbol('sparkRegistry') as InjectionKey<ComponentRegistry>

// ============================================================================
// 实用类型
// ============================================================================

/** 带类型安全的 state */
export type TypedContext<TState = Record<string, unknown>> = Omit<ComponentContext, 'state'> & {
  state: TState
}

/** 带类型安全的 state + props */
export type StrictContext<TState = Record<string, unknown>, TProps = Record<string, unknown>> = Omit<
  ComponentContext,
  'state' | 'props'
> & {
  state: TState
  props: TProps
}

// ============================================================================
// 向后兼容（用于 spark-app 等包的类型引用）
// ============================================================================

// ComponentConfig 是创建 context 时的输入类型
export type ComponentConfig = Partial<ComponentContext> & { type: string }

// 日志类型（从 spark-utils 透传）
export type { LogLevel, LoggerApi, Transport } from '@spark-view/spark-utils'

// 权限类型
export type {
  IDataRow,
  IDataRowWithPermission,
  IDataSource,
  IPermissionChecker
} from '@spark-view/spark-utils'

export { createPermissionChecker } from '@spark-view/spark-utils'
