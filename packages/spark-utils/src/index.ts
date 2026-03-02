/**
 * SPARK Utils - 纯基础设施工具库
 *
 * 提供日志、HTTP 客户端、能力系统等核心工具
 * 不包含业务模型（权限、数据类型已迁移至 @spark-view/spark-data）
 */

// ==================== 日志系统 ====================

export { Logger } from './logger'

export type { LogLevel, LoggerApi } from './logger'

// ==================== HTTP 模块 ====================

export * from './http/index.js'

// ==================== 能力系统 ====================

export * from './capability/index.js'

// ==================== 业务脚本 API 契约 ====================
// IPageRoute, IFormAPI, IDataSetLike, IDataSet(alias),
// IScriptDataRow, IScriptDataView, IScriptDataViewEventMap, IEventEmitterLike,
// IScriptContext, IPageServiceInScript
// 权威定义在 script-api.ts，capability/symbols.ts 以重导出形式保持向后兼容
export * from './script-api.js'

// ==================== 共享错误码 ====================

export { SharedErrorCodes, getSharedErrorMessage } from './error-codes'
export type { SharedErrorCode } from './error-codes'
