import { FetchClient } from './FetchClient'
import { Request } from './Request'
import type { HttpClient, HttpClientFactoryOptions, FetchHttpClient } from './types'

export function createHttpClient(options: HttpClientFactoryOptions & { adapter: 'fetch' }): FetchHttpClient
/**
 * 创建统一 HttpClient 实例。
 *
 * 默认使用 axios 适配器以保持既有行为不变；
 * 如需 fetch 实现，显式传入 `adapter: 'fetch'`。
 */
export function createHttpClient(options: HttpClientFactoryOptions = {}): HttpClient {
  const { adapter = 'axios', ...config } = options
  if (adapter === 'fetch') {
    return new FetchClient(config)
  }
  return new Request(config)
}
