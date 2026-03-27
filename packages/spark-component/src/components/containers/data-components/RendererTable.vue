<!--
/**
 * @skill r-table
 * @description 数据表格容器，通过 DataKey 绑定 DataView，自动渲染行数据；除列区外，其它结构统一通过 children + dock 分区（toolbar / filter / actions）组织，显示参数写入 props.docks
 * @provides DATA_SOURCE
 * @consumes PAGE_DATASET
 * @input { dataKey: string, children?: [{ dock?: 'default'|'toolbar'|'filter'|'actions' }], props: { docks?: { toolbar?: { position?: 'top'|'bottom'|'left'|'right', class?: string }, filter?: { collapsible?: boolean, defaultCollapsed?: boolean, class?: string }, actions?: { position?: 'left'|'right', label?: string, width?: string|number, align?: 'left'|'center'|'right', fixed?: boolean|'left'|'right', class?: string } }, border?: boolean, stripe?: boolean, highlightCurrentRow?: boolean } }
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
          type="r-field-scope"
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
        v-bind="tableAttrs"
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
import { useSparkComponent, SparkComponentRenderer } from '../../internal'
import { nodeId, nodeInputProp, getDockedChildren, getSparkNodeChildren, nodeDock, DEFAULT_DOCK, type SparkNode, type RendererTableApi } from '../../internal'
import type { ContainerDocks } from '../../../core/types'
import type { IDataRow, DataView } from '@spark-view/spark-data'
import { PAGE_SERVICE } from '@spark-view/spark-utils'
import { PAGE_DATASET, DATA_SOURCE } from '../../internal'
import { FIELD_CONTEXT } from '../../internal'
import { MODULE_CONTEXT } from '../../internal'
import { useContainerActions } from '../actions/useContainerActions'
import type { LateralActionPosition } from '../actions/useContainerActions'
import { useContainerDataSource, useContainerDataSourceEffects } from '../data/useContainerDataSource'
import { useContainerSlots } from '../layout/useContainerSlots'
import { useContainerToolbar } from '../layout/useContainerToolbar'
import type { ToolbarPosition } from '../layout/useContainerToolbar'
import { createRowActionSlotScope } from '../slotScopeFactories'
import { useModuleContext } from '../context/useModuleContext'
import RendererFieldScope from './RendererFieldScope.vue'
import { useTableFilters } from '../layout/useTableFilters'
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
} from '../builtin-actions'

type RowActionsPosition = LateralActionPosition

interface Props {
  /** 组件类型（运行时缺省回落为 r-table） */
  type?: string
  /** 组件属性透传占位（兼容 SparkNode 结构） */
  props?: Record<string, unknown>
  /** 节点唯一标识 */
  id?: string
  /** DataKey 格式：tableName@field */
  dataKey?: string
  /** 子节点列表 */
  children?: SparkNode[]
  /** 停靠区域显示配置 */
  docks?: ContainerDocks
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-table',
  docks: () => ({}),
})

const attrs = useAttrs()
const slots = useSlots()
const tableAttrs = computed<Record<string, unknown>>(() => {
  const { toolbar: _legacyToolbar, ...rest } = attrs as Record<string, unknown>
  return rest
})

function readStringAttr(name: string): string | undefined {
  const value = attrs[name]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readBooleanAttr(name: string): boolean | undefined {
  const value = attrs[name]
  if (typeof value === 'boolean') return value
  if (value === '') return true
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

function readNumberAttr(name: string): number | undefined {
  const value = attrs[name]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return undefined
}

function readNumberOrStringAttr(name: string): number | string | undefined {
  const value = attrs[name]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.length > 0) return value
  return undefined
}

const legacyFilterColumnsValue = computed<string[]>(() => {
  const value = attrs['filterColumns']
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
})

const legacyRowActionsValue = computed<SparkNode[]>(() => {
  const value = attrs['rowActions']
  return Array.isArray(value) ? value as SparkNode[] : []
})

const legacyRowActionsPositionValue = computed<RowActionsPosition | undefined>(() => {
  const value = readStringAttr('rowActionsPosition')
  return value === 'left' || value === 'right' ? value : undefined
})

const legacyRowActionsAlignValue = computed<'left' | 'center' | 'right' | undefined>(() => {
  const value = readStringAttr('rowActionsAlign')
  return value === 'left' || value === 'center' || value === 'right' ? value : undefined
})

const legacyRowActionsFixedValue = computed<boolean | 'left' | 'right' | undefined>(() => {
  const value = attrs['rowActionsFixed']
  if (typeof value === 'boolean') return value
  if (value === 'left' || value === 'right') return value
  return undefined
})

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

const { sparkConsume, sparkProvide, registerApi, logger } = useSparkComponent(props)

const pageDataSet = sparkConsume(PAGE_DATASET)
const pageService = sparkConsume(PAGE_SERVICE)
const moduleContext = useModuleContext(sparkConsume(MODULE_CONTEXT))

assertNoLegacyTableStructures()

const { resolvedDataSource: resolvedView, modelPermission } = useContainerDataSource<DataView>({
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

sparkProvide(FIELD_CONTEXT, 'table')

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
  filterColumns: computed(() => legacyFilterColumnsValue.value),
  filterClass: computed(() => props.docks?.filter?.class ?? readStringAttr('filterClass') ?? ''),
  filterGridColumns: computed(() => props.docks?.filter?.gridColumns ?? readNumberAttr('filterGridColumns') ?? 24),
  filterGridGap: computed(() => props.docks?.filter?.gridGap ?? readNumberOrStringAttr('filterGridGap') ?? 12),
  filterGridAutoRows: computed(() => props.docks?.filter?.gridAutoRows ?? readStringAttr('filterGridAutoRows') ?? 'minmax(32px, auto)'),
  logger,
})

const filterCollapsibleValue = computed(() => props.docks?.filter?.collapsible ?? readBooleanAttr('filterCollapsible') ?? false)

const filterDefaultCollapsedValue = computed(() => props.docks?.filter?.defaultCollapsed ?? readBooleanAttr('filterDefaultCollapsed') ?? false)

const filterAutoFitMinWidthValue = computed(() => props.docks?.filter?.autoFitMinWidth ?? readStringAttr('filterAutoFitMinWidth') ?? '220px')

const filterItemSpanValue = computed(() => props.docks?.filter?.itemSpan ?? readNumberAttr('filterItemSpan') ?? 1)

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
  async addRow(row) {
    const view = resolvedView.value
    if (!view) return null
    return await view.addRow(row)
  },
  async editRowById(id, patch) {
    const view = resolvedView.value
    if (!view) return false
    return await view.editRowById(id, patch)
  },
  async removeRow(id) {
    const view = resolvedView.value
    if (!view) return false
    return await view.removeRow(id)
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
  actionPosition: computed(() => props.docks?.actions?.position as LateralActionPosition | undefined ?? legacyRowActionsPositionValue.value ?? 'right'),
  actionClass: computed(() => props.docks?.actions?.class ?? readStringAttr('rowActionsClass') ?? ''),
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

const rowActionsLabelValue = computed(() => props.docks?.actions?.label ?? readStringAttr('rowActionsLabel') ?? '操作')

const rowActionsWidthValue = computed(() => props.docks?.actions?.width ?? readNumberOrStringAttr('rowActionsWidth') ?? 160)

const rowActionsAlignValue = computed(() => props.docks?.actions?.align ?? legacyRowActionsAlignValue.value ?? 'left')

const rowActionsFixedValue = computed<boolean | 'left' | 'right'>(() => {
  const fixed = props.docks?.actions?.fixed ?? legacyRowActionsFixedValue.value
  if (fixed !== undefined) return fixed
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
  const type = config.type
  if (typeof type !== 'string' || type.length === 0) return false
  if (/^Render[A-Z]/.test(type)) return false
  if (type === 'el-table-column') return true
  if (!type.startsWith('r-')) return false
  const field = nodeInputProp(config, 'field')
  if (typeof field === 'string' && field.length > 0) {
    return true
  }
  // 分组列：无 field 但有子列（如 r-column-group）
  const kids = getSparkNodeChildren(config.children)
  if (kids.length > 0) return true
  return false
}

function assertNoLegacyTableStructures(): void {
  if (Array.isArray(attrs['toolbar']) && attrs['toolbar'].length > 0) {
    throw new Error('[RendererTable] props.toolbar 已废除。请将工具栏节点移动到 children，并声明 dock: "toolbar"；位置与样式请改为 props.docks.toolbar。')
  }

  if (legacyFilterColumnsValue.value.length > 0) {
    throw new Error('[RendererTable] props.filterColumns 已废除。请将筛选项移动到 children，并为每个筛选节点声明 dock: "filter"。')
  }

  if (legacyRowActionsValue.value.length > 0) {
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

