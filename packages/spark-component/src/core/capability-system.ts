/**
 * spark-component 内部能力系统（本地实现）
 *
 * 目标：
 * - 迁移自 @spark-view/spark-utils 的能力核心能力
 * - 能力键统一符号化（Symbol.for）
 * - 对外提供类型安全的 key / provide / consume 基础设施
 */

import type { LoggerApi } from '@spark-view/spark-utils'
import type { IEventEmitter } from '@spark-view/spark-data'
import { createEventEmitter } from '@spark-view/spark-data'

export type { IEventEmitter }
export { createEventEmitter }

export type CapabilityKey<T> = symbol & { readonly __capabilityType?: T }
export type CapabilityName = CapabilityKey<unknown>
export type SparkCapabilityConsumer = <T>(name: CapabilityKey<T>) => T | null

export interface ICapabilityContext {
  id: string
  type: string
  parent?: ICapabilityContext
  capabilities: Map<CapabilityName, unknown>
}

export function defineCapability<T>(name: string): CapabilityKey<T> {
  return Symbol.for(name) as CapabilityKey<T>
}

export function sparkProvide<T>(ctx: ICapabilityContext, name: CapabilityKey<T>, impl: T): void {
  ctx.capabilities.set(name, impl)
}

export function sparkRemove(ctx: ICapabilityContext, name: CapabilityKey<unknown>): void {
  ctx.capabilities.delete(name)
}

export function sparkConsume<T>(ctx: ICapabilityContext, name: CapabilityKey<T>): T | null {
  let current: ICapabilityContext | undefined = ctx
  while (current) {
    const impl = current.capabilities.get(name)
    if (impl !== undefined) return impl as T
    current = current.parent
  }
  return null
}

/** Create a minimal Spark capability context node. */
export function createSparkCapabilityContext(
  config: { id: string; type: string },
  parent?: ICapabilityContext | null,
): ICapabilityContext {
  const context: ICapabilityContext = {
    id: config.id,
    type: config.type,
    capabilities: new Map<CapabilityName, unknown>(),
  }
  if (parent !== undefined && parent !== null) {
    context.parent = parent
  }
  return context
}

/** Consume capability from context chain; null when not found. */
export function consumeSparkCapability<T>(
  context: ICapabilityContext | null | undefined,
  name: CapabilityKey<T>,
): T | null {
  if (!context) return null
  return sparkConsume(context, name)
}

/** Create a typed capability consumer bound to a specific context. */
export function createSparkCapabilityConsumer(
  context: ICapabilityContext | null,
): SparkCapabilityConsumer {
  return <T>(name: CapabilityKey<T>): T | null => consumeSparkCapability(context, name)
}

/** Read local-only provider value without walking parent chain. */
export function getSparkCapabilityProvider(
  context: ICapabilityContext,
  name: CapabilityKey<unknown>,
): unknown {
  return context.capabilities.get(name)
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

export const PAGE_SERVICE = defineCapability<IPageServiceCapability>('spark:capability:page-service')

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

export interface CapabilityTypeMap {
  'spark:capability:app-services': IAppServicesCapability
  'spark:capability:page-service': IPageServiceCapability
}
