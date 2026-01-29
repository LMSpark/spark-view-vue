// shared/types/index.ts
// 通用类型定义

/**
 * API响应结果类型
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  message?: string
  code?: string | number
  timestamp?: number
}

/**
 * 分页参数
 */
export interface PaginationParams {
  page: number
  pageSize: number
  total?: number
}

/**
 * 分页响应
 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

/**
 * 表单验证规则
 */
export interface ValidationRule {
  required?: boolean
  min?: number
  max?: number
  pattern?: RegExp
  message?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  validator?: (value: any) => boolean | Promise<boolean>
}

/**
 * 选择项
 */
export interface SelectOption {
  label: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any
  disabled?: boolean
  children?: SelectOption[]
}

/**
 * 树形节点
 */
export interface TreeNode {
  id: string
  label: string
  children?: TreeNode[]
  expanded?: boolean
  selected?: boolean
  disabled?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any
}

/**
 * 文件上传结果
 */
export interface UploadResult {
  url: string
  name: string
  size: number
  type: string
}

/**
 * 通用配置接口
 */
export interface AppConfig {
  api: {
    baseURL: string
    timeout: number
  }
  theme: {
    primaryColor: string
    mode: 'light' | 'dark'
  }
  features: Record<string, boolean>
  limits: {
    maxFileSize: number
    maxConcurrentUploads: number
  }
}

/**
 * Result类型 - 函数式编程风格
 */
export type Result<T, E = Error> = Ok<T> | Err<E>

export class Ok<T> {
  readonly success = true
  constructor(public readonly value: T) {}
}

export class Err<E> {
  readonly success = false
  constructor(public readonly error: E) {}
}

/**
 * 异步操作状态
 */
export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'fulfilled'; data: T }
  | { status: 'rejected'; error: Error }

/**
 * 事件处理器类型
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventHandler<T = any> = (event: T) => void | Promise<void>

/**
 * 组件大小
 */
export type ComponentSize = 'small' | 'medium' | 'large'

/**
 * 方向
 */
export type Direction = 'horizontal' | 'vertical'

/**
 * 对齐方式
 */
export type Alignment = 'start' | 'center' | 'end' | 'stretch'