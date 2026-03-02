/**
 * DataSet 管理 Composable
 *
 * 位于 spark-component 渲染层，负责 DataSet 实例的生命周期管理。
 * DataSet 自身通过事件总线驱动 UI 更新，不需要 Vue 响应式包装。
 *
 * 职责单一：仅关注 DataSet 生命周期，不持有 UI/Rule 相关依赖。
 * DataSet ↔ el-table 的同步桥由 useRuleBinding 单独负责。
 *
 * 数据转换统一由上游 parsePageData（spark-page-config）完成，
 * 本 composable 只接受已编译好的 DataSet 实例，不做任何归一化。
 */

import { onUnmounted } from 'vue'
import { DataSet } from '@spark-view/spark-data'

/**
 * DataSet 管理选项接口
 */
export interface UsePageDataSetOptions {
  enableDataSet?: boolean
}

/** DataSet 管理返回值接口 */
export interface UsePageDataSetReturn {
  /** 当前 DataSet 实例（getter，无响应式，每次访问返回最新值） */
  readonly dataSet: DataSet | null
  /** 设置 DataSet 实例（必须是已编译好的 DataSet） */
  initDataSet: (ds: DataSet) => void
  clearDataSet: () => void
}

/**
 * DataSet 管理 Hook
 *
 * @example
 * ```typescript
 * const { dataSet, initDataSet } = usePageDataSet({ enableDataSet: true })
 * initDataSet(compiledDataSet)
 * ```
 */
export function usePageDataSet(options: UsePageDataSetOptions): UsePageDataSetReturn {
  const { enableDataSet = true } = options

  let dataSet: DataSet | null = null

  const initDataSet = (ds: DataSet) => {
    if (!enableDataSet) return
    dataSet = ds
  }

  const clearDataSet = () => {
    dataSet = null
  }

  onUnmounted(clearDataSet)

  return {
    get dataSet() { return dataSet },
    initDataSet,
    clearDataSet
  }
}
