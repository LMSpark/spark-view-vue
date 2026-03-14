/**
 * HTTP 模块类型定义
 * @packageDocumentation
 */

// ==================== 请求配置 ====================

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * 请求配置
 */
export interface RequestConfig {
  url: string
  method?: Method
  headers?: Record<string, string>
  params?: Record<string, unknown>
  data?: unknown
  timeout?: number
  /** 响应类型（默认 json） */
  responseType?: 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream' | 'formdata'
  baseURL?: string

  // 缓存（仅 GET）
  cache?: boolean
  cacheKey?: string
  /** 缓存过期（ms，默认 300000） */
  cacheExpiry?: number

  // 重试
  /** 重试次数（默认 0） */
  retry?: number
  /** 重试延迟（ms，默认 1000） */
  retryDelay?: number

  /** AbortSignal —— 用于取消请求（组件卸载时中止在途请求） */
  signal?: AbortSignal

  /** 跨域请求携带 cookie（对应 axios withCredentials / fetch credentials:'include'） */
  withCredentials?: boolean

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

// ==================== 文件加载器 / 缓存层 ====================

/** 缓存过期策略级别定义 */
export interface CacheExpirationTier {
  /** 级别编号 */
  level: number
  /** 最大闲置时间（毫秒），Infinity 表示永不过期 */
  maxAge: number
  /** 级别说明 */
  description?: string
}

export interface FileLoadOptions {
  /** API 基础路径（文件 HTTP 加载使用） */
  baseUrl: string
  /** 缓存存储方式 */
  storage?: 'localStorage' | 'sessionStorage' | 'memory'
  /** 缓存键前缀 */
  cachePrefix?: string
  /** 超时（ms） */
  timeout?: number
  /** 自定义请求头（静态） */
  headers?: Record<string, string>
  /** 动态请求头回调（每次请求时调用，优先级高于 headers） */
  getHeaders?: () => Record<string, string>
  /** 网络失败时降级到缓存 */
  fallbackToCache?: boolean
  /** 
   * 过期策略级别定义（默认：0=永不过期, 1=3天, 2=7天, 3=15天, 4=30天）
   * 可自定义级别定义
   */
  expirationTiers?: CacheExpirationTier[]
  /** 默认过期级别（默认 3 = 15天），对应 expirationTiers 中的 level */
  defaultExpirationLevel?: number
  /** 最大缓存条目数（默认 100），超过按 LRU 清理 */
  maxCacheSize?: number
}

/**
 * 通用缓存条目（泛型）
 * - 文件内容：T = string
 * - DataSet、编译后脚本、编译后规则等计算结果：T = 具体类型
 */
export interface CacheEntry<T = string> {
  /** 缓存的数据（文件原始内容或任意计算结果） */
  data: T
  /**
   * 来源时间戳（来自文件服务器的 mtime、版本号或任意标识）
   * 对比此字段判断缓存是否仍有效。
   */
  sourceTimestamp: string
  /** 缓存创建时间（毫秒时间戳，用于兜底） */
  cachedAt: number
  /** 最后访问时间（毫秒时间戳，用于滑动过期 + LRU 清理） */
  lastAccess: number
  /** 过期级别（0=永不过期, 1=3天, 2=7天, 3=15天, 4=30天） */
  expirationLevel: number
}

/** @deprecated 请使用 CacheEntry<string> */
export type FileCache = CacheEntry<string>

export interface FileLoadResult<T = unknown> {
  success: boolean
  data?: T
  /** 来源时间戳 */
  timestamp?: string
  fromCache: boolean
  error?: string
  notModified?: boolean
}
