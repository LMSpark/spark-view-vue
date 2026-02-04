/**
 * 组件能力管理器
 * 基于 spark-utils 的通用能力系统，为组件层提供专用管理
 */

import { CapabilityManager } from '@spark-view/spark-utils'
import { EventCapabilityConnector } from '@spark-view/spark-utils'
import type { CapabilityContext } from '@spark-view/spark-utils'
import type { ComponentContext } from '../types/spark-component.js'

/**
 * 组件能力管理器
 * 扩展通用能力管理器，添加组件专用功能
 */
export class ComponentCapabilityManager extends CapabilityManager {
  
  /**
   * 自动连接组件上下文中的所有能力
   */
  override autoConnectCapabilities(context: ComponentContext | CapabilityContext) {
    const ctx = context as ComponentContext
    for (const consumer of ctx.consumers.values()) {
      const provider = this.findComponentProvider(ctx, consumer.capabilityName)
      if (provider) {
        // 类型断言是必需的，因为 ComponentContext 扩展了 CapabilityContext
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.connectCapability(provider as any, consumer as any, ctx as any)
      }
    }
    
    // 递归处理子组件
    ctx.children.forEach(child => this.autoConnectCapabilities(child as ComponentContext))
  }

  /**
   * 在组件上下文链中查找能力提供者（组件专用版本）
   * 实现"就近原则"：优先从最近的父组件获取
   */
  private findComponentProvider(
    context: ComponentContext, 
    name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): any {
    // 在当前上下文查找
    for (const provider of Array.from(context.providers)) {
      if (provider.name === name) {
        return provider
      }
    }
    
    // 递归查找父组件
    if (context.parent) {
      return this.findComponentProvider(context.parent, name)
    }
    
    return undefined
  }

  /**
   * 断开组件上下文中的所有能力连接
   * 用于组件销毁时清理
   */
  override disconnectAllCapabilities(context: ComponentContext | CapabilityContext) {
    const ctx = context as ComponentContext
    // 断开当前上下文的所有连接
    for (const consumer of ctx.consumers.values()) {
      const provider = this.findComponentProvider(ctx, consumer.capabilityName)
      if (provider) {
        // 类型断言是必需的，因为 ComponentContext 扩展了 CapabilityContext
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.disconnectCapability(provider as any, consumer as any, ctx as any)
      }
    }
    
    // 递归处理子组件
    ctx.children.forEach(child => this.disconnectAllCapabilities(child as ComponentContext))
  }
}

/**
 * 创建组件能力管理器实例
 * 预注册常用连接器
 */
export function createComponentCapabilityManager(): ComponentCapabilityManager {
  const manager = new ComponentCapabilityManager()
  
  // 注册事件能力连接器
  manager.registerConnector('event', new EventCapabilityConnector())
  
  return manager
}

/**
 * 全局组件能力管理器实例
 * 用于向后兼容
 */
export const capabilityManager = createComponentCapabilityManager()
