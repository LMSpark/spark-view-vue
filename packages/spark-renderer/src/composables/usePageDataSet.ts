/**
 * DataSet 管理 Composable
 */

import { shallowRef, Ref, onUnmounted } from 'vue'
import { Logger } from '@spark-view/spark-utils'
import { DataSet } from '@spark-view/spark-data'
import { parseDataKey, isDataKey } from '@spark-view/spark-data'
import type { Rule, FormCreateAPI } from '../types'
import { syncSelectedRowsToTable } from '../utils/bindRules'

const pageLogger = Logger('PageRenderer')

/**
 * DataSet管理选项接口 (ISP: 接口隔离原则)
 */
export interface UsePageDataSetOptions {
  originalRules?: Ref<Rule[]>
  formApi?: Ref<FormCreateAPI | null>
  enableDataSet?: boolean
}

/**
 * DataSet管理返回值接口 (ISP: 接口隔离原则)
 */
export interface UsePageDataSetReturn {
  dataSet: Ref<DataSet | null>
  /** pagedata.json 原始对象 或 已编译的 DataSet 实例 → 初始化 DataSet
   * - 传入 DataSet 实例时：直接赋值，跳过归一化
   * - 传入原始对象时：就地归一化并构建 DataSet
   */
  initDataSet: (rawPageData: Record<string, unknown> | DataSet) => void
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
 *   originalRules
 * })
 * 
 * initDataSet()
 * autoSubscribeTables()
 * ```
 */
export function usePageDataSet(options: UsePageDataSetOptions): UsePageDataSetReturn {
  const { 
    originalRules,
    formApi,
    enableDataSet = true
  } = options
  
  const dataSet = shallowRef<DataSet | null>(null)
  /** 当前 DataSet 对应的 pagedata._version，undefined = 无版本信息 */
  let currentDataVersion: unknown = undefined
  
  /**
   * pagedata.json 原始对象 → 归一化 → DataSet（唯一缓存，不写入 pageData）
   */
  const initDataSet = (rawPageData: Record<string, unknown> | DataSet) => {
    if (!enableDataSet) return

    // DataSet 实例直接赋值，跳过归一化（已由 parsePageData 编译并缓存）
    if (rawPageData instanceof DataSet) {
      if (dataSet.value) dataSet.value = null
      dataSet.value = rawPageData
      currentDataVersion = rawPageData.version
      pageLogger.debug('DataSet 直接赋值（已编译实例）', {
        tables: Object.keys(rawPageData.tables || {})
      })
      return
    }

    // 版本对齐：rawPageData._version 存在且与当前缓存版本一致 → 直接复用 DataSet
    const incomingVersion = rawPageData['_version']
    if (incomingVersion !== undefined && incomingVersion === currentDataVersion && dataSet.value) {
      pageLogger.debug('DataSet 版本命中，跳过重建', { version: incomingVersion })
      return
    }

    // 清理旧的 DataSet
    if (dataSet.value) dataSet.value = null

    dataSet.value = DataSet.fromPageData(rawPageData)
    currentDataVersion = incomingVersion

    pageLogger.debug('DataSet 初始化成功（pagedata 归一化）', { 
      tables: dataSet.value ? Object.keys(dataSet.value.tables || {}) : []
    })
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
          const rawKey = rule['dataKey']
          
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

        // 统一通过 DataView 的 stateChanged 事件订阅（单通道，handler 参数由 DataViewEventMap 自动推断）
        view.events.on('stateChanged', (event) => {
          if (event.changeType === 'currentRow') {
            pageLogger.debug('currentRow 变化', { tableName: event.tableName, viewId: event.viewId })
          } else if (event.changeType === 'selectedRows') {
            const rows = event.rows ?? []
            pageLogger.debug('selectedRows 变化', { tableName: event.tableName, viewId: event.viewId, rowCount: rows.length })
            
            // 同步到 el-table
            if (formApi?.value) {
              syncSelectedRowsToTable(event.tableName, event.viewId, rows, formApi.value)
            }
          } else {
            pageLogger.debug('视图数据变化', { viewKey: key, changeType: event.changeType })
          }
        })
        pageLogger.debug('自动订阅视图', { viewKey: key })
      }
    })
  }
  
  /**
   * 清理DataSet (SRP: 单一职责 - 只负责清理)
   */
  const clearDataSet = () => {
    if (dataSet.value) {
      dataSet.value = null
      currentDataVersion = undefined
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
