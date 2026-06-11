/**
 * @module @spark-appworks/spark-component:page/renderer/usePageDataSet
 * 职责：提供 use Page Data Set 在 spark-component 渲染体系中的辅助能力，连接配置、上下文和组件运行时。
 * 边界：只服务 component-runtime，不绕过 DataViewKey/DataSet 管线，也不承担应用路由职责。
 * AI用途：排查组件配置、运行态上下文或渲染注册关系时，用本模块确认局部语义。
 */

import { onUnmounted } from 'vue'
import type { DataSet } from '@spark-appworks/spark-data'

/**
 * DataSet 管理选项接口
 */
export type UsePageDataSetOptions = {
    /** 是否 enable Data Set。 */
enableDataSet?: boolean}

/** DataSet 管理返回值接口 */
export type UsePageDataSetReturn = {
  /** 当前 DataSet 实例（getter，无响应式，每次访问返回最新值） */
  readonly dataSet: DataSet | null
  /** 设置 DataSet 实例（必须是已编译好的 DataSet） */
  initDataSet: (ds: DataSet) => void
    /** clear Data Set 回调。 */
clearDataSet: () => void}

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
    // 仅释放引用——不调用 destroy()
    // DataSet 由 PageNode 持有，destroy 后同一页面内存态会被破坏。
    dataSet = null
  }

  onUnmounted(clearDataSet)

  return {
    get dataSet() { return dataSet },
    initDataSet,
    clearDataSet
  }
}
