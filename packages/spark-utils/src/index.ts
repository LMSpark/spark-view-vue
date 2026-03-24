/**
 * SPARK Utils - 纯基础设施工具库
 *
 * 提供日志、HTTP 客户端、能力系统等核心工具
 */

// ==================== 日志系统 ====================

export { Logger, addLogTransport, removeLogTransport, clearLogTransports, parseLogArgs } from './logger'

export type { LogLevel, LoggerApi, LogTransport } from './logger'

// ==================== HTTP 模块 ====================

export * from './http/index.js'

// ==================== 能力系统 ====================

export * from './capability.js'
export { sparkProvide, sparkConsume } from './capability.js'

// ==================== 共享错误码 ====================

export { SharedErrorCodes, getSharedErrorMessage } from './error-codes'
export type { SharedErrorCode } from './error-codes'

// ==================== 错误工具 ====================

export { toErrorMessage, toError } from './error-utils'

export { SANDBOX_BLOCKED_KEYS, createSafeProxy } from './sandbox'

// ==================== SSE 事件总线 ====================
export {
  ServerEventType,
  onServerEvent,
  onPageConfigChange,
  onDebugScreenshotRequest,
  onDebugScreenshotResult,
  onDebugRouteRequest,
  onDebugRouteResult,
  configureSseUrl,
} from './sse-events'
export type {
  ServerEventTypeName,
  FileChangeEvent,
  DebugScreenshotRequestEvent,
  DebugScreenshotResultEvent,
  DebugRouteRequestEvent,
  DebugRouteResultEvent,
} from './sse-events'

// ==================== 导航模型类型 ====================

export type {
  ChildPlacement,
  LinkTarget,
  NavNodeKind,
  NavContextItem,
  NavContextConfig,
  NavContextInput,
  AppModuleBase,
  AppNavigation,
  NavNode,
  AppNavRoot,
  RegionItems,
  RegionVisibility,
  NavContextState,
} from './nav-types'
