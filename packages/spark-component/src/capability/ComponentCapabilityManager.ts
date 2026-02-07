/**
 * 组件能力管理器
 *
 * 基于 spark-utils 能力系统，为组件层提供专用的能力管理功能
 *
 * 核心职责：
 * - 建立组件能力树（通过 ComponentContext.parent 链）
 * - 自动连接供需双方（供方不关心谁用，需方不关心谁提供）
 * - 支持延迟绑定（先声明需求，能力提供后自动连接）
 */

import { CapabilityManager } from '@spark-view/spark-utils/capability/internal'
import { getProviderInherited } from '@spark-view/spark-utils'
import type {
  Context as CapabilityContext
} from '@spark-view/spark-utils'
import type { ComponentContext, CapabilityProvider, CapabilityConsumer, CapabilityManagerInterface } from '../types/spark-component.js'

/**
 * 组件能力管理器
 *
 * 扩展通用能力管理器，提供组件树的递归连接功能
 */
export class ComponentCapabilityManager extends CapabilityManager<CapabilityProvider, CapabilityConsumer> implements CapabilityManagerInterface {

  /**
   * 自动连接组件上下文中的所有能力
   *
   * 遍历 consumers 映射，为每个声明的需求查找对应的 provider 并连接
   * 实现延迟绑定：组件无需知道能力来自哪里
   *
   * @param context 组件上下文或能力上下文
   */
  autoConnectCapabilities(context: ComponentContext | CapabilityContext) {
    const ctx = context as ComponentContext
    for (const consumer of ctx.consumers.values()) {
      // 沿 parent 链向上查找提供者
      const provider = getProviderInherited(ctx as CapabilityContext, consumer.capabilityName)
      if (provider) {
        this.connectCapability(provider, consumer, ctx as CapabilityContext<CapabilityProvider>)
      }
    }

    // 递归处理子组件
    ctx.children?.forEach(child => this.autoConnectCapabilities(child))
  }

  /**
   * 断开组件上下文中的所有能力连接
   *
   * 用于组件销毁时清理资源
   *
   * @param context 组件上下文或能力上下文
   */
  disconnectAllCapabilities(context: ComponentContext | CapabilityContext) {
    const ctx = context as ComponentContext
    // 断开当前上下文的所有连接
    for (const consumer of ctx.consumers.values()) {
      const provider = getProviderInherited(ctx as CapabilityContext, consumer.capabilityName)
      if (provider) {
        this.disconnectCapability(provider, consumer, ctx as CapabilityContext<CapabilityProvider>)
      }
    }

    // 递归处理子组件
    ctx.children?.forEach(child => this.disconnectAllCapabilities(child))
  }

  /**
   * 注册 Provider（封装完整流程）
   * 
   * 完整流程：
   * 1. 验证 provider
   * 2. 存储到 context.providers
   * 3. 自动连接 consumer
   * 4. 通知等待的监听器
   */
  registerProvider(context: ComponentContext, provider: CapabilityProvider): void {
    // 验证
    if (!provider?.name || typeof provider.name !== 'string') {
      throw new Error('Invalid provider: must have a non-empty name')
    }

    // 存储
    context.providers.set(provider.name, provider)
    
    // 自动连接能力
    this.autoConnectCapabilities(context)

    // 通知等待的监听器
    if (context.providerListeners?.has(provider.name)) {
      const set = context.providerListeners.get(provider.name)
      if (set) {
        set.forEach(cb => {
          try { cb(provider) } 
          catch {
            // 忽略监听器错误
          }
        })
        set.clear()
      }
    }
  }

  /**
   * 查找 Provider（向上查找父级链）
   */
  getProvider(context: ComponentContext, capabilityName: string): CapabilityProvider | undefined {
    const provider = context.providers.get(capabilityName)
    if (provider) return provider
    if (context.parent) {
      return this.getProvider(context.parent as ComponentContext, capabilityName)
    }
    return undefined
  }
}

/**
 * 创建组件能力管理器实例
 *
 * @returns 新的组件能力管理器实例
 */
export function createComponentCapabilityManager(): ComponentCapabilityManager {
  return new ComponentCapabilityManager()
}

/**
 * 全局组件能力管理器实例
 * 用于向后兼容
 */
export const capabilityManager = createComponentCapabilityManager()
