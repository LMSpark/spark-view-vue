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
export interface SimpleEnvironmentInfo {
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
 * 简单环境适配器
 * 支持客户端、服务端和测试环境自动检测
 */
export const envAdapter = {
  /**
   * 获取环境信息（自动检测环境）
   */
  getEnvironment(): SimpleEnvironmentInfo {
    const isServer = typeof window === 'undefined'
    // 检测测试环境：Vitest (import.meta.env.VITEST) 或 MODE=test
    const isTest =
      (import.meta.env['VITEST'] as string | undefined) === 'true' ||
      import.meta.env.MODE === 'test'
    return {
      type: isServer ? 'server' : 'client',
      isServer,
      isClient: !isServer,
      isTest: !!isTest
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
