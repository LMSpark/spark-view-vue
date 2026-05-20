import { FetchClient } from './FetchClient'
import { Request } from './Request'
import type { HttpClientFactoryOptions } from './types'

export function createHttpClient(options: HttpClientFactoryOptions & { adapter: 'fetch' }): FetchClient
export function createHttpClient(options?: HttpClientFactoryOptions & { adapter?: 'axios' }): Request
/**
 * 创建统一 HttpClient 实例。
 *
 * 默认使用 axios 适配器；
 * 如需 fetch 实现，显式传入 `adapter: 'fetch'`。
 */
export function createHttpClient(options: HttpClientFactoryOptions = {}): Request | FetchClient {
  const { adapter = 'axios', ...config } = options
  if (adapter === 'fetch') {
    return new FetchClient(config)
  }
  return new Request(config)
}
