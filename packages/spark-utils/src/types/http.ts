/**
 * HTTP/API 相关类型定义
 */

/**
 * API 上下文配置（运行时环境信息）
 * 
 * 说明：
 * - 包含 baseURL、token、tenantId 等全局配置
 * - 由 HttpClient 和 ApiAdapter 使用
 * - 通常由应用层初始化并注入到数据层
 * 
 * @example
 * ```typescript
 * const apiContext: IApiContext = {
 *   baseURL: 'http://api.example.com',
 *   token: 'Bearer eyJhbGc...',
 *   tenantId: 'org-123',
 *   timeout: 10000
 * }
 * ```
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
