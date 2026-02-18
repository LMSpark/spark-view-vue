/**
 * DataSet 管理 Composable
 */

import { shallowRef, Ref, onUnmounted } from 'vue'
import { Logger } from '@spark-view/spark-utils'
import { SparkData } from '@spark-view/spark-data'
import { parseDataKey, isDataKey } from '@spark-view/spark-data'
import type { DataSet, IDataRow, DataColumn, CrudApi, DataRelation } from '@spark-view/spark-data' 
import type { Rule, FormCreateAPI } from '../types'
import { syncSelectedRowsToTable } from '../utils/bindRules'

const pageLogger = Logger('PageRenderer')

/**
 * DataSet管理选项接口 (ISP: 接口隔离原则)
 */
export interface UsePageDataSetOptions {
  pageData: Record<string, unknown>
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

    // 统一行为：无论 pagedata.json 长什么样，都**归一化为 dataset** 格式然后创建 DataSet
    // 如果 pageData 已包含合法的 `dataset` 字段则直接使用，否则将 pageData 的顶层键映射为表

    // 清理旧的 DataSet
    if (dataSet.value) dataSet.value = null

    // 创建默认 dataLoader (DIP: 依赖注入)
    const defaultDataLoader = dataLoader ?? (async (tableName: string) => {
      pageLogger.warn('使用默认 dataLoader，页面脚本应该注册自定义 dataLoader', { tableName })
      return []
    })

    // helper: 简单类型推断
    const inferType = (v: unknown): string => {
      if (typeof v === 'number') return 'number'
      if (typeof v === 'boolean') return 'boolean'
      if (v === null) return 'string'
      if (typeof v === 'object') return 'object'
      return 'string'
    }

    // helper: 将任意 pagedata 归一化为 { tables: Record<...> }
    const normalizeToDataset = (pd: Record<string, unknown>) => {
      const tables: Record<string, { tableName: string; columns: DataColumn[]; rows: IDataRow[] }> = {}

      for (const [key, val] of Object.entries(pd)) {
        // 跳过显式的 dataset 字段（如果存在也会在上层被直接使用）
        if (key === 'dataset') continue

        // 数组 -> 表格行
        if (Array.isArray(val)) {
          const rows: IDataRow[] = []
          let columns: DataColumn[] = []

          if (val.length === 0) {
            columns = []
          } else if (typeof val[0] === 'object' && val[0] !== null && !Array.isArray(val[0])) {
            // 数组元素为对象：以第一个元素的键推断列
            const sample = val[0] as Record<string, unknown>
            columns = Object.keys(sample).map(n => ({ name: n, type: inferType(sample[n]), label: n })) as DataColumn[]
            for (const r of val) rows.push(r as IDataRow)
          } else {
            // 数组元素为基础类型：用单列 value 存储
            columns = [{ name: 'value', type: inferType(val[0]), label: 'value' }]
            for (const r of val) rows.push({ value: r } as IDataRow)
          }

          tables[key] = { tableName: key, columns, rows }
          continue
        }

        // 对象 -> 单行表
        if (val && typeof val === 'object') {
          const obj = val as Record<string, unknown>
          const columns = Object.keys(obj).map(n => ({ name: n, type: inferType(obj[n]), label: n }))
          tables[key] = { tableName: key, columns, rows: [obj] }
          continue
        }

        // 基本类型 -> 单列单行表
        tables[key] = { tableName: key, columns: [{ name: 'value', type: inferType(val), label: 'value' }], rows: [{ value: val }] }
      }

      return { dataSetName: 'PageDataSet', tables }
    }

    // 准备 datasetConfig：优先使用 pageData.dataset；否则归一化整个 pageData
    const pageDatasetCandidate = pageData['dataset']
    const rawDataset = (pageDatasetCandidate && typeof pageDatasetCandidate === 'object' && 'tables' in (pageDatasetCandidate as Record<string, unknown>))
      ? (pageDatasetCandidate as { dataSetName?: string; tables?: Record<string, { tableName: string; columns: DataColumn[]; rows?: IDataRow[]; api?: CrudApi }>; relations?: DataRelation[] })
      : normalizeToDataset(pageData)

    type DatasetCandidate =
      | { dataSetName?: string; tables?: Record<string, { tableName: string; columns: DataColumn[]; rows?: IDataRow[]; api?: CrudApi }>; relations?: DataRelation[] }
      | { dataSetName: string; tables: Record<string, { tableName: string; columns: DataColumn[]; rows: IDataRow[] }> }

    const rd = rawDataset as DatasetCandidate
    const cfg: { dataSetName: string; tables: Record<string, { tableName: string; columns: DataColumn[]; rows?: IDataRow[]; api?: CrudApi }>; relations?: DataRelation[]; dataLoader: typeof defaultDataLoader } = {
      dataSetName: rd.dataSetName ?? 'PageDataSet',
      tables: (rd as { tables?: Record<string, { tableName: string; columns: DataColumn[]; rows?: IDataRow[]; api?: CrudApi }>; }).tables ?? {},

      dataLoader: defaultDataLoader
    }

    if ('relations' in rd && rd.relations) cfg.relations = rd.relations

    dataSet.value = SparkData.createDataSet(cfg)

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
              syncSelectedRowsToTable(event.tableName, event.viewId, rows as import('@spark-view/spark-data').IDataRow[], formApi.value)
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
