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
import { useContainerToolbar } from './useContainerToolbar'
import { useContainerModuleContext } from './useContainerModuleContext'
import type { RToolbarProps } from '../non-data-components/RendererToolbar.types'
import { createCurrentRowScope } from '../support/scopeFactories'
import { syncReactiveRow } from '../../support/row-mirror-sync'

/**
 * 表单/详情容器的输入约束。
 *
 * 说明：
 * - `dataKey`：优先用于从 PAGE_DATASET 解析 DataView。
 * - `dataSource`：可显式注入，优先级高于 dataKey。
 * - `toolbar`：结构化工具栏配置，children 内为动作节点。
 * - `grid*`：内容区网格参数，统一交给 useContainerGrid 处理。
 */
interface FormDetailContainerProps extends SparkNode {
  dataKey: string | undefined
  dataSource?: DataView
  toolbar?: RToolbarProps
  gridColumns: number | undefined
  gridGap: number | string | undefined
  gridAutoRows: string | undefined
}

/**
 * useFormDetailContainer
 *
 * 目标：
 * 1. 统一 form/detail 的 DataView 解析与能力注入。
 * 2. 维护 currentRow -> contextData 的响应式镜像。
 * 3. 提供工具栏展示态与默认作用域生成能力。
 */
export function useFormDetailContainer(
  props: FormDetailContainerProps,
  containerType: 'r-form' | 'r-detail',
) {
  // ==========================================================================
  // 分区 1：布局输入与内容区网格
  // ==========================================================================

  // children 作为内容区输入；文本子节点仍合法，统一交给 getSparkNodeChildren 在布局层收窄。
  const contentChildren = computed(() => props.children ?? [])

  // useContainerGrid 负责网格计算与子节点位置分发。
  // 这里仅提供归一化参数，不在容器中重复网格逻辑。
  const { gridChildren, gridStyle, getChildGridStyle } = useContainerGrid({
    children: computed(() => getSparkNodeChildren(contentChildren.value)),
    columns: computed(() => props.gridColumns ?? 24),
    gap: computed(() => props.gridGap ?? 0),
    autoRows: computed(() => props.gridAutoRows ?? 'minmax(32px, auto)'),
  })

  // ==========================================================================
  // 分区 2：能力接入与 DataView 解析
  // ==========================================================================

  // 统一日志前缀：便于在控制台快速区分 form/detail 来源。
  const logPrefix = containerType === 'r-form' ? 'RendererForm' : 'RendererDetail'

  // 页面级能力入口（consume/provide/logger/registerApi）。
  const { sparkConsume, sparkProvide, logger, registerApi } = useSparkPageComponent(props)

  // 页面服务能力：供零代码动作或外层逻辑复用。
  const pageService = sparkConsume(PAGE_SERVICE)

  // 模块上下文能力：用于作用域构建（表达式/动作按模块运行）。
  const moduleContext = useContainerModuleContext(sparkConsume(MODULE_CONTEXT))

  // 统一数据源解析：
  // - externalDataSource 优先（显式注入）
  // - 再按 dataKey 解析
  // - 解析成功后自动向下 provide(DATA_SOURCE)
  // - 由公共层负责 autoload 与错误日志
  const { resolvedDataSource: resolvedView, modelPermission } = useContainerDataSource<DataView>({
    externalDataSource: toRef(props, 'dataSource'),
    dataKey: toRef(props, 'dataKey'),
    sparkConsume,
    mapView: view => view,
    provideDataSource: (view: DataView) => sparkProvide(DATA_SOURCE, view),
    logger,
    logPrefix,
  })

  // DataView 状态投影层：容器不直接读 resolvedView.value?.currentRow。
  const { currentRow } = useDataViewState(resolvedView)

  // ==========================================================================
  // 分区 3：currentRow -> contextData 同步镜像
  // ==========================================================================

  // contextData 是提供给作用域/模板消费的稳定对象引用。
  // 通过“原地同步字段”保持响应式依赖稳定，避免整对象替换导致下游抖动。
  const contextData = shallowReactive<IDataRow>({})

  // watch 去重哨兵：避免同一引用反复同步造成无意义触发。
  let prevRow: unknown = Symbol('initial')

  // 主同步通道：基于 currentRow 投影，同步到 contextData。
  watch(
    currentRow,
    (row) => {
      if (row === prevRow) return
      prevRow = row

      syncReactiveRow(contextData, row)
    },
    { immediate: true },
  )

  // 事件桥接兜底：
  // - currentRowChanged：直接按事件行同步
  // - rowsChanged：当行集合重建时，以最新 currentRow 重算镜像
  useDataViewEventBridge({
    resolvedView,
    onCurrentRowChanged: ({ row }) => {
      syncReactiveRow(contextData, row)
    },
    onRowsChanged: () => {
      syncReactiveRow(contextData, currentRow.value)
    },
  })

  // ==========================================================================
  // 分区 4：工具栏视图态投影
  // ==========================================================================

  // 工具栏投影统一复用公共层，避免容器重复声明三联体。
  const {
    visibleToolbarConfigs,
    toolbarPositionValue,
    toolbarClassValue,
    showToolbar,
  } = useContainerToolbar({
    toolbarNode: () => props.toolbar,
  })

  // ==========================================================================
  // 分区 5：作用域构建
  // ==========================================================================

  // scope 三元组基础：统一 dataSource / modelPermission / moduleContext 来源。
  function scopeBase() {
    return {
      dataSource: resolvedView.value,
      modelPermission: modelPermission.value,
      moduleContext: moduleContext.value,
    }
  }

  // 默认作用域：以 contextData 作为 row/model 暴露给下游动作与表达式。
  function getDefaultScope() {
    return createCurrentRowScope({
      ...scopeBase(),
      row: contextData,
      model: contextData,
    })
  }

  // ==========================================================================
  // 分区 6：对外输出
  // ==========================================================================
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
