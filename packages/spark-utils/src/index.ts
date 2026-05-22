/**
 * SPARK Utils - 纯基础设施工具库
 *
 * 提供日志、HTTP 客户端、能力系统等核心工具
 */

// ==================== 日志系统 ====================

export { Logger, addLogTransport, removeLogTransport, clearLogTransports, parseLogArgs } from './logger'

export type { LogLevel, LoggerApi, LogTransport } from './logger'

// ==================== 能力系统核心 ====================

export {
  defineCapability,
  sparkProvide,
  sparkRemove,
  sparkConsume,
  createSparkCapabilityContext,
  consumeSparkCapability,
  createSparkCapabilityConsumer,
  getSparkCapabilityProvider,
} from './capability/index'

export type {
  CapabilityKey,
  CapabilityName,
  SparkCapabilityConsumer,
  CapabilityTypeMap,
  CapabilityContext,
} from './capability/index'

// ==================== HTTP 模块 ====================

export {
  createFetchClient,
  createFileLoader,
  createHttpClient,
  createRequest,
  FetchClient,
  FileLoader,
  HttpClientBase,
  isRequestError,
  Request,
  TransformedFileLoader,
} from './http/index.js'

export type {
  ApiResponse,
  CacheEntry,
  CacheExpirationTier,
  FileLoaderEventMap,
  FileLoadOptions,
  FileLoadResult,
  HttpClientAdapter,
  HttpClientFactoryOptions,
  HttpResponse,
  JsonLoadOptions,
  LoadOptions,
  Method,
  RequestConfig,
  RequestError,
  RequestInterceptor,
  ResponseInterceptor,
  SSEEvent,
  StreamResponse,
  TextLoadOptions,
  TransformLoadOptions,
  TransformedFileLoadOptions,
} from './http/index.js'

// ==================== 错误工具 ====================

export { toErrorMessage, toError } from './error-utils'

export { SANDBOX_BLOCKED_KEYS, createSafeProxy } from './sandbox'

// ==================== 克隆工具 ====================

export { deepClone } from './clone'


// ==================== 快照历史 ====================

export { SnapshotHistory } from './snapshot-history'

// ==================== 能力树遍历辅助（公开基础设施） ====================

export {
  sparkFindNearestProvider,
  sparkFindNearestProviderByKeys,
  sparkConsumeFromProvider,
} from './capability/helpers.js'

