/**
 * 环境适配层 - SSR/SPA兼容性支持
 * 
 * 符合SOLID原则：
 * - SRP: 单一职责 - 只负责环境检测和适配
 * - OCP: 对扩展开放 - 可扩展新的环境类型
 * - DIP: 依赖抽象 - 提供统一的环境接口
 */

/**
 * 环境类型枚举
 */
export enum EnvironmentType {
  SERVER = 'server',
  CLIENT = 'client',
  TEST = 'test'
}

/**
 * 环境信息接口 (ISP: 接口隔离)
 */
export interface IEnvironmentInfo {
  type: EnvironmentType
  isServer: boolean
  isClient: boolean
  isTest: boolean
}

/**
 * 浏览器API适配器接口
 */
export interface IBrowserAdapter {
  readonly window: Window | null
  readonly document: Document | null
  readonly localStorage: Storage | null
  readonly sessionStorage: Storage | null
  getLocation(): Location | null
  getNavigator(): Navigator | null
}

/**
 * 环境检测器接口
 */
export interface IEnvironmentDetector {
  detect(): IEnvironmentInfo
  getBrowserAdapter(): IBrowserAdapter
}

/**
 * 默认环境检测器实例
 */
let defaultDetector: DefaultEnvironmentDetector | null = null

/**
 * 创建环境检测器
 */
export function createEnvironmentDetector(): IEnvironmentDetector {
  if (!defaultDetector) {
    defaultDetector = new DefaultEnvironmentDetector()
  }
  return defaultDetector
}

/**
 * 创建浏览器适配器
 */
export function createBrowserAdapter(): IBrowserAdapter {
  return createEnvironmentDetector().getBrowserAdapter()
}

/**
 * 默认环境检测器实现
 */
export class DefaultEnvironmentDetector implements IEnvironmentDetector {
  private cachedInfo: IEnvironmentInfo | null = null
  
  detect(): IEnvironmentInfo {
    if (this.cachedInfo) {
      return this.cachedInfo
    }
    
    let type: EnvironmentType
    
    // 测试环境检测
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
      type = EnvironmentType.TEST
    }
    // 服务端环境检测
    else if (typeof window === 'undefined') {
      type = EnvironmentType.SERVER
    }
    // 客户端环境检测
    else {
      type = EnvironmentType.CLIENT
    }
    
    this.cachedInfo = {
      type,
      isServer: type === EnvironmentType.SERVER,
      isClient: type === EnvironmentType.CLIENT,
      isTest: type === EnvironmentType.TEST
    }
    
    return this.cachedInfo
  }
  
  getBrowserAdapter(): IBrowserAdapter {
    const env = this.detect()
    
    if (env.isClient) {
      return new ClientBrowserAdapter()
    }
    
    return new ServerBrowserAdapter()
  }
}

/**
 * 客户端浏览器适配器
 */
class ClientBrowserAdapter implements IBrowserAdapter {
  get window(): Window {
    return window
  }
  
  get document(): Document {
    return document
  }
  
  get localStorage(): Storage {
    return localStorage
  }
  
  get sessionStorage(): Storage {
    return sessionStorage
  }
  
  getLocation(): Location {
    return window.location
  }
  
  getNavigator(): Navigator {
    return window.navigator
  }
}

/**
 * 服务端浏览器适配器 (提供安全的空实现)
 */
class ServerBrowserAdapter implements IBrowserAdapter {
  get window(): null {
    return null
  }
  
  get document(): null {
    return null
  }
  
  get localStorage(): null {
    return null
  }
  
  get sessionStorage(): null {
    return null
  }
  
  getLocation(): null {
    return null
  }
  
  getNavigator(): null {
    return null
  }
}

/**
 * 环境适配器单例
 */
class EnvironmentAdapter {
  private static instance: EnvironmentAdapter
  private detector: IEnvironmentDetector
  
  private constructor(detector?: IEnvironmentDetector) {
    this.detector = detector || new DefaultEnvironmentDetector()
  }
  
  static getInstance(detector?: IEnvironmentDetector): EnvironmentAdapter {
    if (!EnvironmentAdapter.instance) {
      EnvironmentAdapter.instance = new EnvironmentAdapter(detector)
    }
    return EnvironmentAdapter.instance
  }
  
  /**
   * 获取当前环境信息
   */
  getEnvironment(): IEnvironmentInfo {
    return this.detector.detect()
  }
  
  /**
   * 获取浏览器API适配器
   */
  getBrowser(): IBrowserAdapter {
    return this.detector.getBrowserAdapter()
  }
  
  /**
   * 仅在客户端执行回调
   */
  onClient<T>(callback: () => T, fallback?: () => T): T | undefined {
    const env = this.getEnvironment()
    if (env.isClient) {
      return callback()
    }
    return fallback?.()
  }
  
  /**
   * 仅在服务端执行回调
   */
  onServer<T>(callback: () => T, fallback?: () => T): T | undefined {
    const env = this.getEnvironment()
    if (env.isServer) {
      return callback()
    }
    return fallback?.()
  }
  
  /**
   * 条件执行：SSR和SPA都执行
   */
  onBoth<T>(callback: (env: IEnvironmentInfo) => T): T {
    return callback(this.getEnvironment())
  }
}

/**
 * 导出便捷函数
 */
export const envAdapter = EnvironmentAdapter.getInstance()

export const getEnvironment = () => envAdapter.getEnvironment()
export const getBrowser = () => envAdapter.getBrowser()
export const onClient = <T>(callback: () => T, fallback?: () => T) => 
  envAdapter.onClient(callback, fallback)
export const onServer = <T>(callback: () => T, fallback?: () => T) => 
  envAdapter.onServer(callback, fallback)
export const onBoth = <T>(callback: (env: IEnvironmentInfo) => T) => 
  envAdapter.onBoth(callback)

/**
 * 使用示例：
 * 
 * ```typescript
 * import { onClient, getEnvironment, getBrowser } from '@spark-view/spark-app'
 * 
 * // 条件执行
 * onClient(() => {
 *   console.log('仅在客户端执行')
 *   localStorage.setItem('key', 'value')
 * })
 * 
 * // 安全访问浏览器API
 * const browser = getBrowser()
 * const location = browser.getLocation() // SSR环境返回null
 * 
 * // 环境检测
 * const env = getEnvironment()
 * if (env.isClient) {
 *   // 客户端逻辑
 * }
 * ```
 */
