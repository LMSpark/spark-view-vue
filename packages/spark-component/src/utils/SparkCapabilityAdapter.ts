/**
 * Spark Component 能力系统适配器
 * 将通用能力系统适配到组件上下文
 */

import {
  CapabilityManager,
  EventCapabilityConnector,
  type CapabilityContext,
  type CapabilityProvider,
  type CapabilityConsumer
} from '@spark-view/spark-utils'
import { Logger } from '@spark-view/spark-utils'
import type { ComponentContext } from '../types/spark-component.js'

// const logger = Logger('Spark:Capability')  // Reserved for future use

/**
 * 组件上下文适配器
 * 将 ComponentContext 适配为 CapabilityContext
 */
function adaptComponentContext(context: ComponentContext): CapabilityContext {
  return {
    id: context.id,
    type: context.type,
    parent: context.parent ? adaptComponentContext(context.parent) : undefined,
    children: context.children.map(adaptComponentContext),
    providers: context.providers,
    consumers: context.consumers,
    providerListeners: context.providerListeners
  }
}

/**
 * Spark 能力管理器
 * 扩展通用能力管理器，添加 Spark 特定功能
 */
export class SparkCapabilityManager extends CapabilityManager {
  private logger = Logger('Spark:CapabilityMgr')

  constructor() {
    super()
    
    // 注册内置事件能力连接器
    this.registerConnector('events', new EventCapabilityConnector())
    this.logger.info('✅ Event capability connector registered')
  }

  /**
   * 连接能力（组件上下文版本）
   */
  connectCapabilityForComponent(
    provider: CapabilityProvider,
    consumer: CapabilityConsumer,
    context: ComponentContext
  ): boolean {
    return super.connectCapability(provider, consumer, adaptComponentContext(context))
  }

  /**
   * 断开能力（组件上下文版本）
   */
  disconnectCapabilityForComponent(
    provider: CapabilityProvider,
    consumer: CapabilityConsumer,
    context: ComponentContext
  ): boolean {
    return super.disconnectCapability(provider, consumer, adaptComponentContext(context))
  }

  /**
   * 自动连接能力（组件上下文版本）
   */
  autoConnectCapabilitiesForComponent(context: ComponentContext): void {
    super.autoConnectCapabilities(adaptComponentContext(context))
  }

  /**
   * 断开所有能力（组件上下文版本）
   */
  disconnectAllCapabilitiesForComponent(context: ComponentContext): void {
    super.disconnectAllCapabilities(adaptComponentContext(context))
  }

  /**
   * 兼容旧API - connectCapability
   */
  connectCapability(
    provider: CapabilityProvider,
    consumer: CapabilityConsumer,
    context: ComponentContext | CapabilityContext
  ): boolean {
    if ('config' in context) {
      // ComponentContext
      return this.connectCapabilityForComponent(provider, consumer, context as ComponentContext)
    } else {
      // CapabilityContext
      return super.connectCapability(provider, consumer, context)
    }
  }

  /**
   * 兼容旧API - disconnectCapability
   */
  disconnectCapability(
    provider: CapabilityProvider,
    consumer: CapabilityConsumer,
    context: ComponentContext | CapabilityContext
  ): boolean {
    if ('config' in context) {
      // ComponentContext
      return this.disconnectCapabilityForComponent(provider, consumer, context as ComponentContext)
    } else {
      // CapabilityContext
      return super.disconnectCapability(provider, consumer, context)
    }
  }

  /**
   * 兼容旧API - autoConnectCapabilities
   */
  autoConnectCapabilities(context: ComponentContext | CapabilityContext): void {
    if ('config' in context) {
      // ComponentContext
      this.autoConnectCapabilitiesForComponent(context as ComponentContext)
    } else {
      // CapabilityContext
      super.autoConnectCapabilities(context)
    }
  }

  /**
   * 兼容旧API - disconnectAllCapabilities
   */
  disconnectAllCapabilities(context: ComponentContext | CapabilityContext): void {
    if ('config' in context) {
      // ComponentContext
      this.disconnectAllCapabilitiesForComponent(context as ComponentContext)
    } else {
      // CapabilityContext
      super.disconnectAllCapabilities(context)
    }
  }
}

/**
 * 全局能力管理器实例
 */
export const capabilityManager = new SparkCapabilityManager()

// 重新导出通用能力系统类型和工具
export {
  DataFlowConnector,
  EventConnector,
  MethodConnector,
  EventCapabilityConnector,
  createEventCapabilityProvider,
  createEventCapabilityConsumer
} from '@spark-view/spark-utils'

export type {
  CapabilityConnector,
  EventCapabilityProvider,
  EventCapabilityConsumer
} from '@spark-view/spark-utils'
