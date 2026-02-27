/**
 * 事件 ID 生成器与 EventContext 工厂函数
 *
 * 从 types.ts 分离出来，保持类型文件纯粹（仅含 interface / type / enum），
 * 运行时逻辑集中于此文件便于 tree-shaking 和独立测试。
 */

import type { EventSource, EventContext } from '../types'

// ===== 事件 ID 计数器 =====

let eventIdCounter = 0

/**
 * 生成唯一的事件 ID（全局递增）
 *
 * 使用递增计数器生成唯一标识，用于循环检测。
 * 注意：计数器在溢出后会重置为 0（Number.MAX_SAFE_INTEGER）。
 */
export function generateEventId(): number {
  eventIdCounter = (eventIdCounter + 1) % Number.MAX_SAFE_INTEGER
  return eventIdCounter
}

/**
 * 生成视图级别的事件 ID
 *
 * 格式: `${tableName}@${viewId}:${counter}`
 * 适用于需要按视图隔离循环检测的场景。
 */
export function generateViewEventId(tableName: string, viewId: string): string {
  return `${tableName}@${viewId}:${generateEventId()}`
}

/**
 * 生成组件级别的事件 ID
 *
 * 格式: `component:${componentId}:${counter}`
 * 适用于需要按组件实例隔离循环检测的场景。
 */
export function generateComponentEventId(componentId: string): string {
  return `component:${componentId}:${generateEventId()}`
}

/**
 * 创建事件上下文
 *
 * @param source - 事件来源类型（必填）
 * @param options - 可选配置（tableName/viewId → 视图级 ID；componentId → 组件级 ID）
 */
export function createEventContext(
  source: EventSource,
  options?: {
    tableName?: string
    viewId?: string
    componentId?: string
    originatorId?: string
    meta?: Record<string, unknown>
  }
): EventContext {
  let eventId: number | string

  if (options?.tableName && options?.viewId) {
    eventId = generateViewEventId(options.tableName, options.viewId)
  } else if (options?.componentId) {
    eventId = generateComponentEventId(options.componentId)
  } else {
    eventId = generateEventId()
  }

  const ctx: EventContext = { eventId, source }
  if (options?.originatorId !== undefined) {
    ctx.originatorId = options.originatorId
  }
  if (options?.meta !== undefined) {
    ctx.meta = options.meta
  }
  return ctx
}
