<!--
/**
 * @skill r-table
 * @description 数据表格容器，通过 DataKey 绑定 DataView，自动渲染行数据；除列区外，其它结构统一通过 wrapper 子节点（r-toolbar / r-filter / r-actions）组织，显示参数写入各 wrapper 的 props
 * @provides DATA_SOURCE
 * @consumes PAGE_DATASET
 * @input { dataKey: string, children?: [{ type: 'r-toolbar'|'r-filter'|'r-actions'|'el-table-column'|'r-*', props?: Record<string, unknown>, children?: SparkNode[] }], props: { border?: boolean, stripe?: boolean, highlightCurrentRow?: boolean } }
 * @example { "type": "r-table", "dataKey": "Orders@rows", "props": { "border": true, "highlightCurrentRow": true } }
 */
-->
<template>
  <div :class="['renderer-table-layout', `renderer-table-layout--${toolbarPositionValue}`]">
    <!-- 工具栏 -->
    <RendererToolbar
      v-if="showToolbar"
      type="r-toolbar"
      :class="['renderer-table-toolbar', toolbarClassValue]"
      v-bind="toolbarComponentProps"
      :children="resolvedToolbarChildren"
    />

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
        @row-click="handleRowClick"
        @selection-change="handleSelectionChange"
      >
        <SparkTableColumns>
          <!-- 行操作列（左） -->
          <el-table-column v-if="showRowActionsLeftValue" v-bind="rowActionColumnAttrs">
            <template #default="{ row, $index }">
              <div :class="['renderer-table-row-actions', rowActionsClassValue]">
                <template v-for="(action, index) in getScopedRowActions({ row, index: $index })" :key="nodeId(action) ?? `r-table-row-action-${index}`">
                  <SparkComponentRenderer :config="resolveRowActionConfig(action, row, $index)" />
                </template>
                <slot name="row-actions" v-bind="getRowActionSlotScope(row, $index)" />
              </div>
            </template>
          </el-table-column>

          <!-- 主数据列 -->
          <SparkComponentRenderer
            v-for="(child, index) in sparkChildren"
            :key="nodeId(child) ?? `r-table-child-${index}`"
            :config="child"
          />
          <slot />

          <!-- 行操作列（右） -->
          <el-table-column v-if="showRowActionsRightValue" v-bind="rowActionColumnAttrs">
            <template #default="{ row, $index }">
              <div :class="['renderer-table-row-actions', rowActionsClassValue]">
                <template v-for="(action, index) in getScopedRowActions({ row, index: $index })" :key="nodeId(action) ?? `r-table-row-action-${index}`">
                  <SparkComponentRenderer :config="resolveRowActionConfig(action, row, $index)" />
                </template>
                <slot name="row-actions" v-bind="getRowActionSlotScope(row, $index)" />
              </div>
            </template>
          </el-table-column>
        </SparkTableColumns>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @skill-description 数据表格容器，基于 el-table 绑定 DataView 渲染行数据，支持工具栏/筛选区/行操作等区域，自动同步当前行和选中行状态。
 */
/**
 * RendererTable - 表格容器组件
 *
 * 双模式：
 *   配置驱动：传入 config，子组件由 SparkComponentRenderer 通用递归渲染
 *   模板驱动：不传 config，通过 <slot> 接收模板子内容
 */
import { computed, ref, useAttrs, useSlots } from 'vue'
import {
  useSparkPageComponent, SparkComponentRenderer, SparkTableColumns,
  getSparkNodeChildren, nodeId, nodeInputProp, type SparkNode,
  PAGE_DATASET, DATA_SOURCE, MODULE_CONTEXT,
} from '../../../internal'
import type { IDataRow, DataView } from '@spark-view/spark-data'
import { PAGE_SERVICE } from '@spark-view/spark-utils'
import { createRendererTableZeroCode, type NativeTableLike } from './zero-code'
import { useRendererTableViewState } from './view-state'
import { useContainerActions, type LateralActionPosition } from '../../useContainerActions'
import { useContainerDataSource, useContainerDataSourceEffects } from '../../useContainerDataSource'
import { useContainerSlots } from '../../layout/useContainerSlots'
import { useContainerToolbar, type ToolbarPosition } from '../../layout/useContainerToolbar'
import type { ActionsNode } from '../../RendererActions.types'
import type { FilterNode } from '../../RendererFilter.types'
import { createRowActionSlotScope } from '../../slotScopeFactories'
import { useModuleContext } from '../../context/useModuleContext'
import RendererFieldScope from '../RendererFieldScope.vue'
import RendererToolbar from '../../non-data-components/RendererToolbar.vue'
import type { ToolbarNode } from '../../non-data-components/RendererToolbar.types'
import { useTableFilters } from '../../layout/useTableFilters'
import {
  type AddRowHandler, type EditRowHandler, type RemoveRowHandler,
  type RowClickHandler, type RowSelectionHandler, type CurrentRowChangeHandler,
} from '../../support/index.js'
import { bindActionClick, isBuiltinAction } from '../../builtin-actions'

function toKebabCase(name: string): string {
  return name.replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)
}

const TABLE_LOCAL_ATTR_BASE_KEYS = [
  'toolbar',
  'filterColumns',
  'rowActions',
  'rowActionsPosition',
  'rowActionsAlign',
  'rowActionsFixed',
  'rowActionsClass',
  'rowActionsLabel',
  'rowActionsWidth',
  'filterClass',
  'filterGridColumns',
  'filterGridGap',
  'filterGridAutoRows',
  'filterCollapsible',
  'filterDefaultCollapsed',
  'filterAutoFitMinWidth',
  'filterItemSpan',
] as const

const TABLE_LOCAL_ATTR_KEYS = new Set<string>(
  TABLE_LOCAL_ATTR_BASE_KEYS.flatMap(key => [key, toKebabCase(key)]),
)

interface Props extends SparkNode {
  /** DataKey 格式：tableName@field */
  dataKey?: string
  /** 结构化工具栏 */
  toolbar?: ToolbarNode
  /** 结构化筛选区 */
  filter?: FilterNode
  /** 结构化行动作 */
  actions?: ActionsNode
  /** 子节点列表（列节点 + 区域节点） */
  children?: SparkNode[]
  onRowClick?: RowClickHandler
  onSelectionChange?: RowSelectionHandler
  onCurrentChange?: CurrentRowChangeHandler
  onAddRow?: AddRowHandler
  onEditRow?: EditRowHandler
  onRemoveRow?: RemoveRowHandler
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-table',
})

const attrs = useAttrs()
const slots = useSlots()

// ── 属性读取工具 ──────────────────────────────────────────────────────────

const _attrs = attrs as Readonly<Record<string, unknown>>

function readAttr(name: string): unknown {
  const directValue = _attrs[name]
  if (directValue !== undefined) return directValue
  return _attrs[toKebabCase(name)]
}

function readStringAttr(name: string): string | undefined {
  const value = readAttr(name)
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readBooleanAttr(name: string): boolean | undefined {
  const value = readAttr(name)
  if (typeof value === 'boolean') return value
  if (value === '') return true
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

function readNumberAttr(name: string): number | undefined {
  const value = readAttr(name)
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return undefined
}

function readNumberOrStringAttr(name: string): number | string | undefined {
  const value = readAttr(name)
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.length > 0) return value
  return undefined
}

function childProp<T>(child: SparkNode | undefined, name: string): T | undefined {
  return child?.props?.[name] as T | undefined
}

// ── 输入解析 ──────────────────────────────────────────────────────────────

const baseTableAttrs = computed<Record<string, unknown>>(() => {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(_attrs)) {
    if (TABLE_LOCAL_ATTR_KEYS.has(key)) continue
    result[key] = value
  }
  return result
})
const effectiveDataKey = computed(() => props.dataKey)

const sparkChildren = computed<SparkNode[]>(() => {
  const nodes: SparkNode[] = []
  for (const child of props.children ?? []) {
    if (typeof child === 'string' || typeof child === 'number') continue
    if (isCollectedTableColumn(child)) nodes.push(child)
  }
  return nodes
})

// ── SPARK 上下文与数据源 ───────────────────────────────────────────────────

const { sparkConsume, sparkProvide, registerApi, logger } = useSparkPageComponent(props)

const pageDataSet = sparkConsume(PAGE_DATASET)
const pageService = sparkConsume(PAGE_SERVICE)
const moduleContext = useModuleContext(sparkConsume(MODULE_CONTEXT))

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

const {
  toolbarPositionValue,
  toolbarClassValue,
  visibleToolbarConfigs,
  showToolbar,
} = useContainerToolbar({
  toolbar: computed(() => getSparkNodeChildren(props.toolbar?.children)),
  toolbarPosition: computed(() => childProp<ToolbarPosition>(props.toolbar, 'position')),
  toolbarClass: computed(() => childProp<string>(props.toolbar, 'class')),
  modelPermission,
  dataSource: resolvedView,
})

const resolvedToolbarChildren = computed<SparkNode[]>(() =>
  visibleToolbarConfigs.value.map(action =>
    isBuiltinAction(action) ? bindActionClick(action, () => handleBuiltinToolbarAction(action)) : action,
  ),
)

const toolbarComponentProps = computed<Record<string, unknown>>(() => {
  const childMeta = props.toolbar?.props
  if (!childMeta) return {}
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(childMeta)) {
    if (key !== 'position' && key !== 'class') result[key] = value
  }
  return result
})

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
  filterChildren: computed(() => getSparkNodeChildren(props.filter?.children)),
  dataView: resolvedView,
  filterClass: computed(() => childProp<string>(props.filter, 'class') ?? readStringAttr('filterClass') ?? ''),
  filterGridColumns: computed(() => childProp<number>(props.filter, 'gridColumns') ?? readNumberAttr('filterGridColumns') ?? 24),
  filterGridGap: computed(() => childProp<number | string>(props.filter, 'gridGap') ?? readNumberOrStringAttr('filterGridGap') ?? 12),
  filterGridAutoRows: computed(() => childProp<string>(props.filter, 'gridAutoRows') ?? readStringAttr('filterGridAutoRows') ?? 'minmax(32px, auto)'),
  logger,
})

const {
  tableData,
  tableAttrs,
  filterCollapsibleValue,
  filterAutoFitMinWidthValue,
  filterItemSpanValue,
  filtersCollapsed,
  toggleFiltersCollapsed,
} = useRendererTableViewState({
  filterNode: computed(() => props.filter),
  baseTableAttrs,
  resolvedView,
  filteredRows,
  readStringAttr,
  readBooleanAttr,
  readNumberAttr,
})

// ── 视图状态 ──────────────────────────────────────────────────────────────

const nativeTableRef = ref<NativeTableLike | null>(null)

const {
  dispatch,
  tableApi,
  handleBuiltinToolbarAction,
  handleBuiltinRowAction,
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

defineExpose(tableApi)

// ── 行操作区 ──────────────────────────────────────────────────────────────

const {
  actionPositionValue: rowActionsPositionValue,
  actionClassValue: rowActionsClassValue,
  showActionsLeft: showRowActionsLeft,
  showActionsRight: showRowActionsRight,
  getScopedActionConfigs: getScopedRowActions,
} = useContainerActions<{ row: IDataRow, index: number }>({
  actionConfigs: computed(() => getSparkNodeChildren(props.actions?.children)),
  actionPosition: computed(() => childProp<LateralActionPosition>(props.actions, 'position') ?? 'right'),
  actionClass: computed(() => childProp<string>(props.actions, 'class') ?? readStringAttr('rowActionsClass') ?? ''),
  modelPermission,
  dataSource: resolvedView,
  resolveScope: ({ row, index }) => ({
    row,
    listenerArgs: [row, index],
    scopedProps: { row, rowIndex: index },
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

/** 行操作列统一属性（child props → legacy attrs → defaults） */
const rowActionColumnAttrs = computed(() => {
  const label = childProp<string>(props.actions, 'label') ?? readStringAttr('rowActionsLabel') ?? '操作'
  const width = childProp<number | string>(props.actions, 'width') ?? readNumberOrStringAttr('rowActionsWidth') ?? 160
  const rawAlign = childProp<string>(props.actions, 'align') ?? readStringAttr('rowActionsAlign')
  const align = rawAlign === 'left' || rawAlign === 'center' || rawAlign === 'right' ? rawAlign : 'left'
  const childFixed = childProp<boolean | 'left' | 'right'>(props.actions, 'fixed')
  let fixed: boolean | 'left' | 'right'
  if (childFixed !== undefined) {
    fixed = childFixed
  } else {
    const attrFixed = readAttr('rowActionsFixed')
    fixed = typeof attrFixed === 'boolean' ? attrFixed
      : attrFixed === 'left' || attrFixed === 'right' ? attrFixed
      : rowActionsPositionValue.value
  }
  return { label, width, align, fixed, className: rowActionsClassValue.value || undefined }
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

function resolveRowActionConfig(action: SparkNode, row: IDataRow, index: number): SparkNode {
  return isBuiltinAction(action)
    ? bindActionClick(action, () => handleBuiltinRowAction(action, row, index))
    : action
}

// ── 过滤操作 ──────────────────────────────────────────────────────────────

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

// ── 字段上下文与事件桥接 ──────────────────────────────────────────────────

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

function isCollectedTableColumn(config: SparkNode): boolean {
  const type = config.type
  if (typeof type !== 'string' || type.length === 0) return false
  if (/^Render[A-Z]/.test(type)) return false
  if (type === 'el-table-column') return true
  if (!type.startsWith('r-')) return false
  const field = nodeInputProp(config, 'field')
  if (typeof field === 'string' && field.length > 0) return true
  const children = getSparkNodeChildren(config.children)
  if (children.length > 0) return true
  return false
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

.renderer-table-layout--left .renderer-table-toolbar :deep(.renderer-toolbar-lane),
.renderer-table-layout--right .renderer-table-toolbar :deep(.renderer-toolbar-lane) {
  grid-auto-flow: row;
  grid-auto-rows: max-content;
}

.renderer-table-row-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
