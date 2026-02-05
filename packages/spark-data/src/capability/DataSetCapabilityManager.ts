/**
 * DataSet 能力管理器
 * 管理页面级数据和服务能力
 * 
 * DataSet 层提供的能力：
 * - dataSetState: DataSet 状态和数据表访问
 * - globalData: 用户信息、字典等全局数据
 * - pageService: 消息、对话框、导航等页面服务
 * - apiClient: 统一的 API 请求接口
 */

import { CapabilityManager } from '@spark-view/spark-utils/capability/internal'
import type { Provider as CapabilityProvider } from '@spark-view/spark-utils'
import type { IDataSet } from '../types'

/**
 * APP 服务接口（从 APP 层注入）
 */
export interface AppServices {
  /** Vue Router 实例 */
  router?: {
    push(to: string | { path: string; query?: Record<string, unknown> }): Promise<unknown>
    replace(to: string | { path: string; query?: Record<string, unknown> }): Promise<unknown>
    back(): void
    currentRoute: { value: { path: string; query: Record<string, unknown> } }
  }
  
  /** APP Logger - 匹配 LoggerApi 接口 */
  logger?: {
    debug(...args: unknown[]): void
    info(...args: unknown[]): void
    warn(...args: unknown[]): void
    error(...args: unknown[]): void
  }
  
  /** 配置加载器 */
  configLoader?: {
    loadPageConfig(pageId: string): Promise<unknown>
    loadRoutes(): Promise<unknown>
    clearCache(): void
  }
  
  /** 认证服务 */
  authService?: {
    getUser(): { id: string; name: string; roles: string[] } | null
    login(credentials: { username: string; password: string }): Promise<boolean>
    logout(): Promise<void>
    checkAuth(): Promise<boolean>
  }
}

/**
 * DataSet 能力提供者配置
 */
export interface DataSetCapabilityConfig {
  /** DataSet 实例 */
  dataSet: IDataSet
  
  /** APP 层服务（可选） - 统一提供给子组件 */
  appServices?: AppServices
  
  /** 全局数据提供者（可选） */
  globalData?: {
    getUserInfo(): { id: string; name: string; roles: string[] }
    getConfig(key: string): unknown
    getDictionary(type: string): Array<{ label: string; value: unknown }>
  }
  
  /** 页面服务提供者（可选） */
  pageService?: {
    showMessage(message: string, type: 'success' | 'error' | 'warning'): void
    showConfirm(message: string): Promise<boolean>
    showLoading(show: boolean): void
    navigate(path: string, params?: Record<string, unknown>): void
  }
  
  /** API 客户端（可选） */
  apiClient?: {
    request<T = unknown>(config: {
      url: string
      method?: string
      params?: Record<string, unknown>
      data?: unknown
    }): Promise<T>
  }
  
  /** 页面参数 */
  pageParams?: Record<string, unknown>
  
  /** 页面级权限 */
  pagePermission?: Record<string, boolean>
}

/**
 * DataSet 能力管理器
 * 管理页面级数据和服务能力
 */
export class DataSetCapabilityManager extends CapabilityManager {
  private dataSetContext: {
    id: string
    type: string
    parent?: unknown
    providers: Set<CapabilityProvider>
    consumers: Map<string, unknown>
  }
  private config: DataSetCapabilityConfig
  private tableListeners = new Map<string, Set<(table: unknown) => void>>()

  constructor(pageId: string, config: DataSetCapabilityConfig) {
    super()
    this.config = config
    
    // 创建 DataSet 层上下文
    this.dataSetContext = {
      id: `dataset:${pageId}`,
      type: 'dataset',
      parent: undefined,
      providers: new Set(),
      consumers: new Map()
    }
    
    // 注册所有 DataSet 层能力
    this.registerDataSetCapabilities()
  }

  /**
   * 注册 DataSet 层的所有能力
   */
  private registerDataSetCapabilities() {
    // 0. APP 服务能力（如果提供）- 优先注册，让所有子组件可用
    if (this.config.appServices) {
      this.registerAppServicesCapability()
    }
    
    // 1. DataSet 状态能力
    this.registerDataSetStateCapability()
    
    // 2. 全局数据能力（如果提供）
    if (this.config.globalData) {
      this.registerGlobalDataCapability()
    }
    
    // 3. 页面服务能力（如果提供）
    if (this.config.pageService) {
      this.registerPageServiceCapability()
    }
    
    // 4. API 客户端能力（如果提供）
    if (this.config.apiClient) {
      this.registerApiClientCapability()
    }
  }

  /**
   * 注册 APP 服务能力
   * 统一提供 router, logger, configLoader, authService 等 APP 层服务
   */
  private registerAppServicesCapability() {
    const provider: CapabilityProvider = {
      name: 'appServices',
      version: '1.0.0',
      implementation: {
        // Router 服务
        router: this.config.appServices?.router,
        
        // Logger 服务
        logger: this.config.appServices?.logger,
        
        // ConfigLoader 服务
        configLoader: this.config.appServices?.configLoader,
        
        // AuthService 服务
        authService: this.config.appServices?.authService,
        
        // 便捷方法：导航
        navigate: (to: string | { path: string; query?: Record<string, unknown> }) => {
          return this.config.appServices?.router?.push(to)
        },
        
        // 便捷方法：日志（类型安全，无需 any）
        log: {
          debug: (...args: unknown[]) => this.config.appServices?.logger?.debug(...args),
          info: (...args: unknown[]) => this.config.appServices?.logger?.info(...args),
          warn: (...args: unknown[]) => this.config.appServices?.logger?.warn(...args),
          error: (...args: unknown[]) => this.config.appServices?.logger?.error(...args)
        }
      }
    }
    
    this.dataSetContext.providers.add(provider)
  }

  /**
   * 注册 DataSet 状态能力
   */
  private registerDataSetStateCapability() {
    const provider: CapabilityProvider = {
      name: 'dataSetState',
      version: '1.0.0',
      implementation: {
        getDataSet: () => this.config.dataSet,
        
        getTable: (tableName: string) => {
          return this.config.dataSet.tables[tableName]
        },
        
        getPageParams: () => {
          return this.config.pageParams ?? {}
        },
        
        getPagePermission: () => {
          return this.config.pagePermission ?? {}
        },
        
        onTableChange: (tableName: string, callback: (table: unknown) => void) => {
          if (!this.tableListeners.has(tableName)) {
            this.tableListeners.set(tableName, new Set())
          }
          const listeners = this.tableListeners.get(tableName)
          if (listeners) {
            listeners.add(callback)
          }
          
          // 返回取消订阅函数
          return () => {
            const listeners = this.tableListeners.get(tableName)
            if (listeners) {
              listeners.delete(callback)
              if (listeners.size === 0) {
                this.tableListeners.delete(tableName)
              }
            }
          }
        }
      }
    }
    
    this.dataSetContext.providers.add(provider)
  }

  /**
   * 注册全局数据能力
   */
  private registerGlobalDataCapability() {
    const provider: CapabilityProvider = {
      name: 'globalData',
      version: '1.0.0',
      implementation: {
        getUserInfo: () => this.config.globalData?.getUserInfo() ?? { id: '', name: '', roles: [] },
        getConfig: (key: string) => this.config.globalData?.getConfig(key),
        getDictionary: (type: string) => this.config.globalData?.getDictionary(type) ?? []
      }
    }
    
    this.dataSetContext.providers.add(provider)
  }

  /**
   * 注册页面服务能力
   */
  private registerPageServiceCapability() {
    const provider: CapabilityProvider = {
      name: 'pageService',
      version: '1.0.0',
      implementation: {
        showMessage: (message: string, type: 'success' | 'error' | 'warning') => 
          this.config.pageService?.showMessage(message, type),
        showConfirm: (message: string) => 
          this.config.pageService?.showConfirm(message) ?? Promise.resolve(false),
        showLoading: (show: boolean) => 
          this.config.pageService?.showLoading(show),
        navigate: (path: string, params?: Record<string, unknown>) => 
          this.config.pageService?.navigate(path, params)
      }
    }
    
    this.dataSetContext.providers.add(provider)
  }

  /**
   * 注册 API 客户端能力
   */
  private registerApiClientCapability() {
    const provider: CapabilityProvider = {
      name: 'apiClient',
      version: '1.0.0',
      implementation: {
        request: <T = unknown>(config: {
          url: string
          method?: string
          params?: Record<string, unknown>
          data?: unknown
        }): Promise<T> => {
          if (!this.config.apiClient) {
            return Promise.reject(new Error('API client not configured'))
          }
          return this.config.apiClient.request<T>(config)
        }
      }
    }
    
    this.dataSetContext.providers.add(provider)
  }

  /**
   * 获取 DataSet 上下文
   * 组件可以通过此上下文访问 DataSet 层的所有能力
   */
  getContext() {
    return this.dataSetContext
  }

  /**
   * 触发数据表变化事件
   * 当 DataSet 中的表发生变化时调用
   */
  notifyTableChange(tableName: string, table: unknown) {
    const listeners = this.tableListeners.get(tableName)
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(table)
        } catch (error) {
          console.error(`Error in table change listener for ${tableName}:`, error)
        }
      })
    }
  }

  /**
   * 更新配置
   * 运行时可以更新部分配置
   */
  updateConfig(updates: Partial<DataSetCapabilityConfig>) {
    Object.assign(this.config, updates)
    
    // 重新注册能力
    this.dataSetContext.providers.clear()
    this.registerDataSetCapabilities()
  }

  /**
   * 清理资源
   */
  dispose() {
    this.tableListeners.clear()
    this.dataSetContext.providers.clear()
    this.dataSetContext.consumers.clear()
  }
}

/**
 * 创建 DataSet 能力管理器
 */
export function createDataSetCapabilityManager(
  pageId: string,
  config: DataSetCapabilityConfig
): DataSetCapabilityManager {
  return new DataSetCapabilityManager(pageId, config)
}
