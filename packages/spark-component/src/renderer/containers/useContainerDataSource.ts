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
  legacySource: ComputedRef<TSource | null | undefined>
  mapView: (view: DataView) => TSource
}

interface UseContainerDataSourceEffectsOptions<TSource> {
  resolvedDataSource: ComputedRef<TSource | null>
  legacySource?: ComputedRef<TSource | null | undefined>
  provideDataSource?: (source: TSource) => void
  logger: LoggerLike
  logPrefix: string
}

const warnedLegacySourcePrefixes = new Set<string>()

// ── 组合式函数 ───────────────────────────────────────────────────────────────

export function useContainerDataSource<TSource>(options: UseContainerDataSourceOptions<TSource>) {
  // 优先根据 DataKey 从页面级 DataSet 解析数据源，失败时才走遗留注入链。
  const resolvedDataSource = computed<TSource | null>(() => {
    if (options.dataKey.value !== undefined && options.pageDataSet !== null) {
      const descriptor = parseDataKey(options.dataKey.value)
      if (descriptor) {
        const view = options.pageDataSet.getView(descriptor.tableName, descriptor.viewId) as DataView | null
        if (view) return options.mapView(view)
      }
    }
    return options.legacySource.value ?? null
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
  watch(options.legacySource ?? computed(() => undefined), (legacySource) => {
    if (!import.meta.env.DEV) return
    if (legacySource === null || legacySource === undefined) return
    if (warnedLegacySourcePrefixes.has(options.logPrefix)) return
    warnedLegacySourcePrefixes.add(options.logPrefix)
    options.logger.warn(
      `[${options.logPrefix}] dataView 输入已降级为遗留兼容入口；优先改用 dataKey + PAGE_DATASET。`
    )
  }, { immediate: true })

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