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
export { FileLoader, TransformedFileLoader, createFileLoader } from './FileLoader'
export { isRequestError } from './guards'
export type { LoadOptions, JsonLoadOptions, TextLoadOptions, TransformLoadOptions, TransformedFileLoadOptions } from './FileLoader'
export type {
	RequestConfig,
	Method,
	ApiResponse,
	ApiEnvelope,
	ApiEnvelopeError,
	FileLoadOptions,
	FileLoadResult,
	FileLoaderEventMap,
	CacheEntry,
	CacheExpirationTier,
	RequestError,
	RequestInterceptor,
	ResponseInterceptor,
	HttpResponse,
	HttpClientAdapter,
	HttpClientFactoryOptions,
	ApiEnvelopeContext,
	ApiEnvelopeEvent,
} from './types'
