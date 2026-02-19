/**
 * SPARK 能力系统 — 类型 + 符号 + 操作（一体化）
 *
 * 单文件包含：
 * - 核心类型（CapabilityName, ICapabilityContext, IEventEmitter）
 * - 类型安全能力键（CapabilityKey<T>, defineCapability）
 * - 内置能力常量 + 配套接口
 * - 纯函数操作（provide, lookup, createEventEmitter）
 *
 * @example
 * ```ts
 * import { APP_SERVICES, provide, lookup } from '@spark-view/spark-utils'
 * provide(ctx, APP_SERVICES, { router, logger })
 * const svc = lookup(ctx, APP_SERVICES)
 * ```
 */

import type { LoggerApi } from '../logger.js'

// ==================== 核心类型 ====================

/** 能力名称 */
export type CapabilityName = string | symbol

/**
 * 能力上下文 — 运行时核心结构
 * 一个上下文 = 一个组件/数据实例 的能力容器。
 */
export interface ICapabilityContext {
  id: string
  type: string
  parent?: ICapabilityContext
  /** 能力 Map：名称 → 实现 */
  capabilities: Map<CapabilityName, unknown>
}

/** 事件发射器协议 */
/**
 * 类型安全事件发射器
 *
 * 支持泛型事件映射表，提供事件名和参数的自动类型推断。
 * 无类型参数时退化为 `Record<string, any[]>`，保持向后兼容。
 *
 * @example
 * ```ts
 * // 无类型参数——接受任意 handler
 * const emitter: IEventEmitter = createEventEmitter()
 * emitter.on('click', (x, y) => { ... })
 *
 * // 带事件映射——handler 参数自动推断
 * type Events = { stateChanged: [ViewStateEvent] }
 * const emitter: IEventEmitter<Events> = createEventEmitter()
 * emitter.on('stateChanged', (evt) => { // evt: ViewStateEvent })
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface IEventEmitter<TEventMap extends Record<string, any[]> = Record<string, any[]>> {
  on<K extends string & keyof TEventMap>(event: K, handler: (...args: TEventMap[K]) => void): void
  off<K extends string & keyof TEventMap>(event: K, handler: (...args: TEventMap[K]) => void): void
  emit<K extends string & keyof TEventMap>(event: K, ...args: TEventMap[K]): void
}

// ==================== 类型安全能力键 ====================

/** 带类型信息的能力键（branded symbol） */
export type CapabilityKey<T> = symbol & { readonly __capabilityType?: T }

/** 定义类型安全的能力键 */
export function defineCapability<T>(name: string): CapabilityKey<T> {
  return Symbol.for(name) as CapabilityKey<T>
}

// ==================== 纯函数操作 ====================

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

/** 创建类型安全事件发射器（泛型参数可选，默认接受任意事件） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createEventEmitter<TEventMap extends Record<string, any[]> = Record<string, any[]>>(): IEventEmitter<TEventMap> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listeners = new Map<string, Set<(...args: any[]) => void>>()
  return {
    on(event, handler) {
      let handlers = listeners.get(event)
      if (!handlers) { handlers = new Set(); listeners.set(event, handlers) }
      handlers.add(handler)
    },
    off(event, handler) {
      listeners.get(event)?.delete(handler)
    },
    emit(event, ...args) {
      listeners.get(event)?.forEach(h => { try { h(...args) } catch (e) { console.error(`[EventEmitter] Error in handler for '${event}':`, e) } })
    }
  }
}

// ==================== 应用服务 ====================

/** APP Services 能力（应用全局服务聚合） */
export interface IAppServicesCapability {
  router?: {
    push(to: string | { path: string; query?: Record<string, unknown> }): Promise<void | unknown>
    replace(to: string | { path: string; query?: Record<string, unknown> }): Promise<void | unknown>
    back(): void
    currentRoute: unknown
  }
  logger?: LoggerApi
  tenant?: { tenantId: string; tenantName?: string; [key: string]: unknown }
  configLoader?: unknown
  authService?: unknown
}

export const APP_SERVICES = defineCapability<IAppServicesCapability>('spark:capability:app-services')

/** 页面服务能力（UI 交互） */
export interface IPageServiceCapability {
  showMessage(message: string, type?: 'success' | 'error' | 'warning' | 'info'): void
  showConfirm(message: string, title?: string): Promise<boolean>
  showLoading(show: boolean): void
  navigate(path: string, params?: Record<string, unknown>): void
}

export const PAGE_SERVICE = defineCapability<IPageServiceCapability>('spark:capability:page-service')

// ==================== UI 交互 ====================

/** 当前行能力 */
export interface ICurrentRowCapability {
  getRow(): unknown | null
  getIndex(): number | null
  setRow(row: unknown | null): void
}

export const CURRENT_ROW = defineCapability<ICurrentRowCapability>('spark:capability:current-row')

/** 选择能力 */
export interface ISelectionCapability {
  select(id: number | string): void
  deselect(id: number | string): void
  isSelected(id: number | string): boolean
  selectAll?(): void
  clearSelection(): void
  getSelected(): (number | string)[]
}

export const SELECTION = defineCapability<ISelectionCapability>('spark:capability:selection')

/** 行数据能力 */
export interface IRowDataCapability {
  getData(): unknown
  getField(field: string): unknown
  isSelected?(): boolean
}

export const ROW_DATA = defineCapability<IRowDataCapability>('spark:capability:row-data')

// ==================== 事件 ====================

export const GRID_EVENTS = defineCapability<IEventEmitter>('spark:capability:grid-events')
export const ROW_EVENTS = defineCapability<IEventEmitter>('spark:capability:row-events')
