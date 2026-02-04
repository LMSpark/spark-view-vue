/**
 * HTTP 客户端实现（基于 fetch）
 * 
 * 职责：
 * - 封装底层 fetch API
 * - 处理请求超时
 * - 统一响应格式处理
 * - 错误处理和日志记录
 * 
 * @packageDocumentation
 */

import type { IApiClient, IApiContext } from '@spark-view/spark-data'

/**
 * 标准 API 响应格式
 */
interface StandardApiResponse<T = unknown> {
  code: number
  message?: string
  data?: T
}

/**
 * 带权限的响应数据
 */
interface PermissionAwareData {
  /** 模型级权限（表级） */
  _modelPerm?: {
    canAdd?: boolean
    allowCreate?: boolean
    allowImport?: boolean
    allowExport?: boolean
  }
  /** 数据行 */
  rows?: Array<{
    [key: string]: unknown
    /** 实例级权限（行级） */
    _perm?: {
      canEdit?: boolean
      canDelete?: boolean
      allowDelete?: boolean
      editableFields?: string[]
      hiddenFields?: string[]
      maskedFields?: string[]
    }
  }>
  [key: string]: unknown
}

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
export class HttpClient implements IApiClient {
  private context: IApiContext
  
  constructor(context: IApiContext) {
    this.context = context
  }
  
  /**
   * 判断是否为标准 API 响应格式
   * @private
   */
  private isStandardResponse(result: unknown): result is StandardApiResponse {
    return (
      typeof result === 'object' &&
      result !== null &&
      'code' in result &&
      typeof (result as StandardApiResponse).code === 'number'
    )
  }
  
  /**
   * 判断响应码是否为成功状态
   * @private
   */
  private isSuccessCode(code: number): boolean {
    return code === 200 || code === 0
  }
  
  /**
   * 处理响应数据（支持标准格式和直接返回）
   * @private
   */
  private handleResponse<T>(result: unknown): T {
    if (this.isStandardResponse(result)) {
      if (this.isSuccessCode(result.code)) {
        const data = result.data as T
        this.logPermissionInfo(data)
        return data
      }
      throw new Error(result.message || `API 错误 (code: ${result.code})`)
    }
    this.logPermissionInfo(result)
    return result as T
  }
  
  /**
   * 记录权限信息（用于调试和审计）
   * @private
   */
  private logPermissionInfo(data: unknown): void {
    if (!this.context.enablePermissionLog) return
    
    const permData = data as PermissionAwareData
    
    // 记录模型级权限
    if (permData?._modelPerm) {
      console.info('[HttpClient] 模型级权限:', {
        user: this.context.user?.username,
        permissions: permData._modelPerm
      })
    }
    
    // 记录实例级权限统计
    if (Array.isArray(permData?.rows) && permData.rows.length > 0) {
      const permStats = {
        total: permData.rows.length,
        editable: permData.rows.filter(r => r._perm?.canEdit || r._perm?.editableFields?.length).length,
        deletable: permData.rows.filter(r => r._perm?.canDelete || r._perm?.allowDelete).length,
        masked: permData.rows.filter(r => r._perm?.maskedFields?.length).length,
        hidden: permData.rows.filter(r => r._perm?.hiddenFields?.length).length
      }
      
      console.info('[HttpClient] 实例级权限统计:', {
        user: this.context.user?.username,
        stats: permStats
      })
    }
  }
  
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
    const { url, method, data, headers } = config
    const timeout = this.context.timeout || 10000
    
    // 创建超时控制器
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: data ? JSON.stringify(data) : undefined,
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${response.statusText}${errorText ? ` - ${errorText}` : ''}`)
      }
      
      const result = await response.json()
      return this.handleResponse<T>(result)
      
    } catch (error) {
      clearTimeout(timeoutId)
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`请求超时（${timeout}ms）`)
      }
      
      throw error
    }
  }
  
  /**
   * GET 请求（查询参数会自动拼接到 URL）
   * 
   * @param url - 请求 URL
   * @param params - 查询参数
   * @returns 响应数据
   * 
   * @example
   * ```typescript
   * const users = await client.get<User[]>('/users', { 
   *   status: 'active', 
   *   page: 1 
   * })
   * ```
   */
  async get<T = unknown>(url: string, params?: Record<string, unknown>): Promise<T> {
    let fullUrl = url
    
    if (params && Object.keys(params).length > 0) {
      const query = new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== null)
          .map(([k, v]) => [k, String(v)])
      ).toString()
      fullUrl = `${url}?${query}`
    }
    
    return this.request<T>({ url: fullUrl, method: 'GET' })
  }
  
  /**
   * POST 请求（数据作为请求体发送）
   * 
   * @param url - 请求 URL
   * @param data - 请求体数据
   * @returns 响应数据
   * 
   * @example
   * ```typescript
   * const newUser = await client.post<User>('/users', {
   *   name: 'John Doe',
   *   email: 'john@example.com'
   * })
   * ```
   */
  async post<T = unknown>(url: string, data?: unknown): Promise<T> {
    return this.request<T>({ url, method: 'POST', data })
  }
  
  /**
   * PUT 请求（完整更新）
   * 
   * @param url - 请求 URL
   * @param data - 请求体数据
   * @returns 响应数据
   * 
   * @example
   * ```typescript
   * const updatedUser = await client.put<User>('/users/123', {
   *   id: 123,
   *   name: 'Jane Doe',
   *   email: 'jane@example.com'
   * })
   * ```
   */
  async put<T = unknown>(url: string, data?: unknown): Promise<T> {
    return this.request<T>({ url, method: 'PUT', data })
  }
  
  /**
   * PATCH 请求（部分更新）
   * 
   * @param url - 请求 URL
   * @param data - 请求体数据（部分字段）
   * @returns 响应数据
   * 
   * @example
   * ```typescript
   * const updatedUser = await client.patch<User>('/users/123', {
   *   name: 'New Name'
   * })
   * ```
   */
  async patch<T = unknown>(url: string, data?: unknown): Promise<T> {
    return this.request<T>({ url, method: 'PATCH', data })
  }
  
  /**
   * DELETE 请求（查询参数会自动拼接到 URL）
   * 
   * @param url - 请求 URL
   * @param params - 查询参数（可选）
   * @returns 响应数据
   * 
   * @example
   * ```typescript
   * await client.delete('/users/123')
   * 
   * // 带查询参数
   * await client.delete('/users', { ids: [1, 2, 3] })
   * ```
   */
  async delete<T = unknown>(url: string, params?: Record<string, unknown>): Promise<T> {
    let fullUrl = url
    
    if (params && Object.keys(params).length > 0) {
      const query = new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== null)
          .map(([k, v]) => [k, String(v)])
      ).toString()
      fullUrl = `${url}?${query}`
    }
    
    return this.request<T>({ url: fullUrl, method: 'DELETE' })
  }
}

/**
 * 创建 HTTP 客户端
 * 
 * @param context - API 上下文配置
 * @returns HTTP 客户端实例
 * 
 * @example
 * ```typescript
 * const httpClient = createHttpClient({
 *   baseURL: import.meta.env.VITE_API_BASE_URL,
 *   token: userStore.token,
 *   tenantId: userStore.tenantId,
 *   timeout: 10000
 * })
 * ```
 */
export function createHttpClient(context: IApiContext): IApiClient {
  return new HttpClient(context)
}
