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

  /** fetch-only: 页面卸载时保持连接（日志传输场景） */
  keepalive?: boolean
}

// ==================== 响应 ====================

/** HTTP 响应（不泄露 axios 实现） */
export interface HttpResponse<T = unknown> {
  data: T
  status: number
  statusText: string
  headers: Record<string, string>
}

/** 旧版标准业务 API 响应（{ code, message, data } 格式） */
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
  timestamp?: string
  traceId?: string
}

/** SPARK AI Server 统一 API envelope */
export interface ApiEnvelope<T = unknown> {
  ok: boolean
  data: T | null
  error: ApiEnvelopeError | null
  requestId: string
}

export interface ApiEnvelopeError {
  code: string
  message: string
  category: string
  details?: Record<string, unknown>
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
  /**
   * 请求阶段错误回调。
   *
   * 当前版本中，此回调在**同一拦截器**的 `onRequest` 抛出异常时被调用，
   * 允许拦截器自行记录或处理自身引发的错误。异常仍会向上传播。
   */
  onRequestError?: (error: RequestError) => void | Promise<void>
}

export interface ResponseInterceptor {
  name?: string
  onResponse?: <T>(response: HttpResponse<T>) => HttpResponse<T> | Promise<HttpResponse<T>>
  onResponseError?: (error: RequestError) => RequestError | Promise<RequestError>
}

// ==================== 统一客户端契约 ====================

/**
 * HTTP 客户端统一契约。
 *
 * 说明：
 * - `Request`（axios）与 `FetchClient`（fetch）都实现此接口
 * - 业务侧优先依赖 `HttpClient` 类型，避免绑定具体实现
 */
export interface HttpClient {
  readonly interceptors: {
    request: {
      use: (interceptor: RequestInterceptor) => (() => void)
    }
    response: {
      use: (interceptor: ResponseInterceptor) => (() => void)
    }
  }

  request<T = unknown>(config: RequestConfig): Promise<T>
  requestFull<T = unknown>(config: RequestConfig): Promise<HttpResponse<T>>

  get<T = unknown>(url: string, params?: Record<string, unknown>, config?: Partial<RequestConfig>): Promise<T>
  post<T = unknown>(url: string, data?: unknown, config?: Partial<RequestConfig>): Promise<T>
  put<T = unknown>(url: string, data?: unknown, config?: Partial<RequestConfig>): Promise<T>
  patch<T = unknown>(url: string, data?: unknown, config?: Partial<RequestConfig>): Promise<T>
  delete<T = unknown>(url: string, params?: Record<string, unknown>, config?: Partial<RequestConfig>): Promise<T>

  clearCache(url?: string): void
}

/**
 * Fetch 扩展客户端契约。
 *
 * 相比 `HttpClient`，额外暴露流式能力与 beacon 发送能力。
 * stream / streamSSE **不走重试循环**，业务侧按需自行重连。
 *
 * @example
 * ```ts
 * const client: FetchHttpClient = createFetchClient({ baseURL: '/api' })
 * const events = await client.streamSSE({ url: '/ai/chat', method: 'POST', data: body })
 * for await (const e of events) { ... }
 * ```
 */
export interface FetchHttpClient extends HttpClient {
  /** 发起流式请求并返回原始 ReadableStream（⚠️ 不走重试循环） */
  stream(config: RequestConfig): Promise<StreamResponse>
  /** 发起 SSE 请求并返回事件异步迭代器（⚠️ 不走重试循环） */
  streamSSE(config: RequestConfig): Promise<AsyncGenerator<SSEEvent>>
  /** 使用 sendBeacon（或 fetch keepalive 降级）发送卸载期数据 */
  beacon(url: string, data: unknown): boolean
}

/** HttpClient 底层适配器类型 */
export type HttpClientAdapter = 'axios' | 'fetch'

/** createHttpClient 工厂参数 */
export interface HttpClientFactoryOptions extends Partial<RequestConfig> {
  adapter?: HttpClientAdapter
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

export interface FileLoadResult<T = unknown> {
  success: boolean
  data?: T
  /** 来源时间戳 */
  timestamp?: string
  fromCache: boolean
  error?: string
  notModified?: boolean
  /** 失败状态码（如 404） */
  status?: number
  /** 失败原因（用于上游订阅消费，不再依赖字符串匹配） */
  reason?: 'not-found' | 'network' | 'invalid-response' | 'parse' | 'unknown'
}

/** FileLoader 事件映射（用于全链路订阅消费） */
export interface FileLoaderEventMap {
  'file-loaded': {
    fileName: string
    fromCache: boolean
    timestamp?: string
    notModified?: boolean
  }
  'file-missing': {
    fileName: string
    status?: number
    reason: 'not-found'
  }
  'file-error': {
    fileName: string
    status?: number
    error: string
    reason: 'network' | 'invalid-response' | 'parse' | 'unknown'
  }
}

// ==================== 流式响应（fetch-only） ====================

/** 流式 HTTP 响应（fetch ReadableStream） */
export interface StreamResponse {
  body: ReadableStream<Uint8Array>
  status: number
  statusText: string
  headers: Record<string, string>
}

/** 解析后的 SSE 事件 */
export interface SSEEvent {
  /** 事件类型（event: 字段） */
  event?: string
  /** 数据内容（data: 字段，多行拼接） */
  data: string
  /** 事件 ID（id: 字段） */
  id?: string
}
