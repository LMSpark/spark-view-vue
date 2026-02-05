/**
 * Spark Component 能力系统适配器
 * 将通用能力系统适配到组件上下文
 * 
 * 设计说明：
 * - ComponentContext 继承 CapabilityContext（parent + providers）
 * - 适配器只需提取最小接口所需的属性
 * - 能力查找自动沿 parent 链进行（能力树）
 */

import {
  CapabilityManager
} from '@spark-view/spark-utils/capability/internal'
import type {
  Context as CapabilityContext,
  Provider as CapabilityProvider,
  Consumer as CapabilityConsumer
} from '@spark-view/spark-utils'
import { Logger } from '@spark-view/spark-utils'
import { EventConnector } from '@spark-view/spark-utils/capability/internal'
import type { ComponentContext } from '../types/spark-component.js'

// const logger = Logger('Spark:Capability')  // Reserved for future use

/**
 * 组件上下文适配器
 * 
 * 将 ComponentContext 适配为最小 CapabilityContext 接口
 * ComponentContext 已经包含了 parent + providers，所以适配很简单
 */
function adaptComponentContext(context: ComponentContext): CapabilityContext {
  return {
    parent: context.parent ? adaptComponentContext(context.parent) : undefined,
    providers: context.providers
  }
}

/**
 * Spark 能力管理器
 * 扩展通用能力管理器，添加 Spark 特定功能
 */
export class SparkCapabilityManager extends CapabilityManager {
  constructor() {
    super()
    
    // 注册内置事件能力连接器
    this.registerConnector('events', new EventConnector())
    const logger = Logger('Spark:CapabilityMgr')
    logger.info('✅ Event capability connector registered')
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
}

/**
 * 全局能力管理器实例
 */
export const capabilityManager = new SparkCapabilityManager()


