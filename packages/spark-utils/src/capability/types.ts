/**
 * 能力系统类型定义
 * 
 * 核心理念：
 * - 能力本质是上下文的接口，通过名称解耦
 * - 3种能力类型：字面量、方法、事件
 * - Provider/Consumer/Context 是内部实现
 */

/**
 * 提供者 - 提供能力的一方
 * @template T - 能力实现的类型（可以是任何值、方法集合、或事件发射器）
 */
export interface Provider<T = unknown> {
  /** 能力名称（唯一标识） */
  name: string
  /** 版本号 */
  version: string
  /** 能力实现（字面量/方法/事件） */
  implementation?: T
}

/**
 * 消费者 - 使用能力的一方
 * @template T - 能力实现的类型（与 Provider<T> 对应）
 */
export interface Consumer<T = unknown> {
  /** 需要的能力名称 */
  capabilityName: string
  /** 连接后会被赋值为 Provider.implementation */
  implementation?: T
}

/**
 * 上下文 - 能力树的节点
 * 维护 parent 链实现能力查找
 */
export interface Context<T = Provider> {
  /** 父上下文（用于向上查找能力） */
  parent?: Context<T> | null
  /** 当前上下文提供的能力（Map 实现 O(1) 查询） */
  providers: Map<string, T>
}

/**
 * 连接器 - 负责连接 Provider 和 Consumer
 * （内部实现，外部用户不需要关心）
 * @template P - Provider 类型
 * @template C - Consumer 类型
 */
export interface Connector<P = Provider, C = Consumer> {
  connect(provider: P, consumer: C): boolean
  disconnect(provider: P, consumer: C): boolean
  isConnected(provider: P, consumer: C): boolean
}

/**
 * 管理器 - 管理能力的连接
 * （内部实现，外部用户不需要关心）
 * @template P - Provider 类型
 * @template C - Consumer 类型
 */
export interface Manager<P = Provider, C = Consumer> {
  registerConnector(name: string, connector: Connector<P, C>): void
  connectCapability(provider: P, consumer: C, context: Context<P>): boolean
  disconnectCapability(provider: P, consumer: C, context: Context<P>): boolean
}
