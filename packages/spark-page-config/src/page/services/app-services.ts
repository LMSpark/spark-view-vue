import { defineCapability, type LoggerApi } from '@spark-view/spark-utils'

export type PageMessageType = 'success' | 'error' | 'warning' | 'info'
export type PageDialogResult = 'confirm' | 'cancel' | 'close'
export type PageSelectableValue = string | number | boolean

export type PageDialogOptions = {
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

export type PageBrowseFilesOptions = {
  title?: string
  accept?: string
  multiple?: boolean
  currentValue?: string
}

export type PageSelectedFile = {
  name: string
  size: number
  type: string
  lastModified: number
  file: File
}

export type PageUploadFilesOptions = PageBrowseFilesOptions & {
  action: string
  method?: 'POST' | 'PUT' | 'PATCH'
  fieldName?: string
  headers?: Record<string, string>
  data?: Record<string, string | Blob>
  withCredentials?: boolean
  files?: File[]
}

export type PageUploadedFile = PageSelectedFile & {
  response: unknown
  url?: string
}

export type PageSelectorOption = {
  label: string
  value: PageSelectableValue
  description?: string
  disabled?: boolean
  raw?: unknown
}

export type PageSelectEntitiesOptions = {
  title?: string
  entityName?: string
  placeholder?: string
  multiple?: boolean
  searchable?: boolean
  confirmText?: string
  cancelText?: string
  emptyText?: string
  currentValue?: PageSelectableValue | PageSelectableValue[] | string
  options?: PageSelectorOption[]
}

export type PageSelectedEntity = PageSelectorOption

export type PageServiceCapability = {
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

export type PageRouterService = {
  push(to: string | { path: string; query?: Record<string, unknown> }): Promise<unknown>
  replace(to: string | { path: string; query?: Record<string, unknown> }): Promise<unknown>
  back(): void
  currentRoute: unknown
}

export type PageRuntimeServicesCapability = {
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
