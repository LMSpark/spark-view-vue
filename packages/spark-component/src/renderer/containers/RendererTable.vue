<!--
/**
 * @skill r-table
 * @description 数据表格容器，通过 DataKey 绑定 DataView，自动渲染行数据，支持当前行高亮、多选、分页
 * @provides DATA_SOURCE
 * @provides TABLE_API
 * @consumes PAGE_DATASET
 * @input { dataKey: string, props: { border?: boolean, stripe?: boolean, highlightCurrentRow?: boolean } }
 * @example { "type": "r-table", "dataKey": "Orders@rows", "props": { "border": true, "highlightCurrentRow": true } }
 */
-->
<template>
  <div :class="['renderer-table-layout', `renderer-table-layout--${toolbarPositionValue}`]">
    <!-- 工具栏 -->
    <div v-if="showToolbar" :class="['renderer-table-toolbar', toolbarClassValue]">
      <template v-for="(action, index) in visibleToolbarConfigs" :key="action.id ?? `r-table-toolbar-${index}`">
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
      <slot
        name="toolbar"
        v-bind="getToolbarSlotScope()"
      />
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
                <template v-for="(action, index) in getScopedRowActions({ row, index: $index })" :key="action.id ?? `r-table-row-action-left-${index}`">
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
              :key="child.id ?? `r-table-child-${i}`"
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
                <template v-for="(action, index) in getScopedRowActions({ row, index: $index })" :key="action.id ?? `r-table-row-action-right-${index}`">
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
import { computed, defineComponent, inject, onUnmounted, ref, useSlots, watch } from 'vue'
import { useSparkComponent, SparkComponentRenderer } from '../_pkg'
import type { SparkNode, RendererTableApi } from '../_pkg'
import type { ModuleContextCapability } from '../_pkg'
import type { IDataRow, IDataSource, DataView, IModelPermission } from '@spark-view/spark-data'
import { PAGE_SERVICE } from '@spark-view/spark-utils'
import { PAGE_DATASET, DATA_SOURCE, TABLE_API, SPARK_NODE_CONFIG_KEY } from '../_pkg'
import { FIELD_CONTEXT, MODULE_CONTEXT } from '../_pkg'
import { useContainerActions } from './useContainerActions'
import type { LateralActionPosition } from './useContainerActions'
import { useContainerInput } from './useContainerInput'
import { useContainerDataSource } from './useContainerDataSource'
import { useContainerSlots } from './useContainerSlots'
import { useContainerToolbar } from './useContainerToolbar'
import type { ToolbarPosition } from './useContainerToolbar'
import { createRowActionSlotScope, createToolbarSlotScope } from './useContainerSlotScopes'
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
} from './builtin-actions'

type RowActionsPosition = LateralActionPosition

interface Props {
  /** DataKey 格式：tableName@field（与 config 同层冗余时以 config.props.dataKey 为准） */
  dataKey?: string
  /** 直接传入的 DataView（备用） */
  dataView?: DataView | undefined
  /** 工具栏按钮配置 */
  toolbar?: SparkNode[]
  /** 工具栏位置 */
  toolbarPosition?: ToolbarPosition
  /** 工具栏 CSS 类名 */
  toolbarClass?: string
  /** 筛选项字段列表 */
  filterColumns?: string[]
  /** 筛选区 CSS 类名 */
  filterClass?: string
  /** 筛选区可折叠 */
  filterCollapsible?: boolean
  /** 筛选区默认折叠 */
  filterDefaultCollapsed?: boolean
  /** 筛选区最小宽度 */
  filterAutoFitMinWidth?: string
  /** 每项跨列数 */
  filterItemSpan?: number
  /** 筛选栅格总列数 */
  filterGridColumns?: number
  /** 筛选栅格间距 */
  filterGridGap?: number | string
  /** 筛选栅格行高 */
  filterGridAutoRows?: string
  /** 行操作按钮配置 */
  rowActions?: SparkNode[]
  /** 行操作列位置 */
  rowActionsPosition?: RowActionsPosition
  /** 行操作列标题 */
  rowActionsLabel?: string
  /** 行操作列宽度 */
  rowActionsWidth?: string | number
  /** 行操作列对齐方式 */
  rowActionsAlign?: 'left' | 'center' | 'right'
  /** 行操作列固定方向 */
  rowActionsFixed?: boolean | 'left' | 'right'
  /** 行操作列 CSS 类名 */
  rowActionsClass?: string
}

const props = withDefaults(defineProps<Props>(), {
  toolbarPosition: 'top',
  toolbarClass: '',
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
const slots = useSlots()
const nodeConfig = inject(SPARK_NODE_CONFIG_KEY, undefined)

const ElTableColumns = defineComponent({
  name: 'ElTableColumns',
  setup(_, { slots: componentSlots }) {
    return () => componentSlots['default']?.() ?? []
  },
})

// ── 输入解析 ──────────────────────────────────────────────────────────────

const { effectiveDataKey, mergedChildren } = useContainerInput({
  config: computed(() => nodeConfig),
  dataKey: computed(() => props.dataKey),
})

const legacyRowActionConfigs = computed(() =>
  mergedChildren.value.filter(child => /^Render[A-Z]/.test(child.type))
)

const sparkChildren = computed(() => {
  return mergedChildren.value.filter(child => isCollectedTableColumn(child))
})

// ── SPARK 上下文与数据源 ───────────────────────────────────────────────────

const { consume, provide: sparkProvide, registerApi, logger } = useSparkComponent(
  nodeConfig ?? { type: 'r-table' }
)

const pageDataSet = consume(PAGE_DATASET)
const pageService = consume(PAGE_SERVICE)
const moduleContextCapability = consume(MODULE_CONTEXT) as ModuleContextCapability | null
const moduleContext = ref<ReturnType<ModuleContextCapability['getCurrent']>>(moduleContextCapability?.getCurrent() ?? null)
const unsubscribeModuleContext = moduleContextCapability?.subscribe((next) => {
  moduleContext.value = next
}) ?? null

const { resolvedDataSource: resolvedView } = useContainerDataSource<DataView>({
  dataKey: effectiveDataKey,
  pageDataSet,
  fallbackSource: computed(() => props.dataView ?? null),
  mapView: view => view,
  provideDataSource: view => sparkProvide(DATA_SOURCE, view),
  logger,
  logPrefix: 'RendererTable',
})

// ── 视图状态 ──────────────────────────────────────────────────────────────

const tableRows = computed(() => resolvedView.value?.rows ?? [])
const modelPermission = computed<IModelPermission | undefined>(() =>
  (resolvedView.value as IDataSource | null | undefined)?._modelPerm
)

// ── 工具栏 ────────────────────────────────────────────────────────────────

const {
  toolbarPositionValue,
  toolbarClassValue,
  visibleToolbarConfigs,
  showToolbar,
} = useContainerToolbar({
  config: computed(() => nodeConfig),
  toolbar: computed(() => nodeConfig?.toolbar?.items ?? props.toolbar),
  toolbarPosition: computed(() => nodeConfig?.toolbar?.position ?? props.toolbarPosition),
  toolbarClass: computed(() => nodeConfig?.toolbar?.class ?? props.toolbarClass),
  modelPermission,
  slots,
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
  config: computed(() => nodeConfig),
  children: sparkChildren,
  dataView: resolvedView,
  filterColumns: computed(() => {
    const meta = nodeConfig?.filter
    if (meta?.columns) return meta.columns as string[]
    return props.filterColumns
  }),
  filterClass: computed(() => nodeConfig?.filter?.class ?? props.filterClass),
  filterGridColumns: computed(() => nodeConfig?.filter?.gridColumns ?? props.filterGridColumns),
  filterGridGap: computed(() => nodeConfig?.filter?.gridGap ?? props.filterGridGap),
  filterGridAutoRows: computed(() => nodeConfig?.filter?.gridAutoRows ?? props.filterGridAutoRows),
  logger,
})

const filterCollapsibleValue = computed(() =>
  nodeConfig?.filter?.collapsible
  ?? (nodeConfig?.props?.['filterCollapsible'] as boolean | undefined)
  ?? props.filterCollapsible
)

const filterDefaultCollapsedValue = computed(() =>
  nodeConfig?.filter?.defaultCollapsed
  ?? (nodeConfig?.props?.['filterDefaultCollapsed'] as boolean | undefined)
  ?? props.filterDefaultCollapsed
)

const filterAutoFitMinWidthValue = computed(() =>
  nodeConfig?.filter?.autoFitMinWidth
  ?? (nodeConfig?.props?.['filterAutoFitMinWidth'] as string | undefined)
  ?? props.filterAutoFitMinWidth
)

const filterItemSpanValue = computed(() =>
  nodeConfig?.filter?.itemSpan
  ?? (nodeConfig?.props?.['filterItemSpan'] as number | undefined)
  ?? props.filterItemSpan
)

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

sparkProvide(TABLE_API, tableApi)
registerApi(tableApi)

defineExpose(tableApi)

onUnmounted(() => {
  unsubscribeModuleContext?.()
})

// ── 行操作区 ──────────────────────────────────────────────────────────────

const {
  actionPositionValue: rowActionsPositionValue,
  actionClassValue: rowActionsClassValue,
  showActionsLeft: showRowActionsLeft,
  showActionsRight: showRowActionsRight,
  getScopedActionConfigs: getScopedRowActions,
} = useContainerActions<{ row: IDataRow, index: number }>({
  config: computed(() => nodeConfig),
  actionConfigs: computed(() => {
    // v3 meta 域优先
    if (nodeConfig?.actions?.items) {
      return [...legacyRowActionConfigs.value, ...nodeConfig.actions.items]
    }
    const explicit = (nodeConfig?.props?.['rowActions'] as SparkNode[] | undefined) ?? props.rowActions ?? []
    return [...legacyRowActionConfigs.value, ...explicit]
  }),
  actionPosition: computed(() => nodeConfig?.actions?.position ?? props.rowActionsPosition),
  actionClass: computed(() => nodeConfig?.actions?.class ?? props.rowActionsClass),
  actionPropKey: 'rowActions',
  actionPositionPropKey: 'rowActionsPosition',
  actionClassPropKey: 'rowActionsClass',
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

const rowActionsLabelValue = computed(() =>
  nodeConfig?.actions?.label
  ?? (nodeConfig?.props?.['rowActionsLabel'] as string | undefined)
  ?? props.rowActionsLabel
)

const rowActionsWidthValue = computed(() =>
  nodeConfig?.actions?.width
  ?? (nodeConfig?.props?.['rowActionsWidth'] as string | number | undefined)
  ?? props.rowActionsWidth
)

const rowActionsAlignValue = computed(() =>
  nodeConfig?.actions?.align
  ?? (nodeConfig?.props?.['rowActionsAlign'] as 'left' | 'center' | 'right' | undefined)
  ?? props.rowActionsAlign
)

const rowActionsFixedValue = computed<boolean | 'left' | 'right'>(() => {
  const metaFixed = nodeConfig?.actions?.fixed
  if (metaFixed !== undefined) return metaFixed
  const explicit = (nodeConfig?.props?.['rowActionsFixed'] as boolean | 'left' | 'right' | undefined) ?? props.rowActionsFixed
  if (explicit !== undefined) return explicit
  return rowActionsPositionValue.value
})

// ── 槽位作用域 ────────────────────────────────────────────────────────────

function getToolbarSlotScope() {
  return createToolbarSlotScope({
    dataSource: resolvedView.value,
    modelPermission: modelPermission.value,
  }, {
    rows: tableRows.value,
    moduleContext: moduleContext.value,
  })
}

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

function getSelectedRows(view: DataView): IDataRow[] {
  return Array.isArray(view.selectedRows) ? view.selectedRows : []
}

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
  // 数据列：有 field 绑定（v3 field 或 v2 name 经 bindRules 兼容映射）
  if (typeof config.field === 'string' && config.field.length > 0) {
    return true
  }
  // 分组列：无 field 但有子列（如 r-column-group）
  const sparkKids = config.props?.['sparkChildren'] as SparkNode[] | undefined
  if (Array.isArray(sparkKids) && sparkKids.length > 0) return true
  return false
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
