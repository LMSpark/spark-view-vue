import type { IDataRow, IModelPermission } from '@spark-view/spark-data'

interface BaseSlotScope<TSource> {
  dataSource: TSource | null | undefined
  modelPermission: IModelPermission | undefined
}

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