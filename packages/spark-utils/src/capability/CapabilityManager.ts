/**
 * 能力操作 — 纯函数 API + 事件工厂
 *
 * 核心操作：
 * - provide: 在上下文中注册能力
 * - lookup: 沿 parent 链查找能力（就近原则）
 * - getLocal: 仅查本节点
 *
 * 事件工厂：
 * - createEventEmitter: 创建 on/off/emit 发射器
 */

import { Logger } from '../logger.js'
import type { ICapabilityContext, CapabilityName, IEventEmitter } from './types.js'

const logger = Logger('Capability')

// ==================== 能力操作（纯函数） ====================

/** 在上下文中注册能力 */
export function provide<T>(ctx: ICapabilityContext, name: CapabilityName, impl: T): void {
  ctx.capabilities.set(name, impl)
}

/** 沿 parent 链查找能力（就近原则） */
export function lookup<T = unknown>(ctx: ICapabilityContext, name: CapabilityName): T | undefined {
  let current: ICapabilityContext | undefined = ctx
  while (current) {
    const impl = current.capabilities.get(name)
    if (impl !== undefined) return impl as T
    current = current.parent
  }
  return undefined
}

/** 仅查本节点的能力 */
export function getLocal<T = unknown>(ctx: ICapabilityContext, name: CapabilityName): T | undefined {
  const impl = ctx.capabilities.get(name)
  return impl !== undefined ? impl as T : undefined
}

// ==================== 事件工厂 ====================

/** 创建事件发射器 */
export function createEventEmitter(): IEventEmitter {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()

  return {
    on(event: string, handler: (...args: unknown[]) => void) {
      let handlers = listeners.get(event)
      if (!handlers) {
        handlers = new Set()
        listeners.set(event, handlers)
      }
      handlers.add(handler)
    },
    off(event: string, handler: (...args: unknown[]) => void) {
      listeners.get(event)?.delete(handler)
    },
    emit(event: string, ...args: unknown[]) {
      listeners.get(event)?.forEach(handler => {
        try {
          handler(...args)
        } catch (e) {
          logger.error(`Event error '${event}':`, e)
        }
      })
    }
  }
}