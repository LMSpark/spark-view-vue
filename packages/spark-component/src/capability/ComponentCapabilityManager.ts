/**
 * 组件能力管理器
 * 基于 spark-utils 的通用能力系统，为组件层提供专用管理
 * 
 * 核心职责：
 * 1. 建立组件能力树（通过 ComponentContext.parent 链）
 * 2. 按名称查找能力提供者（沿 parent 链向上递归）
 * 3. 自动连接供需双方（供方不关心谁用，需方不关心谁提供）
 */

import { CapabilityManager, EventConnector } from '@spark-view/spark-utils/capability/internal'
import type { Context as CapabilityContext } from '@spark-view/spark-utils'
import type { ComponentContext } from '../types/spark-component.js'

/**
 * 组件能力管理器
 * 扩展通用能力管理器，添加组件专用的递归连接功能
 */
export class ComponentCapabilityManager extends CapabilityManager {
  
  /**
   * 自动连接组件上下文中的所有能力
   * 
   * 对每个 consumer，按名称在能力树中查找对应的 provider 并连接
   * 体现核心理念：需方只管声明需要的能力名称，不关心谁提供
   */
  autoConnectCapabilities(context: ComponentContext | CapabilityContext) {
    const ctx = context as ComponentContext
    for (const consumer of ctx.consumers.values()) {
      // 按名称在能力树中查找提供者（就近原则）
      const provider = this.findProviderByName(ctx, consumer.capabilityName)
      if (provider) {
        // 类型断言是必需的，因为 ComponentContext 扩展了 CapabilityContext
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.connectCapability(provider as any, consumer as any, ctx as any)
      }
    }
    
    // 递归处理子组件（建立完整能力树）
    ctx.children.forEach(child => this.autoConnectCapabilities(child as ComponentContext))
  }

  /**
   * 按名称在能力树中查找提供者
   * 
   * 实现"就近原则"：
   * 1. 先在当前上下文的 providers 中查找
   * 2. 未找到则沿 parent 链向上递归查找
   * 
   * 这是能力系统的核心：供方不关心谁用，需方不关心谁提供
   */
  private findProviderByName(
    context: ComponentContext, 
    name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): any {
    // 在当前上下文的 providers 中查找
    for (const provider of Array.from(context.providers)) {
      if (provider.name === name) {
        return provider
      }
    }
    
    // 沿 parent 链向上递归查找（能力树查找）
    if (context.parent) {
      return this.findProviderByName(context.parent, name)
    }
    
    return undefined
  }

  /**
   * 断开组件上下文中的所有能力连接
   * 用于组件销毁时清理
   */
  disconnectAllCapabilities(context: ComponentContext | CapabilityContext) {
    const ctx = context as ComponentContext
    // 断开当前上下文的所有连接
    for (const consumer of ctx.consumers.values()) {
      const provider = this.findProviderByName(ctx, consumer.capabilityName)
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
  manager.registerConnector('event', new EventConnector())
  
  return manager
}

/**
 * 全局组件能力管理器实例
 * 用于向后兼容
 */
export const capabilityManager = createComponentCapabilityManager()
