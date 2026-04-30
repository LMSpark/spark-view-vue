<template>
  <div :class="['renderer-table-layout', `renderer-table-layout--${toolbarPositionValue}`]">
    <!-- 工具栏 -->
    <SparkComponentRenderer v-if="toolbarNode" :config="toolbarNode" />

    <!-- 过滤区 -->
    <RendererFilter v-if="hasFilters" v-bind="filterRendererProps" :class="filterPanelClass" />

    <!-- 表格主体 -->
    <div class="renderer-table-main">
      <el-table
        ref="nativeTableRef"
        :data="tableData"
        
        v-bind="elTableProps"
        :row-class-name="tableRowClassName"
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
        <!-- 多选勾栏：仅多选模式显示 -->
        <el-table-column
          v-if="resolvedView?.isMultiSelect === true"
          type="selection"
          v-bind="selectionColumnAttrs"
        />

        <!-- 行操作列（左） -->
        <el-table-column
          v-if="rowActionConfigs.length > 0 && rowActionsPositionValue === 'left'"
          v-bind="rowActionColumnAttrs"
        >
          <template #default="scope">
            <div class="renderer-table-row-actions" :style="rowActionsContainerStyle">
              <RendererHostScope :row="(scope.row as IDataRow)">
                <SparkComponentRenderer :config="rawRowActionsToolbarConfig" />
              </RendererHostScope>
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
          v-if="rowActionConfigs.length > 0 && rowActionsPositionValue === 'right'"
          v-bind="rowActionColumnAttrs"
        >
          <template #default="scope">
            <div class="renderer-table-row-actions" :style="rowActionsContainerStyle">
              <RendererHostScope :row="(scope.row as IDataRow)">
                <SparkComponentRenderer :config="rawRowActionsToolbarConfig" />
              </RendererHostScope>
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
 * - children 仅承载列定义，不再参与结构区解算。
 */
import { computed, nextTick, ref, toRef, watch, type CSSProperties } from 'vue'
import {
  useSparkPageComponent, SparkComponentRenderer,
  nodeId, PROP_DATA_KEY, type SparkNode,
  PAGE_DATASET, DATA_SOURCE, PAGE_SERVICE,
} from '../../../internal'
import type { RTableProps } from './RendererTable.props'
import type { IDataRow, DataView } from '@spark-view/spark-data'
import { createRendererTableZeroCode, type NativeTableLike } from './zero-code'
import { useRendererTableViewState } from './view-state'
import { useContainerDataSource, useContainerDataSourceEffects } from '../../composables/useContainerDataSource'
import type { ToolbarPosition } from '../../layout'
import type { RToolbarProps } from '../../non-data-components/RendererToolbar.types'
import { useTableFilters } from '../../layout'
import RendererHostScope from '../../support/RendererHostScope.vue'
import RendererFilter from '../../RendererFilter.vue'

// ── 基础工具：通用读取与列投影辅助 ────────────────────────────────────────

// ── Props / slots 输入 ───────────────────────────────────────────────────

const props = withDefaults(defineProps<RTableProps>(), {
  type: 'r-table',
})

// children 已结构化：仅包含列定义，toolbar/filter/actions 为独立属性
const renderedContentChildNodes = computed(() => ((props.children as SparkNode[]) ?? []).map(normalizeDefaultSortableTableNode))

/** 从结构化 wrapper 节点上读取 props，统一访问 props.toolbar / props.filter / props.actions。 */
function childProp<T>(child: SparkNode | undefined, name: string): T | undefined {
  return child?.props?.[name] as T | undefined
}

/** 将扁平 RToolbarProps 转为 SparkNode，并自动补齐 dataKey。 */
function buildToolbarNode(
  toolbar: RToolbarProps | undefined,
  containerDataKey: string | undefined,
): SparkNode | undefined {
  if (!toolbar) return undefined
  const { type: _type, id, children, dataKey: existingDataKey, ...propsFields } = toolbar
  const resolvedDataKey = (existingDataKey !== undefined && existingDataKey !== null && existingDataKey !== '')
    ? existingDataKey
    : (() => {
        const tableName = typeof containerDataKey === 'string' ? containerDataKey.split('@')[0] : undefined
        return tableName ? `${tableName}@currentRow` : undefined
      })()
  return {
    type: 'r-toolbar',
    ...(id !== undefined ? { id } : {}),
    props: {
      ...propsFields,
      ...(resolvedDataKey !== undefined ? { [PROP_DATA_KEY]: resolvedDataKey } : {}),
    },
    ...(children !== undefined ? { children } : {}),
  }
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
  return (node.children as SparkNode[]) ?? []
}

function resolveRowFragmentLabel(node: SparkNode): string {
  // 列标题仅从 title 读取。
  return String(rowFragmentProp(node, 'title') ?? '')
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
  // 表头对齐仅读取 headerAlign。
  const headerAlign = rowFragmentProp(node, 'headerAlign')
  if (typeof headerAlign === 'string') return headerAlign
  return undefined
}

function resolveRowFragmentClass(node: SparkNode): string | undefined {
  // class 只接受字符串，防止对象/数组类型误入 class-name。
  const value = rowFragmentProp(node, 'class')
  return typeof value === 'string' ? value : undefined
}

const normalizedFilterNode = computed(() => {
  const node = props.filter
  if (node?.type !== 'r-filter') return undefined
  return node
})

// ── 基础输入解析：DataKey 与传给 el-table 的显式 tableProps ───────────────

const baseElTableProps = computed<Record<string, unknown>>(() => {
  const tableProps = props.tableProps ?? {}

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

// ── SPARK 上下文与数据源：解析 DataKey → DataView，并向下游提供 DATA_SOURCE ──

const { sparkConsume, sparkProvide, registerApi, logger } = useSparkPageComponent(props)

const pageDataSet = sparkConsume(PAGE_DATASET)
const pageService = sparkConsume(PAGE_SERVICE)

const { resolvedDataSource: resolvedView } = useContainerDataSource<DataView>({
  externalDataSource: toRef(props, 'dataSource'),
  dataKey: toRef(props, 'dataKey'),
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

const toolbarPositionValue = computed<ToolbarPosition>(() => {
  const position = props.toolbar?.position
  return position === 'top' || position === 'bottom' || position === 'left' || position === 'right'
    ? position
    : 'top'
})

/** 将 RToolbarProps 转换为 SparkNode，自动补齐 dataKey（若调用方未显式提供）。 */
const toolbarNode = computed<SparkNode | undefined>(() =>
  buildToolbarNode(props.toolbar, props.dataKey),
)

// ── 筛选区：表单模型、字段配置、折叠状态与筛选后的数据视图 ───────────────

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
  tableFilterCollapsible: toRef(props, 'filterCollapsible'),
  tableFilterDefaultCollapsed: toRef(props, 'filterDefaultCollapsed'),
  tableFilterAutoFitMinWidth: toRef(props, 'filterAutoFitMinWidth'),
  tableFilterItemSpan: toRef(props, 'filterItemSpan'),
  tableFilterActionSpan: toRef(props, 'filterActionSpan'),
  baseElTableProps,
  resolvedView,
})

const {
  filterRendererProps,
  hasFilters,
  zeroCodeBridge,
} = useTableFilters({
  filterChildren: computed(() => props.filter?.children ?? []),
  dataView: resolvedView,
  filterClass: computed(() => props.filter?.class ?? ''),
  filterGridColumns: computed(() => props.filter?.gridColumns ?? 24),
  filterGridGap: computed(() => props.filter?.gridGap ?? 12),
  filterGridAutoRows: computed(() => props.filter?.gridAutoRows ?? 'minmax(32px, auto)'),
  filterCollapsible: filterCollapsibleValue,
  filterCollapsed: filtersCollapsed,
  filterAutoFitMinWidth: filterAutoFitMinWidthValue,
  filterItemSpan: filterItemSpanValue,
  filterActionSpan: filterActionSpanValue,
  toggleCollapsedAction: toggleFiltersCollapsed,
  logger,
})

const filterPanelClass = computed(() =>
  ['renderer-table-filter-panel', filterRendererProps.value.class].filter(Boolean).join(' '),
)

// ── 零代码 API：桥接原生 el-table 实例，并向页面脚本暴露表格能力 ─────────

const nativeTableRef = ref<NativeTableLike | null>(null)

const {
  dispatch,
  tableApi,
} = createRendererTableZeroCode({
  props,
  resolvedView,
  nativeTableRef,
  pageService,
  logger,
  filterModel: zeroCodeBridge.value.filterModel,
  resetFilters: () => {
    void zeroCodeBridge.value.resetFilters()
  },
  hasFilters,
  activeFilterCount: computed(() => zeroCodeBridge.value.activeFilterCount),
  handleFilterSearch: async () => {
    await zeroCodeBridge.value.searchFilters()
  },
})

registerApi(tableApi)

// DataView → el-table 当前行单向同步
watch(
  () => resolvedView.value?.currentRow,
  async (row) => {
    await nextTick()
    nativeTableRef.value?.setCurrentRow?.(row ?? null)
  },
)

// ── 行操作区：仅使用结构化 toolbar 组装行操作列 ───────────────────────

const rowActionConfigs = computed(() => props.actions?.children ?? [])
const rowActionsPositionValue = computed<'left' | 'right'>(() => {
  const p = props.actions?.position
  return p === 'left' ? 'left' : 'right'
})

const rawRowActionsToolbarConfig = computed<SparkNode>(() => ({
  type: 'r-toolbar',
  children: rowActionConfigs.value,
}))

const rowActionsContainerStyle = computed<CSSProperties>(() => ({
  justifyContent: 'flex-start',
  flexWrap: 'nowrap',
}))

/** 行操作列统一属性（标题 + 宽度） */
const rowActionColumnAttrs = computed(() => ({
  label: '操作',
  width: 220,
  headerAlign: 'center',
}))

function normalizeRowClassValue(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) {
    return value.filter(item => typeof item === 'string').join(' ').trim()
  }
  return ''
}

const selectedRowIdSet = computed(() => {
  const view = resolvedView.value
  const selectedRows = view?.selectedRows ?? []
  const keyField = view?.primaryKey
  const ids = new Set<string | number>()

  if (typeof keyField !== 'string' || keyField.length === 0) {
    return ids
  }

  for (const row of selectedRows) {
    const key = (row as Record<string, unknown>)[keyField]
    if (typeof key === 'string' || typeof key === 'number') {
      ids.add(key)
    }
  }

  return ids
})

const selectedRowRefSet = computed(() => new Set(resolvedView.value?.selectedRows ?? []))

const selectionColumnAttrs = computed(() => {
  const widthValue = elTableProps.value['selectionWidth']
  const width = typeof widthValue === 'number' || typeof widthValue === 'string' ? widthValue : 52

  const fixedValue = elTableProps.value['selectionFixed']
  const fixed = fixedValue === true || fixedValue === false || fixedValue === 'left' || fixedValue === 'right'
    ? fixedValue
    : undefined

  const selectableValue = elTableProps.value['selectionSelectable']
  const selectable = typeof selectableValue === 'function'
    ? selectableValue as (row: IDataRow, index: number) => boolean
    : undefined

  return {
    width,
    ...(fixed !== undefined ? { fixed } : {}),
    ...(selectable !== undefined ? { selectable } : {}),
  }
})

function isSelectedRow(row: IDataRow): boolean {
  const view = resolvedView.value
  const keyField = view?.primaryKey
  if (typeof keyField === 'string' && keyField.length > 0) {
    const key = (row as Record<string, unknown>)[keyField]
    if ((typeof key === 'string' || typeof key === 'number') && selectedRowIdSet.value.has(key)) {
      return true
    }
  }
  return selectedRowRefSet.value.has(row)
}

const tableRowClassName = computed(() => {
  const externalClassResolver = (elTableProps.value['rowClassName'] ?? elTableProps.value['row-class-name']) as unknown

  return ({ row, rowIndex }: { row: IDataRow, rowIndex: number }) => {
    const classNames: string[] = []

    if (typeof externalClassResolver === 'function') {
      const externalClass = (externalClassResolver as (args: { row: IDataRow, rowIndex: number }) => unknown)({ row, rowIndex })
      const normalized = normalizeRowClassValue(externalClass)
      if (normalized.length > 0) classNames.push(normalized)
    } else if (typeof externalClassResolver === 'string') {
      const normalized = externalClassResolver.trim()
      if (normalized.length > 0) classNames.push(normalized)
    }

    if (isSelectedRow(row)) {
      classNames.push('spark-selection-row')
    }

    return classNames.join(' ').trim()
  }
})

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

.renderer-table-filter-panel {
  width: 100%;
}

/* 表头视觉强化：提升层次感与可读性。 */
.renderer-table-main :deep(.el-table) {
  --spark-table-header-bg: linear-gradient(180deg, #f8fbff 0%, #eef4ff 100%);
  --spark-table-header-bg-hover: linear-gradient(180deg, #f2f8ff 0%, #e6efff 100%);
  --spark-table-header-text: #1f2d3d;
  --spark-table-header-border: #dbe6f6;
  --spark-table-sort-active: #2f6feb;
  --spark-table-current-row-bg: #eaf3ff;
  --spark-table-current-row-bg-hover: #deecff;
  --spark-table-selection-row-bg: #f2f9ef;
  --spark-table-selection-row-bg-hover: #e7f4e2;
  --el-table-current-row-bg-color: var(--spark-table-current-row-bg);
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

/* 当前行/勾选行高亮：提升行态辨识度。 */
.renderer-table-main :deep(.el-table__body tr.current-row > td.el-table__cell) {
  background-color: var(--spark-table-current-row-bg) !important;
}

.renderer-table-main :deep(.el-table__body tr.current-row:hover > td.el-table__cell) {
  background-color: var(--spark-table-current-row-bg-hover) !important;
}

.renderer-table-main :deep(.el-table__body tr.spark-selection-row > td.el-table__cell) {
  background-color: var(--spark-table-selection-row-bg) !important;
}

.renderer-table-main :deep(.el-table__body tr.spark-selection-row:hover > td.el-table__cell) {
  background-color: var(--spark-table-selection-row-bg-hover) !important;
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

