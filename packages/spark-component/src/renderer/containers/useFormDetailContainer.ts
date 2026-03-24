import { computed, useSlots, type ComputedRef } from 'vue'
import { useSparkComponent } from '../_pkg'
import type { SparkNode } from '../_pkg'
import type { DataView, IDataSource } from '@spark-view/spark-data'
import { PAGE_DATASET, DATA_SOURCE } from '../_pkg'
import { FIELD_CONTEXT, CONTEXT_DATA } from '../_pkg'
import { useContainerGrid } from './useContainerGrid'
import { useContainerDataSource } from './useContainerDataSource'
import { useContainerContextData } from './useContainerContextData'
import { useContainerToolbar } from './useContainerToolbar'
import type { ToolbarPosition } from './useContainerToolbar'
import { createCurrentRowSlotScope } from './slotScopeFactories'

// ── 类型定义 ──────────────────────────────────────────────────────────────────

interface FormDetailContainerProps {
  dataKey: string | undefined
  children: SparkNode[] | undefined
  fallbackDataView?: ComputedRef<DataView | undefined>
  toolbar: SparkNode[] | undefined
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

  // ── 输入解析 ──────────────────────────────────────────────────────────

  const effectiveDataKey = computed(() => props.dataKey)
  const configChildren = computed<SparkNode[]>(() => {
    const c = props.children
    return Array.isArray(c) && c.length > 0 ? c : []
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

  const { sparkConsume, sparkProvide, logger, registerApi } = useSparkComponent(
    { type: containerType }
  )
  const pageDataSet = sparkConsume(PAGE_DATASET)

  const { resolvedDataSource: resolvedView, modelPermission } = useContainerDataSource<DataView>({
    dataKey: effectiveDataKey,
    pageDataSet,
    fallbackSource: computed(() => props.fallbackDataView?.value ?? null),
    mapView: view => view,
    provideDataSource: view => sparkProvide(DATA_SOURCE, view),
    logger,
    logPrefix,
  })

  const resolvedSource = computed<IDataSource | null>(() => resolvedView.value as IDataSource | null)
  const { contextData } = useContainerContextData({ source: resolvedSource })

  // ── 工具栏 ──────────────────────────────────────────────────────────────

  const {
    toolbarPositionValue,
    toolbarClassValue,
    visibleToolbarConfigs,
    showToolbar,
  } = useContainerToolbar({
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
    registerApi,
    resolvedView,
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
