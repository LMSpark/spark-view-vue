/**
 * 能力系统核心类型
 *
 * 设计理念：
 * - 能力是上下文接口，通过名称解耦
 * - 实现类型 T 可为任意值（对象、函数、事件发射器等）
 * - Provider/Consumer 提供统一的管理抽象
 */

/** 能力名称类型（支持 string 和 Symbol） */
export type CapabilityName = string | symbol

/**
 * 能力提供者
 * @template T 能力实现的类型
 */
export interface Provider<T = unknown> {
  /** 能力名称（唯一标识，支持 string 和 Symbol） */
  name: CapabilityName
  /** 能力实现 */
  implementation?: T
}

/**
 * 能力消费者
 * @template T 能力实现的类型
 */
export interface Consumer<T = unknown> {
  /** 需要的能力名称（支持 string 和 Symbol） */
  capabilityName: CapabilityName
  /** 连接后会被赋值为 Provider.implementation */
  implementation?: T
}

// ============================================================================
// 能力上下文（基类）
// ============================================================================

/**
 * CapabilityContext — 能力上下文基接口
 *
 * 定义 provide/consume 所需的最小运行时结构。
 * 与框架无关（不依赖 Vue），可被 spark-component（ComponentContext）
 * 或 spark-data 等任何包引用。
 *
 * @example
 * ```ts
 * // spark-component 扩展：
 * interface ComponentContext extends CapabilityContext {
 *   props?: Record<string, unknown>
 *   children?: ComponentContext[]
 *   state: Record<string, unknown>
 *   // ...
 * }
 *
 * // spark-data 桥接函数直接接收基类：
 * function registerCapabilities(ctx: CapabilityContext, caps: Map) {
 *   caps.forEach((p, k) => ctx.providers.set(k, p))
 * }
 * ```
 */
export interface CapabilityContext {
  /** 实例 ID */
  id: string
  /** 上下文类型标识（如 'spark-ej2-grid'、'dataset' 等） */
  type: string
  /** 父上下文（能力 parent-chain 查找用） */
  parent?: CapabilityContext
  /** 能力提供者 Map */
  providers: Map<CapabilityName, Provider>
  /** 能力消费者 Map */
  consumers: Map<CapabilityName, Consumer>
}
