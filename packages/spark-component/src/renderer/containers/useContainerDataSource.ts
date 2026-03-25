import { computed, watch } from 'vue'
import type { ComputedRef } from 'vue'
import { parseDataKey } from '@spark-view/spark-data'
import type { DataView, IDataSet, IDataSource, IModelPermission } from '@spark-view/spark-data'

// ── 类型定义 ──────────────────────────────────────────────────────────────────

interface LoggerLike {
  warn(message: string): void
  error(message: string, error?: unknown): void
}

interface UseContainerDataSourceOptions<TSource> {
  dataKey: ComputedRef<string | undefined>
  pageDataSet: IDataSet | null
  mapView: (view: DataView) => TSource
}

interface UseContainerDataSourceEffectsOptions<TSource> {
  resolvedDataSource: ComputedRef<TSource | null>
  provideDataSource?: (source: TSource) => void
  logger: LoggerLike
  logPrefix: string
}

// ── 组合式函数 ───────────────────────────────────────────────────────────────

export function useContainerDataSource<TSource>(options: UseContainerDataSourceOptions<TSource>) {
  // 仅根据 DataKey 从页面级 DataSet 解析数据源。
  const resolvedDataSource = computed<TSource | null>(() => {
    if (options.dataKey.value !== undefined && options.pageDataSet !== null) {
      const descriptor = parseDataKey(options.dataKey.value)
      if (descriptor) {
        const view = options.pageDataSet.getView(descriptor.tableName, descriptor.viewId) as DataView | null
        if (view) return options.mapView(view)
      }
    }
    return null
  })

  /** 从 resolvedDataSource 提取模型级权限快照（IDataSource._modelPerm） */
  const modelPermission = computed<IModelPermission | undefined>(() =>
    (resolvedDataSource.value as IDataSource | null | undefined)?._modelPerm
  )

  return {
    resolvedDataSource,
    modelPermission,
  }
}

export function useContainerDataSourceEffects<TSource>(options: UseContainerDataSourceEffectsOptions<TSource>) {
  function tryAutoLoad(source: TSource | null): void {
    if (source === null) return
    const maybeView = source as DataView
    if (typeof maybeView.requestData !== 'function') return
    if (!maybeView.dataTable?.api) return

    void maybeView.requestData().catch((error: unknown) => {
      options.logger.error(`${options.logPrefix}: requestData() 失败`, error)
    })
  }

  watch(options.resolvedDataSource, (source) => {
    if (source === null) return
    options.provideDataSource?.(source)
    tryAutoLoad(source)
  }, { immediate: true })
}