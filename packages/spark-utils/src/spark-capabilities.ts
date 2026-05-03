/**
 * SPARK 业务能力类型与键定义。
 *
 * 将 spark-component 页面/组件级的能力系统集中到 spark-utils，
 * 使其他包（spark-page-config、spark-app 等）无需依赖 spark-component 即可引用这些类型。
 *
 * 注意：PAGE_DATASET / DATA_SOURCE / DATA_ROW 这三个依赖 spark-data 类型的键
 * 保留在 spark-component/src/core/capability-keys.ts，以遵守包边界。
 */

import {
  defineCapability,
  consumeSparkCapability,
} from './capability.js'
import type {
  CapabilityKey,
  ICapabilityContext,
} from './capability.js'
import type { LoggerApi } from './logger.js'
import type { NavPermissionMode } from './nav-types.js'

// ==================== 业务类型 ====================

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

export type IPageSelectedEntity = IPageSelectorOption

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

export type ThemeMode = 'light' | 'dark' | 'auto'

export interface IThemeCapability {
  readonly current: 'light' | 'dark'
  readonly mode: ThemeMode
  setMode(mode: ThemeMode): void
  readonly isDark: boolean
  toggle(): void
}

export interface IModuleContextItem {
  id: string | number
  title: string
}

export interface IModuleContext {
  selected: string | number | null
  items: readonly IModuleContextItem[]
  nodeId: string
}

// ==================== 页面组件注册表类型 ====================

export interface PageComponentInstanceEntry {
  id: string
  type: string
  props?: Record<string, unknown>
}

export interface PageComponentApiEntry {
  id: string
  type: string
  api: unknown
}

export interface PageComponentRegistry {
  registerInstance(entry: PageComponentInstanceEntry): void
  unregisterInstance(id: string): void
  listInstances(type?: string): PageComponentInstanceEntry[]
  getInstance(id: string): PageComponentInstanceEntry | null

  registerApi(entry: PageComponentApiEntry): void
  unregisterApi(id: string): void
  listApis(type?: string): PageComponentApiEntry[]
  getApi<T = unknown>(id: string): T | null
  getApisByType<T = unknown>(type: string): T[]
}

export interface ModuleContextCapability {
  getCurrent(): IModuleContext | null
  subscribe(handler: (next: IModuleContext | null, prev: IModuleContext | null) => void): () => void
}

export interface PageCssScopeCapability {
  inject(css: string): void
}

// ==================== CapabilityTypeMap 扩展 ====================

declare module './capability.js' {
  interface CapabilityTypeMap {
    'spark:capability:app-services': IAppServicesCapability
    'spark:capability:page-service': IPageServiceCapability
    'spark:capability:page-component-registry': PageComponentRegistry
    'spark:capability:module-context': ModuleContextCapability
    'spark:capability:css-scope': PageCssScopeCapability
    'spark:capability:permission-mode': NavPermissionMode
  }
}

// ==================== 能力键定义（不依赖 spark-data） ====================

export const APP_SERVICES = defineCapability<IAppServicesCapability>('spark:capability:app-services')
export const PAGE_SERVICE = defineCapability<IPageServiceCapability>('spark:capability:page-service')
export const PAGE_PERMISSION_MODE = defineCapability<NavPermissionMode>('spark:capability:permission-mode')
export const PAGE_COMPONENT_REGISTRY = defineCapability<PageComponentRegistry>('spark:capability:page-component-registry')
export const MODULE_CONTEXT = defineCapability<ModuleContextCapability>('spark:capability:module-context')
export const CSS_SCOPE = defineCapability<PageCssScopeCapability>('spark:capability:css-scope')

// ==================== 能力树辅助函数 ====================

function hasLocalCapability<T>(ctx: ICapabilityContext, key: CapabilityKey<T>): boolean {
  return ctx.capabilities.has(key)
}

/**
 * 逐层往上查找最近的"本地声明了指定能力键"的上下文。
 *
 * 只检查每层本地 capabilities map（Map.has），
 * 返回 provider context 本身，而不是能力值。
 */
export function findNearestCapabilityProvider<T>(
  ctx: ICapabilityContext | null | undefined,
  key: CapabilityKey<T>,
  options?: { includeSelf?: boolean },
): ICapabilityContext | null {
  if (!ctx) return null
  let current: ICapabilityContext | undefined = options?.includeSelf ? ctx : ctx.parent
  while (current) {
    if (hasLocalCapability(current, key)) {
      return current
    }
    current = current.parent
  }
  return null
}

/**
 * 逐层往上查找最近的"本地声明了任一指定能力键"的上下文。
 */
export function findNearestCapabilityProviderByKeys(
  ctx: ICapabilityContext | null | undefined,
  keys: ReadonlyArray<CapabilityKey<unknown>>,
  options?: { includeSelf?: boolean },
): ICapabilityContext | null {
  if (!ctx) return null
  let current: ICapabilityContext | null = options?.includeSelf ? ctx : ctx.parent ?? null
  while (current) {
    for (const key of keys) {
      if (hasLocalCapability(current, key)) {
        return current
      }
    }
    current = current.parent ?? null
  }
  return null
}

/**
 * 从指定 provider context 读取能力。
 *
 * localOnly=true 时只读该 context 本地提供；否则沿其 parent 链继续消费。
 */
export function consumeCapabilityFromProvider<T>(
  provider: ICapabilityContext | null | undefined,
  key: CapabilityKey<T>,
  options?: { localOnly?: boolean },
): T | null {
  if (!provider) return null
  if (options?.localOnly) {
    return hasLocalCapability(provider, key)
      ? (provider.capabilities.get(key) as T)
      : null
  }
  return consumeSparkCapability(provider, key)
}
