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

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
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
 * 统一的 HTTP 请求配置接口
 * 
 * 整合了静态 API 定义和运行时请求配置的所有功能
 * - 静态配置：API 端点定义（url, method, headers, queryParams, pathParams, bodySchema）
 * - 运行时配置：请求执行选项（timeout, responseType, cache, retry 等）
 */
export interface HttpRequestConfig {
  // ===== 基础请求配置 =====
  /** 请求 URL */
  url: string

  /** 请求方法 */
  method?: RequestMethod

  /** 请求头 */
  headers?: Record<string, string>

  // ===== 参数配置 =====
  /** URL 查询参数 */
  params?: Record<string, unknown>

  /** 请求体数据 */
  data?: unknown

  /** 路径参数列表 */
  pathParams?: string[]

  // ===== 请求体结构定义 =====
  /** 请求体结构描述（用于文档或验证） */
  bodySchema?: unknown

  // ===== 运行时选项 =====
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

  // ===== 业务配置 =====
  /** API 基础地址 */
  baseURL?: string

  /** 认证 Token */
  token?: string

  /** 租户 ID */
  tenantId?: string
}

/**
 * 请求错误
 */
export interface RequestError extends Error {
  config: HttpRequestConfig
  code?: string
  status?: number
  response?: unknown
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
  headers: Record<string, string>

  /** 请求配置 */
  config: HttpRequestConfig

  /** 是否来自缓存 */
  fromCache?: boolean
}

/**
 * 请求拦截器
 */
export interface RequestInterceptor {
  /** 拦截器名称（用于调试） */
  name?: string
  
  /** 请求前处理 */
  onRequest?: (config: HttpRequestConfig) => HttpRequestConfig | Promise<HttpRequestConfig>
  
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
  onResponse?: <T>(response: AxiosResponse<T>) => AxiosResponse<T> | Promise<AxiosResponse<T>>
  
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
  private axiosInstance: AxiosInstance
  private cache = new Map<string, CacheItem>()
  private config: {
    baseURL?: string
    timeout?: number
    headers?: Record<string, string>
    token?: string
    tenantId?: string
  }

  constructor(config: {
    baseURL?: string
    timeout?: number
    headers?: Record<string, string>
    token?: string
    tenantId?: string
  } = {}) {
    this.config = config

    this.axiosInstance = axios.create({
      baseURL: config.baseURL ?? '',
      timeout: config.timeout ?? 10000,
      headers: config.headers ?? {}
    })

    // 设置默认响应类型为json
    this.axiosInstance.defaults.responseType = 'json'

    // 添加内置认证和租户拦截器
    this.setupBuiltInInterceptors()
  }

  /**
   * 设置内置拦截器（认证、租户等）
   */
  private setupBuiltInInterceptors(): void {
    this.axiosInstance.interceptors.request.use((config) => {
      // 添加认证头
      if (this.config.token) {
        config.headers = config.headers ?? {}
        config.headers['Authorization'] = this.config.token.startsWith('Bearer ')
          ? this.config.token
          : `Bearer ${this.config.token}`
      }

      // 添加租户头
      if (this.config.tenantId) {
        config.headers = config.headers ?? {}
        config.headers['X-Tenant-ID'] = this.config.tenantId
      }

      return config
    })
  }

  /**
   * 拦截器 API
   */
  interceptors = {
    request: {
      use: (interceptor: RequestInterceptor) => {
        if (interceptor.onRequest) {
          this.axiosInstance.interceptors.request.use(
            async (config) => {
              // 转换为我们的HttpRequestConfig格式进行处理
              const requestConfig: HttpRequestConfig = {
                url: config.url ?? '',
                method: (config.method as RequestMethod ?? 'GET'),
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- axios config.params 类型为 any
                params: config.params,
                data: config.data,
                headers: (config.headers ?? {}) as Record<string, string>,
                timeout: config.timeout,
                responseType: config.responseType as 'json' | 'text' | 'blob' | 'arraybuffer',
                cache: false, // axios配置中没有cache
                cacheKey: undefined,
                cacheExpiry: undefined,
                retry: undefined,
                retryDelay: undefined,
                skipRequestInterceptor: false,
                skipResponseInterceptor: false,
                meta: config as unknown as Record<string, unknown>
              }

              if (!interceptor.onRequest) return config
              const result = await interceptor.onRequest(requestConfig)

              // 应用修改回axios配置
              config.url = result.url
              config.method = (result.method ?? 'GET') as AxiosRequestConfig['method']
              config.params = result.params
              config.data = result.data
              config.timeout = result.timeout
              config.responseType = (result.responseType ?? 'json') as AxiosRequestConfig['responseType']
              if (result.headers) {
                config.headers = Object.assign({}, config.headers, result.headers)
              }

              return config
            },
            interceptor.onRequestError
          )
        }
        return () => {
          // axios拦截器不支持直接移除，这里简化处理
        }
      }
    },
    response: {
      use: (interceptor: ResponseInterceptor) => {
        if (interceptor.onResponse) {
          this.axiosInstance.interceptors.response.use(
            (response) => {
              if (!interceptor.onResponse) return response
              return interceptor.onResponse(response)
            },
            interceptor.onResponseError
          )
        }
        return () => {
          // axios拦截器不支持直接移除，这里简化处理
        }
      }
    }
  }
  
  /**
   * 发起请求（返回完整响应）
   */
  async requestFull<T = unknown>(config: HttpRequestConfig): Promise<AxiosResponse<T>> {
    // 检查缓存（仅 GET 请求）
    if (config.method === 'GET' && config.cache) {
      const cached = this.getCache<T>(config)
      if (cached) {
        logger.debug('使用缓存', { url: config.url })
        // 为缓存数据创建模拟的AxiosResponse
        return {
          data: cached,
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as AxiosRequestConfig
        } as AxiosResponse<T>
      }
    }

    const axiosConfig: AxiosRequestConfig = {
      url: config.url,
      method: config.method ?? 'GET',
      // 始终设置 timeout 和 responseType（从配置或实例默认值）
      timeout: config.timeout ?? this.axiosInstance.defaults.timeout ?? 10000,
      responseType: config.responseType ?? this.axiosInstance.defaults.responseType ?? 'json'
    }
    
    // 只有非 undefined 的属性才添加
    if (config.params !== undefined) axiosConfig.params = config.params
    if (config.data !== undefined) axiosConfig.data = config.data
    if (config.headers !== undefined && Object.keys(config.headers).length > 0) {
      axiosConfig.headers = config.headers
    }

    const response: AxiosResponse<T> = await this.axiosInstance.request(axiosConfig)

    // 缓存结果
    if (config.method === 'GET' && config.cache) {
      this.setCache(config, response.data)
    }

    return response
  }

  /**
   * 发起请求（返回数据）
   */
  async request<T = unknown>(config: HttpRequestConfig): Promise<T> {
    // 检查缓存（仅 GET 请求）
    if (config.method === 'GET' && config.cache) {
      const cached = this.getCache<T>(config)
      if (cached) {
        logger.debug('使用缓存', { url: config.url })
        return cached
      }
    }

    try {
      const axiosConfig: AxiosRequestConfig = {
        url: config.url,
        method: config.method ?? 'GET',
        // 始终设置 timeout 和 responseType（从配置或实例默认值）
        timeout: config.timeout ?? this.axiosInstance.defaults.timeout ?? 10000,
        responseType: config.responseType ?? this.axiosInstance.defaults.responseType ?? 'json'
      }
      
      // 只有非 undefined 的属性才添加到配置中
      if (config.params !== undefined) axiosConfig.params = config.params
      if (config.data !== undefined) axiosConfig.data = config.data
      if (config.headers !== undefined && Object.keys(config.headers).length > 0) {
        axiosConfig.headers = config.headers
      }

      const response: AxiosResponse<T> = await this.axiosInstance.request(axiosConfig)

      // 缓存结果
      if (config.method === 'GET' && config.cache) {
        this.setCache(config, response.data)
      }

      return response.data
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const requestError: RequestError = {
          name: 'RequestError',
          message: error.message,
          config: config,
          status: error.response?.status,
          response: error.response
        }
        throw requestError
      }
      throw error
    }
  }
  
  /**
   * GET 请求
   */
  async get<T = unknown>(url: string, params?: Record<string, unknown>, config?: Partial<HttpRequestConfig>): Promise<T> {
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
  async post<T = unknown>(url: string, data?: unknown, config?: Partial<HttpRequestConfig>): Promise<T> {
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
  async put<T = unknown>(url: string, data?: unknown, config?: Partial<HttpRequestConfig>): Promise<T> {
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
  async patch<T = unknown>(url: string, data?: unknown, config?: Partial<HttpRequestConfig>): Promise<T> {
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
  async delete<T = unknown>(url: string, params?: Record<string, unknown>, config?: Partial<HttpRequestConfig>): Promise<T> {
    return this.request<T>({
      ...config,
      url,
      method: 'DELETE',
      params
    })
  }

  /**
   * 执行端点请求（支持路径参数和端点配置）
   *
   * @param endpoint - HTTP 端点配置
   * @param params - 请求参数（包含路径参数和查询参数）
   * @param config - 额外的请求配置
   * @returns 响应数据
   *
   * @example
   * ```typescript
   * const endpoint = {
   *   url: '/users/{userId}',
   *   method: 'GET',
   *   pathParams: ['userId']
   * }
   *
   * const user = await request.executeEndpoint(endpoint, { userId: 123 })
   * ```
   */
  async executeEndpoint<T = unknown>(
    endpoint: {
      url: string
      method?: RequestMethod
      headers?: Record<string, string>
      params?: Record<string, unknown>
      pathParams?: string[]
      bodySchema?: unknown
    },
    params?: Record<string, unknown>,
    config?: Partial<HttpRequestConfig>
  ): Promise<T> {
    const actualParams = params ?? {}

    // 1. 处理路径参数替换
    let url = endpoint.url
    const remainingParams: Record<string, unknown> = { ...actualParams }

    if (endpoint.pathParams) {
      endpoint.pathParams.forEach(param => {
        if (actualParams[param] !== undefined) {
          url = url.replace(`{${param}}`, String(actualParams[param]))
          delete remainingParams[param] // 从剩余参数中移除路径参数
        }
      })
    }

    // 2. 构建完整配置
    const requestConfig: HttpRequestConfig = {
      ...config,
      url,
      method: endpoint.method ?? 'GET',
      params: { ...endpoint.params, ...remainingParams },
      pathParams: endpoint.pathParams,
      bodySchema: endpoint.bodySchema
    }
    
    // 合并 headers，只在有实际 header 值时才设置
    const mergedHeaders = { 
      ...(endpoint.headers ?? {}), 
      ...(config?.headers ?? {}) 
    }
    if (Object.keys(mergedHeaders).length > 0) {
      requestConfig.headers = mergedHeaders
    }

    // 3. 根据方法处理请求体
    const method = requestConfig.method?.toLowerCase()
    if ((method === 'post' || method === 'put' || method === 'patch') && Object.keys(remainingParams).length > 0) {
      requestConfig.data = remainingParams
    }

    return this.request<T>(requestConfig)
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

  /**
   * 获取缓存
   */
  private getCache<T>(config: HttpRequestConfig): T | null {
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
  private setCache(config: HttpRequestConfig, data: unknown): void {
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
  private buildCacheKey(config: HttpRequestConfig): string {
    const url = config.url + (config.params ? `?${JSON.stringify(config.params)}` : '')
    return `${config.method}:${url}`
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
  token?: string
  tenantId?: string
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
