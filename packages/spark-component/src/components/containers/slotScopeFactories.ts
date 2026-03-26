import type { IDataRow, IModelPermission } from '@spark-view/spark-data'

// ── 通用作用域结构 ───────────────────────────────────────────────────────────

export interface BaseSlotScope<TSource> {
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
  extra?: Record<string, unknown>
}) {
  return withBaseScope(params, {
    row: params.row,
    rowIndex: params.index,
    $index: params.index,
    ...(params.extra ?? {}),
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