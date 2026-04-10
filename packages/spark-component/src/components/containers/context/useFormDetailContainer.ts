import { computed } from 'vue'
import { useSparkPageComponent } from '../../internal'
import { getSparkNodeChildren, type SparkNode } from '../../internal'
import type { DataView, IDataSource } from '@spark-view/spark-data'
import { PAGE_SERVICE } from '@spark-view/spark-utils'
import { PAGE_DATASET, DATA_SOURCE } from '../../internal'
import { DATA_ROW } from '../../internal'
import { useContainerGrid } from '../layout/useContainerGrid'
import { useContainerDataSource, useContainerDataSourceEffects } from '../useContainerDataSource'
import { useContainerContextData } from './useContainerContextData'
import { useContainerToolbar, type ToolbarPosition } from '../layout/useContainerToolbar'
import { createCurrentRowSlotScope } from '../slotScopeFactories'

interface FormDetailContainerProps extends SparkNode {
  dataKey: string | undefined
  children?: SparkNode[]
  toolbar?: SparkNode
  gridColumns: number | undefined
  gridGap: number | string | undefined
  gridAutoRows: string | undefined
}

export function useFormDetailContainer(
  props: FormDetailContainerProps,
  containerType: 'r-form' | 'r-detail',
) {
  const effectiveDataKey = computed(() => props.dataKey)

  // Dock 节点已由绑定层从 children 提升为 props（toolbar），
  // 此处 children 仅包含内容子节点。
  const contentChildren = computed(() => props.children ?? [])

  const { gridChildren, gridStyle, getChildGridStyle } = useContainerGrid({
    children: computed(() => getSparkNodeChildren(contentChildren.value)),
    columns: computed(() => props.gridColumns ?? 24),
    gap: computed(() => props.gridGap ?? 0),
    autoRows: computed(() => props.gridAutoRows ?? 'minmax(32px, auto)'),
  })

  const logPrefix = containerType === 'r-form' ? 'RendererForm' : 'RendererDetail'

  const { context, sparkConsume, sparkProvide, logger, registerApi } = useSparkPageComponent(props)
  const pageDataSet = sparkConsume(PAGE_DATASET)
  const pageService = sparkConsume(PAGE_SERVICE)

  const { resolvedDataSource: resolvedView, modelPermission } = useContainerDataSource<DataView>({
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
  const { contextData } = useContainerContextData({ source: resolvedSource })

  const {
    toolbarPositionValue,
    toolbarClassValue,
    visibleToolbarConfigs,
    showToolbar,
  } = useContainerToolbar({
    toolbar: computed(() => getSparkNodeChildren(props.toolbar?.children)),
    toolbarPosition: computed(() => props.toolbar?.props?.['position'] as ToolbarPosition | undefined),
    toolbarClass: computed(() => props.toolbar?.props?.['class'] as string | undefined),
    modelPermission,
    dataSource: computed(() => resolvedView.value),
  })

  sparkProvide(DATA_ROW, contextData)

  function getDefaultSlotScope() {
    return createCurrentRowSlotScope({
      dataSource: resolvedView.value,
      modelPermission: modelPermission.value,
      row: contextData,
      model: contextData,
    })
  }

  return {
    registerApi,
    context,
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
    getDefaultSlotScope,
  }
}