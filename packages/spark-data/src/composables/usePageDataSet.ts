/**
 * DataSet 管理 Composable
 */

import { shallowRef, Ref, onUnmounted } from 'vue'
import { Logger } from '@spark-view/spark-utils'
import { DataSet } from '../dataset'

const pageLogger = Logger('PageRenderer')

/**
 * DataSet 管理选项接口
 *
 * 职责单一：仅关注 DataSet 生命周期，不持有 UI/Rule 相关依赖。
 * DataSet ↔ el-table 的同步桥由 useTableDataSync 单独负责。
 */
export interface UsePageDataSetOptions {
  enableDataSet?: boolean
}

/** DataSet 管理返回值接口 */
export interface UsePageDataSetReturn {
  dataSet: Ref<DataSet | null>
  /** pagedata.json 原始对象 或 已编译的 DataSet 实例 → 初始化 DataSet
   * - 传入 DataSet 实例时：直接赋值，跳过归一化
   * - 传入原始对象时：就地归一化并构建 DataSet
   */
  initDataSet: (rawPageData: Record<string, unknown> | DataSet) => void
  clearDataSet: () => void
}

/**
 * DataSet 管理 Hook
 * 
 * @example
 * ```typescript
 * const { dataSet, initDataSet } = usePageDataSet({ enableDataSet: true })
 * initDataSet(config.data)
 * ```
 */
export function usePageDataSet(options: UsePageDataSetOptions): UsePageDataSetReturn {
  const { enableDataSet = true } = options
  
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
    clearDataSet
  }
}
