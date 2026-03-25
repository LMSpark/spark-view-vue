<!--
/**
 * @skill r-table
 * @description 数据表格容器，通过 DataKey 绑定 DataView，自动渲染行数据；除列区外，其它结构统一通过 dock 分区（toolbar / filter / actions）组织；支持当前行高亮、多选、分页
 * @provides DATA_SOURCE
 * @consumes PAGE_DATASET
 * @input { dataKey: string, children?: [{ dock?: 'default'|'toolbar'|'filter'|'actions' }], props: { docks?: { toolbar?: { position?: 'top'|'bottom'|'left'|'right', class?: string } }, border?: boolean, stripe?: boolean, highlightCurrentRow?: boolean } }
 * @example { "type": "r-table", "dataKey": "Orders@rows", "props": { "border": true, "highlightCurrentRow": true } }
 */
-->
<template>
  <div :class="['renderer-table-layout', `renderer-table-layout--${toolbarPositionValue}`]">
    <!-- 工具栏 -->
    <div v-if="showToolbar" :class="['renderer-table-toolbar', toolbarClassValue]">
      <template v-for="(action, index) in visibleToolbarConfigs" :key="nodeId(action) ?? `r-table-toolbar-${index}`">
        <el-button
          v-if="isBuiltinAction(action)"
          :type="getBuiltinButtonType(action)"
          :size="getBuiltinButtonSize(action)"
          :plain="getBuiltinButtonPlain(action)"
          :text="getBuiltinButtonText(action)"
          :link="getBuiltinButtonLink(action)"
          :disabled="isBuiltinActionDisabled(action)"
          :class="getBuiltinButtonClass(action)"
          @click="handleBuiltinToolbarAction(action)"
        >{{ getBuiltinActionLabel(action) }}</el-button>
        <SparkComponentRenderer
          v-else
          :config="action"
        />
      </template>
    </div>

    <!-- 过滤区 -->
    <div v-if="hasFilters" :class="['renderer-table-filters', filterClassValue]">
      <div v-if="filterCollapsibleValue" class="renderer-table-filters__header">
        <div class="renderer-table-filters__heading">
          <span class="renderer-table-filters__title">筛选条件</span>
          <el-tag
            v-if="activeFilterCount > 0"
            size="small"
            type="info"
            class="renderer-table-filters__count"
          >{{ activeFilterCount }} 项筛选</el-tag>
        </div>
        <button
          type="button"
          class="renderer-table-filters__toggle"
          :aria-expanded="!filtersCollapsed"
          @click="toggleFiltersCollapsed"
        >
          <span class="renderer-table-filters__toggle-icon">{{ filtersCollapsed ? '>' : 'v' }}</span>
          <span>{{ filtersCollapsed ? '展开筛选' : '收起筛选' }}</span>
        </button>
      </div>

      <div v-show="!filtersCollapsed" class="renderer-table-filters__content">
      <div class="renderer-table-filters__body">
        <RendererFieldScope
          :model="filterModel"
          :configs="filterConfigs"
          :grid-columns="filterGridColumnsValue"
          :grid-gap="filterGridGapValue"
          :grid-auto-rows="filterGridAutoRowsValue"
          :auto-fit-min-width="filterAutoFitMinWidthValue"
          :default-col-span="filterItemSpanValue"
          label-position="left"
          label-width="80px"
          compact
        />
      </div>
      <div class="renderer-table-filters__actions">
        <el-button type="primary" size="small" @click="handleFilterSearch">查询</el-button>
        <el-button size="small" @click="handleFilterReset">重置</el-button>
        <el-tag
          v-if="activeFilterCount > 0 && !filterCollapsibleValue"
          size="small"
          type="info"
          class="renderer-table-filters__count"
        >{{ activeFilterCount }} 项筛选</el-tag>
      </div>
      </div>
    </div>

    <div class="renderer-table-main">
      <el-table
        ref="nativeTableRef"
        :data="tableData"
        v-bind="$attrs"
        @current-change="handleCurrentChange"
        @selection-change="handleSelectionChange"
      >
        <el-table-columns>
          <!-- 行操作列（左） -->
          <el-table-column
            v-if="showRowActionsLeftValue"
            :label="rowActionsLabelValue"
            :width="rowActionsWidthValue"
            :fixed="rowActionsFixedValue"
            :align="rowActionsAlignValue"
            :class-name="rowActionsClassValue"
          >
            <template #default="{ row, $index }">
              <div :class="['renderer-table-row-actions', rowActionsClassValue]">
                <template v-for="(action, index) in getScopedRowActions({ row, index: $index })" :key="nodeId(action) ?? `r-table-row-action-left-${index}`">
                  <el-button
                    v-if="isBuiltinAction(action)"
                    :type="getBuiltinButtonType(action)"
                    :size="getBuiltinButtonSize(action)"
                    :plain="getBuiltinButtonPlain(action)"
                    :text="getBuiltinButtonText(action)"
                    :link="getBuiltinButtonLink(action)"
                    :disabled="isBuiltinActionDisabled(action, { row, index: $index })"
                    :class="getBuiltinButtonClass(action)"
                    @click="handleBuiltinRowAction(action, row, $index)"
                  >{{ getBuiltinActionLabel(action) }}</el-button>
                  <SparkComponentRenderer
                    v-else
                    :config="action"
                  />
                </template>
                <slot
                  name="row-actions"
                  v-bind="getRowActionSlotScope(row, $index)"
                />
              </div>
            </template>
          </el-table-column>

          <!-- 主数据列 -->
          <template v-if="sparkChildren.length">
            <SparkComponentRenderer
              v-for="(child, i) in sparkChildren"
              :key="nodeId(child) ?? `r-table-child-${i}`"
              :config="child"
            />
          </template>
          <!-- Template 驱动 —— 保留 <slot> 向后兼容 -->
          <slot v-else />

          <!-- 行操作列（右） -->
          <el-table-column
            v-if="showRowActionsRightValue"
            :label="rowActionsLabelValue"
            :width="rowActionsWidthValue"
            :fixed="rowActionsFixedValue"
            :align="rowActionsAlignValue"
            :class-name="rowActionsClassValue"
          >
            <template #default="{ row, $index }">
              <div :class="['renderer-table-row-actions', rowActionsClassValue]">
                <template v-for="(action, index) in getScopedRowActions({ row, index: $index })" :key="nodeId(action) ?? `r-table-row-action-right-${index}`">
                  <el-button
                    v-if="isBuiltinAction(action)"
                    :type="getBuiltinButtonType(action)"
                    :size="getBuiltinButtonSize(action)"
                    :plain="getBuiltinButtonPlain(action)"
                    :text="getBuiltinButtonText(action)"
                    :link="getBuiltinButtonLink(action)"
                    :disabled="isBuiltinActionDisabled(action, { row, index: $index })"
                    :class="getBuiltinButtonClass(action)"
                    @click="handleBuiltinRowAction(action, row, $index)"
                  >{{ getBuiltinActionLabel(action) }}</el-button>
                  <SparkComponentRenderer
                    v-else
                    :config="action"
                  />
                </template>
                <slot
                  name="row-actions"
                  v-bind="getRowActionSlotScope(row, $index)"
                />
              </div>
            </template>
          </el-table-column>
        </el-table-columns>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * RendererTable - 表格容器组件
 *
 * 双模式：
 *   配置驱动：传入 config，子组件由 SparkComponentRenderer 通用递归渲染
 *   模板驱动：不传 config，通过 <slot> 接收模板子内容
 */
import { computed, defineComponent, ref, useAttrs, useSlots, watch } from 'vue'
import { useSparkComponent, SparkComponentRenderer } from '../_pkg'
import { nodeId, getDockedChildren, nodeDock, DEFAULT_DOCK, type SparkNode, type RendererTableApi } from '../_pkg'
import type { ContainerDocks } from '../../types'
import type { IDataRow, DataView } from '@spark-view/spark-data'
import { PAGE_SERVICE } from '@spark-view/spark-utils'
import { PAGE_DATASET, DATA_SOURCE } from '../_pkg'
import { FIELD_CONTEXT, MODULE_CONTEXT } from '../_pkg'
import { useContainerActions } from './useContainerActions'
import type { LateralActionPosition } from './useContainerActions'
import { useContainerDataSource } from './useContainerDataSource'
import { useContainerSlots } from './useContainerSlots'
import { useContainerToolbar } from './useContainerToolbar'
import type { ToolbarPosition } from './useContainerToolbar'
import { createRowActionSlotScope } from './slotScopeFactories'
import { useModuleContext } from './useModuleContext'
import RendererFieldScope from './RendererFieldScope.vue'
import { useTableFilters } from './useTableFilters'
import {
  isBuiltinAction,
  isBuiltinActionDisabled as _isBuiltinActionDisabled,
  getBuiltinActionLabel,
  getBuiltinButtonType,
  getBuiltinButtonSize,
  getBuiltinButtonPlain,
  getBuiltinButtonText,
  getBuiltinButtonLink,
  getBuiltinButtonClass,
  createBuiltinActionHandler,
  getSelectedRows,
} from './builtin-actions'

type RowActionsPosition = LateralActionPosition

interface Props {
  /** DataKey 格式：tableName@field */
  dataKey?: string
  /** 子节点列表 */
  children?: SparkNode[]
  /** 停靠区域显示配置 */
  docks?: ContainerDocks
  /** @deprecated legacy filter.columns：筛选项字段列表；优先使用 dock='filter' 子节点 */
  filterColumns?: string[]
  /** @deprecated legacy filter.class：筛选区 CSS 类名 */
  filterClass?: string
  /** @deprecated legacy filter.collapsible：筛选区可折叠 */
  filterCollapsible?: boolean
  /** @deprecated legacy filter.defaultCollapsed：筛选区默认折叠 */
  filterDefaultCollapsed?: boolean
  /** @deprecated legacy filter.autoFitMinWidth：筛选区最小宽度 */
  filterAutoFitMinWidth?: string
  /** @deprecated legacy filter.itemSpan：每项跨列数 */
  filterItemSpan?: number
  /** @deprecated legacy filter.gridColumns：筛选栅格总列数 */
  filterGridColumns?: number
  /** @deprecated legacy filter.gridGap：筛选栅格间距 */
  filterGridGap?: number | string
  /** @deprecated legacy filter.gridAutoRows：筛选栅格行高 */
  filterGridAutoRows?: string
  /** @deprecated legacy actions.items：行操作按钮配置；优先使用 dock='actions' 子节点 */
  rowActions?: SparkNode[]
  /** @deprecated legacy actions.position：行操作列位置 */
  rowActionsPosition?: RowActionsPosition
  /** @deprecated legacy actions.label：行操作列标题 */
  rowActionsLabel?: string
  /** @deprecated legacy actions.width：行操作列宽度 */
  rowActionsWidth?: string | number
  /** @deprecated legacy actions.align：行操作列对齐方式 */
  rowActionsAlign?: 'left' | 'center' | 'right'
  /** @deprecated legacy actions.fixed：行操作列固定方向 */
  rowActionsFixed?: boolean | 'left' | 'right'
  /** @deprecated legacy actions.class：行操作列 CSS 类名 */
  rowActionsClass?: string
}

const props = withDefaults(defineProps<Props>(), {
  docks: () => ({}),
  filterColumns: () => [],
  filterClass: '',
  filterCollapsible: false,
  filterDefaultCollapsed: false,
  filterAutoFitMinWidth: '220px',
  filterItemSpan: 1,
  filterGridColumns: 24,
  filterGridGap: 12,
  filterGridAutoRows: 'minmax(32px, auto)',
  rowActionsPosition: 'right',
  rowActionsLabel: '操作',
  rowActionsWidth: 160,
  rowActionsAlign: 'left',
  rowActionsClass: '',
})
const attrs = useAttrs()
const slots = useSlots()

const ElTableColumns = defineComponent({
  name: 'ElTableColumns',
  setup(_, { slots: componentSlots }) {
    return () => componentSlots['default']?.() ?? []
  },
})

// ── 输入解析 ──────────────────────────────────────────────────────────────

const effectiveDataKey = computed(() => props.dataKey)
const configChildren = computed<SparkNode[]>(() => {
  const c = props.children
  return Array.isArray(c) && c.length > 0 ? c : []
})

const dockedToolbar = computed(() =>
  getDockedChildren(configChildren.value, 'toolbar')
)

const dockedFilters = computed(() =>
  getDockedChildren(configChildren.value, 'filter')
)

const dockedRowActions = computed(() =>
  getDockedChildren(configChildren.value, 'actions')
)

const sparkChildren = computed(() => {
  return configChildren.value.filter(child => nodeDock(child) === DEFAULT_DOCK && isCollectedTableColumn(child))
})

// ── SPARK 上下文与数据源 ───────────────────────────────────────────────────

const { sparkConsume, sparkProvide, registerApi, logger } = useSparkComponent(
  { type: 'r-table' }
)

const pageDataSet = sparkConsume(PAGE_DATASET)
const pageService = sparkConsume(PAGE_SERVICE)
const moduleContext = useModuleContext(sparkConsume(MODULE_CONTEXT))

assertNoLegacyTableStructures()

const { resolvedDataSource: resolvedView, modelPermission } = useContainerDataSource<DataView>({
  dataKey: effectiveDataKey,
  pageDataSet,
  fallbackSource: computed(() => (attrs['dataView'] as DataView | undefined) ?? null),
  mapView: view => view,
  provideDataSource: view => sparkProvide(DATA_SOURCE, view),
  logger,
  logPrefix: 'RendererTable',
})

// ── 视图状态 ──────────────────────────────────────────────────────────────

const tableRows = computed(() => resolvedView.value?.rows ?? [])

// ── 工具栏 ────────────────────────────────────────────────────────────────

const {
  toolbarPositionValue,
  toolbarClassValue,
  visibleToolbarConfigs,
  showToolbar,
} = useContainerToolbar({
  toolbar: computed(() => dockedToolbar.value),
  toolbarPosition: computed(() => props.docks?.toolbar?.position as ToolbarPosition | undefined),
  toolbarClass: computed(() => props.docks?.toolbar?.class),
  modelPermission,
})

// ── 过滤区与表格数据 ──────────────────────────────────────────────────────

const {
  filterModel,
  filterConfigs,
  filterClassValue,
  filterGridColumnsValue,
  filterGridGapValue,
  filterGridAutoRowsValue,
  filteredRows,
  hasFilters,
  activeFilterCount,
  resetFilters,
} = useTableFilters({
  children: sparkChildren,
  filterChildren: computed(() => dockedFilters.value),
  dataView: resolvedView,
  filterColumns: computed(() => props.filterColumns),
  filterClass: computed(() => props.filterClass),
  filterGridColumns: computed(() => props.filterGridColumns),
  filterGridGap: computed(() => props.filterGridGap),
  filterGridAutoRows: computed(() => props.filterGridAutoRows),
  logger,
})

const filterCollapsibleValue = computed(() => props.filterCollapsible)

const filterDefaultCollapsedValue = computed(() => props.filterDefaultCollapsed)

const filterAutoFitMinWidthValue = computed(() => props.filterAutoFitMinWidth)

const filterItemSpanValue = computed(() => props.filterItemSpan)

const filtersCollapsed = ref(filterDefaultCollapsedValue.value)

watch(filterDefaultCollapsedValue, (value) => {
  filtersCollapsed.value = value
}, { immediate: true })

const tableData = computed(() => filteredRows.value ?? tableRows.value)

// ── r-table 包装 API（脚本可用） ───────────────────────────────────────────

interface NativeTableLike {
  clearSelection?: () => void
  toggleRowSelection?: (row: IDataRow, selected?: boolean) => void
  setCurrentRow?: (row: IDataRow | null) => void
  doLayout?: () => void
}

const nativeTableRef = ref<NativeTableLike | null>(null)

function hasRemoteListApi(view: DataView | null | undefined): boolean {
  return Boolean(view?.dataTable?.api?.list)
}

const tableApi: RendererTableApi = {
  getDataSource() {
    return resolvedView.value ?? null
  },
  getRows() {
    return resolvedView.value?.rows ?? []
  },
  getCurrentRow() {
    return resolvedView.value?.currentRow ?? null
  },
  getSelectedRows() {
    return resolvedView.value ? getSelectedRows(resolvedView.value) : []
  },
  async refresh() {
    const view = resolvedView.value
    if (!view || !hasRemoteListApi(view)) return
    await view.refresh()
  },
  appendRow(row) {
    resolvedView.value?.appendRow(row)
  },
  updateRowById(id, patch) {
    return resolvedView.value?.updateRowById(id, patch) ?? false
  },
  deleteRowById(id) {
    return resolvedView.value?.deleteRowById(id) ?? false
  },
  setCurrentRow(row) {
    const targetRow = row ?? null
    resolvedView.value?.selection.setCurrentRow(targetRow)
    nativeTableRef.value?.setCurrentRow?.(targetRow)
  },
  setCurrentRowById(id) {
    const view = resolvedView.value
    if (!view) return false
    const updated = view.selection.setCurrentRowById(id ?? null)
    nativeTableRef.value?.setCurrentRow?.(view.currentRow ?? null)
    return updated
  },
  setSelectedRows(rows) {
    resolvedView.value?.selection.setSelectedRows(rows)
  },
  setSelectedRowsById(ids) {
    return resolvedView.value?.selection.setSelectedRowsById(ids) ?? 0
  },
  clearSelectedRows() {
    resolvedView.value?.selection.clearSelectedRows()
  },
  clearUiSelection() {
    nativeTableRef.value?.clearSelection?.()
  },
  toggleUiRowSelection(row, selected = true) {
    nativeTableRef.value?.toggleRowSelection?.(row, selected)
  },
  doLayout() {
    nativeTableRef.value?.doLayout?.()
  },
  getNativeTable() {
    return nativeTableRef.value
  },
  getFilterModel() {
    return { ...filterModel }
  },
  resetFilters() {
    resetFilters()
  },
  hasActiveFilters() {
    return hasFilters.value
  },
  getActiveFilterCount() {
    return activeFilterCount.value
  },
}

registerApi(tableApi)

defineExpose(tableApi)

// ── 行操作区 ──────────────────────────────────────────────────────────────

const {
  actionPositionValue: rowActionsPositionValue,
  actionClassValue: rowActionsClassValue,
  showActionsLeft: showRowActionsLeft,
  showActionsRight: showRowActionsRight,
  getScopedActionConfigs: getScopedRowActions,
} = useContainerActions<{ row: IDataRow, index: number }>({
  actionConfigs: computed(() => {
    return [...dockedRowActions.value]
  }),
  actionPosition: computed(() => props.rowActionsPosition),
  actionClass: computed(() => props.rowActionsClass),
  modelPermission,
  resolveScope: ({ row, index }) => ({
    row,
    listenerArgs: [row, index],
    scopedProps: { row, rowIndex: index, $index: index },
  }),
})

const {
  showActionsLeftValue: showRowActionsLeftValue,
  showActionsRightValue: showRowActionsRightValue,
} = useContainerSlots({
  slots,
  actionSlotName: 'row-actions',
  actionPosition: rowActionsPositionValue,
  showActionsLeft: showRowActionsLeft,
  showActionsRight: showRowActionsRight,
})

const rowActionsLabelValue = computed(() => props.rowActionsLabel)

const rowActionsWidthValue = computed(() => props.rowActionsWidth)

const rowActionsAlignValue = computed(() => props.rowActionsAlign)

const rowActionsFixedValue = computed<boolean | 'left' | 'right'>(() => {
  if (props.rowActionsFixed !== undefined) return props.rowActionsFixed
  return rowActionsPositionValue.value
})

function getRowActionSlotScope(row: IDataRow, index: number) {
  return createRowActionSlotScope({
    dataSource: resolvedView.value,
    modelPermission: modelPermission.value,
    row,
    index,
    extra: {
      moduleContext: moduleContext.value,
    },
  })
}

// ── 声明式内置动作（零脚本能力） ────────────────────────────────────────────

function isBuiltinActionDisabled(action: SparkNode, scope?: { row?: IDataRow; index?: number }): boolean {
  return _isBuiltinActionDisabled(action, resolvedView.value, scope)
}

const builtinHandler = createBuiltinActionHandler({
  getView: () => resolvedView.value,
  getPageService: () => pageService,
  getLogger: () => logger,
  hasRemoteListApi: (view) => hasRemoteListApi(view),
})

function handleBuiltinToolbarAction(action: SparkNode): void {
  builtinHandler.handleToolbar(action)
}

function handleBuiltinRowAction(action: SparkNode, row: IDataRow, index: number): void {
  builtinHandler.handleRow(action, row, index)
}

// ── 子节点分类 ────────────────────────────────────────────────────────────

function isCollectedTableColumn(config: SparkNode): boolean {
  if (/^Render[A-Z]/.test(config.type)) return false
  if (config.type === 'el-table-column') return true
  if (!config.type.startsWith('r-')) return false
  // 数据列：有 field 绑定（bindSparkRuleEvents 已规范化到 props）
  const field = config.props?.['field']
  if (typeof field === 'string' && field.length > 0) {
    return true
  }
  // 分组列：无 field 但有子列（如 r-column-group）
  const kids = Array.isArray(config.children) ? config.children : []
  if (kids.length > 0) return true
  return false
}

function assertNoLegacyTableStructures(): void {
  if (Array.isArray(attrs['toolbar']) && attrs['toolbar'].length > 0) {
    throw new Error('[RendererTable] props.toolbar 已废除。请将工具栏节点移动到 children，并声明 dock: "toolbar"；位置与样式请改为 props.docks.toolbar。')
  }

  if (props.filterColumns.length > 0) {
    throw new Error('[RendererTable] props.filterColumns 已废除。请将筛选项移动到 children，并为每个筛选节点声明 dock: "filter"。')
  }

  if (Array.isArray(props.rowActions) && props.rowActions.length > 0) {
    throw new Error('[RendererTable] props.rowActions 已废除。请将行操作节点移动到 children，并声明 dock: "actions"。')
  }

  const legacyDefaultChildren = configChildren.value.filter(child =>
    nodeDock(child) === DEFAULT_DOCK && !isCollectedTableColumn(child)
  )

  if (legacyDefaultChildren.length > 0) {
    const childTypes = legacyDefaultChildren.map(child => child.type).join(', ')
    throw new Error(`[RendererTable] r-table 默认区仅允许列节点。检测到未声明 dock 的非列表达式节点: ${childTypes}。请将工具栏/筛选/行操作节点分别移动到 dock: "toolbar" | "filter" | "actions"。`)
  }
}

// ── 过滤操作 ──────────────────────────────────────────────────────────────

function handleFilterSearch() {
  // 对远程表触发 refresh()；本地表 filteredRows 已是 computed 实时过滤
  const view = resolvedView.value
  if (view?.dataTable?.api?.list) {
    void view.refresh().catch(() => { /* 已在 useTableFilters watch 中处理 */ })
  }
}

function handleFilterReset() {
  resetFilters()
}

function toggleFiltersCollapsed() {
  if (!filterCollapsibleValue.value) return
  filtersCollapsed.value = !filtersCollapsed.value
}

// ── 字段上下文与事件桥接 ──────────────────────────────────────────────────

sparkProvide(FIELD_CONTEXT, 'table')

function handleCurrentChange(currentRow: IDataRow | null) {
  resolvedView.value?.selection.setCurrentRow(currentRow ?? null)
}

function handleSelectionChange(selection: IDataRow[]) {
  resolvedView.value?.selection.setSelectedRows(Array.isArray(selection) ? selection : [])
}

</script>

<style scoped>
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

.renderer-table-main {
  min-width: 0;
  flex: 1;
}

.renderer-table-filters {
  width: 100%;
  background: var(--el-fill-color-lighter, #f5f7fa);
  border: 1px solid var(--el-border-color-lighter, #e4e7ed);
  border-radius: 4px;
  padding: 12px 16px;
}

.renderer-table-filters__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.renderer-table-filters__heading {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.renderer-table-filters__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary, #303133);
}

.renderer-table-filters__toggle {
  border: 0;
  background: transparent;
  color: var(--el-color-primary, #409eff);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  line-height: 1.5;
}

.renderer-table-filters__toggle-icon {
  display: inline-block;
  width: 10px;
}

.renderer-table-filters__body {
  flex: 1;
  min-width: 0;
}

.renderer-table-filters__content {
  min-width: 0;
}

.renderer-table-filters__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-extra-light, #f0f2f5);
}

.renderer-table-filters__count {
  margin-left: 4px;
}

.renderer-table-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.renderer-table-layout--left .renderer-table-toolbar,
.renderer-table-layout--right .renderer-table-toolbar {
  flex-direction: column;
  align-items: stretch;
}

.renderer-table-row-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
