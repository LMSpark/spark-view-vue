/**
 * HTTP 模块 - 统一网络请求层
 *
 * 包含：请求类、拦截器、文件加载器、全部类型
 *
 * @example
 * ```ts
 * import { createRequest, createAuthInterceptor, createFileLoader } from '@spark-view/spark-utils'
 *
 * const http = createRequest({ baseURL: '/api', timeout: 5000 })
 * const removeAuth = http.interceptors.request.use(
 *   createAuthInterceptor(() => localStorage.getItem('token'))
 * )
 *
 * const data = await http.get<User[]>('/users')
 * ```
 */

// Core
export { Request, createRequest, getDefaultRequest, setDefaultRequest } from './Request'

// Interceptors
export {
  createAuthInterceptor,
  createTenantInterceptor,
  createHeadersInterceptor,
  createTimestampInterceptor,
  createRequestLogInterceptor,
  createResponseLogInterceptor,
  createStandardApiInterceptor,
  createErrorTransformInterceptor,
  createRedirectInterceptor
} from './interceptors'

// FileLoader
export { FileLoader, createFileLoader } from './FileLoader'

// Types
export type {
  Method,
  RequestConfig,
  HttpResponse,
  ApiResponse,
  RequestError,
  RequestInterceptor,
  ResponseInterceptor,
  FileLoadOptions,
  FileCache,
  FileLoadResult
} from './types'
