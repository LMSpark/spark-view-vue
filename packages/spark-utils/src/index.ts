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

// ==================== 智能加载器 ====================

export { useSyncfusionLoader, useLazyLoader, preloader } from './lazy-loader'
