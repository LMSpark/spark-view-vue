/**
 * 共享错误码定义
 *
 * 提供跨包通用的错误码，消除 spark-app 与 spark-page-config 之间的重复定义。
 * 各包可导入这些常量而无需反向依赖。
 */

/** 共享错误码（跨包通用） */
export const SharedErrorCodes = {
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
  UNKNOWN_ERROR: 9999
} as const

export type SharedErrorCode = typeof SharedErrorCodes[keyof typeof SharedErrorCodes]

/** 获取共享错误码对应的默认消息 */
export function getSharedErrorMessage(code: number): string {
  const messages: Record<number, string> = {
    [SharedErrorCodes.NETWORK_ERROR]: '网络错误',
    [SharedErrorCodes.NETWORK_TIMEOUT]: '请求超时',
    [SharedErrorCodes.NETWORK_OFFLINE]: '网络未连接',
    [SharedErrorCodes.NETWORK_REQUEST_FAILED]: '网络请求失败',

    [SharedErrorCodes.CONFIG_LOAD_FAILED]: '配置加载失败',
    [SharedErrorCodes.CONFIG_INVALID]: '配置无效',
    [SharedErrorCodes.CONFIG_NOT_FOUND]: '配置未找到',

    [SharedErrorCodes.ROUTE_NOT_FOUND]: '页面未找到',
    [SharedErrorCodes.ROUTE_INVALID]: '路由无效',

    [SharedErrorCodes.UNKNOWN_ERROR]: '未知错误'
  }
  return messages[code] ?? '未知错误'
}
