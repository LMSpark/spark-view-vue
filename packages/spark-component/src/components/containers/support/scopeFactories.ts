import type { IDataRow, IModelPermission } from '@spark-view/spark-data'
import type { IModuleContext } from '../../internal'

// ── 通用作用域结构 ───────────────────────────────────────────────────────────

export interface BaseScopeContext<TSource> {
  dataSource: TSource | null | undefined
  modelPermission: IModelPermission | undefined
  moduleContext?: IModuleContext | null | undefined
}

// ── 作用域构建辅助函数 ───────────────────────────────────────────────────────

function withBaseScopeContext<TSource, TExtra extends Record<string, unknown>>(
  base: BaseScopeContext<TSource>,
  extra: TExtra,
): BaseScopeContext<TSource> & TExtra {
  return {
    dataSource: base.dataSource,
    modelPermission: base.modelPermission,
    moduleContext: base.moduleContext,
    ...extra,
  }
}

// ── 作用域工厂 ───────────────────────────────────────────────────────────────

export function createToolbarScope<TSource>(
  base: BaseScopeContext<TSource>,
  extra: Record<string, unknown>,
) {
  return withBaseScopeContext(base, extra)
}

export function createRowScope<TSource>(params: {
  dataSource: TSource | null | undefined
  modelPermission: IModelPermission | undefined
  moduleContext?: IModuleContext | null | undefined
  row: IDataRow
  index: number
  extra?: Record<string, unknown>
}) {
  return withBaseScopeContext(params, {
    row: params.row,
    rowIndex: params.index,
    ...(params.extra ?? {}),
  })
}

export function createCurrentRowScope<TSource>(params: {
  dataSource: TSource | null | undefined
  modelPermission: IModelPermission | undefined
  moduleContext?: IModuleContext | null | undefined
  row: IDataRow
  model?: IDataRow
}) {
  return withBaseScopeContext(params, {
    row: params.row,
    model: params.model ?? params.row,
  })
}
