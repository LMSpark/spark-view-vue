<template>
  <div :class="['renderer-table-layout', `renderer-table-layout--${toolbarPositionValue}`]">
    <!-- 工具栏 -->
    <SparkComponentRenderer v-if="toolbarNode" :config="toolbarNode" />

    <!-- 过滤区 -->
    <SparkComponentRenderer v-if="hasFilters" :config="filterSparkNode" />

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
          :width="52"
        />

        <!-- 行操作列（左） -->
        <el-table-column
          v-if="(props.actions?.children?.length ?? 0) > 0 && props.actions?.position === 'left'"
          label="操作"
          :width="220"
          header-align="center"
        >
          <template #default="scope">
            <div class="renderer-table-row-actions">
              <RendererHostScope :row="(scope.row as IDataRow)">
                <SparkComponentRenderer :config="{ type: 'r-toolbar', children: props.actions?.children ?? [] }" />
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
          v-for="(child, index) in renderedContentChildren"
          :key="nodeId(child.node) ?? `r-table-child-${index}`"
        >
          <el-table-column
            v-if="child.node.type === 'r-row-fragment'"
            v-bind="child.rowFragmentColumnAttrs"
          >
            <template #default="scope">
              <RendererHostScope :row="(scope.row as IDataRow)">
                <SparkComponentRenderer
                  v-for="(fragmentChild, fragmentIndex) in ((child.node.children as SparkNode[]) ?? [])"
                  :key="nodeId(fragmentChild) ?? `r-table-row-fragment-${fragmentIndex}`"
                  :config="fragmentChild"
                />
              </RendererHostScope>
            </template>
          </el-table-column>

          <SparkComponentRenderer
            v-else
            :config="child.node"
          />
        </template>

        <!-- 模板驱动补充列：支持直接手写 el-table-column -->
        <slot />

        <!-- 行操作列（右） -->
        <el-table-column
          v-if="(props.actions?.children?.length ?? 0) > 0 && (props.actions?.position ?? 'right') === 'right'"
          label="操作"
          :width="220"
          header-align="center"
        >
          <template #default="scope">
            <div class="renderer-table-row-actions">
              <RendererHostScope :row="(scope.row as IDataRow)">
                <SparkComponentRenderer :config="{ type: 'r-toolbar', children: props.actions?.children ?? [] }" />
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
 * @binding dataKey-driven
 * @provides DATA_SOURCE
 * @consumes PAGE_DATASET
 * @consumes PAGE_SERVICE
 * @notes children 仅放 r-* 字段组件做列，禁止直接声明底层列节点
 * @notes 结构化区域使用 props.toolbar / props.filter / props.actions，不再使用 dock 分流
 * @notes highlightCurrentRow 必须显式声明才生效
 * @notes 提示词模板（可提取）：默认包含 toolbar/filter/actions 三块，具体动作模板见对应 props 注释。
 * @notes 提示词模板（数据绑定）：table dataKey 使用 table@view@rows；统计值优先使用 display 组件 + dataKey（summaryRow/currentRow）而不是 children 文本插值。
 */
import { computed, nextTick, ref, toRef, watch } from 'vue'
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
import { useTableFilters } from '../../layout'
import RendererHostScope from '../../support/RendererHostScope.vue'

// ── Props / slots 输入 ───────────────────────────────────────────────────

const props = withDefaults(defineProps<RTableProps>(), {
  type: 'r-table',
})

interface RenderedTableChild {
  node: SparkNode
  rowFragmentColumnAttrs?: Record<string, unknown>
}

// children 已结构化：仅包含列定义，toolbar/filter/actions 为独立属性
const renderedContentChildren = computed<RenderedTableChild[]>(() => {
  return ((props.children as SparkNode[]) ?? []).map((rawNode) => {
    const sourceProps = rawNode.props ?? {}
    const field = sourceProps['field'] ?? sourceProps['fieldName'] ?? sourceProps['prop'] ?? sourceProps['property']
    const node = (
      rawNode.type === 'r-row-fragment'
      || rawNode.type === 'r-column-group'
      || sourceProps['sortable'] !== undefined
      || typeof field !== 'string'
      || field.trim().length === 0
    )
      ? rawNode
      : { ...rawNode, props: { ...sourceProps, sortable: true } }

    if (node.type !== 'r-row-fragment') {
      return { node }
    }

    const p = node.props as Record<string, unknown> | undefined
    const width = p?.['width']
    const minWidth = p?.['minWidth']
    const align = p?.['align']
    const className = p?.['class']

    return {
      node,
      rowFragmentColumnAttrs: {
        label: String(p?.['title'] ?? ''),
        ...(typeof width === 'string' || typeof width === 'number' ? { width } : {}),
        ...(typeof minWidth === 'string' || typeof minWidth === 'number' ? { minWidth } : {}),
        ...(typeof align === 'string' ? { align } : {}),
        ...(typeof p?.['headerAlign'] === 'string' ? { headerAlign: p['headerAlign'] } : {}),
        ...(typeof className === 'string' ? { className } : {}),
      },
    }
  })
})

// ── 基础输入解析：DataKey → DataView 与基础 el-table 属性 ───────────────────

const baseElTableProps = computed<Record<string, unknown>>(() => {
  const resolvedResizable = props.resizable !== undefined ? props.resizable : true
  const resolvedBorder = resolvedResizable === true ? true : (props.border ?? true)
  return {
    ...(props.stripe !== undefined ? { stripe: props.stripe } : {}),
    ...(props.highlightCurrentRow !== undefined ? { highlightCurrentRow: props.highlightCurrentRow } : {}),
    ...(props.rowKey !== undefined ? { rowKey: props.rowKey } : {}),
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
const toolbarNode = computed<SparkNode | undefined>(() => {
  const toolbar = props.toolbar
  if (!toolbar) return undefined

  const { type: _type, id, children, dataKey: existingDataKey, ...propsFields } = toolbar
  const resolvedDataKey = (existingDataKey !== undefined && existingDataKey !== null && existingDataKey !== '')
    ? existingDataKey
    : (() => {
        const tableName = typeof props.dataKey === 'string' ? props.dataKey.split('@')[0] : undefined
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
})

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
  filterNode: toRef(props, 'filter'),
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

const filterSparkNode = computed<SparkNode>(() => {
  const { children, class: userClass, ...restFilterProps } = filterRendererProps.value
  return {
    type: 'r-filter',
    props: {
      ...restFilterProps,
      class: ['renderer-table-filter-panel', userClass].filter(Boolean).join(' '),
    },
    children: children ?? [],
  }
})

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

function tableRowClassName({ row }: { row: IDataRow }) {
  return isSelectedRow(row) ? 'spark-selection-row' : ''
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
  justify-content: flex-start;
  flex-wrap: nowrap;
  gap: 8px;
}

</style>

