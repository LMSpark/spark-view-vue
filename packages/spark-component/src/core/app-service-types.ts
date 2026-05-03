/**
 * 应用服务与页面服务能力类型定义。
 *
 * 与 capability-keys.ts 分离，避免在同一文件里既
 * `import from '@spark-view/spark-utils'` 又
 * `declare module '@spark-view/spark-utils'` 产生的循环增强问题。
 */
import type { LoggerApi } from '@spark-view/spark-utils'

/** 页面权限模式：none=无限制, masked=字段遮蔽, invisible=隐藏 */
export type NavPermissionMode = 'none' | 'masked' | 'invisible'

// ── 页面服务能力类型 ──────────────────────────────────────────────────────

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
