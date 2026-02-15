/**
 * 能力系统核心类型
 *
 * 核心模型：
 * - 上下文节点是能力的容器，既能提供也能消费
 * - 通过 parent 链形成能力树，查找时沿链向上（就近原则）
 * - 一个上下文可持有多种能力，通过名称解耦
 * - 事件能力是普通能力，实现恰好是 IEventEmitter
 */

/** 能力名称 */
export type CapabilityName = string | symbol

/**
 * 能力上下文 — 唯一的运行时核心结构
 *
 * 一个上下文节点 = 一个组件/数据实例的能力容器。
 * 与框架无关，可被 spark-component（ComponentContext）等扩展。
 */
export interface ICapabilityContext {
  id: string
  type: string
  parent?: ICapabilityContext
  /** 能力 Map：名称 → 实现 */
  capabilities: Map<CapabilityName, unknown>
}

/**
 * 事件发射器 — 唯一的"特殊能力"协议
 *
 * 普通能力存取任意对象即可。
 * 事件能力需要 on/off/emit 协议，因此单独定义。
 */
export interface IEventEmitter {
  on(event: string, handler: (...args: unknown[]) => void): void
  off(event: string, handler: (...args: unknown[]) => void): void
  emit(event: string, ...args: unknown[]): void
}
