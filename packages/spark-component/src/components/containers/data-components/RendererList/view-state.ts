import type { DataView } from '@spark-view/spark-data'
import type { ValueRef } from '../../../shared-types.js'
import { useDataViewState } from '../useDataViewState'

// ==============================
// 类型定义
// ==============================

interface RendererListViewStateOptions {
  resolvedView: ValueRef<DataView | null | undefined>
}

// ==============================
// 主状态：RendererList 视图态
// ==============================

/**
 * RendererList 与 DataView 的唯一对接层。
 *
 * 组件模板不直接访问 DataView 属性，全部通过此函数返回的 computeds 消费。
 */
export function useRendererListViewState(options: RendererListViewStateOptions) {
  const { rows } = useDataViewState(options.resolvedView)

  return {
    listRows: rows,
  }
}
