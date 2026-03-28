import { computed } from 'vue'
import { useSparkComponent } from '../../internal'
import { getDockedChildren, type SparkNode } from '../../internal'
import type { DataView, IDataSource } from '@spark-view/spark-data'
import { PAGE_SERVICE } from '@spark-view/spark-utils'
import { PAGE_DATASET, DATA_SOURCE } from '../../internal'
import { CONTEXT_DATA, FIELD_CONTEXT } from '../../internal'
import type { ContainerDocks } from '../../../core/types'
import { useContainerGrid } from '../layout/useContainerGrid'
import { useContainerDataSource, useContainerDataSourceEffects } from '../data/useContainerDataSource'
import { useContainerContextData } from './useContainerContextData'
import { useContainerToolbar } from '../layout/useContainerToolbar'
import { createCurrentRowSlotScope } from '../slotScopeFactories'

interface FormDetailContainerProps extends SparkNode {
  dataKey: string | undefined
  children?: SparkNode[]
  docks?: ContainerDocks
  gridColumns: number | undefined
  gridGap: number | string | undefined
  gridAutoRows: string | undefined
}

export function useFormDetailContainer(
  props: FormDetailContainerProps,
  fieldContext: 'form' | 'detail',
) {
  const effectiveDataKey = computed(() => props.dataKey)
  const configChildren = computed<SparkNode[]>(() => {
    const c = props.children
    return Array.isArray(c) && c.length > 0 ? c : []
  })

  const dockedToolbar = computed(() => getDockedChildren(configChildren.value, 'toolbar'))

  const { gridChildren, gridStyle, getChildGridStyle } = useContainerGrid({
    children: computed(() => getDockedChildren(configChildren.value)),
    columns: computed(() => props.gridColumns ?? 24),
    gap: computed(() => props.gridGap ?? 0),
    autoRows: computed(() => props.gridAutoRows ?? 'minmax(32px, auto)'),
  })

  const logPrefix = fieldContext === 'form' ? 'RendererForm' : 'RendererDetail'

  const { sparkConsume, sparkProvide, logger, registerApi } = useSparkComponent(props)
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
    toolbar: computed(() => dockedToolbar.value),
    toolbarPosition: computed(() => props.docks?.toolbar?.position),
    toolbarClass: computed(() => props.docks?.toolbar?.class),
    modelPermission,
  })

  sparkProvide(CONTEXT_DATA, contextData)
  sparkProvide(FIELD_CONTEXT, fieldContext)

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