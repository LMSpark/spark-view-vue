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
  IApiAdapter, 
  IApiClient, 
  IApiContext, 
  HttpEndpoint 
} from './types'

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
export class ApiAdapter implements IApiAdapter {
  constructor(
    private client: IApiClient,
    private context: IApiContext
  ) {}
  
  /**
   * 构建请求配置
   * 
   * @param endpoint - HTTP 端点配置
   * @param params - 请求参数（路径参数、查询参数或请求体数据）
   * @returns 完整的请求配置对象
   * 
   * 处理逻辑：
   * 1. 路径参数替换：/users/{id} → /users/123
   * 2. 拼接 baseURL：/users → http://api.example.com/users
   * 3. 合并请求头：注入 token、tenantId
   * 4. 处理查询参数（GET/DELETE）或请求体（POST/PUT/PATCH）
   * 
   * @example
   * ```typescript
   * // 示例 1: 路径参数替换
   * const config = adapter.buildRequest(
   *   { url: '/users/{id}', method: 'GET', pathParams: ['id'] },
   *   { id: 123, status: 'active' }
   * )
   * // 结果: { url: 'http://api.example.com/users/123?status=active', method: 'GET', ... }
   * 
   * // 示例 2: POST 请求体
   * const config = adapter.buildRequest(
   *   { url: '/users', method: 'POST' },
   *   { name: 'John', email: 'john@example.com' }
   * )
   * // 结果: { url: 'http://api.example.com/users', method: 'POST', data: { name: 'John', ... } }
   * ```
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
    // 1. 处理路径参数替换
    let url = endpoint.url
    const remainingParams: Record<string, unknown> = { ...params }
    
    if (endpoint.pathParams && params) {
      endpoint.pathParams.forEach(param => {
        if (params[param] !== undefined) {
          url = url.replace(`{${param}}`, String(params[param]))
          delete remainingParams[param] // 从参数中移除已使用的路径参数
        }
      })
    }
    
    // 2. 拼接 baseURL
    const fullUrl = this.context.baseURL + url
    
    // 3. 合并请求头
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
    
    // 4. 处理查询参数和请求体
    const method = (endpoint.method || 'GET') as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    let data: unknown = undefined
    let queryParams: Record<string, unknown> = { ...endpoint.queryParams }
    
    if (remainingParams && Object.keys(remainingParams).length > 0) {
      // GET/DELETE 使用查询参数
      if (method === 'GET' || method === 'DELETE') {
        queryParams = { ...queryParams, ...remainingParams }
      } else {
        // POST/PUT/PATCH 使用请求体
        data = remainingParams
      }
    }
    
    // 5. 拼接查询参数到 URL
    let finalUrl = fullUrl
    if (Object.keys(queryParams).length > 0) {
      const query = new URLSearchParams(
        Object.entries(queryParams)
          .filter(([, v]) => v !== undefined && v !== null)
          .map(([k, v]) => [k, String(v)])
      ).toString()
      finalUrl = `${fullUrl}?${query}`
    }
    
    return { url: finalUrl, method, data, headers }
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
