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

export { HttpClientBase } from './HttpClientBase'
export { Request, createRequest } from './Request'
export { FetchClient, createFetchClient } from './FetchClient'
export { createHttpClient } from './HttpClientFactory'
export { FileLoader, createFileLoader } from './FileLoader'
export type { LoadOptions, DerivedLoader } from './FileLoader'
export type {
	RequestConfig,
	Method,
	ApiResponse,
	FileLoadOptions,
	FileLoadResult,
	FileLoaderEventMap,
	CacheEntry,
	CacheExpirationTier,
	RequestError,
	RequestInterceptor,
	ResponseInterceptor,
	HttpResponse,
	StreamResponse,
	SSEEvent,
	HttpClient,
	FetchHttpClient,
	HttpClientAdapter,
	HttpClientFactoryOptions,
} from './types'
