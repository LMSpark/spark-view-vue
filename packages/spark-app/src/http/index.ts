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

import type { 
  IApiClient, 
  IApiContext,
  IModelPermission
} from '@spark-view/spark-data'

// 导入权限类型用于内部使用
import type { IInstancePermission } from '@spark-view/spark-data'

/**
 * 标准 API 响应格式
 */
interface StandardApiResponse<T = unknown> {
  code: number
  message?: string
  data?: T
}

/**
 * 带权限的响应数据（使用约定字段名）
 */
interface PermissionAwareData {
  /** 模型级权限（表级） */
  _modelPerm?: IModelPermission
  /** 数据行（任意类型的数组，可能包含 _perm 字段） */
  rows?: Array<Record<string, unknown> & { _perm?: IInstancePermission }>
  [key: string]: unknown
}

/**
 * 类型守卫：检查是否包含权限数据
 */
function isPermissionAwareData(data: unknown): data is PermissionAwareData {
  if (typeof data !== 'object' || data === null) return false
  const obj = data as Record<string, unknown>
  return '_modelPerm' in obj || ('rows' in obj && Array.isArray(obj.rows))
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
  private isStandardResponse<T = unknown>(result: unknown): result is StandardApiResponse<T> {
    if (typeof result !== 'object' || result === null) return false
    const obj = result as Record<string, unknown>
    return 'code' in obj && typeof obj.code === 'number'
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
    if (this.isStandardResponse<T>(result)) {
      if (this.isSuccessCode(result.code)) {
        // 类型守卫已确保 result.data 的类型安全
        const data = result.data ?? ({} as T)
        this.logPermissionInfo(data)
        return data
      }
      throw new Error(result.message || `API 错误 (code: ${result.code})`)
    }
    // 直接返回数据（非标准格式）
    this.logPermissionInfo(result)
    return result as T // 这里的 as 是必要的，因为我们信任后端返回的数据类型
  }
  
  /**
   * 记录权限信息（用于调试和审计）
   * @private
   */
  private logPermissionInfo(data: unknown): void {
    if (!this.context.enablePermissionLog) return
    if (!isPermissionAwareData(data)) return
    
    // 记录模型级权限
    if (data._modelPerm) {
      console.info('[HttpClient] 模型级权限:', {
        user: this.context.user?.username,
        permissions: data._modelPerm
      })
    }
    
    // 记录实例级权限统计
    if (Array.isArray(data.rows) && data.rows.length > 0) {
      const permStats = {
        total: data.rows.length,
        editable: data.rows.filter(r => r._perm?.editableFields && r._perm.editableFields.length > 0).length,
        deletable: data.rows.filter(r => r._perm?.allowDelete).length,
        masked: data.rows.filter(r => r._perm?.maskedFields && r._perm.maskedFields.length > 0).length,
        hidden: data.rows.filter(r => r._perm?.hiddenFields && r._perm.hiddenFields.length > 0).length
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
