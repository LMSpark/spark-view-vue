/**
 * 能力系统 - 通用类型定义
 * 独立于具体实现（组件、页面、应用）
 */

/**
 * 能力提供者
 * 提供某种能力给其他上下文使用
 */
export interface CapabilityProvider<
  TInterface = Record<string, unknown>,
  TImpl = unknown
> {
  name: string
  version: string
  interface: TInterface
  implementation?: TImpl
  description?: string
}

/**
 * 能力消费者
 * 消费其他上下文提供的能力
 */
export interface CapabilityConsumer<
  TInterface = Record<string, unknown>,
  TImpl = unknown
> {
  capabilityName: string
  minVersion?: string
  interface: TInterface
  implementation?: TImpl
}

/**
 * 通用上下文接口
 * 任何使用能力系统的上下文都应实现此接口
 */
export interface CapabilityContext {
  id: string
  type: string
  parent?: CapabilityContext
  children: CapabilityContext[]
  providers: Set<CapabilityProvider>
  consumers: Map<string, CapabilityConsumer>
  providerListeners?: Map<string, Set<(provider: CapabilityProvider) => void>>
}

/**
 * 能力连接器接口
 * 定义如何连接提供者和消费者
 */
export interface CapabilityConnector {
  connect(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean
  disconnect(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean
  isConnected(provider: CapabilityProvider, consumer: CapabilityConsumer): boolean
}

/**
 * 能力管理器接口
 * 管理能力的注册、连接、断开
 */
export interface ICapabilityManager {
  registerConnector(name: string, connector: CapabilityConnector): void
  unregisterConnector(name: string): boolean
  connectCapability(
    provider: CapabilityProvider,
    consumer: CapabilityConsumer,
    context: CapabilityContext
  ): boolean
  disconnectCapability(
    provider: CapabilityProvider,
    consumer: CapabilityConsumer,
    context: CapabilityContext
  ): boolean
  isCapabilityConnected(
    provider: CapabilityProvider,
    consumer: CapabilityConsumer,
    context: CapabilityContext
  ): boolean
  autoConnectCapabilities(context: CapabilityContext): void
  disconnectAllCapabilities(context: CapabilityContext): void
}
