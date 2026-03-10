import { computed, onMounted, watch } from 'vue'
import type { ComputedRef } from 'vue'
import { parseDataKey } from '@spark-view/spark-data'
import type { DataView, IDataSet } from '@spark-view/spark-data'

// ── 类型定义 ──────────────────────────────────────────────────────────────────

interface LoggerLike {
  error(message: string, error?: unknown): void
}

interface UseContainerDataSourceOptions<TSource> {
  dataKey: ComputedRef<string | undefined>
  pageDataSet: IDataSet | null
  fallbackSource: ComputedRef<TSource | null | undefined>
  mapView: (view: DataView) => TSource
  provideDataSource?: (source: TSource) => void
  logger: LoggerLike
  logPrefix: string
}

// ── 组合式函数 ───────────────────────────────────────────────────────────────

export function useContainerDataSource<TSource>(options: UseContainerDataSourceOptions<TSource>) {
  // 优先根据 DataKey 从页面级 DataSet 解析数据源，失败时再回退到显式传入的 source。
  const resolvedDataSource = computed<TSource | null>(() => {
    if (options.dataKey.value !== undefined && options.pageDataSet !== null) {
      const descriptor = parseDataKey(options.dataKey.value)
      if (descriptor) {
        const view = options.pageDataSet.getView(descriptor.tableName, descriptor.viewId) as DataView | null
        if (view) return options.mapView(view)
      }
    }
    return options.fallbackSource.value ?? null
  })

  // 对接 DataView 的容器可以在这里统一触发首次 requestData()。
  function tryAutoLoad(source: TSource | null): void {
    if (source === null) return
    const maybeView = source as DataView
    if (typeof maybeView.requestData !== 'function') return
    if (!maybeView.dataTable?.api) return

    void maybeView.requestData().catch((error: unknown) => {
      options.logger.error(`${options.logPrefix}: requestData() 失败`, error)
    })
  }

  // 当解析出的数据源变化时，同步更新 SPARK 能力暴露。
  watch(resolvedDataSource, (source) => {
    if (source === null) return
    options.provideDataSource?.(source)
    tryAutoLoad(source)
  }, { immediate: true })

  // mounted 后再补一次自动加载，覆盖 setup 期间尚未就绪的场景。
  onMounted(() => tryAutoLoad(resolvedDataSource.value))

  return {
    resolvedDataSource,
  }
}