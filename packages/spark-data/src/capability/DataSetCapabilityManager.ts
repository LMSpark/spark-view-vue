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

// =============================================================================
// 1. 导入语句 (Imports)
// =============================================================================

import type { Provider as CapabilityProvider, CapabilityKey, LoggerApi } from '@spark-view/spark-utils'
import { Logger } from '@spark-view/spark-utils'
import type {
  AppServicesCapability,
  GlobalDataCapability,
  PageServiceCapability,
  ApiClientCapability
} from '@spark-view/spark-utils'
import { APP_SERVICES, DATA_SET_STATE, GLOBAL_DATA, PAGE_SERVICE, API_CLIENT } from '@spark-view/spark-utils'
import type { IDataSet } from '../types'

// =============================================================================
// 2. 类型定义 (Type Definitions)
// =============================================================================

/**
 * DataSet 能力提供者配置
 */
export interface DataSetCapabilityConfig {
  /** DataSet 实例 */
  dataSet: IDataSet

  /** APP 层服务（可选） - 统一提供给子组件 */
  appServices?: AppServicesCapability

  /** 全局数据提供者（可选） */
  globalData?: GlobalDataCapability

  /** 页面服务提供者（可选） */
  pageService?: PageServiceCapability

  /** API 客户端（可选） */
  apiClient?: ApiClientCapability

  /** 页面参数 */
  pageParams?: Record<string, unknown>

  /** 页面级权限 */
  pagePermission?: Record<string, boolean>

  /** 父上下文（可选） - 将 DataSet 能力注入到 SPARK 组件树中 */
  parentContext?: unknown
}

// =============================================================================
// 3. 核心类 (Core Class)
// =============================================================================

/**
 * DataSet 能力管理器
 * 管理页面级数据和服务能力
 *
 * 架构说明：
 * - DataSet 与页面组件在同一层级，不是独立的父层
 * - 通过 parentContext 参数连接到 SPARK 组件树
 * - 页面根组件可以直接注入 DataSet 能力，子组件通过 parent chain 访问
 *
 * 使用方式 1 - 独立 Context（需要手动集成）：
 * ```typescript
 * const manager = createDataSetCapabilityManager('page-1', { dataSet, parentContext: appContext })
 * const dsContext = manager.getContext()
 * // 将 dsContext 作为页面组件的 parent
 * ```
 *
 * 使用方式 2 - 直接注入（推荐）：
 * ```typescript
 * // 在页面根组件中
 * const { provide, context } = useSparkComponent({ type: 'page-root' })
 * const manager = createDataSetCapabilityManager('page-1', { dataSet })
 * manager.injectIntoContext(context) // 直接注入到页面 context
 * ```
 */
export class DataSetCapabilityManager {
  private dataSetContext: {
    id: string
    type: string
    parent?: unknown
    providers: Map<CapabilityKey<unknown>, CapabilityProvider>
  }
  private config: DataSetCapabilityConfig
  private tableListeners = new Map<string, Set<(table: unknown) => void>>()
  private logger: LoggerApi

  constructor(pageId: string, config: DataSetCapabilityConfig) {
    this.config = config
    this.logger = Logger(`DataSet:${pageId}`)

    // 创建 DataSet Context，连接到 SPARK 组件树
    this.dataSetContext = {
      id: `dataset:${pageId}`,
      type: 'dataset',
      parent: config.parentContext, // 连接到父 context（app root 或 undefined）
      providers: new Map<CapabilityKey<unknown>, CapabilityProvider>()
    }

    this.logger.debug('Initializing DataSet capability manager', {
      hasParent: !!config.parentContext
    })

    // 注册所有 DataSet 能力
    this.registerDataSetCapabilities()
  }

  // =============================================================================
  // 私有方法 (Private Methods)
  // =============================================================================

  /**
   * 注册 DataSet 层的所有能力
   */
  private registerDataSetCapabilities() {
    // 0. APP 服务能力（如果提供）- 优先注册，让所有子组件可用
    if (this.config.appServices) {
      this.registerCapability(APP_SERVICES, this.config.appServices)
    }

    // 1. DataSet 状态能力（必需）
    this.registerDataSetStateCapability()

    // 2. 全局数据能力（如果提供）
    if (this.config.globalData) {
      this.registerCapability(GLOBAL_DATA, this.createGlobalDataImpl())
    }

    // 3. 页面服务能力（如果提供）
    if (this.config.pageService) {
      this.registerCapability(PAGE_SERVICE, this.createPageServiceImpl())
    }

    // 4. API 客户端能力（如果提供）
    if (this.config.apiClient) {
      this.registerCapability(API_CLIENT, this.createApiClientImpl())
    }
  }

  /**
   * 通用能力注册方法
   */
  private registerCapability(name: symbol, implementation: unknown) {
    const provider: CapabilityProvider = { name, implementation }
    this.dataSetContext.providers.set(name as CapabilityKey<unknown>, provider)
    this.logger.debug(`Registered capability: ${String(name)}`)
  }

  /**
   * 注册 DataSet 状态能力
   */
  private registerDataSetStateCapability() {
    const provider: CapabilityProvider = {
      name: DATA_SET_STATE,
      implementation: {
        getDataSet: () => this.config.dataSet,

        getTable: (tableName: string) => {
          return this.config.dataSet.tables[tableName]
        },

        getPageParams: () => {
          return this.config.pageParams ?? {}
        },

        getPagePermission: () => this.config.pagePermission ?? {},

        onTableChange: (tableName: string, callback: (table: unknown) => void) => {
          if (!this.tableListeners.has(tableName)) {
            this.tableListeners.set(tableName, new Set())
          }
          this.tableListeners.get(tableName)?.add(callback)

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

    this.registerCapability(provider.name as symbol, provider.implementation)
  }

  /**
   * 创建全局数据能力实现
   */
  private createGlobalDataImpl() {
    return {
      getUserInfo: () => {
        try {
          return this.config.globalData?.getUserInfo() ?? { id: '', name: '', roles: [] }
        } catch (error) {
          this.logger.error('Failed to get user info', { error })
          return { id: '', name: '', roles: [] }
        }
      },
      getConfig: (key: string) => {
        try {
          return this.config.globalData?.getConfig(key)
        } catch (error) {
          this.logger.error('Failed to get config', { key, error })
          return undefined
        }
      },
      getDictionary: (type: string) => {
        try {
          return this.config.globalData?.getDictionary(type) ?? []
        } catch (error) {
          this.logger.error('Failed to get dictionary', { type, error })
          return []
        }
      }
    }
  }

  /**
   * 创建页面服务能力实现
   */
  private createPageServiceImpl() {
    return {
      showMessage: (message: string, type: 'success' | 'error' | 'warning') => {
        try {
          this.config.pageService?.showMessage(message, type)
        } catch (error) {
          this.logger.error('Failed to show message', { message, type, error })
        }
      },
      showConfirm: async (message: string) => {
        try {
          return await (this.config.pageService?.showConfirm(message) ?? Promise.resolve(false))
        } catch (error) {
          this.logger.error('Failed to show confirm dialog', { message, error })
          return false
        }
      },
      showLoading: (show: boolean) => {
        try {
          this.config.pageService?.showLoading(show)
        } catch (error) {
          this.logger.error('Failed to toggle loading', { show, error })
        }
      },
      navigate: (path: string, params?: Record<string, unknown>) => {
        try {
          this.config.pageService?.navigate(path, params)
        } catch (error) {
          this.logger.error('Failed to navigate', { path, params, error })
        }
      }
    }
  }

  /**
   * 创建 API 客户端能力实现
   */
  private createApiClientImpl() {
    return {
      request: async <T = unknown>(config: {
        url: string
        method?: string
        params?: Record<string, unknown>
        data?: unknown
      }): Promise<T> => {
        if (!this.config.apiClient) {
          const error = new Error('API client not configured')
          this.logger.error('API request failed', { config, error })
          return Promise.reject(error)
        }
        try {
          return await this.config.apiClient.request<T>(config)
        } catch (error) {
          this.logger.error('API request failed', { config, error })
          throw error
        }
      }
    }
  }

  // =============================================================================
  // 公共方法 (Public Methods)
  // =============================================================================

  /**
   * 获取 DataSet Context
   * 可作为页面组件的 parent context
   */
  getContext() {
    return this.dataSetContext
  }

  /**
   * 将 DataSet 能力直接注入到指定 Context
   * 推荐在页面根组件中使用，避免创建额外的层级
   *
   * @param targetContext - 目标 SPARK 组件 Context（通常是页面根组件的 context）
   *
   * @example
   * ```typescript
   * // 在页面根组件中
   * const { context } = useSparkComponent({ type: 'page-root' })
   * const dsManager = createDataSetCapabilityManager('page-1', { dataSet })
   * dsManager.injectIntoContext(context) // 直接注入能力
   * ```
   */
  injectIntoContext(targetContext: { providers?: Map<CapabilityKey<unknown>, CapabilityProvider> }) {
    if (!targetContext.providers) {
      this.logger.warn('Target context has no providers map, cannot inject capabilities')
      return
    }

    this.logger.debug('Injecting DataSet capabilities into target context', {
      capabilityCount: this.dataSetContext.providers.size
    })

    // 将所有 DataSet 能力复制到目标 context
    const targetProviders = targetContext.providers
    this.dataSetContext.providers.forEach((provider, name) => {
      targetProviders.set(name, provider)
    })
  }

  /**
   * 触发数据表变化事件
   * 当 DataSet 中的表发生变化时调用
   */
  notifyTableChange(tableName: string, table: unknown) {
    const listeners = this.tableListeners.get(tableName)
    if (!listeners || listeners.size === 0) {
      return
    }

    this.logger.debug(`Notifying table change: ${tableName}`, { listenerCount: listeners.size })

    listeners.forEach(callback => {
      try {
        callback(table)
      } catch (error) {
        this.logger.error(`Error in table change listener for ${tableName}`, { error })
      }
    })
  }

  /**
   * 更新配置
   * 运行时可以更新部分配置
   */
  updateConfig(updates: Partial<DataSetCapabilityConfig>) {
    this.logger.debug('Updating configuration', { updates: Object.keys(updates) })
    Object.assign(this.config, updates)

    // 重新注册能力
    this.dataSetContext.providers.clear()
    this.registerDataSetCapabilities()
  }

  /**
   * 清理资源
   */
  dispose() {
    this.logger.debug('Disposing DataSet capability manager')
    this.tableListeners.clear()
    this.dataSetContext.providers.clear()
  }
}

// =============================================================================
// 4. 工厂函数 (Factory Functions)
// =============================================================================

/**
 * 创建 DataSet 能力管理器
 */
export function createDataSetCapabilityManager(
  pageId: string,
  config: DataSetCapabilityConfig
): DataSetCapabilityManager {
  return new DataSetCapabilityManager(pageId, config)
}
