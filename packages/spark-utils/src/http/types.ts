/**
 * HTTP 模块类型定义
 *
 * 网络请求相关的全部类型集中于此
 *
 * @packageDocumentation
 */

// ==================== 请求配置 ====================

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * 请求配置
 *
 * 每次请求的完整配置，简洁且可扩展
 */
export interface RequestConfig {
  /** 请求 URL */
  url: string
  /** HTTP 方法（默认 GET） */
  method?: Method
  /** 请求头 */
  headers?: Record<string, string>
  /** URL 查询参数 */
  params?: Record<string, unknown>
  /** 请求体 */
  data?: unknown
  /** 超时（ms，默认 10000） */
  timeout?: number
  /** 响应类型（默认 json） */
  responseType?: 'json' | 'text' | 'blob' | 'arraybuffer'
  /** API 基础地址 */
  baseURL?: string

  // ===== 缓存（仅 GET） =====
  /** 启用缓存 */
  cache?: boolean
  /** 自定义缓存键 */
  cacheKey?: string
  /** 缓存过期（ms，默认 300000） */
  cacheExpiry?: number

  // ===== 重试 =====
  /** 重试次数（默认 0） */
  retry?: number
  /** 重试延迟（ms，默认 1000） */
  retryDelay?: number

  // ===== 扩展 =====
  /** 自定义元数据（透传给拦截器） */
  meta?: Record<string, unknown>
}

// ==================== 响应 ====================

/** HTTP 响应（不泄露 axios 实现） */
export interface HttpResponse<T = unknown> {
  data: T
  status: number
  statusText: string
  headers: Record<string, string>
}

/** 标准业务 API 响应（{ code, message, data } 格式） */
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
  timestamp?: string
  traceId?: string
}

// ==================== 错误 ====================

export interface RequestError extends Error {
  config: RequestConfig
  code?: string
  status?: number
  response?: unknown
}

// ==================== 拦截器 ====================

export interface RequestInterceptor {
  name?: string
  onRequest?: (config: RequestConfig) => RequestConfig | Promise<RequestConfig>
  onRequestError?: (error: RequestError) => void | Promise<void>
}

export interface ResponseInterceptor {
  name?: string
  onResponse?: <T>(response: HttpResponse<T>) => HttpResponse<T> | Promise<HttpResponse<T>>
  onResponseError?: (error: RequestError) => RequestError | Promise<RequestError>
}

// ==================== 文件加载器 ====================

export interface FileLoadOptions {
  /** API 基础路径 */
  baseUrl: string
  /** 缓存存储方式 */
  storage?: 'localStorage' | 'sessionStorage' | 'memory'
  /** 缓存键前缀 */
  cachePrefix?: string
  /** 超时（ms） */
  timeout?: number
  /** 自定义请求头 */
  headers?: Record<string, string>
  /** 网络失败时降级到缓存 */
  fallbackToCache?: boolean
}

export interface FileCache {
  content: string
  timestamp: string
  cachedAt: number
}

export interface FileLoadResult<T = unknown> {
  success: boolean
  data?: T
  timestamp?: string
  fromCache: boolean
  error?: string
  notModified?: boolean
}
