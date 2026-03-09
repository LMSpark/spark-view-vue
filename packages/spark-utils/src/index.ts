/**
 * SPARK Utils - 纯基础设施工具库
 *
 * 提供日志、HTTP 客户端、能力系统等核心工具
 */

// ==================== 日志系统 ====================

export { Logger, setLoggerHook, addLogTransport, removeLogTransport, clearLogTransports, parseLogArgs } from './logger'

export type { LogLevel, LoggerApi, LoggerHook, LogTransport } from './logger'

// ==================== HTTP 模块 ====================

export * from './http/index.js'

// ==================== 能力系统 ====================

export * from './capability/index.js'

// ==================== 共享错误码 ====================

export { SharedErrorCodes, getSharedErrorMessage } from './error-codes'
export type { SharedErrorCode } from './error-codes'

// ==================== 错误工具 ====================

export { toErrorMessage, toError } from './error-utils'

export { SANDBOX_BLOCKED_KEYS, createSafeProxy } from './sandbox'
