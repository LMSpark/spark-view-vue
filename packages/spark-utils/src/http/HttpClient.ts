/**
 * HTTP 客户端实现（基于 fetch）
 * 
 * 职责：
 * - 封装底层 fetch API
 * - 处理请求超时
 * - 统一响应格式处理
 * - 错误处理和日志记录
 * 
 * 注意：
 * - 不处理业务数据权限（_perm, _modelPerm），那是上层业务逻辑
 * - 仅处理 HTTP 层面的请求/响应
 * 
 * @packageDocumentation
 */

// ============================================================================
// 类型定义
// ============================================================================

/**
 * API 上下文配置（运行时环境信息）
 * 
 * 说明：
 * - 包含 baseURL、token、tenantId 等全局配置
 * - 由 HttpClient 和 ApiAdapter 使用
 * - 通常由应用层初始化并注入到数据层
 */
export interface IApiContext {
  /** API 基础地址（如 '/api' 或 'https://api.example.com'） */
  baseURL?: string
  /** 认证 Token（用于 Authorization header） */
  token?: string
  /** 租户 ID（多租户场景，用于 X-Tenant-Id header） */
  tenantId?: string
  /** 自定义请求头（会与 HttpEndpoint.headers 合并） */
  headers?: Record<string, string>
  /** 请求超时时间（毫秒，默认 10000） */
  timeout?: number
}

/**
 * 标准 API 响应格式
 */
interface StandardApiResponse<T = unknown> {
  code: number
  message?: string
  data?: T
}

// ============================================================================
// HTTP 客户端类
// ============================================================================

/**
 * HTTP 客户端实现类
 * 
 * 特性：
 * - 基于原生 fetch API
 * - 自动处理超时（AbortController）
 * - 支持标准 API 响应格式 { code, message, data }
 * - 统一错误处理
 * 
 * @example
 * ```typescript
 * const httpClient = createHttpClient({
 *   baseURL: '/api',
 *   token: 'Bearer xxx',
 *   timeout: 10000
 * })
 * 
 * const users = await httpClient.get<User[]>('/users')
 * const newUser = await httpClient.post<User>('/users', { name: 'John' })
 * ```
 */
export class HttpClient {
  private context: IApiContext

  constructor(context: IApiContext) {
    this.context = context
  }

  // --------------------------------------------------------------------------
  // 核心请求方法
  // --------------------------------------------------------------------------

  /**
   * 通用请求方法
   */
  async request<T = unknown>(config: {
    url: string
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    params?: Record<string, unknown>
    data?: unknown
    headers?: Record<string, string>
  }): Promise<T> {
    const { url, method, params, data, headers = {} } = config

    // 构建完整 URL
    const fullUrl = this.buildUrl(url, params)

    // 准备请求选项
    const options: RequestInit = {
      method,
      headers: this.buildHeaders(headers)
    }

    // GET/DELETE 请求不发送 body
    if (method !== 'GET' && method !== 'DELETE' && data !== undefined) {
      options.body = JSON.stringify(data)
    }

    // 执行请求（带超时控制）
    return this.executeRequest<T>(fullUrl, options)
  }

  // --------------------------------------------------------------------------
  // RESTful 快捷方法
  // --------------------------------------------------------------------------

  /**
   * GET 请求
   */
  async get<T = unknown>(url: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>({ url, method: 'GET', params })
  }

  /**
   * POST 请求
   */
  async post<T = unknown>(url: string, data?: unknown): Promise<T> {
    return this.request<T>({ url, method: 'POST', data })
  }

  /**
   * PUT 请求
   */
  async put<T = unknown>(url: string, data?: unknown): Promise<T> {
    return this.request<T>({ url, method: 'PUT', data })
  }

  /**
   * PATCH 请求
   */
  async patch<T = unknown>(url: string, data?: unknown): Promise<T> {
    return this.request<T>({ url, method: 'PATCH', data })
  }

  /**
   * DELETE 请求
   */
  async delete<T = unknown>(url: string, params?: Record<string, unknown>): Promise<T> {
    return this.request<T>({ url, method: 'DELETE', params })
  }

  // --------------------------------------------------------------------------
  // 私有辅助方法
  // --------------------------------------------------------------------------

  /**
   * 构建请求头
   */
  private buildHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.context.headers,
      ...customHeaders
    }

    // 添加认证信息
    if (this.context.token) {
      headers['Authorization'] = `Bearer ${this.context.token}`
    }

    // 添加租户 ID
    if (this.context.tenantId) {
      headers['X-Tenant-Id'] = this.context.tenantId
    }

    return headers
  }

  /**
   * 构建完整 URL（拼接查询参数）
   */
  private buildUrl(url: string, params?: Record<string, unknown>): string {
    const baseURL = this.context.baseURL ?? ''
    const fullPath = url.startsWith('/') ? url : `/${url}`
    let fullUrl = `${baseURL}${fullPath}`

    // 拼接查询参数
    if (params && Object.keys(params).length > 0) {
      const searchParams = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value))
        }
      })
      const queryString = searchParams.toString()
      if (queryString) {
        fullUrl += `${fullUrl.includes('?') ? '&' : '?'}${queryString}`
      }
    }

    return fullUrl
  }

  /**
   * 执行 HTTP 请求（带超时控制）
   */
  private async executeRequest<T>(url: string, options: RequestInit): Promise<T> {
    const controller = new AbortController()
    const timeout = this.context.timeout ?? 10000
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    options.signal = controller.signal

    try {
      const response = await fetch(url, options)
      clearTimeout(timeoutId)

      return await this.handleResponse<T>(response, url)
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout: ${url}`)
      }
      throw error
    }
  }

  /**
   * 处理 HTTP 响应
   */
  private async handleResponse<T>(response: Response, _url: string): Promise<T> {
    // 处理 HTTP 错误状态
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    // 解析 JSON 响应
    const result = await response.json() as StandardApiResponse<T> | T

    // 处理标准 API 响应格式 { code, message, data }
    if (this.isStandardResponse(result)) {
      if (result.code === 0 || result.code === 200) {
        return result.data as T
      }
      throw new Error(result.message ?? 'API request failed')
    }

    // 直接返回原始数据
    return result
  }

  /**
   * 检查是否是标准 API 响应格式
   */
  private isStandardResponse<T>(result: unknown): result is StandardApiResponse<T> {
    return (
      typeof result === 'object' &&
      result !== null &&
      'code' in result &&
      typeof (result as StandardApiResponse).code === 'number'
    )
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建 HTTP 客户端实例
 * 
 * @param context - API 上下文配置
 * @returns HTTP 客户端实例
 * 
 * @example
 * ```typescript
 * const client = createHttpClient({
 *   baseURL: '/api',
 *   token: 'Bearer xxx',
 *   timeout: 10000
 * })
 * 
 * const users = await client.get<User[]>('/users')
 * ```
 */
export function createHttpClient(context: IApiContext): HttpClient {
  return new HttpClient(context)
}
