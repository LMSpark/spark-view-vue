/**
 * @module @spark-appworks/spark-utils:http/HttpClientFactory
 * @spark-appworks/spark-utils 的 http/HttpClientFactory 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
import { Request } from './Request'
import type { HttpClientFactoryOptions } from './types'

export function createHttpClient(options: HttpClientFactoryOptions = {}): Request {
  return new Request(options)
}
