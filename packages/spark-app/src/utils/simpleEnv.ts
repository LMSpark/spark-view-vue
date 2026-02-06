/**
 * 简单的环境检测（SPA 纯客户端）
 * 替代原 environment 模块中的复杂SSR兼容层
 */

// 简单的环境类型
export type SimpleEnvironment = 'client' | 'server'

/**
 *  简单环境适配器（仅客户端）
 * 用于替代原 envAdapter
 */
export const simpleEnvAdapter = {
  /**
   * 获取环境信息（总是返回客户端）
   */
  getEnvironment(): { type: SimpleEnvironment; isServer: boolean; isClient: boolean; isTest: boolean } {
    return {
      type: 'client',
      isServer: false,
      isClient: true,
      isTest: false  // SPA应用不是测试环境
    }
  },
  
  /**
   * localStorage（浏览器环境）
   */
  get localStorage(): Storage | undefined {
    return typeof window !== 'undefined' ? window.localStorage : undefined
  },
  
  /**
   * sessionStorage（浏览器环境）
   */
  get sessionStorage(): Storage | undefined {
    return typeof window !== 'undefined' ? window.sessionStorage : undefined
  }
}

/**
 * 在客户端执行回调
 */
export function onClient<T>(callback: () => T): T | null {
  return typeof window !== 'undefined' ? callback() : null
}

/**
 * 检测是否为客户端环境
 */
export function isClient(): boolean {
  return typeof window !== 'undefined'
}
