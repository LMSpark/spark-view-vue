/**
 * API 适配器实现
 * 
 * 职责：
 * - 将 HttpEndpoint 配置转换为实际的 HTTP 请求
 * - 自动注入 baseURL、token、tenantId
 * - 处理路径参数、查询参数
 * - 统一请求配置构建
 * 
 * @packageDocumentation
 */

import type { 
  HttpEndpoint
} from './types'
import type { IApiContext } from '@spark-view/spark-utils'
import { HttpClient } from '@spark-view/spark-utils'

/**
 * API 适配器实现类
 * 
 * @example
 * ```typescript
 * const httpClient = createHttpClient(apiContext)
 * const apiAdapter = new ApiAdapter(httpClient, {
 *   baseURL: '/api',
 *   token: 'Bearer xxx',
 *   tenantId: 'tenant-123'
 * })
 * 
 * // 执行请求
 * const users = await apiAdapter.execute<User[]>(
 *   { url: '/users', method: 'GET' },
 *   { status: 'active' }
 * )
 * ```
 */
export class ApiAdapter {
  constructor(
    private client: HttpClient,
    private context: IApiContext
  ) {}
  
  /**
   * 构建完整 URL（处理路径参数和查询参数）
   * @private
   */
  private buildFullUrl(
    endpoint: HttpEndpoint,
    params: Record<string, unknown>,
    remainingParams: Record<string, unknown>
  ): string {
    // 1. 路径参数替换
    let url = endpoint.url
    if (endpoint.pathParams) {
      endpoint.pathParams.forEach(param => {
        if (params[param] !== undefined) {
          url = url.replace(`{${param}}`, String(params[param]))
        }
      })
    }
    
    // 2. 拼接 baseURL
    const fullUrl = this.context.baseURL + url
    
    // 3. 拼接查询参数（GET/DELETE 方法）
    const method = endpoint.method || 'GET'
    if ((method === 'GET' || method === 'DELETE') && Object.keys(remainingParams).length > 0) {
      const query = new URLSearchParams(
        Object.entries({ ...endpoint.queryParams, ...remainingParams })
          .filter(([, v]) => v !== undefined && v !== null)
          .map(([k, v]) => [k, String(v)])
      ).toString()
      return `${fullUrl}?${query}`
    }
    
    return fullUrl
  }
  
  /**
   * 构建请求头（合并默认头、上下文头、端点头）
   * @private
   */
  private buildHeaders(endpoint: HttpEndpoint): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.context.headers,
      ...endpoint.headers
    }
    
    // 添加认证 Token
    if (this.context.token) {
      headers['Authorization'] = this.context.token.startsWith('Bearer ') 
        ? this.context.token 
        : `Bearer ${this.context.token}`
    }
    
    // 添加租户 ID
    if (this.context.tenantId) {
      headers['X-Tenant-Id'] = this.context.tenantId
    }
    
    return headers
  }
  
  /**
   * 构建请求配置
   */
  buildRequest(
    endpoint: HttpEndpoint,
    params?: Record<string, unknown>
  ): {
    url: string
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    data?: unknown
    headers?: Record<string, string>
  } {
    const actualParams = params || {}
    const method = (endpoint.method || 'GET') as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    
    // 移除路径参数后的剩余参数
    const remainingParams: Record<string, unknown> = { ...actualParams }
    endpoint.pathParams?.forEach(param => delete remainingParams[param])
    
    // 构建 URL
    const url = this.buildFullUrl(endpoint, actualParams, remainingParams)
    
    // 构建请求头
    const headers = this.buildHeaders(endpoint)
    
    // 请求体（仅 POST/PUT/PATCH 使用）
    const data = (method !== 'GET' && method !== 'DELETE' && Object.keys(remainingParams).length > 0)
      ? remainingParams
      : undefined
    
    return { url, method, data, headers }
  }
  
  /**
   * 执行 HTTP 请求
   * 
   * @param endpoint - HTTP 端点配置
   * @param params - 请求参数
   * @returns 响应数据
   * 
   * @throws {Error} 请求失败时抛出错误
   * 
   * @example
   * ```typescript
   * try {
   *   const users = await adapter.execute<User[]>(
   *     { url: '/users', method: 'GET' },
   *     { page: 1, pageSize: 20 }
   *   )
   *   console.log('成功加载用户:', users.length)
   * } catch (error) {
   *   console.error('请求失败:', error)
   * }
   * ```
   */
  async execute<T = unknown>(
    endpoint: HttpEndpoint,
    params?: Record<string, unknown>
  ): Promise<T> {
    const config = this.buildRequest(endpoint, params)
    
    try {
      return await this.client.request<T>(config)
    } catch (error) {
      console.error('[ApiAdapter] 请求失败', { 
        endpoint, 
        params, 
        config,
        error 
      })
      throw error
    }
  }
  
  /**
   * 更新 API 上下文（如 token 刷新）
   * 
   * @param updates - 要更新的上下文字段
   * 
   * @example
   * ```typescript
   * // 更新 token
   * adapter.updateContext({ token: 'new-token' })
   * 
   * // 更新多个字段
   * adapter.updateContext({ 
   *   token: 'new-token',
   *   tenantId: 'new-tenant-id' 
   * })
   * ```
   */
  updateContext(updates: Partial<IApiContext>): void {
    Object.assign(this.context, updates)
  }
  
  /**
   * 获取当前 API 上下文
   * 
   * @returns 当前的 API 上下文配置
   */
  getContext(): Readonly<IApiContext> {
    return { ...this.context }
  }
}
