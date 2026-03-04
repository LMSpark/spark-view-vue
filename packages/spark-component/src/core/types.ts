/**
 * SPARK 组件系统 - 核心类型定义
 *
 * 设计原则：
 * - 最小化类型，只定义必要的接口
 * - ComponentContext = 配置 + 运行时状态 的统一表示
 * - 能力系统通过 capabilities Map 实现（继承自 ICapabilityContext）
 */

import type { InjectionKey } from 'vue'
import type { LoggerApi, ICapabilityContext } from '@spark-view/spark-utils'

// 能力名称类型（从 spark-utils 重新导出）
export type { CapabilityName, ICapabilityContext } from '@spark-view/spark-utils'

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

/**
 * 组件 dataKey 行为声明（Registry meta.dataKey）
 *
 * - `'self-resolve'`：组件内部 consume(PAGE_DATASET) 自行解析 dataKey prop（r-table、r-form 等）
 * - `'injected'`：由 bindRules 外部注入数据（el-table 等原生组件）
 * - `'none'`：不参与 dataKey 系统
 */
export type ComponentDataKeyBehavior = 'self-resolve' | 'injected' | 'none'

// ============================================================================
// 组件上下文（核心）
// ============================================================================

/**
 * ComponentContext - 组件实例的运行时表示
 *
 * 继承 ICapabilityContext（id, type, parent, capabilities），
 * 扩展 Vue 组件专属字段（props, children, state, logger）。
 *
 * 双重职责：
 * 1. 配置描述（JSON → type + props + children）
 * 2. 运行时管理（id + parent/children + capabilities）
 */
export interface ComponentContext extends ICapabilityContext {
  /** 组件属性（JSON 配置传入） */
  props?: Record<string, unknown>
  /** 子组件上下文（递归结构） */
  children?: ComponentContext[]
  /** 父上下文（能力查找用，覆盖基类为更具体的类型） */
  parent?: ICapabilityContext

  /** 运行时状态 */
  state: Record<string, unknown>

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
  /** 字段名（与父组件 dataKey 叠加，子组件通过 name 定位数据字段） */
  name?: string
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
  register(type: string, component: unknown, meta?: Record<string, unknown>, options?: { silent?: boolean }): void
  registerOnce(type: string, component: unknown, meta?: Record<string, unknown>): boolean
  get(type: string): ComponentDefinition | undefined
  has(type: string): boolean
  unregister(type: string): boolean
  getAll(): ReadonlyMap<string, ComponentDefinition>
}

// ============================================================================
// DI Keys
// ============================================================================

/** 组件注册表注入键 */
export const SPARK_REGISTRY_KEY: InjectionKey<ComponentRegistry> = Symbol('sparkRegistry') as InjectionKey<ComponentRegistry>

/** 父级上下文注入键（替代字符串 'sparkParentContext'） */
export const SPARK_PARENT_CONTEXT_KEY: InjectionKey<ComponentContext> = Symbol('sparkParentContext') as InjectionKey<ComponentContext>

// 日志类型 — 直接从 @spark-view/spark-utils 导入
export type { LoggerApi } from '@spark-view/spark-utils'
