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
} from './capability'

export type {
  CapabilityKey,
  CapabilityName,
  SparkCapabilityConsumer,
  ICapabilityContext,
} from './capability'

// ==================== HTTP 模块 ====================

export * from './http/index.js'

// ==================== 共享错误码 ====================

export { SharedErrorCodes, getSharedErrorMessage } from './error-codes'
export type { SharedErrorCode } from './error-codes'

// ==================== 错误工具 ====================

export { toErrorMessage, toError } from './error-utils'

export { SANDBOX_BLOCKED_KEYS, createSafeProxy } from './sandbox'

// ==================== 克隆工具 ====================

export { deepClone } from './clone'

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
  NavPermissionMode,
  AppModuleBase,
  AppNavigation,
  NavNode,
  AppNavRoot,
  RegionItems,
  RegionVisibility,
  NavContextState,
} from './nav-types'

// ==================== 快照历史 ====================

export { SnapshotHistory } from './snapshot-history'

// ==================== 能力上下文运行时锚点 ====================

export {
  bindCapabilityContextOwner,
  unbindCapabilityContextOwner,
  resolveCapabilityContextOwner,
  bindPageRootCapabilityContext,
  unbindPageRootCapabilityContext,
  resolvePageRootCapabilityContext,
  resolveParentCapabilityContext,
} from './capability-context'

export type { SparkRuntimeOwner } from './capability-context'
