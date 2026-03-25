import { computed } from 'vue'
import { useSparkComponent } from '../_pkg'
import { getDockedChildren, type SparkNode } from '../_pkg'
import type { DataView, IDataSource } from '@spark-view/spark-data'
import { PAGE_DATASET, DATA_SOURCE } from '../_pkg'
import { CONTEXT_DATA } from '../_pkg'
import type { ContainerDocks } from '../../types'
import { useContainerGrid } from './useContainerGrid'
import { useContainerDataSource, useContainerDataSourceEffects } from './useContainerDataSource'
import { useContainerContextData } from './useContainerContextData'
import { useContainerToolbar } from './useContainerToolbar'
import { createCurrentRowSlotScope } from './slotScopeFactories'

// ── 类型定义 ──────────────────────────────────────────────────────────────────

interface FormDetailContainerProps extends SparkNode {
  dataKey: string | undefined
  children?: SparkNode[]
  docks?: ContainerDocks
  gridColumns: number | undefined
  gridGap: number | string | undefined
  gridAutoRows: string | undefined
}

// ── 组合式函数 ───────────────────────────────────────────────────────────────

/**
 * RendererForm 与 RendererDetail 的共享初始化逻辑。
 *
 * 两者仅在模板包装元素（`<el-form>` vs `<div>`）和语义类型
 * （`'r-form'` vs `'r-detail'`）上有差异，数据解析、工具栏、上下文注入完全一致。
 */
export function useFormDetailContainer(
  props: FormDetailContainerProps,
  fieldContext: 'form' | 'detail',
) {
  // ── 输入解析 ──────────────────────────────────────────────────────────

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

  // ── SPARK 上下文与数据源 ─────────────────────────────────────────────────

  const logPrefix = fieldContext === 'form' ? 'RendererForm' : 'RendererDetail'
  const componentType = props.type

  const { sparkConsume, sparkProvide, logger, registerApi } = useSparkComponent({
    type: componentType,
    ...(props.id !== undefined ? { id: props.id } : {}),
    ...(props.dock !== undefined ? { dock: props.dock } : {}),
    ...(props.order !== undefined ? { order: props.order } : {}),
    ...(props.children !== undefined ? { children: props.children } : {}),
  })
  const pageDataSet = sparkConsume(PAGE_DATASET)

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

  // ── 工具栏 ──────────────────────────────────────────────────────────────

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

  // ── 能力提供 ──────────────────────────────────────────────────────────────

  sparkProvide(CONTEXT_DATA, contextData)

  // ── 槽位作用域 ────────────────────────────────────────────────────────────

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
    getDefaultSlotScope,
  }
}
