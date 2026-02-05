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

// 基础数据类型和权限系统
export type {
  DataRow,
  ComponentDataRow,
  ComponentDataSource,  
  IInstancePermission,
  IModelPermission,
  WithInstancePermission,
  WithModelPermission,
  IPermissionChecker,
  IPermissionFilter
} from './data-types'

export {
  INSTANCE_PERMISSION_FIELD,
  MODEL_PERMISSION_FIELD,
  FieldVisibility,
  ComponentLevel
} from './data-types'

// 权限系统实现（实现类） 
export {
  PermissionChecker,
  createPermissionChecker,
  checkPermission,
  PermissionFilter,
  createPermissionFilter,
  filterByPermission,
  FieldRenderHelper,
  createFieldRenderHelper,
  computeFieldState,
  computeFieldStates,
  filterVisibleFields
} from './permission/index.js'

export type {
  IFieldRenderConfig,
  IFieldRenderState,
  IFieldRenderHelper
} from './permission/index.js'
