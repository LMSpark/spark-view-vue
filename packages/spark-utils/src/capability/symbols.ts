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
 * type Events = { rowsChanged: [], currentRowChanged: [row: IDataRow | null] }
 * const emitter: IEventEmitter<Events> = createEventEmitter()
 * emitter.on('currentRowChanged', (row) => { // row: IDataRow | null })
 * ```
 */
// Note: any[] 在此处是合理的泛型约束
// 原因：事件参数类型在泛型层面需要最大灵活性，允许任意类型的参数数组
// TypeScript 在具体使用时会通过 TEventMap 推断出正确的类型
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface IEventEmitter<TEventMap extends Record<string, any[]> = Record<string, any[]>> {
  on<K extends string & keyof TEventMap>(event: K, handler: (...args: TEventMap[K]) => void): void
  off<K extends string & keyof TEventMap>(event: K, handler: (...args: TEventMap[K]) => void): void
  emit<K extends string & keyof TEventMap>(event: K, ...args: TEventMap[K]): void
  /** 移除指定事件的所有监听器，或不传参时移除全部监听器（用于 destroy 清理） */
  removeAllListeners<K extends string & keyof TEventMap>(event?: K): void
  /** 返回指定事件的监听器数量，不传参时返回所有事件监听器总数 */
  listenerCount<K extends string & keyof TEventMap>(event?: K): number
}

// ==================== 类型安全能力键 ====================

/** 带类型信息的能力键（branded symbol） */
export type CapabilityKey<T> = symbol & { readonly __capabilityType?: T }

/** 定义类型安全的能力键 */
export function defineCapability<T>(name: string): CapabilityKey<T> {
  return Symbol.for(name) as CapabilityKey<T>
}

// ==================== 纯函数操作 ====================

/**
 * 标准化能力键：字符串 → Symbol.for(string)，symbol 原样返回。
 *
 * 作用：允许用字符串名称 provide / consume 能力，与用 CapabilityKey<T>
 * 符号 provide 的值共享同一 Map 槽位。
 *
 * @example
 * normalizeKey('spark:capability:app-services') === APP_SERVICES // true
 */
export function normalizeKey(name: CapabilityName): symbol | string {
  return typeof name === 'string' ? Symbol.for(name) : name
}

/** 在上下文中注册能力 */
export function provide<T>(ctx: ICapabilityContext, name: CapabilityName, impl: T): void {
  ctx.capabilities.set(normalizeKey(name), impl)
}

/** 沿 parent 链查找能力（就近原则） */
export function lookup<T = unknown>(ctx: ICapabilityContext, name: CapabilityName): T | undefined {
  const key = normalizeKey(name)
  let current: ICapabilityContext | undefined = ctx
  while (current) {
    const impl = current.capabilities.get(key)
    if (impl !== undefined) return impl as T
    current = current.parent
  }
  return undefined
}

/** 创建类型安全事件发射器（泛型参数可选，默认接受任意事件） */
// Note: any[] 在此处是合理的泛型约束（与 IEventEmitter 接口保持一致）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createEventEmitter<TEventMap extends Record<string, any[]> = Record<string, any[]>>(): IEventEmitter<TEventMap> {
  // Note: any 在此处是内部实现细节，外部通过泛型确保类型安全
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
      const handlers = listeners.get(event)
      if (handlers) {
        for (const h of handlers) {
          try { h(...args) } catch (e) { console.error(`[EventEmitter] Error in handler for '${event}':`, e) }
        }
      }
    },
    removeAllListeners(event?: string) {
      if (event !== undefined) {
        listeners.delete(event)
      } else {
        listeners.clear()
      }
    },
    listenerCount(event?: string) {
      if (event !== undefined) {
        return listeners.get(event)?.size ?? 0
      }
      let total = 0
      for (const s of listeners.values()) total += s.size
      return total
    }
  }
}

// ==================== 应用服务 ====================

/** APP Services 能力（应用全局服务聚合） */
export interface IAppServicesCapability {
  router?: {
    push(to: string | { path: string; query?: Record<string, unknown> }): Promise<unknown>
    replace(to: string | { path: string; query?: Record<string, unknown> }): Promise<unknown>
    back(): void
    currentRoute: unknown
  }
  logger?: LoggerApi
  tenant?: { tenantId: string; tenantName?: string; [key: string]: unknown }
  configLoader?: unknown
  authService?: unknown
}

export const APP_SERVICES = defineCapability<IAppServicesCapability>('spark:capability:app-services')

/**
 * Logger 能力键
 *
 * 组件树中任一层可通过 `provide(LOGGER, myLogger)` 注入自定义 Logger；
 * `useSparkComponent` 的内置 `logger` 代理按以下优先级解析：
 *   1. `LOGGER` 能力（最近的祖先）
 *   2. `APP_SERVICES.logger`（应用层统一提供）
 *   3. fallback console
 */
export const LOGGER = defineCapability<LoggerApi>('spark:capability:logger')

/** 页面服务能力（UI 交互） */
export interface IPageServiceCapability {
  /** 消息提示（替代 ElMessage） */
  showMessage(message: string, type?: 'success' | 'error' | 'warning' | 'info'): void
  /** 确认框，返回 true=确定 / false=取消（替代 ElMessageBox.confirm） */
  showConfirm(message: string, title?: string, options?: { confirmText?: string; cancelText?: string; type?: 'warning' | 'info' | 'error' | 'success' }): Promise<boolean>
  /** 输入框，返回输入值；取消返回 null（替代 ElMessageBox.prompt） */
  showPrompt(message: string, title?: string, options?: { placeholder?: string; defaultValue?: string }): Promise<string | null>
  /** 纯提示框，仅确定按钮（替代 ElMessageBox.alert） */
  showAlert(message: string, title?: string, options?: { type?: 'warning' | 'info' | 'error' | 'success' }): Promise<void>
  /** 全局加载遮罩 */
  showLoading(show: boolean, text?: string): void
  /** 路由导航 */
  navigate(path: string, params?: Record<string, unknown>): void
}

export const PAGE_SERVICE = defineCapability<IPageServiceCapability>('spark:capability:page-service')

// ==================== UI 交互 ====================

/** 当前行能力 */
export interface ICurrentRowCapability {
  getRow(): unknown
  getIndex(): number | null
  setRow(row: unknown): void
}

/**
 * @reserved 为 r-row 组件预留，待 r-table→r-row 组件树实现后展开。
 * @internal 尚无 provider / consumer，外部代码请勿依赖。
 */
export const CURRENT_ROW = defineCapability<ICurrentRowCapability>('spark:capability:current-row')

/** 选择能力 */
export interface ISelectionCapability {
  select(id: number | string): void
  deselect(id: number | string): void
  isSelected(id: number | string): boolean
  selectAll?(): void
  clearSelection(): void
  getSelected(): Array<number | string>
}

/**
 * @reserved 为 r-row 选择状态管理预留，待 r-table→r-row 组件树实现后展开。
 * @internal 尚无 provider / consumer，外部代码请勿依赖。
 */
export const SELECTION = defineCapability<ISelectionCapability>('spark:capability:selection')

/** 行数据能力 */
export interface IRowDataCapability {
  getData(): unknown
  getField(field: string): unknown
  isSelected?(): boolean
}

/**
 * @reserved 为 r-cell 组件预留，待 r-row→r-cell 组件树实现后展开。
 * @internal 尚无 provider / consumer，外部代码请勿依赖。
 */
export const ROW_DATA = defineCapability<IRowDataCapability>('spark:capability:row-data')

// ==================== 事件 ====================

/**
 * @reserved 为 r-table 内部事件总线预留，待 r-table 实现内部子组件通信时展开。
 * @internal 尚无 provider / consumer，外部代码请勿依赖。
 */
export const GRID_EVENTS = defineCapability<IEventEmitter>('spark:capability:grid-events')

/**
 * @reserved 为 r-row 外向事件上报预留，待 r-row 实现内部子组件通信时展开。
 * @internal 尚无 provider / consumer，外部代码请勿依赖。
 */
export const ROW_EVENTS = defineCapability<IEventEmitter>('spark:capability:row-events')

// ==================== 能力类型映射表（可扩展） ====================

/**
 * 能力名称 → 实现类型的映射表。
 *
 * 任意包可通过 declaration merging 注入新条目，无需修改 spark-utils：
 *
 * @example
 * ```ts
 * // packages/spark-component/src/capability-keys.ts
 * declare module '@spark-view/spark-utils' {
 *   interface CapabilityTypeMap {
 *     'spark:capability:page-dataset': IDataSet
 *     'spark:capability:data-source':  IDataSource
 *   }
 * }
 *
 * // 消费方（无需 import 符号对象）
 * const ds = consume('spark:capability:data-source') // 类型：IDataSource | null
 * ```
 */
export interface CapabilityTypeMap {
  'spark:capability:app-services': IAppServicesCapability
  'spark:capability:logger':       LoggerApi
  'spark:capability:page-service': IPageServiceCapability
  'spark:capability:current-row':  ICurrentRowCapability
  'spark:capability:selection':    ISelectionCapability
  'spark:capability:row-data':     IRowDataCapability
  'spark:capability:grid-events':  IEventEmitter
  'spark:capability:row-events':   IEventEmitter
}

// === 业务能力扩展点（plop spark-capability 生成的自定义能力在此追加） ===
