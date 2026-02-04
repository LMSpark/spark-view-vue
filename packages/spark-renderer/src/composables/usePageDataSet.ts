/**
 * DataSet 管理 Composable
 */

import { ref, Ref, onUnmounted } from 'vue'
import { Logger } from '@spark-view/spark-utils'
import { DataSetManager } from '@spark-view/spark-data'
import type { IDataSet, DataRow } from '@spark-view/spark-data'
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
  dataLoader?: (tableName: string) => Promise<DataRow[]>
}

/**
 * DataSet管理返回值接口 (ISP: 接口隔离原则)
 */
export interface UsePageDataSetReturn {
  dataSet: Ref<IDataSet | null>
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
    context, 
    originalRules,
    formApi,
    enableDataSet = true,
    dataLoader
  } = options
  
  const dataSet = ref<IDataSet | null>(null)
  
  /**
   * 初始化DataSet (SRP: 单一职责 - 只负责初始化)
   */
  const initDataSet = () => {
    if (!enableDataSet) return
    
    if (pageData.dataset && typeof pageData.dataset === 'object' && 'tables' in pageData.dataset) {
      // 清理旧的 DataSet
      if (dataSet.value) {
        dataSet.value = null
      }
      
      // 创建默认 dataLoader (DIP: 依赖注入)
      const defaultDataLoader = dataLoader || (async (tableName: string) => {
        pageLogger.warn('使用默认 dataLoader，页面脚本应该注册自定义 dataLoader', { tableName })
        return []
      })
      
      // 创建 DataSet (使用工厂模式)
      dataSet.value = DataSetManager.create(pageData.dataset as IDataSet, defaultDataLoader)
      
      // 移除 pageData.dataset.tables 引用
      if (pageData.dataset && typeof pageData.dataset === 'object' && 'tables' in pageData.dataset) {
        delete (pageData.dataset as Record<string, unknown>).tables
      }
      
      // 更新上下文
      context.$dataSet = dataSet.value
      
      pageLogger.debug('DataSet 初始化成功', { 
        tables: Object.keys(dataSet.value.tables || {}) 
      })
    }
  }
  
  /**
   * 自动订阅表数据变化 (SRP: 单一职责 - 只负责订阅管理)
   */
  const autoSubscribeTables = () => {
    if (!dataSet.value || !originalRules?.value) return
    
    // 收集所有 (tableName, contextId) 组合
    const contexts = new Set<string>()
    
    const extractContexts = (rules: Rule[] | Rule) => {
      const ruleArray = Array.isArray(rules) ? rules : [rules]
      
      ruleArray.forEach(rule => {
        if (rule.dataKey?.startsWith('dataset.tables.')) {
          const match = rule.dataKey.match(/^dataset\.tables\.([^.]+)(?:\.contexts\.([^.]+))?/)
          if (match) {
            const tableName = match[1]
            const contextId = match[2] || rule.contextId || 'default'
            const key = `${tableName}.${contextId}`
            contexts.add(key)
          }
        }
        if (rule.children && Array.isArray(rule.children)) {
          const childRules = rule.children.filter((child: unknown): child is Rule => typeof child !== 'string')
          extractContexts(childRules)
        }
      })
    }
    
    extractContexts(originalRules.value)
    
    // 为每个上下文注册订阅
    contexts.forEach(key => {
      const [tableName, contextId] = key.split('.')
      // 类型安全：确保contextId存在且是有效字符串
      if (tableName && contextId && contextId !== 'undefined' && dataSet.value) {
        dataSet.value.subscribe(tableName, contextId, () => {
          pageLogger.debug('上下文数据变化', { contextKey: key })
        })
        pageLogger.debug('自动订阅上下文', { contextKey: key })
      }
    })
    
    // 监听 currentRow 和 selectedRows 变化
    dataSet.value.on('currentRowChanged', () => {
      pageLogger.debug('currentRow 变化')
    })
    
    dataSet.value.on('selectedRowsChanged', ({ tableName, contextId, rows }: { 
      tableName: string
      contextId: string
      rows: DataRow[] 
    }) => {
      pageLogger.debug('selectedRows 变化', { tableName, contextId, rowCount: rows.length })
      
      // 同步到 el-table
      if (formApi?.value) {
        syncSelectedRowsToTable(tableName, contextId, rows, formApi.value)
      }
    })
  }
  
  /**
   * 清理DataSet (SRP: 单一职责 - 只负责清理)
   */
  const clearDataSet = () => {
    if (dataSet.value) {
      dataSet.value = null
      context.$dataSet = null
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
