/**
 * 通用能力管理器 + 事件能力工厂
 *
 * 职责：
 * 1. Provider/Consumer 注册、parent-chain 查找、连接
 * 2. 事件能力创建（on/off/emit 发布订阅）
 *
 * 设计原则：
 * - 框架无关（不依赖 Vue），只操作 CapabilityContext
 * - 无全局单例（实例由调用方管理）
 * - 沿 parent 链向上查找 provider（就近原则）
 */

// ==================== 导入和依赖 ====================

import { Logger } from '../logger.js'
import type { CapabilityContext, CapabilityName, Provider, Consumer } from './types.js'

const logger = Logger('Capability')

// ==================== 类型定义 ====================

/**
 * 通用能力管理器接口
 */
export interface ICapabilityManager {
  /** 注册能力提供者到指定上下文 */
  registerProvider(context: CapabilityContext, provider: Provider): void
  /** 沿 parent 链查找能力提供者（就近原则） */
  getProvider(context: CapabilityContext, name: CapabilityName): Provider | undefined
  /** 注册能力消费者并尝试立即连接 */
  registerConsumer(context: CapabilityContext, consumer: Consumer): void
  /** 手动连接 provider → consumer */
  connectCapability(provider: Provider, consumer: Consumer): void
}

/**
 * 事件提供者接口 — on/off/emit 发布订阅
 */
export interface EventProvider {
  on: (event: string, handler: (...args: unknown[]) => void) => void
  off: (event: string, handler: (...args: unknown[]) => void) => void
  emit: (event: string, ...args: unknown[]) => void
}

// ==================== 核心管理器 ====================

/**
 * 创建通用能力管理器
 *
 * ⚠️ 使用注意事项：
 * - provide() 必须在消费方查找之前完成注册
 * - 在 Vue 场景中，这意味着 provide() 和 consume() 都必须在 setup() 同步阶段调用
 * - Vue 3 保证父 setup() 先于子 setup()，因此父 provide → 子 consume 的顺序是确定的
 * - 不要在 onMounted / watch / async 回调中调用 provide()，否则子组件可能找不到 provider
 *
 * @example
 * ```ts
 * const manager = createCapabilityManager()
 * manager.registerProvider(ctx, { name: DATA_SET, implementation: dsState })
 * ```
 */
export function createCapabilityManager(): ICapabilityManager {

  return {
    registerProvider(context: CapabilityContext, provider: Provider): void {
      if (!provider.name) {
        logger.warn('Provider name is required')
        return
      }

      // 存储到 context
      context.providers.set(provider.name, provider)
    },

    getProvider(context: CapabilityContext, name: CapabilityName): Provider | undefined {
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

    registerConsumer(context: CapabilityContext, consumer: Consumer): void {
      context.consumers.set(consumer.capabilityName, consumer)

      // 尝试立即连接
      const provider = this.getProvider(context, consumer.capabilityName)
      if (provider) {
        this.connectCapability(provider, consumer)
      }
    },

    connectCapability(provider: Provider, consumer: Consumer): void {
      consumer.implementation = provider.implementation
    }
  }
}

// ==================== 事件系统 ====================

/**
 * 创建事件提供者
 *
 * @param name 能力名称，用于在能力系统中注册
 * @returns 包含 Provider 和 EventProvider 实例的对象
 *
 * @example
 * ```ts
 * const { provider, emitter } = createEventProvider('grid-events')
 * provide(context, provider.name, provider.implementation)
 * emitter.emit('rowClick', { id: 1 })
 * ```
 */
export function createEventProvider(name: string): { provider: Provider; emitter: EventProvider } {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()

  const emitter: EventProvider = {
    on(event: string, handler: (...args: unknown[]) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)?.add(handler)
    },
    off(event: string, handler: (...args: unknown[]) => void) {
      const handlers = listeners.get(event)
      if (handlers) {
        handlers.delete(handler)
        if (handlers.size === 0) listeners.delete(event)
      }
    },
    emit(event: string, ...args: unknown[]) {
      listeners.get(event)?.forEach(handler => {
        try {
          handler(...args)
        } catch (e) {
          logger.error(`事件错误 '${event}':`, e)
        }
      })
    }
  }

  return {
    provider: { name, implementation: emitter },
    emitter
  }
}