import { computed, shallowReactive, toRef, watch } from 'vue'
import { useSparkPageComponent } from '../../internal'
import { getSparkNodeChildren, type SparkNode } from '../../internal'
import type { DataView } from '@spark-view/spark-data'
import { PAGE_SERVICE } from '../../internal'
import { DATA_SOURCE, MODULE_CONTEXT } from '../../internal'
import type { IDataRow } from '@spark-view/spark-data'
import { useContainerGrid } from '../layout/useContainerGrid'
import { useContainerDataSource } from './useContainerDataSource'
import { useDataViewEventBridge } from './useDataViewEventBridge'
import { useDataViewState } from '../data-components/useDataViewState'
import { useContainerModuleContext } from './useContainerModuleContext'
import type { RToolbarProps } from '../non-data-components/RendererToolbar.types'
import { createCurrentRowScope } from '../support/scopeFactories'
import { syncReactiveRow } from '../../support/row-mirror-sync'
import type { ToolbarPosition } from '../layout'

interface FormDetailContainerProps extends SparkNode {
  dataKey: string | undefined
  dataSource?: DataView
  toolbar?: RToolbarProps
  gridColumns: number | undefined
  gridGap: number | string | undefined
  gridAutoRows: string | undefined
}

export function useFormDetailContainer(
  props: FormDetailContainerProps,
  containerType: 'r-form' | 'r-detail',
) {
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
  const pageService = sparkConsume(PAGE_SERVICE)
  const moduleContext = useContainerModuleContext(sparkConsume(MODULE_CONTEXT))

  const { resolvedDataSource: resolvedView, modelPermission } = useContainerDataSource<DataView>({
    externalDataSource: toRef(props, 'dataSource'),
    dataKey: toRef(props, 'dataKey'),
    sparkConsume,
    mapView: view => view,
    provideDataSource: (view: DataView) => sparkProvide(DATA_SOURCE, view),
    logger,
    logPrefix,
  })

  const { currentRow } = useDataViewState(resolvedView)

  const contextData = shallowReactive<IDataRow>({})
  let prevRow: unknown = Symbol('initial')

  watch(
    currentRow,
    (row) => {
      if (row === prevRow) return
      prevRow = row

      syncReactiveRow(contextData, row)
    },
    { immediate: true },
  )

  useDataViewEventBridge({
    resolvedView,
    onCurrentRowChanged: ({ row }) => {
      syncReactiveRow(contextData, row)
    },
    onRowsChanged: () => {
      syncReactiveRow(contextData, currentRow.value)
    },
  })

  const visibleToolbarConfigs = computed(() => getSparkNodeChildren(props.toolbar?.children))
  const toolbarPositionValue = computed<ToolbarPosition>(() => {
    const position = props.toolbar?.position
    return position === 'top' || position === 'bottom' || position === 'left' || position === 'right'
      ? position
      : 'top'
  })
  const toolbarClassValue = computed(() => {
    const className = props.toolbar?.class
    return typeof className === 'string' ? className : 'renderer-toolbar-default'
  })
  const showToolbar = computed(() => visibleToolbarConfigs.value.length > 0)

  function scopeBase() {
    return {
      dataSource: resolvedView.value,
      modelPermission: modelPermission.value,
      moduleContext: moduleContext.value,
    }
  }

  function getDefaultScope() {
    return createCurrentRowScope({
      ...scopeBase(),
      row: contextData,
      model: contextData,
    })
  }

  return {
    registerApi,
    sparkProvide,
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
