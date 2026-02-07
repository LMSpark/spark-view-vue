/**
 * 简单的环境检测（SPA 纯客户端）
 * 替代原 environment 模块中的复杂SSR兼容层
 */

/**
 * 简单的环境类型
 */
export type SimpleEnvironment = 'client' | 'server'

/**
 * 环境信息接口
 */
export interface EnvironmentInfo {
  /** 环境类型 */
  type: SimpleEnvironment
  /** 是否为服务端 */
  isServer: boolean
  /** 是否为客户端 */
  isClient: boolean
  /** 是否为测试环境 */
  isTest: boolean
}

/**
 * 简单环境适配器（仅客户端）
 * 用于替代原 envAdapter
 */
export const simpleEnvAdapter = {
  /**
   * 获取环境信息（总是返回客户端）
   */
  getEnvironment(): EnvironmentInfo {
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
} as const
