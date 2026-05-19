/**
 * HttpClientBase — HTTP 客户端抽象基类
 *
 * 所有公共逻辑的**唯一来源**：
 *   - 重试循环（retry + exponential delay）
 *   - 内存缓存（TTL + LRU 淘汰）
 *   - 拦截器管理（request / response 双链）
 *   - HTTP 快捷方法（get/post/put/patch/delete）
 *   - 错误归一化（统一 RequestError）
 *   - 延时工具（重试用，支持 AbortSignal 取消）
 *
 * 子类仅需实现：
 *   - `executeRequest<T>(config): Promise<HttpResponse<T>>`  — 适配层核心
 *   - `normalizeAdapterError(err, config?): RequestError`    — 适配层错误转换
 *
 * 设计原则：
 *   - SRP：基类只管公共流程，子类只管传输适配
 *   - OCP：扩展新传输层只需新子类 + 2 个方法
 *   - DRY：重试、缓存、拦截器、快捷方法仅存一处
 */

import { Logger } from '../logger'
import { isRecord } from '../internal/guards.js'
import type {
  RequestConfig, HttpResponse,
  RequestError, RequestInterceptor, ResponseInterceptor, HttpClient, ApiEnvelope,
} from './types'

// ==================== 常量（单一来源） ====================

export const DEFAULT_TIMEOUT = 10_000

/** 缓存条目：存储数据、写入时间戳和过期时长（ms） */
interface CacheItem { data: unknown; timestamp: number; expiry: number }

/** 缓存最大条目数——超出后淘汰最旧 20% 条目（LRU-like） */
const MAX_CACHE_SIZE = 500

/** 缓存默认过期时间（5分钟） */
const DEFAULT_CACHE_EXPIRY = 5 * 60 * 1000
const ABSOLUTE_URL_RE = /^[a-z][a-z\d+\-.]*:\/\//i

// ==================== 抽象基类 ====================

export abstract class HttpClientBase implements HttpClient {
  private cache = new Map<string, CacheItem>()
  private reqInterceptors: RequestInterceptor[] = []
  private resInterceptors: ResponseInterceptor[] = []
  protected readonly logger: ReturnType<typeof Logger>

  constructor(protected defaults: Partial<RequestConfig> = {}, loggerName = 'Http') {
    this.logger = Logger(loggerName)
  }

  // ==================== 子类必须实现 ====================

  /**
   * 执行单次 HTTP 请求并返回完整响应。
   *
   * - 不含重试、缓存、拦截器——这些由基类统一处理
   * - 子类只负责"发出请求 → 读取响应"
   */
  protected abstract executeRequest<T>(config: RequestConfig): Promise<HttpResponse<T>>

  /**
   * 将适配层特定错误（如 AxiosError、fetch TypeError）转换为统一 RequestError。
   */
  protected abstract normalizeAdapterError(err: unknown, config?: RequestConfig): RequestError

  // ==================== 拦截器 ====================

  readonly interceptors = {
    request: {
      use: (interceptor: RequestInterceptor): (() => void) => {
        this.reqInterceptors.push(interceptor)
        return () => {
          const idx = this.reqInterceptors.indexOf(interceptor)
          if (idx >= 0) this.reqInterceptors.splice(idx, 1)
        }
      },
    },
    response: {
      use: (interceptor: ResponseInterceptor): (() => void) => {
        this.resInterceptors.push(interceptor)
        return () => {
          const idx = this.resInterceptors.indexOf(interceptor)
          if (idx >= 0) this.resInterceptors.splice(idx, 1)
        }
      },
    },
  }

  // ==================== 核心请求（单一重试循环） ====================

  async request<T = unknown>(config: RequestConfig): Promise<T> {
    const res = await this.requestWithRetry<T>(config, true)
    return res.data
  }

  async requestFull<T = unknown>(config: RequestConfig): Promise<HttpResponse<T>> {
    return this.requestWithRetry<T>(config, false)
  }

  /**
   * 统一重试循环——request() 和 requestFull() 的单一实现。
   *
   * @param useCache 仅 request() 启用缓存（返回 data 时），requestFull() 不缓存
   */
  private async requestWithRetry<T>(config: RequestConfig, useCache: boolean): Promise<HttpResponse<T>> {
    const merged = this.mergeConfig(config)
    const method = merged.method ?? 'GET'

    // 缓存检查（仅 GET + cache 开启 + useCache=true）
    if (useCache && method === 'GET' && (merged.cache ?? false)) {
      const cached = this.getCache<T>(merged)
      if (cached !== null) return { data: cached, status: 200, statusText: 'OK (cached)', headers: {} }
    }

    const maxRetries = Math.max(0, merged.retry ?? 0)  // 防御负数
    const retryDelay = merged.retryDelay ?? 1000

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          await this.delay(retryDelay * attempt, merged.signal)
          this.logger.warn(`重试 ${attempt}/${maxRetries}`, { url: merged.url })
        }

        const cfg = await this.applyRequestInterceptors(merged)
        const res = await this.executeRequest<T>(cfg)
        const processed = await this.applyResponseInterceptors(res)
        const unwrapped = this.unwrapApiEnvelopeResponse(processed, cfg)

        // 写入缓存
        if (useCache && method === 'GET' && (merged.cache ?? false)) {
          this.setCache(merged, unwrapped.data)
        }
        return unwrapped
      } catch (err) {
        const normalized = this.isRequestError(err) ? err : this.normalizeAdapterError(err, merged)
        const transformed = await this.applyResponseErrorInterceptors(normalized)
        // 用户主动取消（signal.abort）不重试——信号已中止说明调用方不希望继续
        const userCancelled = merged.signal?.aborted === true
        const status = transformed.status ?? 0
        const retryable = !userCancelled && (status === 0 || status >= 500)
        if (attempt < maxRetries && retryable) continue

        const meta = merged.meta
        const silentHttpError = meta?.['silentHttpError'] === true
        const silentStatusCodesRaw = meta?.['silentHttpErrorStatusCodes']
        const silentStatusCodes = Array.isArray(silentStatusCodesRaw)
          ? silentStatusCodesRaw.filter((code): code is number => typeof code === 'number')
          : []
        const silentByStatus = silentStatusCodes.includes(status)

        if (!userCancelled && !silentHttpError && !silentByStatus) {
          this.logger.error('HTTP 请求失败', {
            method,
            url: merged.url,
            status,
            code: transformed.code,
            message: transformed.message,
            attempt: attempt + 1,
            maxRetries,
            responsePreview: transformed.response !== undefined ? this.safePreview(transformed.response) : undefined,
          })
        }
        throw transformed
      }
    }

    throw new Error('unreachable')
  }

  // ==================== HTTP 快捷方法（单一来源） ====================

  async get<T = unknown>(url: string, params?: Record<string, unknown>, config?: Partial<RequestConfig>): Promise<T> {
    return this.request<T>({ ...config, url, method: 'GET', ...(params !== undefined ? { params } : {}) })
  }

  async post<T = unknown>(url: string, data?: unknown, config?: Partial<RequestConfig>): Promise<T> {
    return this.request<T>({ ...config, url, method: 'POST', data })
  }

  async put<T = unknown>(url: string, data?: unknown, config?: Partial<RequestConfig>): Promise<T> {
    return this.request<T>({ ...config, url, method: 'PUT', data })
  }

  async patch<T = unknown>(url: string, data?: unknown, config?: Partial<RequestConfig>): Promise<T> {
    return this.request<T>({ ...config, url, method: 'PATCH', data })
  }

  async delete<T = unknown>(url: string, params?: Record<string, unknown>, config?: Partial<RequestConfig>): Promise<T> {
    return this.request<T>({ ...config, url, method: 'DELETE', ...(params !== undefined ? { params } : {}) })
  }

  // ==================== 缓存管理（单一来源） ====================

  clearCache(url?: string): void {
    if (url !== undefined) {
      for (const key of this.cache.keys()) {
        // key format: "METHOD:url" or "METHOD:url?{params}"
        const urlStart = key.indexOf(':') + 1
        const paramsStart = key.indexOf('?', urlStart)
        const keyUrl = paramsStart < 0 ? key.slice(urlStart) : key.slice(urlStart, paramsStart)
        if (keyUrl === url) this.cache.delete(key)
      }
    } else {
      this.cache.clear()
    }
  }

  // ==================== 拦截器链（单一来源） ====================

  protected async applyRequestInterceptors(config: RequestConfig): Promise<RequestConfig> {
    let cfg = config
    for (const i of this.reqInterceptors) {
      if (i.onRequest !== undefined) {
        try {
          cfg = await i.onRequest(cfg)
        } catch (err) {
          const reqError = this.isRequestError(err) ? err
            : this.buildRequestError(err instanceof Error ? err.message : String(err), cfg)
          if (i.onRequestError !== undefined) {
            await i.onRequestError(reqError)
          }
          throw reqError
        }
      }
    }
    return cfg
  }

  protected async applyResponseInterceptors<T>(response: HttpResponse<T>): Promise<HttpResponse<T>> {
    let res = response
    for (const i of this.resInterceptors) {
      if (i.onResponse !== undefined) res = await i.onResponse(res)
    }
    return res
  }

  protected async applyResponseErrorInterceptors(error: RequestError): Promise<RequestError> {
    let current = error
    for (const i of this.resInterceptors) {
      if (i.onResponseError !== undefined) current = await i.onResponseError(current)
    }
    return current
  }

  // ==================== 配置合并 ====================

  protected mergeConfig(config: RequestConfig): RequestConfig {
    const result: RequestConfig = {
      ...this.defaults,
      ...config,
      headers: { ...this.defaults.headers, ...config.headers },
    }
    // 深合并 params，防止 config.params 完全覆盖 defaults.params
    if (this.defaults.params !== undefined && config.params !== undefined) {
      result.params = { ...this.defaults.params, ...config.params }
    }
    // 兼容历史 endpoint 写法：当 url 已包含 baseURL 前缀时，避免拼出 /api/api/*。
    const normalizedUrl = this.stripDuplicatedBasePrefix(result.baseURL, result.url)
    if (normalizedUrl !== null) {
      result.url = normalizedUrl
    }
    return result
  }

  private stripDuplicatedBasePrefix(baseURL: unknown, url: unknown): string | null {
    if (typeof baseURL !== 'string' || typeof url !== 'string') return null
    const trimmedBase = baseURL.trim()
    const trimmedUrl = url.trim()
    if (trimmedBase === '' || trimmedUrl === '') return null
    if (ABSOLUTE_URL_RE.test(trimmedUrl)) return null

    const normalizedBase = this.normalizePathPrefix(trimmedBase)
    const normalizedUrl = this.normalizePathPrefix(trimmedUrl)
    if (normalizedBase === null || normalizedUrl === null) return null

    if (normalizedUrl === normalizedBase) return '/'
    if (!normalizedUrl.startsWith(`${normalizedBase}/`)) return null

    const stripped = normalizedUrl.slice(normalizedBase.length)
    return stripped.length > 0 ? stripped : '/'
  }

  private normalizePathPrefix(value: string): string | null {
    if (value.startsWith('/') === false) return null
    return value.replace(/\/+$/, '') || '/'
  }

  // ==================== 错误工具（单一来源） ====================

  protected isRequestError(err: unknown): err is RequestError {
    return err instanceof Error && err.name === 'RequestError'
  }

  protected buildRequestError(
    message: string,
    config: RequestConfig,
    opts: { code?: string; status?: number; response?: unknown } = {}
  ): RequestError {
    const result: RequestError = Object.assign(new Error(message), {
      config,
      name: 'RequestError',
      status: opts.status ?? 0,
    })
    if (opts.code !== undefined) result.code = opts.code
    if (opts.response !== undefined) result.response = opts.response
    return result
  }

  protected extractApiEnvelopeErrorMessage(body: unknown): string | undefined {
    if (!this.isApiEnvelope(body)) return undefined
    const message = body.error?.message
    if (typeof message === 'string' && message.trim() !== '') {
      return message.trim()
    }
    const code = body.error?.code
    return typeof code === 'string' && code.trim() !== '' ? code.trim() : undefined
  }

  private unwrapApiEnvelopeResponse<T>(response: HttpResponse<T>, config: RequestConfig): HttpResponse<T> {
    if (config.meta?.['rawEnvelope'] === true || !this.isApiEnvelope(response.data)) {
      return response
    }
    const envelope = response.data
    if (envelope.ok === true) {
      return { ...response, data: envelope.data as T }
    }
    throw this.buildRequestError(
      this.extractApiEnvelopeErrorMessage(envelope) ?? 'API request failed',
      config,
      {
        status: response.status,
        response: envelope,
        ...(envelope.error?.code !== undefined ? { code: envelope.error.code } : {}),
      },
    )
  }

  private isApiEnvelope(value: unknown): value is ApiEnvelope {
    if (!isRecord(value)) return false
    const record = value
    return typeof record['ok'] === 'boolean'
      && Object.prototype.hasOwnProperty.call(record, 'data')
      && Object.prototype.hasOwnProperty.call(record, 'error')
      && typeof record['requestId'] === 'string'
  }

  private safePreview(value: unknown): string {
    try {
      const text = typeof value === 'string' ? value : JSON.stringify(value)
      return text.length > 1200 ? `${text.slice(0, 1200)}...(truncated)` : text
    } catch {
      return '[unserializable response]'
    }
  }

  // ==================== 缓存内部实现 ====================

  private getCache<T>(config: RequestConfig): T | null {
    const key = config.cacheKey ?? this.cacheKey(config)
    const item = this.cache.get(key)
    if (item === undefined) return null
    if (Date.now() - item.timestamp > item.expiry) { this.cache.delete(key); return null }
    // 命中时刷新顺序，实现 O(1) 近似 LRU（Map 按插入顺序迭代）
    this.cache.delete(key)
    this.cache.set(key, item)
    return item.data as T
  }

  private setCache(config: RequestConfig, data: unknown): void {
    const key = config.cacheKey ?? this.cacheKey(config)
    if (this.cache.has(key)) this.cache.delete(key)
    if (this.cache.size >= MAX_CACHE_SIZE) this.evictOldestEntries()
    this.cache.set(key, { data, timestamp: Date.now(), expiry: config.cacheExpiry ?? DEFAULT_CACHE_EXPIRY })
  }

  private evictOldestEntries(): void {
    const evictCount = Math.max(1, Math.floor(this.cache.size * 0.2))
    const keys = this.cache.keys()
    for (let i = 0; i < evictCount; i++) {
      const oldest = keys.next()
      if (oldest.done) break
      this.cache.delete(oldest.value)
    }
  }

  private cacheKey(c: RequestConfig): string {
    const base = `${c.method ?? 'GET'}:${c.url}`
    // 空对象视为「无参数」——与 undefined 相同，避免 get() 传 {} 产生 "GET:/url?{}" 与
    // 直接 request({ url }) 产生 "GET:/url" 不一致的缓存双轨问题
    if (c.params === undefined || Object.keys(c.params).length === 0) return base
    // 对键排序后序列化，保证参数顺序不同时缓存 key 仍相同
    const sorted = Object.fromEntries(Object.entries(c.params).sort(([a], [b]) => a.localeCompare(b)))
    return `${base}?${JSON.stringify(sorted)}`
  }

  // ==================== 延时工具（单一来源） ====================

  protected delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted === true) { reject(signal.reason ?? new DOMException('Aborted', 'AbortError')); return }
      const onAbort = (): void => {
        clearTimeout(timer)
        reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'))
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }, ms)
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }
}
