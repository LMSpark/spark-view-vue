/**
 * HTTP 模块 — 请求 + 文件加载
 *
 * @example
 * ```ts
 * import { createRequest, createFileLoader } from '@spark-view/spark-utils'
 * const http = createRequest({ baseURL: '/api', timeout: 5000 })
 * const data = await http.get<User[]>('/users')
 * ```
 */

export { Request, createRequest } from './Request'
export { FileLoader, createFileLoader } from './FileLoader'
export type { LoadOptions, DerivedLoader } from './FileLoader'
export type { RequestConfig, ApiResponse, FileLoadOptions, FileLoadResult, CacheEntry } from './types'
