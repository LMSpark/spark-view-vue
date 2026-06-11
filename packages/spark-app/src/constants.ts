/**
 * 应用层符号常量表
 * L1 Application Layer Constants
 * 
 * 提供全局的 Symbol、枚举、错误码等常量定义
 */


/**
 * ============================================
 * 依赖注入 Symbol Keys（Injection Keys）
 * ============================================
 */

/**
 * SparkRegistry 注入键
 * 从 spark-component 导入（架构允许 spark-app 依赖 spark-component）
 */
export { SPARK_REGISTRY_KEY } from '@spark-appworks/spark-component'

/**
 * ============================================
 * 错误码定义
 * ============================================
 */

export const ErrorCodes = {
  // 网络相关 (3xxx)
  NETWORK_ERROR: 3001,
  NETWORK_TIMEOUT: 3002,
  NETWORK_OFFLINE: 3003,
  NETWORK_REQUEST_FAILED: 3004,

  // 配置相关 (4xxx)
  CONFIG_LOAD_FAILED: 4001,
  CONFIG_INVALID: 4002,
  CONFIG_NOT_FOUND: 4003,

  // 路由相关 (5xxx)
  ROUTE_NOT_FOUND: 5001,
  ROUTE_INVALID: 5002,

  // 系统相关 (9xxx)
  UNKNOWN_ERROR: 9999,

  // 认证相关 (1xxx)
  AUTH_REQUIRED: 1001,
  AUTH_TOKEN_EXPIRED: 1002,
  AUTH_TOKEN_INVALID: 1003,
  AUTH_LOGIN_FAILED: 1004,
  
  // 权限相关 (2xxx)
  PERMISSION_DENIED: 2001,
  PERMISSION_INSUFFICIENT: 2002,
  PERMISSION_NOT_FOUND: 2003,
  
  // 路由相关 (5xxx) — 扩展共享码
  ROUTE_REDIRECT_FAILED: 5003,
  
  // 数据相关 (6xxx)
  DATA_LOAD_FAILED: 6001,
  DATA_SAVE_FAILED: 6002,
  DATA_VALIDATION_FAILED: 6003,
} as const

/** Error Code 的语义模型。 */
export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes]

/**
 * ============================================
 * 环境常量
 * ============================================
 */

/**
 * 环境常量
 * @internal 待实际使用时移除 internal 标记
 */
export const Environments = {
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production',
  TEST: 'test'
} as const

/** Environment 的语义模型。 */
export type Environment = typeof Environments[keyof typeof Environments]

/**
 * ============================================
 * 默认配置值
 * ============================================
 */

/**
 * 默认配置值
 * @internal 待实际使用时移除 internal 标记
 */
export const DefaultConfig = {
  // 应用配置
  APP_NAME: 'SPARK AppWorks',
  APP_VERSION: '1.0.0',
  
  // 超时配置
  REQUEST_TIMEOUT: 10000,      // 10秒
  ROUTE_TIMEOUT: 3000,         // 3秒
  CONFIG_CACHE_EXPIRY: 300000, // 5分钟
  
  // 分页配置
  PAGE_SIZE: 20,
  PAGE_SIZES: [10, 20, 50, 100],
  
  // 日志配置
  LOG_LEVEL: 'info',
  LOG_MAX_ENTRIES: 1000,
} as const

/**
 * ============================================
 * 工具函数
 * ============================================
 */

/**
 * 获取错误消息
 */
export function getErrorMessage(code: ErrorCode): string {
  const messages: Record<number, string> = {
    [ErrorCodes.NETWORK_ERROR]: '网络错误',
    [ErrorCodes.NETWORK_TIMEOUT]: '请求超时',
    [ErrorCodes.NETWORK_OFFLINE]: '网络未连接',
    [ErrorCodes.NETWORK_REQUEST_FAILED]: '网络请求失败',
    [ErrorCodes.CONFIG_LOAD_FAILED]: '配置加载失败',
    [ErrorCodes.CONFIG_INVALID]: '配置无效',
    [ErrorCodes.CONFIG_NOT_FOUND]: '配置未找到',
    [ErrorCodes.ROUTE_NOT_FOUND]: '页面未找到',
    [ErrorCodes.ROUTE_INVALID]: '路由无效',
    [ErrorCodes.UNKNOWN_ERROR]: '未知错误',
    [ErrorCodes.AUTH_REQUIRED]: '需要登录',
    [ErrorCodes.AUTH_TOKEN_EXPIRED]: '登录已过期',
    [ErrorCodes.AUTH_TOKEN_INVALID]: '登录凭证无效',
    [ErrorCodes.AUTH_LOGIN_FAILED]: '登录失败',
    [ErrorCodes.PERMISSION_DENIED]: '没有权限',
    [ErrorCodes.PERMISSION_INSUFFICIENT]: '权限不足，需要更高权限',
    [ErrorCodes.PERMISSION_NOT_FOUND]: '权限未找到',
    [ErrorCodes.ROUTE_REDIRECT_FAILED]: '跳转失败',
    [ErrorCodes.DATA_LOAD_FAILED]: '数据加载失败',
    [ErrorCodes.DATA_SAVE_FAILED]: '数据保存失败',
    [ErrorCodes.DATA_VALIDATION_FAILED]: '数据验证失败',
  }
  return messages[code] ?? '未知错误'
}
