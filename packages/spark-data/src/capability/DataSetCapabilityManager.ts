/**
 * DataSet 能力管理器
 * 
 * 职责：协调 DataSet / DataTable / DataView 各层的能力注册
 * 
 * 架构分层：
 * - DataView 自身注册：DATA_SOURCE（数据源）、SELECTION（选择状态）
 * - DataTable 自身注册：FIELD_METADATA（字段元数据）+ 继承 DataView 能力
 * - DataSet 自身注册：DATA_SET_STATE（数据空间状态）
 * - Manager 注册（外部注入）：APP_SERVICES、GLOBAL_DATA、PAGE_SERVICE、API_CLIENT
 *
 * 每层只关心自己的能力，Manager 负责汇总和协调
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
import { APP_SERVICES, GLOBAL_DATA, PAGE_SERVICE, API_CLIENT } from '@spark-view/spark-utils'
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
 * 
 * 职责：汇总各层能力 + 注册外部注入的能力
 * 
 * 能力来源：
 * 1. DataSet.getCapabilities() → DATA_SET_STATE
 * 2. DataTable.getCapabilities() → FIELD_METADATA + DATA_SOURCE + SELECTION
 * 3. DataView.getCapabilities() → DATA_SOURCE + SELECTION
 * 4. 外部注入 → APP_SERVICES, GLOBAL_DATA, PAGE_SERVICE, API_CLIENT
 *
 * 使用方式 1 - 独立 Context（需要手动集成）：
 * ```typescript
 * const manager = createDataSetCapabilityManager('page-1', { dataSet, parentContext: appContext })
 * const dsContext = manager.getContext()
 * ```
 *
 * 使用方式 2 - 直接注入（推荐）：
 * ```typescript
 * const { context } = useSparkComponent({ type: 'page-root' })
 * const manager = createDataSetCapabilityManager('page-1', { dataSet })
 * manager.injectIntoContext(context)
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
  private logger: LoggerApi

  constructor(pageId: string, config: DataSetCapabilityConfig) {
    this.config = config
    this.logger = Logger(`DataSet:${pageId}`)

    // 创建 DataSet Context，连接到 SPARK 组件树
    this.dataSetContext = {
      id: `dataset:${pageId}`,
      type: 'dataset',
      parent: config.parentContext,
      providers: new Map<CapabilityKey<unknown>, CapabilityProvider>()
    }

    this.logger.debug('Initializing DataSet capability manager', {
      hasParent: !!config.parentContext
    })

    // 注册所有能力
    this.registerAllCapabilities()
  }

  // =============================================================================
  // 私有方法 (Private Methods)
  // =============================================================================

  /**
   * 注册所有能力（委托各层 + 外部注入）
   */
  private registerAllCapabilities() {
    // ===== 1. 外部注入：APP 层服务 =====
    if (this.config.appServices) {
      this.registerCapability(APP_SERVICES, this.config.appServices)
    }

    // ===== 2. 委托：DataSet 自身的能力（DATA_SET_STATE） =====
    this.delegateDataSetCapabilities()

    // ===== 3. 外部注入：页面服务层（直接传递，不做冗余包装） =====
    if (this.config.globalData) {
      this.registerCapability(GLOBAL_DATA, this.config.globalData)
    }

    if (this.config.pageService) {
      this.registerCapability(PAGE_SERVICE, this.config.pageService)
    }

    if (this.config.apiClient) {
      this.registerCapability(API_CLIENT, this.config.apiClient)
    }
  }

  /**
   * 委托 DataSet 注册自身能力
   * DataSet.getCapabilities() → DATA_SET_STATE（含 tableListeners）
   */
  private delegateDataSetCapabilities() {
    const dataSet = this.config.dataSet
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    const ds = dataSet as any

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (typeof ds.getCapabilities === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const dsCapabilities: Map<CapabilityKey<unknown>, CapabilityProvider> =
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        ds.getCapabilities(this.config.pageParams, this.config.pagePermission)

      dsCapabilities.forEach((provider: CapabilityProvider, key: CapabilityKey<unknown>) => {
        this.dataSetContext.providers.set(key, provider)
        this.logger.debug(`Delegated DataSet capability: ${String(provider.name)}`)
      })
    } else {
      this.logger.warn('DataSet does not implement getCapabilities(), skipping delegation')
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
   * @param targetContext - 目标 SPARK 组件 Context
   */
  injectIntoContext(targetContext: { providers?: Map<CapabilityKey<unknown>, CapabilityProvider> }) {
    if (!targetContext.providers) {
      this.logger.warn('Target context has no providers map, cannot inject capabilities')
      return
    }

    this.logger.debug('Injecting DataSet capabilities into target context', {
      capabilityCount: this.dataSetContext.providers.size
    })

    const targetProviders = targetContext.providers
    this.dataSetContext.providers.forEach((provider, name) => {
      targetProviders.set(name, provider)
    })
  }

  /**
   * 触发数据表变化事件
   * 委托给 DataSet 的事件系统
   */
  notifyTableChange(tableName: string, _table: unknown) {
    this.logger.debug(`Notifying table change: ${tableName}`)

    // 通过 DataSet 实例的事件系统来通知
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    const ds = this.config.dataSet as any
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (typeof ds.emit === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      ds.emit('tableChanged', { tableName })
    }
  }

  /**
   * 更新配置
   */
  updateConfig(updates: Partial<DataSetCapabilityConfig>) {
    this.logger.debug('Updating configuration', { updates: Object.keys(updates) })
    Object.assign(this.config, updates)

    // 重新注册能力
    this.dataSetContext.providers.clear()
    this.registerAllCapabilities()
  }

  /**
   * 清理资源
   */
  dispose() {
    this.logger.debug('Disposing DataSet capability manager')
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
