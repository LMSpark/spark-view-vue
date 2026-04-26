import { computed, shallowReactive, watch } from 'vue'
import { useSparkPageComponent } from '../../internal'
import { getSparkNodeChildren, type SparkNode } from '../../internal'
import type { DataView, IDataSource } from '@spark-view/spark-data'
import { PAGE_SERVICE } from '../../internal'
import { PAGE_DATASET, DATA_SOURCE, MODULE_CONTEXT } from '../../internal'
import type { IDataRow } from '@spark-view/spark-data'
import { useContainerGrid } from '../layout/useContainerGrid'
import { useContainerDataSource, useContainerDataSourceEffects } from './useContainerDataSource'
import { useContainerModuleContext } from './useContainerModuleContext'
import { useContainerToolbar } from '../layout/useContainerToolbar'
import type { ToolbarNode } from '../non-data-components/RendererToolbar.types'
import { createCurrentRowScope } from '../support/scopeFactories'
import { syncReactiveRow } from '../../support/row-mirror-sync'

interface FormDetailContainerProps extends SparkNode {
  dataKey: string | undefined
  dataSource?: DataView
  toolbar?: ToolbarNode
  gridColumns: number | undefined
  gridGap: number | string | undefined
  gridAutoRows: string | undefined
}

type DataSourceEventName = 'currentRowChanged' | 'selectedRowsChanged' | 'rowsChanged'

interface DataSourceEventBus {
  on(event: DataSourceEventName, handler: () => void): void
  off(event: DataSourceEventName, handler: () => void): void
}

function resolveDataSourceEventBus(dataSource: IDataSource | null): DataSourceEventBus | null {
  if (!dataSource) return null
  const events = (dataSource as { events?: unknown }).events
  if (events === null || events === undefined || typeof events !== 'object') return null
  const on = (events as { on?: unknown }).on
  const off = (events as { off?: unknown }).off
  if (typeof on !== 'function' || typeof off !== 'function') return null
  return events as DataSourceEventBus
}

export function useFormDetailContainer(
  props: FormDetailContainerProps,
  containerType: 'r-form' | 'r-detail',
) {
  const effectiveDataKey = computed(() => props.dataKey)

  // 工具栏优先通过 props.toolbar 输入；
  // 此处 children 作为内容区输入；文本子节点仍合法，因此先保留原始 children，
  // 交给 getSparkNodeChildren() 在布局层按需收窄为结构节点。
  const contentChildren = computed(() => props.children ?? [])

  const { gridChildren, gridStyle, getChildGridStyle } = useContainerGrid({
    children: computed(() => getSparkNodeChildren(contentChildren.value)),
    columns: computed(() => props.gridColumns ?? 24),
    gap: computed(() => props.gridGap ?? 0),
    autoRows: computed(() => props.gridAutoRows ?? 'minmax(32px, auto)'),
  })

  const logPrefix = containerType === 'r-form' ? 'RendererForm' : 'RendererDetail'

  const { sparkConsume, sparkProvide, logger, registerApi } = useSparkPageComponent(props)
  const pageDataSet = sparkConsume(PAGE_DATASET)
  const pageService = sparkConsume(PAGE_SERVICE)
  const moduleContext = useContainerModuleContext(sparkConsume(MODULE_CONTEXT))

  const { resolvedDataSource: resolvedView, modelPermission } = useContainerDataSource<DataView>({
    externalDataSource: computed(() => props.dataSource),
    dataKey: effectiveDataKey,
    pageDataSet,
    mapView: view => view,
  })

  useContainerDataSourceEffects({
    resolvedDataSource: resolvedView,
    provideDataSource: (view: DataView) => sparkProvide(DATA_SOURCE, view),
    logger,
    logPrefix,
  })

  const resolvedSource = computed<IDataSource | null>(() => resolvedView.value as IDataSource | null)
  const contextData = shallowReactive<IDataRow>({})
  let prevRow: unknown = Symbol('initial')

  watch(
    () => resolvedSource.value?.currentRow,
    (row) => {
      if (row === prevRow) return
      prevRow = row

      syncReactiveRow(contextData, row)
    },
    { immediate: true },
  )

  watch(
    resolvedSource,
    (source, _prev, onCleanup) => {
      const events = resolveDataSourceEventBus(source)
      if (!events) return

      const syncCurrentRow = () => {
        syncReactiveRow(contextData, source?.currentRow)
      }

      events.on('currentRowChanged', syncCurrentRow)
      events.on('rowsChanged', syncCurrentRow)

      onCleanup(() => {
        events.off('currentRowChanged', syncCurrentRow)
        events.off('rowsChanged', syncCurrentRow)
      })
    },
    { immediate: true },
  )

  const {
    toolbarPositionValue,
    toolbarClassValue,
    visibleToolbarConfigs,
    showToolbar,
  } = useContainerToolbar({
    toolbar: computed(() => getSparkNodeChildren(props.toolbar?.children)),
    toolbarPosition: computed(() => props.toolbar?.props?.position),
    toolbarClass: computed(() => props.toolbar?.props?.class),
    modelPermission,
    dataSource: computed(() => resolvedView.value),
  })

  function getDefaultScope() {
    return createCurrentRowScope({
      dataSource: resolvedView.value,
      modelPermission: modelPermission.value,
      moduleContext: moduleContext.value,
      row: contextData,
      model: contextData,
    })
  }

  return {
    registerApi,
    logger,
    pageService,
    resolvedView,
    contextData,
    gridChildren,
    gridStyle,
    getChildGridStyle,
    toolbarPositionValue,
    toolbarClassValue,
    visibleToolbarConfigs,
    showToolbar,
    getDefaultScope,
  }
}
