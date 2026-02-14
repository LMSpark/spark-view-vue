/**
 * 统一请求类
 *
 * 基于 axios，提供拦截器、缓存、重试，不泄露 axios 类型
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { Logger } from '../logger'
import type {
  RequestConfig, Method, HttpResponse,
  RequestError, RequestInterceptor, ResponseInterceptor
} from './types'

const logger = Logger('Http')

interface CacheItem { data: unknown; timestamp: number; expiry: number }

export class Request {
  private ax: AxiosInstance
  private cache = new Map<string, CacheItem>()

  constructor(private defaults: Partial<RequestConfig> = {}) {
    this.ax = axios.create({
      baseURL: defaults.baseURL ?? '',
      timeout: defaults.timeout ?? 10000,
      headers: defaults.headers,
    })
  }

  // ==================== 拦截器 ====================

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

  // ==================== 请求方法 ====================

  /** 发起请求（返回数据） */
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
          await this.delay(retryDelay * attempt)
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

  /** 发起请求（返回完整响应） */
  async requestFull<T = unknown>(config: RequestConfig): Promise<HttpResponse<T>> {
    const merged: RequestConfig = { ...this.defaults, ...config }
    try {
      const res: AxiosResponse<T> = await this.ax.request(this.toAxios(merged))
      return this.toHttpResponse(res)
    } catch (err) {
      throw this.normalizeError(err, merged)
    }
  }

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

  /** 清除缓存 */
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

  private toAxios(config: RequestConfig | Partial<RequestConfig>): AxiosRequestConfig {
    const c: AxiosRequestConfig = {
      url: config.url ?? '',
      method: config.method ?? 'GET',
      timeout: config.timeout ?? 10000,
      responseType: config.responseType ?? 'json',
      baseURL: config.baseURL ?? '',
    }
    if (config.params !== undefined) c.params = config.params
    if (config.data !== undefined) c.data = config.data
    if (config.headers) c.headers = config.headers
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- axios params 为 any
      params: c.params,
      data: c.data as unknown,
      timeout: c.timeout ?? 10000,
      responseType: c.responseType ?? 'json',
      baseURL: c.baseURL ?? '',
    }
  }

  private toHttpResponse<T>(res: AxiosResponse<T>): HttpResponse<T> {
    const headers: Record<string, string> = {}
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

  private getCache<T>(config: RequestConfig): T | null {
    const key = config.cacheKey ?? this.cacheKey(config)
    const item = this.cache.get(key)
    if (!item) return null
    if (Date.now() - item.timestamp > item.expiry) { this.cache.delete(key); return null }
    return item.data as T
  }

  private setCache(config: RequestConfig, data: unknown): void {
    const key = config.cacheKey ?? this.cacheKey(config)
    this.cache.set(key, { data, timestamp: Date.now(), expiry: config.cacheExpiry ?? 300000 })
  }

  private cacheKey(c: RequestConfig): string {
    return `${c.method}:${c.url}${c.params ? '?' + JSON.stringify(c.params) : ''}`
  }

  private delay(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms))
  }
}

// ==================== 工厂 ====================

export function createRequest(config?: Partial<RequestConfig>): Request {
  return new Request(config)
}

let defaultInstance: Request | undefined

export function getDefaultRequest(): Request {
  defaultInstance ??= createRequest()
  return defaultInstance
}

export function setDefaultRequest(instance: Request): void {
  defaultInstance = instance
}
