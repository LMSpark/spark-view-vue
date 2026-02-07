/**
 * SPARK 能力管理器
 *
 * 职责：Provider/Consumer 注册、查找、连接
 *
 * 设计原则：
 * - 无全局单例（实例通过 DI 管理）
 * - 沿 parent 链向上查找 provider（就近原则）
 * - 注册 provider 时自动通知监听器
 * - 不做递归子树遍历（性能安全）
 */

import { Logger } from '@spark-view/spark-utils'
import type { ComponentContext, CapabilityProvider, CapabilityConsumer } from '../core/types.js'

const logger = Logger('Spark:Capability')

export interface CapabilityManager {
  /** 注册能力提供者 */
  registerProvider(context: ComponentContext, provider: CapabilityProvider): void
  /** 沿 parent 链查找能力提供者 */
  getProvider(context: ComponentContext, name: string): CapabilityProvider | undefined
  /** 注册能力消费者并尝试连接 */
  registerConsumer(context: ComponentContext, consumer: CapabilityConsumer): void
  /** 手动连接 provider → consumer */
  connectCapability(provider: CapabilityProvider, consumer: CapabilityConsumer): void
  /** 手动断开连接 */
  disconnectCapability(consumer: CapabilityConsumer): void
}

/**
 * 创建能力管理器
 */
export function createCapabilityManager(): CapabilityManager {
  return {
    registerProvider(context: ComponentContext, provider: CapabilityProvider): void {
      if (!provider.name) {
        logger.warn('Provider name is required')
        return
      }

      // 存储到 context
      context.providers.set(provider.name, provider)

      // 通知本 context 的监听器
      const listeners = context.providerListeners?.get(provider.name)
      if (listeners) {
        listeners.forEach(cb => {
          try { cb(provider) } catch (e) { logger.error('Provider listener error:', String(e)) }
        })
      }

      // 通知子组件中等待此能力的消费者
      this._notifyChildren(context, provider)
    },

    getProvider(context: ComponentContext, name: string): CapabilityProvider | undefined {
      // 先查本 context
      const local = context.providers.get(name)
      if (local) return local

      // 沿 parent 链向上查找
      let current = context.parent
      while (current) {
        const found = current.providers.get(name)
        if (found) return found
        current = current.parent
      }

      return undefined
    },

    registerConsumer(context: ComponentContext, consumer: CapabilityConsumer): void {
      context.consumers.set(consumer.capabilityName, consumer)

      // 尝试立即连接
      const provider = this.getProvider(context, consumer.capabilityName)
      if (provider) {
        this.connectCapability(provider, consumer)
      }
    },

    connectCapability(provider: CapabilityProvider, consumer: CapabilityConsumer): void {
      consumer.implementation = provider.implementation
    },

    disconnectCapability(consumer: CapabilityConsumer): void {
      consumer.implementation = undefined
    },

    /** 通知子组件中等待此 capability 的监听器 */
    _notifyChildren(context: ComponentContext, provider: CapabilityProvider): void {
      if (!context.children) return
      for (const child of context.children) {
        // 通知 child 的 providerListeners
        const listeners = child.providerListeners?.get(provider.name)
        if (listeners) {
          listeners.forEach(cb => {
            try { cb(provider) } catch (e) { logger.error('Child listener error:', String(e)) }
          })
        }
        // 递归通知孙子
        this._notifyChildren(child, provider)
      }
    }
  } as CapabilityManager & { _notifyChildren(ctx: ComponentContext, p: CapabilityProvider): void }
}
