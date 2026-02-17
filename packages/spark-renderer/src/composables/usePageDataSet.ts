/**
 * DataSet 管理 Composable
 */

import { shallowRef, Ref, onUnmounted } from 'vue'
import { Logger } from '@spark-view/spark-utils'
import { SparkData } from '@spark-view/spark-data'
import { parseDataKey, isDataKey } from '@spark-view/spark-data'
import type { DataSet, IDataRow, DataColumn, CrudApi, DataRelation } from '@spark-view/spark-data'
import type { PageContext, Rule, FormCreateAPI } from '../types'
import { syncSelectedRowsToTable } from '../utils/bindRules'

const pageLogger = Logger('PageRenderer')

/**
 * DataSet管理选项接口 (ISP: 接口隔离原则)
 */
export interface UsePageDataSetOptions {
  pageData: Record<string, unknown>
  context: PageContext
  originalRules?: Ref<Rule[]>
  formApi?: Ref<FormCreateAPI | null>
  enableDataSet?: boolean
  dataLoader?: (tableName: string) => Promise<IDataRow[]>
}

/**
 * DataSet管理返回值接口 (ISP: 接口隔离原则)
 */
export interface UsePageDataSetReturn {
  dataSet: Ref<DataSet | null>
  initDataSet: () => void
  autoSubscribeTables: () => void
  clearDataSet: () => void
}

/**
 * DataSet 管理 Hook
 * 
 * @example
 * ```typescript
 * const { dataSet, initDataSet, autoSubscribeTables } = usePageDataSet({
 *   pageData,
 *   context,
 *   originalRules
 * })
 * 
 * initDataSet()
 * autoSubscribeTables()
 * ```
 */
export function usePageDataSet(options: UsePageDataSetOptions): UsePageDataSetReturn {
  const { 
    pageData, 
    context: _context,  // 保留以维持接口一致性，但标记为未使用
    originalRules,
    formApi,
    enableDataSet = true,
    dataLoader
  } = options
  
  const dataSet = shallowRef<DataSet | null>(null)
  
  /**
   * 初始化DataSet (SRP: 单一职责 - 只负责初始化)
   */
  const initDataSet = () => {
    if (!enableDataSet) return
    
    if (pageData['dataset'] && typeof pageData['dataset'] === 'object' && 'tables' in pageData['dataset']) {
      // 清理旧的 DataSet
      if (dataSet.value) {
        dataSet.value = null
      }
      
      // 创建默认 dataLoader (DIP: 依赖注入)
      const defaultDataLoader = dataLoader ?? (async (tableName: string) => {
        pageLogger.warn('使用默认 dataLoader，页面脚本应该注册自定义 dataLoader', { tableName })
        return []
      })
      
      // 创建 DataSet (使用命名空间 API)
      const datasetConfig = pageData['dataset'] as {
        dataSetName?: string
        tables?: Record<string, { tableName: string; columns: DataColumn[]; rows?: IDataRow[]; api?: CrudApi }>
        relations?: DataRelation[]
      }
      const config = {
        dataSetName: datasetConfig.dataSetName ?? 'PageDataSet',
        tables: datasetConfig.tables ?? {},
        ...(datasetConfig.relations && { relations: datasetConfig.relations }),
        dataLoader: defaultDataLoader
      }
      dataSet.value = SparkData.createDataSet(config)
      
      // 注意：不需要设置 context.$dataSet，因为 PageRenderer 已通过 getter 提供访问
      // context.$dataSet 是只读属性，通过 getter 返回 dataSet.value
      
      pageLogger.debug('DataSet 初始化成功', { 
        tables: dataSet.value ? Object.keys(dataSet.value.tables || {}) : []
      })
    }
  }
  
  /**
   * 自动订阅表数据变化 (SRP: 单一职责 - 只负责订阅管理)
   */
  const autoSubscribeTables = () => {
    if (!dataSet.value || !originalRules?.value) return
    
    // 收集所有 (tableName, viewId) 组合
    const viewKeys = new Set<string>()
    
    const extractViewKeys = (rules: Rule[] | Rule) => {
      const ruleArray = Array.isArray(rules) ? rules : [rules]
      
      ruleArray.forEach(rule => {
        if (rule['dataKey'] && typeof rule['dataKey'] === 'string') {
          const rawKey = rule['dataKey'] as string
          
          // 统一使用 DataKey 解析器（支持新格式 @ 和旧格式 dataset.tables.X）
          if (isDataKey(rawKey)) {
            const dk = parseDataKey(rawKey)
            if (dk) {
              const key = `${dk.tableName}.${dk.viewId}`
              viewKeys.add(key)
            }
          }
        }
        if (rule.children && Array.isArray(rule.children)) {
          const childRules = rule.children.filter((child: unknown): child is Rule => typeof child !== 'string')
          extractViewKeys(childRules)
        }
      })
    }
    
    extractViewKeys(originalRules.value)
    
    // 为每个视图注册订阅 + 视图状态监听
    viewKeys.forEach(key => {
      const [tableName, viewId] = key.split('.')
      // 类型安全：确保viewId存在且是有效字符串
      if (tableName && viewId && viewId !== 'undefined' && dataSet.value) {
        const view = dataSet.value.getView(tableName, viewId)
        if (!view) return

        dataSet.value.subscribe(tableName, viewId, () => {
          pageLogger.debug('视图数据变化', { viewKey: key })
        })
        pageLogger.debug('自动订阅视图', { viewKey: key })

        // 直接订阅 DataView 的 stateChanged 事件（状态变更归属于 DataView）
        view.events.on('stateChanged', (...args: unknown[]) => {
          const event = args[0] as { changeType: string; tableName: string; viewId: string; rows?: unknown[] }
          if (event.changeType === 'currentRow') {
            pageLogger.debug('currentRow 变化', { tableName: event.tableName, viewId: event.viewId })
          } else if (event.changeType === 'selectedRows') {
            const rows = event.rows ?? []
            pageLogger.debug('selectedRows 变化', { tableName: event.tableName, viewId: event.viewId, rowCount: rows.length })
            
            // 同步到 el-table
            if (formApi?.value) {
              syncSelectedRowsToTable(event.tableName, event.viewId, rows, formApi.value)
            }
          }
        })
      }
    })
  }
  
  /**
   * 清理DataSet (SRP: 单一职责 - 只负责清理)
   */
  const clearDataSet = () => {
    if (dataSet.value) {
      dataSet.value = null
      // context.$dataSet 是只读 getter，无需手动设置
    }
  }
  
  onUnmounted(() => {
    clearDataSet()
  })
  
  return {
    dataSet,
    initDataSet,
    autoSubscribeTables,
    clearDataSet
  }
}
