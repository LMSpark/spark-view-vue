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
 */
export interface Consumer {
  /** 需要的能力名称 */
  capabilityName: string
  /** 连接后会被赋值为 Provider.implementation */
  implementation?: unknown
}

/**
 * 上下文 - 能力树的节点
 * 维护 parent 链实现能力查找
 */
export interface Context<T = Provider> {
  /** 父上下文（用于向上查找能力） */
  parent?: Context<T> | null
  /** 当前上下文提供的能力 */
  providers: Set<T>
}

/**
 * 连接器 - 负责连接 Provider 和 Consumer
 * （内部实现，外部用户不需要关心）
 */
export interface Connector {
  connect(provider: Provider, consumer: Consumer): boolean
  disconnect(provider: Provider, consumer: Consumer): boolean
  isConnected(provider: Provider, consumer: Consumer): boolean
}

/**
 * 管理器 - 管理能力的连接
 * （内部实现，外部用户不需要关心）
 */
export interface Manager {
  registerConnector(name: string, connector: Connector): void
  connectCapability(provider: Provider, consumer: Consumer, context: Context): boolean
  disconnectCapability(provider: Provider, consumer: Consumer, context: Context): boolean
}
