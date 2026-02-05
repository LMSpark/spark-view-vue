// Logger utilities
export {
  Logger,
  createConsoleTransport,
  createHttpTransport,
  createMemoryTransport,
} from './logger'

// Types from common
export type { LogLevel, LoggerApi, AnyFunction, Transport } from './types/common'

// Error handling utilities (内部使用)
// 注意：ErrorHandler 仅在 spark-utils 内部使用（asyncUtils.ts）
export {
  AppError,
  ErrorType,
  type RetryOptions,
  type ErrorContext,
} from './errorHandler'

// Environment utilities
export {
  getWindow,
  getDocument,
  isBrowser,
  isServer,
  getWindowProperty,
  getDocumentProperty,
} from './env'

// Event Emitter
export {
  EventEmitter,
} from './eventEmitter'
export type { EventMap } from './eventEmitter'

// HTTP Client
export {
  HttpClient,
  createHttpClient,
} from './http/HttpClient'
export type { IApiContext } from './types/http'

// 能力系统 (Capability System)
export { Capability } from './capability/index.js'
export * from './capability/index.js'
