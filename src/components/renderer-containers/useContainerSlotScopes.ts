import type { IDataRow, IModelPermission } from '@spark-view/spark-data'

// ── 通用作用域结构 ───────────────────────────────────────────────────────────

interface BaseSlotScope<TSource> {
  dataSource: TSource | null | undefined
  modelPermission: IModelPermission | undefined
}

// ── 作用域构建辅助函数 ───────────────────────────────────────────────────────

function withBaseScope<TSource, TExtra extends Record<string, unknown>>(
  base: BaseSlotScope<TSource>,
  extra: TExtra,
): BaseSlotScope<TSource> & TExtra {
  return {
    dataSource: base.dataSource,
    modelPermission: base.modelPermission,
    ...extra,
  }
}

// ── 插槽作用域工厂 ───────────────────────────────────────────────────────────

export function createToolbarSlotScope<TSource>(
  base: BaseSlotScope<TSource>,
  extra: Record<string, unknown>,
) {
  return withBaseScope(base, extra)
}

export function createRowActionSlotScope<TSource>(params: {
  dataSource: TSource | null | undefined
  modelPermission: IModelPermission | undefined
  row: IDataRow
  index: number
}) {
  return withBaseScope(params, {
    row: params.row,
    rowIndex: params.index,
    $index: params.index,
  })
}

export function createNodeActionSlotScope<TSource>(params: {
  dataSource: TSource | null | undefined
  modelPermission: IModelPermission | undefined
  data: unknown
  node: unknown
}) {
  return withBaseScope(params, {
    data: params.data,
    node: params.node,
  })
}

export function createCurrentRowSlotScope<TSource>(params: {
  dataSource: TSource | null | undefined
  modelPermission: IModelPermission | undefined
  row: Record<string, unknown>
  model?: Record<string, unknown>
}) {
  return withBaseScope(params, {
    row: params.row,
    model: params.model ?? params.row,
  })
}