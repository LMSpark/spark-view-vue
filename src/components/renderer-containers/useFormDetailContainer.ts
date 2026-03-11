import { computed, useSlots } from 'vue'
import { useSparkComponent } from '@spark-view/spark-component'
import type { ComponentConfig } from '@spark-view/spark-component'
import type { DataView, IDataSource } from '@spark-view/spark-data'
import { PAGE_DATASET, DATA_SOURCE } from '@spark-view/spark-component'
import { FIELD_CONTEXT, CONTEXT_DATA } from '@spark-view/spark-component'
import { useContainerInput } from './useContainerInput'
import { useContainerGrid } from './useContainerGrid'
import { useContainerDataSource } from './useContainerDataSource'
import { useContainerContextData } from './useContainerContextData'
import { useContainerToolbar } from './useContainerToolbar'
import type { ToolbarPosition } from './useContainerToolbar'
import { createCurrentRowSlotScope } from './useContainerSlotScopes'

// ── 类型定义 ──────────────────────────────────────────────────────────────────

interface FormDetailContainerProps {
  config: ComponentConfig | undefined
  dataKey: string | undefined
  sparkChildren: ComponentConfig[] | undefined
  dataView: DataView | undefined
  toolbar: ComponentConfig[] | undefined
  toolbarPosition: ToolbarPosition | undefined
  toolbarClass: string | undefined
  gridColumns: number | undefined
  gridGap: number | string | undefined
  gridAutoRows: string | undefined
}

// ── 组合式函数 ───────────────────────────────────────────────────────────────

/**
 * RendererForm 与 RendererDetail 的共享初始化逻辑。
 *
 * 两者仅在模板包装元素（`<el-form>` vs `<div>`）和 FIELD_CONTEXT 值
 * （`'form'` vs `'detail'`）上有差异，数据解析、工具栏、上下文注入完全一致。
 */
export function useFormDetailContainer(
  props: FormDetailContainerProps,
  fieldContext: 'form' | 'detail',
) {
  const slots = useSlots()

  // ── 输入解析 ──────────────────────────────────────────────────────────────

  const { effectiveDataKey, configChildren } = useContainerInput({
    config: computed(() => props.config),
    dataKey: computed(() => props.dataKey),
    sparkChildren: computed(() => props.sparkChildren),
  })

  const { gridChildren, gridStyle, getChildGridStyle } = useContainerGrid({
    children: configChildren,
    columns: computed(() => props.gridColumns ?? 24),
    gap: computed(() => props.gridGap ?? 0),
    autoRows: computed(() => props.gridAutoRows ?? 'minmax(32px, auto)'),
  })

  // ── SPARK 上下文与数据源 ─────────────────────────────────────────────────

  const containerType = fieldContext === 'form' ? 'r-form' : 'r-detail'
  const logPrefix = fieldContext === 'form' ? 'RendererForm' : 'RendererDetail'

  const { consume, provide: sparkProvide, logger } = useSparkComponent(
    props.config ?? { type: containerType }
  )
  const pageDataSet = consume(PAGE_DATASET)

  const { resolvedDataSource: resolvedView } = useContainerDataSource<DataView>({
    dataKey: effectiveDataKey,
    pageDataSet,
    fallbackSource: computed(() => props.dataView ?? null),
    mapView: view => view,
    provideDataSource: view => sparkProvide(DATA_SOURCE, view),
    logger,
    logPrefix,
  })

  const resolvedSource = computed<IDataSource | null>(() => resolvedView.value as IDataSource | null)
  const { contextData, modelPermission } = useContainerContextData({ source: resolvedSource })

  // ── 工具栏 ──────────────────────────────────────────────────────────────

  const {
    toolbarPositionValue,
    toolbarClassValue,
    visibleToolbarConfigs,
    showToolbar,
  } = useContainerToolbar({
    config: computed(() => props.config),
    toolbar: computed(() => props.toolbar),
    toolbarPosition: computed(() => props.toolbarPosition),
    toolbarClass: computed(() => props.toolbarClass),
    modelPermission,
    slots,
  })

  // ── 能力提供 ──────────────────────────────────────────────────────────────

  sparkProvide(FIELD_CONTEXT, fieldContext)
  sparkProvide(CONTEXT_DATA, contextData)

  // ── 槽位作用域 ────────────────────────────────────────────────────────────

  function getToolbarSlotScope() {
    return createCurrentRowSlotScope({
      dataSource: resolvedView.value,
      modelPermission: modelPermission.value,
      row: contextData,
      model: contextData,
    })
  }

  function getDefaultSlotScope() {
    return createCurrentRowSlotScope({
      dataSource: resolvedView.value,
      modelPermission: modelPermission.value,
      row: contextData,
      model: contextData,
    })
  }

  return {
    contextData,
    gridChildren,
    gridStyle,
    getChildGridStyle,
    toolbarPositionValue,
    toolbarClassValue,
    visibleToolbarConfigs,
    showToolbar,
    getToolbarSlotScope,
    getDefaultSlotScope,
  }
}
