<template>
  <div :class="['renderer-table-layout', `renderer-table-layout--${toolbarPositionValue}`]">
    <!-- 工具栏 -->
    <SparkComponentRenderer v-if="showToolbar" :config="projectedToolbarRendererConfig!" />

    <!-- 过滤区 -->
    <RendererTableFilterPanel
      :visible="hasFilters"
      :rows="resolvedView?.rows ?? []"
      :filter-class="filterClassValue"
      :filter-model="filterModel"
      :filter-configs="filterConfigs"
      :active-filter-count="activeFilterCount"
      :collapsible="filterCollapsibleValue"
      :collapsed="filtersCollapsed"
      :grid-columns="filterGridColumnsValue"
      :grid-gap="filterGridGapValue"
      :grid-auto-rows="filterGridAutoRowsValue"
      :auto-fit-min-width="filterAutoFitMinWidthValue"
      :item-span="filterItemSpanValue"
      :action-span="filterActionSpanValue"
      :on-search="handleFilterSearch"
      :on-reset="handleFilterReset"
      :on-toggle-collapsed="toggleFiltersCollapsed"
    />

    <!-- 表格主体 -->
    <div class="renderer-table-main">
      <el-table
        ref="nativeTableRef"
        :data="tableData"
        
        v-bind="elTableProps"
        @current-change="handleCurrentChange"
        @row-click="handleRowClick"
        @selection-change="handleSelectionChange"
        @sort-change="handleSortChange"
      >
        <!--
          列区必须在编译后直接成为 el-table 的子级。
          这里直接串联三类列内容，不再引入额外透明包装层：
          1. 配置驱动列（props.children）
          2. 模板驱动列（默认 slot）
          3. 行操作列（左右）
        -->
        <!-- 行操作列（左） -->
        <el-table-column
          v-if="showRowActionsLeftVisible"
          v-bind="rowActionColumnAttrs"
        >
          <template #default="scope">
            <div class="renderer-table-row-actions" :style="rowActionsContainerStyle">
              <SparkComponentRenderer :config="createScopedRowActionsToolbarConfig(scope)" />
            </div>
          </template>
        </el-table-column>

        <!--
          主数据列分发：
          1. 普通列节点：仍由 SparkComponentRenderer 直接渲染。
          2. r-row-fragment：由 table 宿主投影成 el-table-column，确保列节点层级正确。
             说明：这是本次架构调整后的关键点，RowFragment 本体不再直接声明 el-table-column。
        -->
        <template
          v-for="(child, index) in renderedContentChildNodes"
          :key="nodeId(child) ?? `r-table-child-${index}`"
        >
          <el-table-column
            v-if="isRowFragmentNode(child)"
            :label="resolveRowFragmentLabel(child)"
            :width="resolveRowFragmentWidth(child)"
            :min-width="resolveRowFragmentMinWidth(child)"
            :align="resolveRowFragmentAlign(child)"
            :header-align="resolveRowFragmentHeaderAlign(child)"
            :class-name="resolveRowFragmentClass(child)"
          >
            <template #default="scope">
              <RendererHostScope :row="(scope.row as IDataRow)">
                <SparkComponentRenderer
                  v-for="(fragmentChild, fragmentIndex) in resolveRowFragmentChildren(child)"
                  :key="nodeId(fragmentChild) ?? `r-table-row-fragment-${fragmentIndex}`"
                  :config="fragmentChild"
                />
              </RendererHostScope>
            </template>
          </el-table-column>

          <SparkComponentRenderer
            v-else
            :config="child"
          />
        </template>

        <!-- 模板驱动补充列：支持直接手写 el-table-column -->
        <slot />

        <!-- 行操作列（右） -->
        <el-table-column
          v-if="showRowActionsRightVisible"
          v-bind="rowActionColumnAttrs"
        >
          <template #default="scope">
            <div class="renderer-table-row-actions" :style="rowActionsContainerStyle">
              <SparkComponentRenderer :config="createScopedRowActionsToolbarConfig(scope)" />
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @skill r-table
 * @description 数据表格容器，支持工具栏/筛选区/行操作等区域，自动同步当前行和选中行状态。
 * @category container
 * @binding datakey-driven
 * @provides DATA_SOURCE
 * @consumes PAGE_DATASET
 * @consumes PAGE_SERVICE
 * @notes children 仅放 r-* 字段组件做列，禁止直接声明底层列节点
 * @notes 结构化区域使用 props.toolbar / props.filter / props.actions，不再使用 dock 分流
 * @notes highlightCurrentRow 必须显式声明才生效
 * @notes 提示词模板（可提取）：默认包含 toolbar/filter/actions 三块，具体动作模板见对应 props 注释。
 * @notes 提示词模板（数据绑定）：table dataKey 使用 table@view@rows；统计值优先使用 display 组件 + dataKey（summaryRow/currentRow）而不是 children 文本插值。
 */
/**
 * RendererTable - 表格容器组件
 *
 * 双模式：
 * 1. 配置驱动：列结构直接来自 props.children，统一走 SparkComponentRenderer。
 * 2. 模板驱动：保留默认 slot，允许直接手写 el-table-column。
 *
 * 结构约定：
 * - 工具栏/筛选区/行操作优先使用结构化 props（toolbar/filter/actions）。
 * - children 中结构节点只按 node.props 读取配置，并在内容区过滤这些结构节点。
 */
import { computed, nextTick, ref, watch, type CSSProperties } from 'vue'
import {
  useSparkPageComponent, SparkComponentRenderer,
  getSparkNodeChildren, nodeId, type SparkNode,
  PAGE_DATASET, DATA_SOURCE, PAGE_SERVICE,
  ACTION_CAPABILITY,
  createActionCapability,
} from '../../../internal'
import type { RTableProps } from './RendererTable.props'
import type { IDataRow, DataView } from '@spark-view/spark-data'
import { createRendererTableZeroCode, type NativeTableLike } from './zero-code'
import { useRendererTableViewState } from './view-state'
import { useContainerDataSource, useContainerDataSourceEffects } from '../../composables/useContainerDataSource'
import type { ToolbarPosition } from '../../layout/toolbar-position'
import { useContainerActionVisibility } from '../../layout/useContainerActionVisibility'
import type { FilterNode } from '../../RendererFilter.types'
import type { ActionsAlign, ActionsFixed, ActionsPosition } from '../../support/RendererActions.types'
import { useTableFilters } from '../../layout/useTableFilters'
import { resolveCurrentRowPath } from '../../../support/row-selection-path'
import RendererTableFilterPanel from './RendererTableFilterPanel.vue'
import RendererHostScope from '../../support/RendererHostScope.vue'

// ── 基础工具：通用读取与列投影辅助 ────────────────────────────────────────

// ── Props / slots 输入 ───────────────────────────────────────────────────

const props = withDefaults(defineProps<RTableProps>(), {
  type: 'r-table',
})

const STRUCTURAL_CHILD_TYPES = new Set(['r-toolbar', 'r-filter'])

// 共享 props.children 允许文本子节点；表格列区只接受结构节点，局部显式收窄。
const allChildNodes = computed(() => getSparkNodeChildren(props.children))
const contentChildNodes = computed(() => allChildNodes.value.filter(child => !STRUCTURAL_CHILD_TYPES.has(child.type)))
const renderedContentChildNodes = computed(() => contentChildNodes.value.map(normalizeDefaultSortableTableNode))

/** 从结构化 wrapper 节点上读取 props，统一访问 props.toolbar / props.filter / props.actions。 */
function childProp<T>(child: SparkNode | undefined, name: string): T | undefined {
  return child?.props?.[name] as T | undefined
}

function isAutoFilterCandidate(node: SparkNode): boolean {
  if (isRowFragmentNode(node)) return false

  const field = childProp<unknown>(node, 'field')
  if (typeof field !== 'string' || field.trim().length === 0) return false

  const filterable = childProp<unknown>(node, 'filterable')
  return filterable === true
}

// ── row-fragment 宿主投影：将语义节点投影为 el-table-column ───────────────

function isRowFragmentNode(node: SparkNode): boolean {
  return node.type === 'r-row-fragment'
}

function normalizeDefaultSortableTableNode(node: SparkNode): SparkNode {
  if (isRowFragmentNode(node) || node.type === 'r-column-group') return node

  const sourceProps = node.props ?? {}
  if (sourceProps['sortable'] !== undefined) return node

  const field = childProp<unknown>(node, 'field')
    ?? childProp<unknown>(node, 'fieldName')
    ?? childProp<unknown>(node, 'prop')
    ?? childProp<unknown>(node, 'property')
  if (typeof field !== 'string' || field.trim().length === 0) return node

  return {
    ...node,
    props: {
      ...sourceProps,
      sortable: true,
    },
  }
}

function rowFragmentProp(node: SparkNode, key: string): unknown {
  // row-fragment 元属性统一从 node.props 读取，避免在模板中散落字面量访问。
  return (node.props as Record<string, unknown> | undefined)?.[key]
}

function resolveRowFragmentChildren(node: SparkNode): SparkNode[] {
  return getSparkNodeChildren(node.children)
}

function resolveRowFragmentLabel(node: SparkNode): string {
  // 列标题优先级：title > label > 空字符串。
  return String(rowFragmentProp(node, 'title') ?? rowFragmentProp(node, 'label') ?? '')
}

function resolveRowFragmentWidth(node: SparkNode): string | number | undefined {
  // width 仅接受字符串/数字，其他类型直接忽略，避免透传非法值污染底层表格。
  const value = rowFragmentProp(node, 'width')
  return typeof value === 'string' || typeof value === 'number' ? value : undefined
}

function resolveRowFragmentMinWidth(node: SparkNode): string | number | undefined {
  // minWidth 与 width 同步做显式类型收敛。
  const value = rowFragmentProp(node, 'minWidth')
  return typeof value === 'string' || typeof value === 'number' ? value : undefined
}

function resolveRowFragmentAlign(node: SparkNode): string | undefined {
  // 对齐属性保持透传语义，不在此处改写值域。
  const value = rowFragmentProp(node, 'align')
  return typeof value === 'string' ? value : undefined
}

function resolveRowFragmentHeaderAlign(node: SparkNode): string | undefined {
  // 表头对齐优先使用 headerAlign，未配置时回退到 align。
  const headerAlign = rowFragmentProp(node, 'headerAlign')
  if (typeof headerAlign === 'string') return headerAlign

  const align = rowFragmentProp(node, 'align')
  return typeof align === 'string' ? align : undefined
}

function resolveRowFragmentClass(node: SparkNode): string | undefined {
  // class 只接受字符串，防止对象/数组类型误入 class-name。
  const value = rowFragmentProp(node, 'class')
  return typeof value === 'string' ? value : undefined
}

const toolbarNodes = computed(() => allChildNodes.value.filter(child => child.type === 'r-toolbar'))
const toolbarNode = computed(() => props.toolbar ?? toolbarNodes.value[0])
const filterNode = computed(() => props.filter ?? allChildNodes.value.find(child => child.type === 'r-filter'))
const actionsNode = computed(() => props.actions ?? toolbarNodes.value[1])
const explicitFilterChildren = computed(() => getSparkNodeChildren(filterNode.value?.children))
const autoFilterChildren = computed(() => contentChildNodes.value.filter(isAutoFilterCandidate))
const effectiveFilterChildren = computed(() =>
  explicitFilterChildren.value.length > 0
    ? explicitFilterChildren.value
    : autoFilterChildren.value
)
const normalizedFilterNode = computed<FilterNode | undefined>(() => {
  const node = filterNode.value
  if (node?.type !== 'r-filter') return undefined
  return node as FilterNode
})

// ── 基础输入解析：DataKey 与传给 el-table 的显式 tableProps ───────────────

const baseElTableProps = computed<Record<string, unknown>>(() => {
  const raw = props.tableProps ?? {}
  const {
    ...tableProps
  } = raw

  const explicitResizable = tableProps['resizable']
  const resolvedResizable = explicitResizable === true || explicitResizable === false ? explicitResizable : true

  const resolvedBorder = resolvedResizable === true
    ? true
    : (tableProps['border'] ?? true)

  return {
    ...tableProps,
    border: resolvedBorder,
    resizable: resolvedResizable,
  }
})
const effectiveDataKey = computed(() => props.dataKey)

// ── SPARK 上下文与数据源：解析 DataKey → DataView，并向下游提供 DATA_SOURCE ──

const { sparkConsume, sparkProvide, registerApi, logger } = useSparkPageComponent(props)

const pageDataSet = sparkConsume(PAGE_DATASET)
const pageService = sparkConsume(PAGE_SERVICE)

const { resolvedDataSource: resolvedView } = useContainerDataSource<DataView>({
  externalDataSource: computed(() => props.dataSource),
  dataKey: effectiveDataKey,
  pageDataSet,
  mapView: view => view,
})

useContainerDataSourceEffects({
  resolvedDataSource: resolvedView,
  provideDataSource: (view: DataView) => sparkProvide(DATA_SOURCE, view),
  logger,
  logPrefix: 'RendererTable',
})

// ── 工具栏区：读取结构化 toolbar 配置，并向工具栏子树提供内置动作宿主能力 ──

const visibleToolbarConfigs = computed(() => getSparkNodeChildren(toolbarNode.value?.children))
const toolbarPositionValue = computed<ToolbarPosition>(() => {
  const position = childProp<ToolbarPosition>(toolbarNode.value, 'position')
  return position === 'top' || position === 'bottom' || position === 'left' || position === 'right'
    ? position
    : 'top'
})
const toolbarClassValue = computed(() => childProp<string>(toolbarNode.value, 'class') ?? 'renderer-toolbar-default')
const showToolbar = computed(() => visibleToolbarConfigs.value.length > 0)

const toolbarRendererConfig = computed<SparkNode | undefined>(() => {
  if (!showToolbar.value) return undefined

  return {
    type: 'r-toolbar',
    ...(toolbarNode.value?.id !== undefined ? { id: toolbarNode.value.id } : {}),
    props: {
      ...(toolbarNode.value?.props ?? {}),
      class: ['renderer-table-toolbar', toolbarClassValue.value],
    },
    children: visibleToolbarConfigs.value,
  }
})

const projectedToolbarRendererConfig = computed<SparkNode | undefined>(() => {
  if (!toolbarRendererConfig.value) return undefined
  return {
    ...toolbarRendererConfig.value,
    children: visibleToolbarConfigs.value,
  }
})

// ── 筛选区：表单模型、字段配置、折叠状态与筛选后的数据视图 ───────────────

const {
  filterModel,
  filterConfigs,
  filterClassValue,
  filterGridColumnsValue,
  filterGridGapValue,
  filterGridAutoRowsValue,
  hasFilters,
  activeFilterCount,
  resetFilters,
} = useTableFilters({
  filterChildren: effectiveFilterChildren,
  dataView: resolvedView,
  filterClass: computed(() => childProp<string>(filterNode.value, 'class') ?? ''),
  filterGridColumns: computed(() => childProp<number>(filterNode.value, 'gridColumns') ?? 24),
  filterGridGap: computed(() => childProp<number | string>(filterNode.value, 'gridGap') ?? 12),
  filterGridAutoRows: computed(() => childProp<string>(filterNode.value, 'gridAutoRows') ?? 'minmax(32px, auto)'),
  logger,
})

const {
  tableData,
  elTableProps,
  filterCollapsibleValue,
  filterAutoFitMinWidthValue,
  filterItemSpanValue,
  filterActionSpanValue,
  filtersCollapsed,
  toggleFiltersCollapsed,
} = useRendererTableViewState({
  filterNode: normalizedFilterNode,
  tableFilterCollapsible: computed(() => props.filterCollapsible),
  tableFilterDefaultCollapsed: computed(() => props.filterDefaultCollapsed),
  tableFilterAutoFitMinWidth: computed(() => props.filterAutoFitMinWidth),
  tableFilterItemSpan: computed(() => props.filterItemSpan),
  tableFilterActionSpan: computed(() => props.filterActionSpan),
  baseElTableProps,
  resolvedView,
})

// ── 零代码 API：桥接原生 el-table 实例，并向页面脚本暴露表格能力 ─────────

const nativeTableRef = ref<NativeTableLike | null>(null)

const {
  dispatch,
  tableApi,
  handleBuiltinToolbarAction,
  handleBuiltinRowAction,
  isBuiltinActionDisabled,
} = createRendererTableZeroCode({
  props,
  resolvedView,
  nativeTableRef,
  pageService,
  logger,
  filterModel,
  resetFilters,
  hasFilters,
  activeFilterCount,
  handleFilterSearch,
})

registerApi(tableApi)

const rowActionCapability = {
  isDisabled(action: SparkNode): boolean {
    const row = action.props?.['row'] as IDataRow | undefined
    const index = action.props?.['rowIndex']
    const builtinDisabled = isBuiltinActionDisabled(action, {
      ...(row !== undefined ? { row } : {}),
      ...(typeof index === 'number' ? { index } : {}),
    })

    return builtinDisabled
  },
  execute(action: SparkNode): void {
    const row = action.props?.['row'] as IDataRow | undefined
    const index = action.props?.['rowIndex']
    if (!row) {
      handleBuiltinToolbarAction(action)
      return
    }
    handleBuiltinRowAction(action, row, typeof index === 'number' ? index : 0)
  },
}

sparkProvide(ACTION_CAPABILITY, createActionCapability(rowActionCapability))

// DataView → el-table 当前行单向同步
watch(
  () => resolvedView.value?.currentRow,
  async (row) => {
    await nextTick()
    nativeTableRef.value?.setCurrentRow?.(row ?? null)
  },
)

// ── 行操作区：仅使用结构化 toolbar 组装行操作列 ───────────────────────

const rowActionConfigs = computed(() => getSparkNodeChildren(actionsNode.value?.children))
const rowActionsPositionValue = computed<ActionsPosition>(() => childProp<ActionsPosition>(actionsNode.value, 'position') ?? 'right')
const showRowActionsLeft = computed(() => rowActionConfigs.value.length > 0 && rowActionsPositionValue.value === 'left')
const showRowActionsRight = computed(() => rowActionConfigs.value.length > 0 && rowActionsPositionValue.value === 'right')

const { getVisibleActionConfigs: getScopedRowActions } = useContainerActionVisibility<{ row: IDataRow, index: number }>({
  actionConfigs: rowActionConfigs,
  resolveScope: ({ row, index }) => ({
    row: resolveCurrentRowPath(row, resolvedView.value),
    data: row,
    index,
    listenerArgs: [row, index],
    propsPatch: { row, rowIndex: index },
  }),
})

const hasVisibleRowActionsInRows = computed(() => {
  const rows = tableData.value
  if (!Array.isArray(rows) || rows.length === 0) return false

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    if (row === undefined) continue
    if (getScopedRowActions({ row, index }).length > 0) return true
  }

  return false
})

const showRowActionsLeftVisible = computed(() => showRowActionsLeft.value && hasVisibleRowActionsInRows.value)
const showRowActionsRightVisible = computed(() => showRowActionsRight.value && hasVisibleRowActionsInRows.value)

const rowActionsAlignValue = computed<ActionsAlign | undefined>(() => {
  const align = childProp<ActionsAlign>(actionsNode.value, 'align')
  if (align === 'left' || align === 'center' || align === 'right') return align
  return undefined
})

const rowActionsHeaderAlignValue = computed<ActionsAlign>(() => {
  return rowActionsAlignValue.value ?? 'center'
})

const rowActionsFixedValue = computed<ActionsFixed | undefined>(() => {
  const fixed = childProp<ActionsFixed>(actionsNode.value, 'fixed')
  if (fixed === true || fixed === false || fixed === 'left' || fixed === 'right') return fixed
  return undefined
})

const rowActionsJustifyContentValue = computed(() => {
  switch (rowActionsAlignValue.value) {
    case 'center':
      return 'center'
    case 'right':
      return 'flex-end'
    default:
      return 'flex-start'
  }
})

const rowActionsContainerStyle = computed<CSSProperties>(() => ({
  justifyContent: rowActionsJustifyContentValue.value,
  flexWrap: 'nowrap',
}))

/** 行操作列统一属性（标题 + 宽度） */
const rowActionColumnAttrs = computed(() => {
  const label = childProp<string>(actionsNode.value, 'label') ?? '操作'
  const width = childProp<number | string>(actionsNode.value, 'width') ?? 220
  const align = rowActionsAlignValue.value
  const headerAlign = rowActionsHeaderAlignValue.value
  const fixed = rowActionsFixedValue.value
  return {
    label,
    width,
    ...(align !== undefined ? { align } : {}),
    headerAlign,
    ...(fixed !== undefined ? { fixed } : {}),
  }
})

function resolveRowActionScope(scope: Record<string, unknown>) {
  // 从 el-table 默认 slot scope 提取 row / $index。
  // 这里采用 fail-safe 默认值，保证作用域函数在测试桩与真实环境下都可执行。
  return {
    row: (scope['row'] as IDataRow | undefined) ?? {},
    index: typeof scope['$index'] === 'number' ? scope['$index'] : 0,
  }
}

function createScopedRowActionsToolbarConfig(scope: Record<string, unknown>): SparkNode {
  // 构造行操作投影 r-toolbar 节点，children 已由 getScopedRowActions 完成可见性过滤与 props 绑定。
  const { row, index } = resolveRowActionScope(scope)
  return {
    type: 'r-toolbar',
    children: getScopedRowActions({ row, index }),
  }
}

// ── 过滤操作：筛选区按钮回调 ─────────────────────────────────────────────

async function handleFilterSearch(): Promise<void> {
  // 对远程表触发 refresh()；本地表 filteredRows 已是 computed 实时过滤
  const view = resolvedView.value
  if (view?.dataTable?.api?.list) {
    await view.refresh()
  }
}

function handleFilterReset() {
  resetFilters()
}

// ── 事件桥接：el-table 原生事件统一转发到零代码调度器 ───────────────────

async function handleCurrentChange(currentRow: IDataRow | null, oldCurrentRow?: IDataRow | null) {
  await dispatch('current-change', currentRow ?? null, oldCurrentRow)
}

async function handleRowClick(row: IDataRow, column?: unknown, event?: Event) {
  if (!row) return
  await dispatch('row-click', row, column, event)
}

async function handleSelectionChange(selection: IDataRow[]) {
  await dispatch('selection-change', Array.isArray(selection) ? selection : [])
}

/** 处理排序变化（服务端排序） */
async function handleSortChange({ prop, order }: { prop: string | null, order: 'ascending' | 'descending' | null }) {
  if (!resolvedView.value) return
  if (!prop || !order) {
    // 取消排序
    await resolvedView.value.setSort(undefined)
  } else {
    // 设置排序
    await resolvedView.value.setSort([{
      field: prop,
      direction: order === 'ascending' ? 'asc' : 'desc',
    }])
  }
}

</script>

<style scoped>
/* ── 布局骨架 ───────────────────────────────────────────────────────────── */

.renderer-table-layout {
  display: flex;
  gap: 12px;
  width: 100%;
}

.renderer-table-layout--top,
.renderer-table-layout--bottom {
  flex-direction: column;
}

.renderer-table-layout--bottom {
  flex-direction: column-reverse;
}

.renderer-table-layout--left,
.renderer-table-layout--right {
  align-items: flex-start;
}

.renderer-table-layout--right {
  flex-direction: row-reverse;
}

/* 表格主体：允许在 flex 容器中收缩，避免横向内容把外层撑爆。 */
.renderer-table-main {
  min-width: 0;
  flex: 1;
}

/* 表头视觉强化：提升层次感与可读性。 */
.renderer-table-main :deep(.el-table) {
  --spark-table-header-bg: linear-gradient(180deg, #f8fbff 0%, #eef4ff 100%);
  --spark-table-header-bg-hover: linear-gradient(180deg, #f2f8ff 0%, #e6efff 100%);
  --spark-table-header-text: #1f2d3d;
  --spark-table-header-border: #dbe6f6;
  --spark-table-sort-active: #2f6feb;
}

.renderer-table-main :deep(.el-table__header-wrapper th.el-table__cell) {
  background: var(--spark-table-header-bg);
  color: var(--spark-table-header-text);
  border-bottom: 1px solid var(--spark-table-header-border);
  height: 44px;
  font-weight: 600;
  transition: background-color 0.18s ease, color 0.18s ease;
}

.renderer-table-main :deep(.el-table__header-wrapper th.el-table__cell .cell) {
  letter-spacing: 0.02em;
}

.renderer-table-main :deep(.el-table__header-wrapper th.el-table__cell.is-sortable:hover) {
  background: var(--spark-table-header-bg-hover);
}

.renderer-table-main :deep(.el-table__header-wrapper th.el-table__cell:first-child) {
  border-top-left-radius: 10px;
}

.renderer-table-main :deep(.el-table__header-wrapper th.el-table__cell:last-child) {
  border-top-right-radius: 10px;
}

/* 左右侧工具栏布局时，工具栏内部也改为纵向堆叠。 */
.renderer-table-layout--left .renderer-table-toolbar :deep(.renderer-toolbar-lane),
.renderer-table-layout--right .renderer-table-toolbar :deep(.renderer-toolbar-lane) {
  grid-auto-flow: row;
  grid-auto-rows: max-content;
}

/* 行操作列内容左对齐，避免按钮全部挤在列中间。 */
.renderer-table-row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

</style>

