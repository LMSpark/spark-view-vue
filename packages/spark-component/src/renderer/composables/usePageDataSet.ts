/**
 * DataSet 管理 Composable
 *
 * 位于 spark-component 渲染层，负责 DataSet 实例的引用管理。
 * DataSet 自身通过事件总线驱动 UI 更新，不需要 Vue 响应式包装。
 *
 * 职责单一：仅关注 DataSet 引用的持有/释放，不持有 UI/Rule 相关依赖。
 * DataSet ↔ el-table 的同步桥由 useRuleBinding 单独负责。
 *
 * 数据转换统一由上游 parsePageData（spark-page-config）完成，
 * 本 composable 只接受已编译好的 DataSet 实例，不做任何归一化。
 *
 * ⚠️ 不调用 DataSet.destroy()——DataSet 实例由 configLoader 的 memCache 缓存，
 * 同一页面的多次进入共享同一个 DataSet 对象。调用 destroy() 会导致
 * 第二次进入页面时拿到已销毁的 DataSet，表格无数据。
 * 清除实例引用即可，GC 由缓存策略负责。
 */

import { onUnmounted } from 'vue'
import type { DataSet } from '@spark-view/spark-data'

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
    // 仅释放引用——不调用 destroy()
    // DataSet 可能被 configLoader memCache 缓存，destroy 后再次进入同一页面会拿到死对象。
    dataSet = null
  }

  onUnmounted(clearDataSet)

  return {
    get dataSet() { return dataSet },
    initDataSet,
    clearDataSet
  }
}
