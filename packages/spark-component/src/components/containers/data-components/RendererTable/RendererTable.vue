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
    <RendererFilter
      v-if="hasFilters"
      :class="filterClassValue"
      :model="filterModel"
      :configs="filterConfigs"
      :active-count="activeFilterCount"
      :collapsible="filterCollapsibleValue"
      :collapsed="filtersCollapsed"
      :grid-columns="filterGridColumnsValue"
      :grid-gap="filterGridGapValue"
      :grid-auto-rows="filterGridAutoRowsValue"
      :auto-fit-min-width="filterAutoFitMinWidthValue"
      :item-span="filterItemSpanValue"
      :search-action="handleFilterSearch"
      :reset-action="handleFilterReset"
      :toggle-collapsed-action="toggleFiltersCollapsed"
    />

    <!-- 表格主体 -->
    <div class="renderer-table-main">
      <el-table
        ref="nativeTableRef"
        :data="tableData"
        v-bind="tableAttrs"
        @current-change="handleCurrentChange"
        @row-click="handleRowClick"
        @selection-change="handleSelectionChange"
      >
        <!--
          列区必须直接成为 el-table 的子级。
          SparkTableColumns 只是一个透明转发层，用来同时容纳：
          1. 配置驱动列（props.children）
          2. 模板驱动列（默认 slot）
          3. 行操作列（左右）
        -->
        <SparkTableColumns>
          <!-- 行操作列（左） -->
          <RendererActionHost
            v-if="showRowActionsLeftValue"
            host-tag="el-table-column"
            :host-attrs="rowActionColumnAttrs"
            :resolve-actions="getRenderedRowActions"
            :resolve-slot-scope="getScopedRowActionSlotScope"
            action-key-prefix="r-table-row-action"
            :wrapper-class="['renderer-table-row-actions', rowActionsClassValue]"
          >
            <template #actions="scope">
              <slot name="row-actions" v-bind="scope" />
            </template>
          </RendererActionHost>

          <!-- 主数据列：直接按绑定层整理后的 children 配置渲染 -->
          <SparkComponentRenderer
            v-for="(child, index) in props.children ?? []"
            :key="nodeId(child) ?? `r-table-child-${index}`"
            :config="child"
          />

          <!-- 模板驱动补充列：兼容直接手写 el-table-column -->
          <slot />

          <!-- 行操作列（右） -->
          <RendererActionHost
            v-if="showRowActionsRightValue"
            host-tag="el-table-column"
            :host-attrs="rowActionColumnAttrs"
            :resolve-actions="getRenderedRowActions"
            :resolve-slot-scope="getScopedRowActionSlotScope"
            action-key-prefix="r-table-row-action"
            :wrapper-class="['renderer-table-row-actions', rowActionsClassValue]"
          >
            <template #actions="scope">
              <slot name="row-actions" v-bind="scope" />
            </template>
          </RendererActionHost>
        </SparkTableColumns>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @skill r-table
 * @description 数据表格容器，基于 el-table 绑定 DataView 渲染行数据，支持工具栏/筛选区/行操作等区域，自动同步当前行和选中行状态。
 * @category container
 * @binding datakey-driven
 * @provides DATA_SOURCE
 * @consumes PAGE_DATASET
 * @consumes PAGE_SERVICE
 * @consumes MODULE_CONTEXT
 * @notes children 仅放 r-* 字段组件做列，禁止 el-table-column
 * @notes dock='filter' 声明筛选区节点；dock='toolbar' 声明工具栏；dock='actions' 声明行操作
 * @notes highlightCurrentRow 必须显式声明才生效
 */
/**
 * RendererTable - 表格容器组件
 *
 * 双模式：
 * 1. 配置驱动：列结构直接来自 props.children，统一走 SparkComponentRenderer。
 * 2. 模板驱动：保留默认 slot，允许直接手写 el-table-column。
 *
 * 结构约定：
 * - r-toolbar / r-filter / r-actions 已由绑定层从 children 提升到 props。
 * - 到达此组件时，props.children 只保留表格内容列配置，不再做运行时二次分拣。
 */
import { computed, ref, useAttrs, useSlots } from 'vue'
import {
  useSparkPageComponent, SparkComponentRenderer, SparkTableColumns,
  getSparkNodeChildren, nodeId, type SparkNode,
  PAGE_DATASET, DATA_SOURCE, MODULE_CONTEXT,
} from '../../../internal'
import type { RTableProps } from './RendererTable.props'
import type { IDataRow, DataView } from '@spark-view/spark-data'
import { PAGE_SERVICE } from '@spark-view/spark-utils'
import { createRendererTableZeroCode, type NativeTableLike } from './zero-code'
import { useRendererTableViewState } from './view-state'
import RendererActionHost from '../../support/RendererActionHost.vue'
import { useContainerActions, type LateralActionPosition } from '../../useContainerActions'
import { useContainerDataSource, useContainerDataSourceEffects } from '../../useContainerDataSource'
import { useContainerSlots } from '../../layout/useContainerSlots'
import { useContainerToolbar, type ToolbarPosition } from '../../layout/useContainerToolbar'
import RendererFilter from '../../RendererFilter.vue'
import { createRowActionSlotScope } from '../../slotScopeFactories'
import { useModuleContext } from '../../context/useModuleContext'
import RendererToolbar from '../../non-data-components/RendererToolbar.vue'
import { useTableFilters } from '../../layout/useTableFilters'
import { bindActionClick, isBuiltinAction, injectActionDisabled, injectRowActionDefaults } from '../../builtin-actions'

// ── 基础工具与本地属性约定 ───────────────────────────────────────────────

/** 将 camelCase 属性名转换为 kebab-case，兼容模板透传属性的两种写法。 */
function toKebabCase(name: string): string {
  return name.replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)
}

/**
 * 这些属性由 RendererTable 内部消费，不应继续透传给底层 el-table。
 * 其中包含：工具栏/筛选区/行操作区的结构化配置，以及少量旧 attrs 兼容入口。
 */
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

// ── Props / attrs / slots 输入 ───────────────────────────────────────────

const props = withDefaults(defineProps<RTableProps>(), {
  type: 'r-table',
})

const attrs = useAttrs()
const slots = useSlots()

// ── 属性读取工具：兼容 attrs 与结构化子节点 props ────────────────────────

const _attrs = attrs as Readonly<Record<string, unknown>>

/** 优先读取原名，其次回退 kebab-case，兼容模板透传属性。 */
function readAttr(name: string): unknown {
  const directValue = _attrs[name]
  if (directValue !== undefined) return directValue
  return _attrs[toKebabCase(name)]
}

/** 读取字符串属性；空字符串视为未配置。 */
function readStringAttr(name: string): string | undefined {
  const value = readAttr(name)
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** 读取布尔属性；兼容模板中空属性、字符串 true/false。 */
function readBooleanAttr(name: string): boolean | undefined {
  const value = readAttr(name)
  if (typeof value === 'boolean') return value
  if (value === '') return true
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

/** 读取数字属性；仅接受有限数值。 */
function readNumberAttr(name: string): number | undefined {
  const value = readAttr(name)
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return undefined
}

/** 读取 number|string 联合属性，常用于宽度、间距等布局参数。 */
function readNumberOrStringAttr(name: string): number | string | undefined {
  const value = readAttr(name)
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.length > 0) return value
  return undefined
}

/** 从结构化 wrapper 节点上读取 props，统一访问 props.toolbar / props.filter / props.actions。 */
function childProp<T>(child: SparkNode | undefined, name: string): T | undefined {
  return child?.props?.[name] as T | undefined
}

// ── 基础输入解析：DataKey 与传给 el-table 的基础 attrs ───────────────────

const baseTableAttrs = computed<Record<string, unknown>>(() => {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(_attrs)) {
    if (TABLE_LOCAL_ATTR_KEYS.has(key)) continue
    result[key] = value
  }
  return result
})
const effectiveDataKey = computed(() => props.dataKey)

// ── SPARK 上下文与数据源：解析 DataKey → DataView，并向下游提供 DATA_SOURCE ──

const { sparkConsume, sparkProvide, registerApi, logger } = useSparkPageComponent(props)

const pageDataSet = sparkConsume(PAGE_DATASET)
const pageService = sparkConsume(PAGE_SERVICE)
const moduleContext = useModuleContext(sparkConsume(MODULE_CONTEXT))

const { resolvedDataSource: resolvedView, modelPermission } = useContainerDataSource<DataView>({
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

// ── 工具栏区：读取提升后的 props.toolbar，并处理内置动作绑定 ─────────────

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
    isBuiltinAction(action) ? injectActionDisabled(bindActionClick(action, () => handleBuiltinToolbarAction(action)), resolvedView.value) : action,
  ),
)

/** 过滤掉结构元信息后，剩余 props 继续透传给 RendererToolbar。 */
const toolbarComponentProps = computed<Record<string, unknown>>(() => {
  const childMeta = props.toolbar?.props
  if (!childMeta) return {}
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(childMeta)) {
    if (key !== 'position' && key !== 'class') result[key] = value
  }
  return result
})

// ── 筛选区：表单模型、字段配置、折叠状态与筛选后的数据视图 ───────────────

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

// ── 零代码 API：桥接原生 el-table 实例，并向页面脚本暴露表格能力 ─────────

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

// ── 行操作区：结构化 actions + row-actions 命名插槽共同组成行操作列 ─────

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

/** 为 row-actions 命名插槽构造统一上下文，确保模板插槽与内置动作拿到同一套作用域。 */
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

/** 内置动作补齐点击处理，自定义动作维持原配置透传。行操作自动注入 small + text 样式。 */
function resolveRowActionConfig(action: SparkNode, row: IDataRow, index: number): SparkNode {
  if (!isBuiltinAction(action)) return action
  const bound = bindActionClick(action, () => handleBuiltinRowAction(action, row, index))
  return injectRowActionDefaults(injectActionDisabled(bound, resolvedView.value, { row, index }))
}

function getRenderedRowActions(scope: Record<string, unknown>): SparkNode[] {
  const row = (scope['row'] as IDataRow | undefined) ?? {}
  const index = typeof scope['$index'] === 'number' ? scope['$index'] : 0
  return getScopedRowActions({ row, index })
    .map(action => resolveRowActionConfig(action, row, index))
}

function getScopedRowActionSlotScope(scope: Record<string, unknown>): object {
  const row = (scope['row'] as IDataRow | undefined) ?? {}
  const index = typeof scope['$index'] === 'number' ? scope['$index'] : 0
  return getRowActionSlotScope(row, index)
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

/* 左右侧工具栏布局时，工具栏内部也改为纵向堆叠。 */
.renderer-table-layout--left .renderer-table-toolbar :deep(.renderer-toolbar-lane),
.renderer-table-layout--right .renderer-table-toolbar :deep(.renderer-toolbar-lane) {
  grid-auto-flow: row;
  grid-auto-rows: max-content;
}

</style>
