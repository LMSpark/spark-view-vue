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

import { CapabilityManager } from '@spark-view/spark-utils'
import type { CapabilityContext, CapabilityProvider } from '@spark-view/spark-utils'
import type { IDataSet } from '../types'

/**
 * DataSet 能力提供者配置
 */
export interface DataSetCapabilityConfig {
  /** DataSet 实例 */
  dataSet: IDataSet
  
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
  private dataSetContext: CapabilityContext
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
      children: [],
      providers: new Set(),
      consumers: new Map(),
      providerListeners: new Map()
    }
    
    // 注册所有 DataSet 层能力
    this.registerDataSetCapabilities()
  }

  /**
   * 注册 DataSet 层的所有能力
   */
  private registerDataSetCapabilities() {
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
   * 注册 DataSet 状态能力
   */
  private registerDataSetStateCapability() {
    const provider: CapabilityProvider = {
      name: 'dataSetState',
      version: '1.0.0',
      interface: {
        getDataSet: 'function',
        getTable: 'function',
        getPageParams: 'function',
        getPagePermission: 'function',
        onTableChange: 'function'
      },
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
          this.tableListeners.get(tableName)!.add(callback)
          
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
    
    this.dataSetContext.providers.add(provider as any)
  }

  /**
   * 注册全局数据能力
   */
  private registerGlobalDataCapability() {
    const provider: CapabilityProvider = {
      name: 'globalData',
      version: '1.0.0',
      interface: {
        getUserInfo: 'function',
        getConfig: 'function',
        getDictionary: 'function'
      },
      implementation: {
        getUserInfo: () => this.config.globalData!.getUserInfo(),
        getConfig: (key: string) => this.config.globalData!.getConfig(key),
        getDictionary: (type: string) => this.config.globalData!.getDictionary(type)
      }
    }
    
    this.dataSetContext.providers.add(provider as any)
  }

  /**
   * 注册页面服务能力
   */
  private registerPageServiceCapability() {
    const provider: CapabilityProvider = {
      name: 'pageService',
      version: '1.0.0',
      interface: {
        showMessage: 'function',
        showConfirm: 'function',
        showLoading: 'function',
        navigate: 'function'
      },
      implementation: {
        showMessage: (message: string, type: 'success' | 'error' | 'warning') => 
          this.config.pageService!.showMessage(message, type),
        showConfirm: (message: string) => 
          this.config.pageService!.showConfirm(message),
        showLoading: (show: boolean) => 
          this.config.pageService!.showLoading(show),
        navigate: (path: string, params?: Record<string, unknown>) => 
          this.config.pageService!.navigate(path, params)
      }
    }
    
    this.dataSetContext.providers.add(provider as any)
  }

  /**
   * 注册 API 客户端能力
   */
  private registerApiClientCapability() {
    const provider: CapabilityProvider = {
      name: 'apiClient',
      version: '1.0.0',
      interface: {
        request: 'function'
      },
      implementation: {
        request: <T = unknown>(config: {
          url: string
          method?: string
          params?: Record<string, unknown>
          data?: unknown
        }): Promise<T> => {
          return this.config.apiClient!.request<T>(config)
        }
      }
    }
    
    this.dataSetContext.providers.add(provider as any)
  }

  /**
   * 获取 DataSet 上下文
   * 组件可以通过此上下文访问 DataSet 层的所有能力
   */
  getContext(): CapabilityContext {
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
