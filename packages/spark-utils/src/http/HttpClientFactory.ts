import { Request } from './Request'
import type { HttpClientFactoryOptions } from './types'

export function createHttpClient(options: HttpClientFactoryOptions = {}): Request {
  return new Request(options)
}
