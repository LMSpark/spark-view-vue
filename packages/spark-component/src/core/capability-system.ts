/**
 * spark-component 内部能力系统（本地实现）
 *
 * 目标：
 * - 迁移自 @spark-view/spark-utils 的能力核心能力
 * - 能力键统一符号化（Symbol.for）
 * - 对外提供类型安全的 key / provide / consume 基础设施
 */

import type { LoggerApi } from '@spark-view/spark-utils'

export type CapabilityName = string | symbol

export interface ICapabilityContext {
  id: string
  type: string
  parent?: ICapabilityContext
  capabilities: Map<CapabilityName, unknown>
  host?: unknown
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface IEventEmitter<TEventMap extends Record<string, any[]> = Record<string, any[]>> {
  on<K extends string & keyof TEventMap>(event: K, handler: (...args: TEventMap[K]) => void): void
  off<K extends string & keyof TEventMap>(event: K, handler: (...args: TEventMap[K]) => void): void
  emit<K extends string & keyof TEventMap>(event: K, ...args: TEventMap[K]): void
  removeAllListeners<K extends string & keyof TEventMap>(event?: K): void
  listenerCount<K extends string & keyof TEventMap>(event?: K): number
}

export type CapabilityKey<T> = symbol & { readonly __capabilityType?: T }

export function defineCapability<T>(name: string): CapabilityKey<T> {
  return Symbol.for(name) as CapabilityKey<T>
}

export function normalizeKey(name: CapabilityName): symbol | string {
  return typeof name === 'string' ? Symbol.for(name) : name
}

export function sparkProvide<T>(ctx: ICapabilityContext, name: CapabilityName, impl: T): void {
  ctx.capabilities.set(normalizeKey(name), impl)
}

export function sparkConsume<T = unknown>(ctx: ICapabilityContext, name: CapabilityName): T | undefined {
  const key = normalizeKey(name)
  let current: ICapabilityContext | undefined = ctx
  while (current) {
    const impl = current.capabilities.get(key)
    if (impl !== undefined) return impl as T
    current = current.parent
  }
  return undefined
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createEventEmitter<TEventMap extends Record<string, any[]> = Record<string, any[]>>(): IEventEmitter<TEventMap> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listeners = new Map<string, Set<(...args: any[]) => void>>()
  return {
    on(event, handler) {
      let handlers = listeners.get(event)
      if (!handlers) {
        handlers = new Set()
        listeners.set(event, handlers)
      }
      handlers.add(handler)
    },
    off(event, handler) {
      listeners.get(event)?.delete(handler)
    },
    emit(event, ...args) {
      const handlers = listeners.get(event)
      if (handlers) {
        for (const h of handlers) {
          try {
            h(...args)
          } catch (e) {
            if (import.meta.env.DEV) console.error(`[EventEmitter] Error in handler for '${event}':`, e)
          }
        }
      }
    },
    removeAllListeners(event?: string) {
      if (event !== undefined) listeners.delete(event)
      else listeners.clear()
    },
    listenerCount(event?: string) {
      if (event !== undefined) return listeners.get(event)?.size ?? 0
      let total = 0
      for (const s of listeners.values()) total += s.size
      return total
    },
  }
}

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
  pageService?: Partial<IPageServiceCapability>
}

export const APP_SERVICES = defineCapability<IAppServicesCapability>('spark:capability:app-services')
export const LOGGER = defineCapability<LoggerApi>('spark:capability:logger')

export type PageMessageType = 'success' | 'error' | 'warning' | 'info'
export type PageDialogResult = 'confirm' | 'cancel' | 'close'
export type PageSelectableValue = string | number | boolean

export interface IPageDialogOptions {
  title?: string
  message?: string
  content?: string
  confirmText?: string
  cancelText?: string
  showCancelButton?: boolean
  dangerouslyUseHTMLString?: boolean
  type?: PageMessageType
  width?: string
}

export interface IPageBrowseFilesOptions {
  title?: string
  accept?: string
  multiple?: boolean
  currentValue?: string
}

export interface IPageSelectedFile {
  name: string
  size: number
  type: string
  lastModified: number
  file: File
}

export interface IPageUploadFilesOptions extends IPageBrowseFilesOptions {
  action: string
  method?: 'POST' | 'PUT' | 'PATCH'
  fieldName?: string
  headers?: Record<string, string>
  data?: Record<string, string | Blob>
  withCredentials?: boolean
  files?: File[]
}

export interface IPageUploadedFile extends IPageSelectedFile {
  response: unknown
  url?: string
}

export interface IPageSelectorOption {
  label: string
  value: PageSelectableValue
  description?: string
  disabled?: boolean
  raw?: unknown
}

export interface IPageSelectEntitiesOptions {
  title?: string
  entityName?: string
  placeholder?: string
  multiple?: boolean
  searchable?: boolean
  confirmText?: string
  cancelText?: string
  emptyText?: string
  currentValue?: PageSelectableValue | PageSelectableValue[] | string
  options?: IPageSelectorOption[]
}

export interface IPageSelectedEntity extends IPageSelectorOption {}

export interface IPageServiceCapability {
  showMessage(message: string, type?: PageMessageType): void
  showConfirm(message: string, title?: string, options?: { confirmText?: string; cancelText?: string; type?: PageMessageType }): Promise<boolean>
  showPrompt(message: string, title?: string, options?: { placeholder?: string; defaultValue?: string }): Promise<string | null>
  showAlert(message: string, title?: string, options?: { type?: PageMessageType }): Promise<void>
  showDialog(options: IPageDialogOptions): Promise<PageDialogResult>
  selectEntities(options: IPageSelectEntitiesOptions): Promise<IPageSelectedEntity[]>
  browseFiles(options?: IPageBrowseFilesOptions): Promise<IPageSelectedFile[]>
  uploadFiles(options: IPageUploadFilesOptions): Promise<IPageUploadedFile[]>
  showLoading(show: boolean, text?: string): void
  navigate(path: string, params?: Record<string, unknown>): void
}

export const PAGE_SERVICE = defineCapability<IPageServiceCapability>('spark:capability:page-service')

export type ThemeMode = 'light' | 'dark' | 'auto'

export interface IThemeCapability {
  readonly current: 'light' | 'dark'
  readonly mode: ThemeMode
  setMode(mode: ThemeMode): void
  readonly isDark: boolean
  toggle(): void
}

export const THEME = defineCapability<IThemeCapability>('spark:capability:theme')

export interface IModuleContextItem {
  id: string | number
  title: string
}

export interface IModuleContext {
  selected: string | number | null
  items: readonly IModuleContextItem[]
  nodeId: string
}

export interface CapabilityTypeMap {
  'spark:capability:app-services': IAppServicesCapability
  'spark:capability:logger': LoggerApi
  'spark:capability:page-service': IPageServiceCapability
  'spark:capability:theme': IThemeCapability
}
