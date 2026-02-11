/**
 * 统一网络请求层
 * 
 * ## 设计目标
 * - 统一所有网络请求（业务 API、配置文件、静态资源）
 * - 支持拦截器（请求/响应）
 * - 支持重试、超时、缓存
 * - 适配器模式支持不同场景
 * 
 * @module Request
 */

import { Logger } from './logger'

const logger = Logger('Request')

/* -----------------------------------------------------------------------------
 * 类型定义
 * -------------------------------------------------------------------------- */

/**
 * 请求方法
 */
export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

/**
 * 请求配置
 */
export interface RequestConfig {
  /** 请求 URL */
  url: string
  
  /** 请求方法（默认 GET） */
  method?: RequestMethod
  
  /** 查询参数 */
  params?: Record<string, unknown>
  
  /** 请求体数据 */
  data?: unknown
  
  /** 请求头 */
  headers?: Record<string, string>
  
  /** 超时时间（毫秒） */
  timeout?: number
  
  /** 响应类型 */
  responseType?: 'json' | 'text' | 'blob' | 'arraybuffer'
  
  /** 是否启用缓存（仅 GET 请求） */
  cache?: boolean
  
  /** 缓存键（自定义） */
  cacheKey?: string
  
  /** 缓存过期时间（毫秒） */
  cacheExpiry?: number
  
  /** 重试次数（失败后自动重试） */
  retry?: number
  
  /** 重试延迟（毫秒） */
  retryDelay?: number
  
  /** 是否跳过请求拦截器 */
  skipRequestInterceptor?: boolean
  
  /** 是否跳过响应拦截器 */
  skipResponseInterceptor?: boolean
  
  /** 自定义元数据（传递给拦截器） */
  meta?: Record<string, unknown>
}

/**
 * 请求响应
 */
export interface RequestResponse<T = unknown> {
  /** 响应数据 */
  data: T
  
  /** HTTP 状态码 */
  status: number
  
  /** 状态文本 */
  statusText: string
  
  /** 响应头 */
  headers: Headers
  
  /** 请求配置 */
  config: RequestConfig
  
  /** 是否来自缓存 */
  fromCache?: boolean
}

/**
 * 请求错误
 */
export interface RequestError extends Error {
  config: RequestConfig
  code?: string
  status?: number
  response?: Response
}

/**
 * 请求拦截器
 */
export interface RequestInterceptor {
  /** 拦截器名称（用于调试） */
  name?: string
  
  /** 请求前处理 */
  onRequest?: (config: RequestConfig) => RequestConfig | Promise<RequestConfig>
  
  /** 请求失败处理 */
  onRequestError?: (error: RequestError) => void | Promise<void>
}

/**
 * 响应拦截器
 */
export interface ResponseInterceptor {
  /** 拦截器名称 */
  name?: string
  
  /** 响应成功处理 */
  onResponse?: <T>(response: RequestResponse<T>) => RequestResponse<T> | Promise<RequestResponse<T>>
  
  /** 响应失败处理 */
  onResponseError?: (error: RequestError) => RequestError | Promise<RequestError>
}

/**
 * 缓存项
 */
interface CacheItem {
  data: unknown
  timestamp: number
  expiry: number
}

/* -----------------------------------------------------------------------------
 * Request 类
 * -------------------------------------------------------------------------- */

/**
 * 统一请求类
 * 
 * @example
 * ```typescript
 * const request = createRequest({
 *   baseURL: '/api',
 *   timeout: 10000
 * })
 * 
 * // 添加请求拦截器
 * request.interceptors.request.use({
 *   onRequest: (config) => {
 *     config.headers.Authorization = `Bearer ${token}`
 *     return config
 *   }
 * })
 * 
 * // 发起请求
 * const data = await request.get<User[]>('/users')
 * ```
 */
export class Request {
  private baseURL: string
  private defaultConfig: Partial<RequestConfig>
  private requestInterceptors: RequestInterceptor[] = []
  private responseInterceptors: ResponseInterceptor[] = []
  private cache = new Map<string, CacheItem>()
  
  constructor(config: {
    baseURL?: string
    timeout?: number
    headers?: Record<string, string>
  } = {}) {
    this.baseURL = config.baseURL ?? ''
    this.defaultConfig = {
      timeout: config.timeout ?? 10000,
      headers: config.headers ?? {},
      responseType: 'json',
      retry: 0,
      retryDelay: 1000
    }
  }
  
  /**
   * 拦截器 API
   */
  interceptors = {
    request: {
      use: (interceptor: RequestInterceptor) => {
        this.requestInterceptors.push(interceptor)
        return () => {
          const index = this.requestInterceptors.indexOf(interceptor)
          if (index > -1) this.requestInterceptors.splice(index, 1)
        }
      }
    },
    response: {
      use: (interceptor: ResponseInterceptor) => {
        this.responseInterceptors.push(interceptor)
        return () => {
          const index = this.responseInterceptors.indexOf(interceptor)
          if (index > -1) this.responseInterceptors.splice(index, 1)
        }
      }
    }
  }
  
  /**
   * 发起请求
   */
  async request<T = unknown>(config: RequestConfig): Promise<T> {
    // 合并配置
    const mergedConfig: RequestConfig = {
      ...this.defaultConfig,
      ...config,
      headers: {
        ...this.defaultConfig.headers,
        ...config.headers
      }
    }
    
    // 检查缓存（仅 GET 请求）
    if (mergedConfig.method === 'GET' && mergedConfig.cache) {
      const cached = this.getCache<T>(mergedConfig)
      if (cached) {
        logger.debug('使用缓存', { url: mergedConfig.url })
        return cached
      }
    }
    
    // 执行请求（带重试）
    let lastError: RequestError | undefined
    const maxRetries = (mergedConfig.retry ?? 0) + 1
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = mergedConfig.retryDelay ?? 1000
          logger.info(`重试请求 (${attempt}/${mergedConfig.retry})`, { url: mergedConfig.url })
          await this.sleep(delay * attempt)
        }
        
        const response = await this.executeRequest<T>(mergedConfig)
        
        // 缓存结果
        if (mergedConfig.method === 'GET' && mergedConfig.cache) {
          this.setCache(mergedConfig, response.data)
        }
        
        return response.data
      } catch (error) {
        lastError = error as RequestError
        
        // 某些错误不应重试（如 4xx 客户端错误）
        if (lastError.status && lastError.status >= 400 && lastError.status < 500) {
          break
        }
      }
    }
    
    throw lastError
  }
  
  /**
   * GET 请求
   */
  async get<T = unknown>(url: string, params?: Record<string, unknown>, config?: Partial<RequestConfig>): Promise<T> {
    return this.request<T>({
      ...config,
      url,
      method: 'GET',
      params
    })
  }
  
  /**
   * POST 请求
   */
  async post<T = unknown>(url: string, data?: unknown, config?: Partial<RequestConfig>): Promise<T> {
    return this.request<T>({
      ...config,
      url,
      method: 'POST',
      data
    })
  }
  
  /**
   * PUT 请求
   */
  async put<T = unknown>(url: string, data?: unknown, config?: Partial<RequestConfig>): Promise<T> {
    return this.request<T>({
      ...config,
      url,
      method: 'PUT',
      data
    })
  }
  
  /**
   * PATCH 请求
   */
  async patch<T = unknown>(url: string, data?: unknown, config?: Partial<RequestConfig>): Promise<T> {
    return this.request<T>({
      ...config,
      url,
      method: 'PATCH',
      data
    })
  }
  
  /**
   * DELETE 请求
   */
  async delete<T = unknown>(url: string, params?: Record<string, unknown>, config?: Partial<RequestConfig>): Promise<T> {
    return this.request<T>({
      ...config,
      url,
      method: 'DELETE',
      params
    })
  }
  
  /**
   * 清除缓存
   */
  clearCache(url?: string): void {
    if (url) {
      const keys = Array.from(this.cache.keys()).filter(key => key.includes(url))
      keys.forEach(key => this.cache.delete(key))
      logger.debug('清除缓存', { url, count: keys.length })
    } else {
      this.cache.clear()
      logger.debug('清除所有缓存')
    }
  }
  
  /* ---------------------------------------------------------------------------
   * 私有方法
   * ------------------------------------------------------------------------ */
  
  /**
   * 执行请求
   */
  private async executeRequest<T>(config: RequestConfig): Promise<RequestResponse<T>> {
    // 执行请求拦截器
    let requestConfig = config
    if (!config.skipRequestInterceptor) {
      for (const interceptor of this.requestInterceptors) {
        try {
          if (interceptor.onRequest) {
            requestConfig = await interceptor.onRequest(requestConfig)
          }
        } catch (error) {
          logger.error('请求拦截器错误', { name: interceptor.name, error })
          if (interceptor.onRequestError) {
            await interceptor.onRequestError(error as RequestError)
          }
          throw error
        }
      }
    }
    
    // 构建完整 URL
    const fullUrl = this.buildUrl(requestConfig.url, requestConfig.params)
    
    // 准备请求选项
    const options: RequestInit = {
      method: requestConfig.method ?? 'GET',
      headers: requestConfig.headers
    }
    
    // 添加请求体
    if (requestConfig.data !== undefined && requestConfig.method !== 'GET' && requestConfig.method !== 'HEAD') {
      if (typeof requestConfig.data === 'string') {
        options.body = requestConfig.data
      } else {
        options.body = JSON.stringify(requestConfig.data)
        options.headers = {
          'Content-Type': 'application/json',
          ...options.headers
        }
      }
    }
    
    // 超时控制
    const controller = new AbortController()
    const timeout = requestConfig.timeout ?? 10000
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    options.signal = controller.signal
    
    try {
      logger.debug('发起请求', { url: fullUrl, method: options.method })
      
      const response = await fetch(fullUrl, options)
      clearTimeout(timeoutId)
      
      // 解析响应
      const responseData = await this.parseResponse<T>(response, requestConfig.responseType ?? 'json')
      
      const result: RequestResponse<T> = {
        data: responseData,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        config: requestConfig
      }
      
      // 执行响应拦截器
      let interceptedResult = result
      if (!config.skipResponseInterceptor) {
        for (const interceptor of this.responseInterceptors) {
          try {
            if (interceptor.onResponse) {
              interceptedResult = await interceptor.onResponse(interceptedResult)
            }
          } catch (error) {
            logger.error('响应拦截器错误', { name: interceptor.name, error })
            if (interceptor.onResponseError) {
              throw await interceptor.onResponseError(error as RequestError)
            }
            throw error
          }
        }
      }
      
      // 检查 HTTP 错误
      if (!response.ok) {
        const error: RequestError = new Error(`HTTP ${response.status}: ${response.statusText}`) as RequestError
        error.config = requestConfig
        error.status = response.status
        error.response = response
        
        // 执行响应错误拦截器
        if (!config.skipResponseInterceptor) {
          for (const interceptor of this.responseInterceptors) {
            if (interceptor.onResponseError) {
              await interceptor.onResponseError(error)
            }
          }
        }
        
        throw error
      }
      
      return interceptedResult
    } catch (error) {
      clearTimeout(timeoutId)
      
      const requestError = error as RequestError
      requestError.config = requestConfig
      
      if (error instanceof Error && error.name === 'AbortError') {
        requestError.code = 'TIMEOUT'
        requestError.message = `请求超时: ${fullUrl}`
      }
      
      logger.error('请求失败', { url: fullUrl, error: requestError.message })
      throw requestError
    }
  }
  
  /**
   * 构建完整 URL
   */
  private buildUrl(url: string, params?: Record<string, unknown>): string {
    // 如果是完整 URL，直接使用
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return this.appendParams(url, params)
    }
    
    // 拼接 baseURL
    const path = url.startsWith('/') ? url : `/${url}`
    const fullUrl = `${this.baseURL}${path}`
    
    return this.appendParams(fullUrl, params)
  }
  
  /**
   * 添加查询参数
   */
  private appendParams(url: string, params?: Record<string, unknown>): string {
    if (!params || Object.keys(params).length === 0) {
      return url
    }
    
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value))
      }
    })
    
    const queryString = searchParams.toString()
    if (!queryString) return url
    
    return url.includes('?') ? `${url}&${queryString}` : `${url}?${queryString}`
  }
  
  /**
   * 解析响应
   */
  private async parseResponse<T>(response: Response, responseType: string): Promise<T> {
    switch (responseType) {
      case 'json':
        return await response.json()
      case 'text':
        return await response.text() as T
      case 'blob':
        return await response.blob() as T
      case 'arraybuffer':
        return await response.arrayBuffer() as T
      default:
        return await response.json()
    }
  }
  
  /**
   * 获取缓存
   */
  private getCache<T>(config: RequestConfig): T | null {
    const key = config.cacheKey ?? this.buildCacheKey(config)
    const item = this.cache.get(key)
    
    if (!item) return null
    
    const now = Date.now()
    if (now - item.timestamp > item.expiry) {
      this.cache.delete(key)
      return null
    }
    
    return item.data as T
  }
  
  /**
   * 设置缓存
   */
  private setCache(config: RequestConfig, data: unknown): void {
    const key = config.cacheKey ?? this.buildCacheKey(config)
    const expiry = config.cacheExpiry ?? 300000 // 默认 5 分钟
    
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiry
    })
  }
  
  /**
   * 构建缓存键
   */
  private buildCacheKey(config: RequestConfig): string {
    const url = this.buildUrl(config.url, config.params)
    return `${config.method}:${url}`
  }
  
  /**
   * 延迟
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

/* -----------------------------------------------------------------------------
 * 工厂函数
 * -------------------------------------------------------------------------- */

/**
 * 创建请求实例
 */
export function createRequest(config?: {
  baseURL?: string
  timeout?: number
  headers?: Record<string, string>
}): Request {
  return new Request(config)
}

/**
 * 默认请求实例（全局单例）
 */
let defaultInstance: Request | undefined

export function getDefaultRequest(): Request {
  defaultInstance ??= createRequest()
  return defaultInstance
}

export function setDefaultRequest(instance: Request): void {
  defaultInstance = instance
}
