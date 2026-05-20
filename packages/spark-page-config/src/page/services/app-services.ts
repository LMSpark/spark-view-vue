import { defineCapability, type LoggerApi } from '@spark-view/spark-utils'

export type PageMessageType = 'success' | 'error' | 'warning' | 'info'
export type PageDialogResult = 'confirm' | 'cancel' | 'close'
// 这里不再为 JS 基础类型保留导出别名，直接使用原生联合类型。

export interface PageDialogOptions {
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

export interface PageBrowseFilesOptions {
  title?: string
  accept?: string
  multiple?: boolean
  currentValue?: string
}

export interface PageSelectedFile {
  name: string
  size: number
  type: string
  lastModified: number
  file: File
}

export interface PageUploadFilesOptions extends PageBrowseFilesOptions {
  action: string
    method?: 'POST' | 'PUT' | 'PATCH'
    fieldName?: string
    headers?: Record<string, string>
    data?: Record<string, string | Blob>
    withCredentials?: boolean
    files?: File[]
}

export interface PageUploadedFile extends PageSelectedFile {
  response: unknown
    url?: string
}

export interface PageSelectorOption {
  label: string
  value: string | number | boolean
  description?: string
  disabled?: boolean
  raw?: unknown
}

export interface PageSelectEntitiesOptions {
  title?: string
  entityName?: string
  placeholder?: string
  multiple?: boolean
  searchable?: boolean
  confirmText?: string
  cancelText?: string
  emptyText?: string
  currentValue?: string | number | boolean | Array<string | number | boolean>
  options?: PageSelectorOption[]
}

/** 选中实体沿用候选项结构，不再额外定义基础值类型别名。 */
export interface PageSelectedEntity extends PageSelectorOption {}

export interface PageServiceCapability {
  showMessage(message: string, type?: PageMessageType): void
  showConfirm(message: string, title?: string, options?: { confirmText?: string; cancelText?: string; type?: PageMessageType }): Promise<boolean>
  showPrompt(message: string, title?: string, options?: { placeholder?: string; defaultValue?: string }): Promise<string | null>
  showAlert(message: string, title?: string, options?: { type?: PageMessageType }): Promise<void>
  showDialog(options: PageDialogOptions): Promise<PageDialogResult>
  selectEntities(options: PageSelectEntitiesOptions): Promise<PageSelectedEntity[]>
  browseFiles(options?: PageBrowseFilesOptions): Promise<PageSelectedFile[]>
  uploadFiles(options: PageUploadFilesOptions): Promise<PageUploadedFile[]>
  showLoading(show: boolean, text?: string): void
  navigate(path: string, params?: Record<string, unknown>): void
}

export interface PageRouterService {
  push(to: string | { path: string; query?: Record<string, unknown> }): Promise<unknown>
  replace(to: string | { path: string; query?: Record<string, unknown> }): Promise<unknown>
  back(): void
  currentRoute: unknown
}

export interface PageRuntimeServicesCapability {
  router?: PageRouterService
  logger?: LoggerApi
  tenant?: { tenantId: string; tenantName?: string; [key: string]: unknown }
  configLoader?: unknown
  authService?: unknown
  pageService?: Partial<PageServiceCapability>
}

declare module '@spark-view/spark-utils' {
  interface CapabilityTypeMap {
    'spark:capability:page-runtime-services': PageRuntimeServicesCapability
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPageRuntimeServicesCapability(value: unknown): value is PageRuntimeServicesCapability {
  return isRecord(value)
}

export const PAGE_RUNTIME_SERVICES = defineCapability<PageRuntimeServicesCapability>(
  'spark:capability:page-runtime-services',
  isPageRuntimeServicesCapability,
)
