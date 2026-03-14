/**
 * Request — SPARK 统一请求封装
 *
 * 基于 axios 实现，对上层完全隐藏 axios 类型。
 *
 * 功能点：
 *   - 拦截器：请求前 / 响应后可拦截，支持异步操作
 *   - 重试：服务端错误（状态码 ≥500）自动按次迟延重试
 *   - 缓存：GET 请求可配置内存缓存（cacheExpiry 控制 TTL）
 *   - 类型安全：所有公共 API 接收 `RequestConfig`，返回 `HttpResponse`
 */

import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { Logger } from '../logger'
import type {
  RequestConfig, Method, HttpResponse,
  RequestError, RequestInterceptor, ResponseInterceptor
} from './types'

const logger = Logger('Http')

const DEFAULT_TIMEOUT = 10_000

/** 缓存条目：存储数据、写入时间戳和过期时长（ms） */
interface CacheItem { data: unknown; timestamp: number; expiry: number }

/** 缓存最大条目数——超出后淘汰最旧 20% 条目（LRU-like） */
const MAX_CACHE_SIZE = 500

/** 缓存默认过期时间（5分钟） */
const DEFAULT_CACHE_EXPIRY = 5 * 60 * 1000

export class Request {
  private ax: AxiosInstance
  private cache = new Map<string, CacheItem>()

  constructor(private defaults: Partial<RequestConfig> = {}) {
    this.ax = axios.create({
      baseURL: defaults.baseURL ?? '',
      timeout: defaults.timeout ?? DEFAULT_TIMEOUT,
      ...(defaults.headers && { headers: defaults.headers }),
    })
  }

  // ==================== 拦截器 ====================
  // 返回的反注册函数可用于移除拦截器（如 `const unuse = interceptors.request.use(...); unuse()`）

  interceptors = {
    request: {
      use: (interceptor: RequestInterceptor): (() => void) => {
        const id = this.ax.interceptors.request.use(
          async (axCfg) => {
            if (!interceptor.onRequest) return axCfg
            const cfg = this.fromAxios(axCfg)
            const result = await interceptor.onRequest(cfg)
            // 合并修改回 axios config（保留 axios 内部字段）
            axCfg.url = result.url
            axCfg.method = result.method?.toLowerCase() as Method
            if (result.params !== undefined) axCfg.params = result.params
            if (result.data !== undefined) axCfg.data = result.data
            if (result.timeout !== undefined) axCfg.timeout = result.timeout
            if (result.responseType) axCfg.responseType = result.responseType
            if (result.headers) {
              axCfg.headers = Object.assign({}, axCfg.headers, result.headers)
            }
            return axCfg
          },
          interceptor.onRequestError
        )
        return () => this.ax.interceptors.request.eject(id)
      }
    },
    response: {
      use: (interceptor: ResponseInterceptor): (() => void) => {
        const id = this.ax.interceptors.response.use(
          async (axRes) => {
            if (!interceptor.onResponse) return axRes
            const res = this.toHttpResponse(axRes)
            const result = await interceptor.onResponse(res)
            return { ...axRes, data: result.data as unknown, status: result.status, statusText: result.statusText }
          },
          async (error) => {
            if (!interceptor.onResponseError) throw error
            const reqErr = this.normalizeError(error)
            throw await interceptor.onResponseError(reqErr)
          }
        )
        return () => this.ax.interceptors.response.eject(id)
      }
    }
  }

  // ==================== 核心请求 ====================

  /**
   * 发起请求，返回响应体中的 data
   *
   * 执行顺序：缓存检查 → 重试循环 → axios 发送 → 写入缓存 → 返回 data
   * 仅 GET 请求 + `config.cache=true` 时启用缓存。
   */
  async request<T = unknown>(config: RequestConfig): Promise<T> {
    const merged: RequestConfig = { ...this.defaults, ...config }
    const method = merged.method ?? 'GET'

    // 缓存检查
    if (method === 'GET' && merged.cache) {
      const cached = this.getCache<T>(merged)
      if (cached !== null) return cached
    }

    const maxRetries = merged.retry ?? 0
    const retryDelay = merged.retryDelay ?? 1000

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          await this.delay(retryDelay * attempt, merged.signal)
          logger.warn(`重试 ${attempt}/${maxRetries}`, { url: merged.url })
        }
        const res: AxiosResponse<T> = await this.ax.request(this.toAxios(merged))

        if (method === 'GET' && merged.cache) {
          this.setCache(merged, res.data)
        }
        return res.data
      } catch (err) {
        const retryable = !axios.isAxiosError(err) || !err.response || err.response.status >= 500
        if (attempt < maxRetries && retryable) continue
        throw this.normalizeError(err, merged)
      }
    }

    throw new Error('unreachable')
  }

  /** 发起请求，返回包含 status / headers 的完整响应对象（支持 retry） */
  async requestFull<T = unknown>(config: RequestConfig): Promise<HttpResponse<T>> {
    const merged: RequestConfig = { ...this.defaults, ...config }
    const maxRetries = merged.retry ?? 0
    const retryDelay = merged.retryDelay ?? 1000

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          await this.delay(retryDelay * attempt, merged.signal)
          logger.warn(`重试 ${attempt}/${maxRetries}`, { url: merged.url })
        }
        const res: AxiosResponse<T> = await this.ax.request(this.toAxios(merged))
        return this.toHttpResponse(res)
      } catch (err) {
        const retryable = !axios.isAxiosError(err) || !err.response || err.response.status >= 500
        if (attempt < maxRetries && retryable) continue
        throw this.normalizeError(err, merged)
      }
    }

    throw new Error('unreachable')
  }

  // ==================== HTTP 快捷方法 ====================
  // 均为 request() 的语法糖，需配置重试/缓存时通过 config 参数传入

  async get<T = unknown>(url: string, params?: Record<string, unknown>, config?: Partial<RequestConfig>): Promise<T> {
    return this.request<T>({ ...config, url, method: 'GET', params: params ?? {} })
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
    return this.request<T>({ ...config, url, method: 'DELETE', params: params ?? {} })
  }

  // ==================== 缓存管理 ====================

  /** 清除缓存；传入 url 则只清包含该字符串的条目，不传则清全 */
  clearCache(url?: string): void {
    if (url) {
      for (const key of this.cache.keys()) {
        if (key.includes(url)) this.cache.delete(key)
      }
    } else {
      this.cache.clear()
    }
  }

  // ==================== 内部方法 ====================

  // ── 配置转换（RequestConfig ↔ AxiosRequestConfig）───────────────────────

  private toAxios(config: RequestConfig | Partial<RequestConfig>): AxiosRequestConfig {
    const c: AxiosRequestConfig = {
      url: config.url ?? '',
      method: config.method ?? 'GET',
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      responseType: config.responseType ?? 'json',
      baseURL: config.baseURL ?? '',
    }
    if (config.params !== undefined) c.params = config.params
    if (config.data !== undefined) c.data = config.data
    if (config.headers) c.headers = config.headers
    if (config.signal) c.signal = config.signal
    if (config.withCredentials) c.withCredentials = true
    return c
  }

  private fromAxios(c: AxiosRequestConfig): RequestConfig {
    // 提取 headers 为 Record<string, string>
    const headers: Record<string, string> = {}
    if (c.headers && typeof c.headers === 'object') {
      for (const [k, v] of Object.entries(c.headers)) {
        if (typeof v === 'string') headers[k] = v
      }
    }
    return {
      url: c.url ?? '',
      method: (c.method?.toUpperCase() ?? 'GET') as Method,
      headers,
      // axios 定义 params 为 any；用条件展开避免将 undefined 赋到 exactOptionalPropertyTypes 严格的可选属性
      ...(c.params !== null && c.params !== undefined && { params: c.params as Record<string, unknown> }),
      data: c.data as unknown,
      timeout: c.timeout ?? DEFAULT_TIMEOUT,
      responseType: c.responseType ?? 'json',
      baseURL: c.baseURL ?? '',
    }
  }

  private toHttpResponse<T>(res: AxiosResponse<T>): HttpResponse<T> {
    const headers: Record<string, string> = {}
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions -- axios headers 可能为任意结构
    if (res.headers && typeof res.headers === 'object') {
      for (const [k, v] of Object.entries(res.headers)) {
        if (typeof v === 'string') headers[k] = v
      }
    }
    return {
      data: res.data,
      status: res.status,
      statusText: res.statusText,
      headers,
    }
  }

  // ── 错误处理 ────────────────────────────────────────────

  /** 将 axios 错误或未知异常标准化为 `RequestError`，确保上层只需处理一种错误类型 */
  private normalizeError(err: unknown, fallback?: RequestConfig): RequestError {
    const base = err instanceof Error ? err : new Error(String(err))
    const error: RequestError = Object.assign(base, {
      config: fallback ?? { url: '' },
      name: 'RequestError'
    })

    if (axios.isAxiosError(err)) {
      error.config = err.config ? this.fromAxios(err.config) : (fallback ?? { url: '' })
      error.code = err.code ?? 'UNKNOWN'
      error.status = err.response?.status ?? 0
      error.response = err.response?.data
    }
    return error
  }

  // ── 缓存内部实现 ────────────────────────────────────────

  private getCache<T>(config: RequestConfig): T | null {
    const key = config.cacheKey ?? this.cacheKey(config)
    const item = this.cache.get(key)
    if (!item) return null
    if (Date.now() - item.timestamp > item.expiry) { this.cache.delete(key); return null }
    return item.data as T
  }

  private setCache(config: RequestConfig, data: unknown): void {
    const key = config.cacheKey ?? this.cacheKey(config)
    // 超出上限时淘汰最旧 20% 条目
    if (this.cache.size >= MAX_CACHE_SIZE) {
      this.evictOldestEntries()
    }
    this.cache.set(key, { data, timestamp: Date.now(), expiry: config.cacheExpiry ?? DEFAULT_CACHE_EXPIRY })
  }

  /** 淘汰最旧 20% 缓存条目 */
  private evictOldestEntries(): void {
    const evictCount = Math.max(1, Math.floor(this.cache.size * 0.2))
    const sortedEntries = [...this.cache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
    for (let i = 0; i < evictCount && i < sortedEntries.length; i++) {
      const entry = sortedEntries[i]
      if (entry) this.cache.delete(entry[0])
    }
  }

  private cacheKey(c: RequestConfig): string {
    return `${c.method}:${c.url}${c.params ? `?${  JSON.stringify(c.params)}` : ''}`
  }

  private delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(signal.reason ?? new DOMException('Aborted', 'AbortError')); return }
      const timer = setTimeout(resolve, ms)
      signal?.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
      }, { once: true })
    })
  }
}

// ==================== 工厂函数 ====================

/** 创建 `Request` 实例；支持传入默认配置（baseURL、timeout、headers 等） */
export function createRequest(config?: Partial<RequestConfig>): Request {
  return new Request(config)
}
