<template>
  <div :class="['renderer-table-layout', `renderer-table-layout--${toolbarPositionValue}`]">
    <!-- 工具栏 -->
    <RendererHostScope v-if="showToolbar" type="r-table-toolbar-scope" :variant="'toolbar'" :action-host="toolbarActionHost">
      <RendererToolbar
        type="r-toolbar"
        :class="['renderer-table-toolbar', toolbarClassValue]"
        v-bind="toolbarComponentProps"
        :children="visibleToolbarConfigs"
      />
    </RendererHostScope>

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
      :action-span="filterActionSpanValue"
      :search-action="handleFilterSearch"
      :reset-action="handleFilterReset"
      :toggle-collapsed-action="toggleFiltersCollapsed"
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
          v-if="showRowActionsLeftValue"
          v-bind="rowActionColumnAttrs"
        >
          <template #default="scope">
            <div class="renderer-table-row-actions" :style="rowActionsContainerStyle">
              <RendererHostScope
                type="r-table-row-action-scope"
                :children="getScopedRowActionConfigs(scope)"
                :row="getScopedRowActionRow(scope)"
                :variant="'row-action'"
                :action-host="getScopedRowActionCapability(scope)"
                child-key-prefix="r-table-row-action"
              />
              <slot name="row-actions" v-bind="getScopedRowActionSlotScope(scope)" />
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
            resizable
          >
            <template #default="scope">
              <!--
                将当前行 slot scope 回写到 row-fragment 节点配置中，
                让下游 RendererHostScope 统一解析 DATA_ROW。
              -->
              <SparkComponentRenderer :config="createScopedRowFragmentConfig(child, scope)" />
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
          v-if="showRowActionsRightValue"
          v-bind="rowActionColumnAttrs"
        >
          <template #default="scope">
            <div class="renderer-table-row-actions" :style="rowActionsContainerStyle">
              <RendererHostScope
                type="r-table-row-action-scope"
                :children="getScopedRowActionConfigs(scope)"
                :row="getScopedRowActionRow(scope)"
                :variant="'row-action'"
                :action-host="getScopedRowActionCapability(scope)"
                child-key-prefix="r-table-row-action"
              />
              <slot name="row-actions" v-bind="getScopedRowActionSlotScope(scope)" />
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
 * @consumes MODULE_CONTEXT
 * @notes children 仅放 r-* 字段组件做列，禁止直接声明底层列节点
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
 * - 到达此组件时，props.children 只保留表格内容列配置，不做运行时二次分拣。
 */
import { computed, nextTick, ref, watch, useAttrs, useSlots, type CSSProperties } from 'vue'
import {
  useSparkPageComponent, SparkComponentRenderer,
  getSparkNodeChildren, nodeId, type SparkNode,
  PAGE_DATASET, DATA_SOURCE, MODULE_CONTEXT, PAGE_SERVICE, HOST_FIELD_MODE,
} from '../../../internal'
import type { RTableProps } from './RendererTable.props'
import type { IDataRow, DataView } from '@spark-view/spark-data'
import { createRendererTableZeroCode, type NativeTableLike } from './zero-code'
import { useRendererTableViewState } from './view-state'
import { mapNodeProps } from '../../support'
import { useContainerActions, type LateralActionPosition } from '../../composables/useContainerActions'
import { useContainerDataSource, useContainerDataSourceEffects } from '../../composables/useContainerDataSource'
import { useContainerSlots } from '../../layout/useContainerSlots'
import { useContainerToolbar, type ToolbarPosition } from '../../layout/useContainerToolbar'
import RendererFilter from '../../RendererFilter.vue'
import { createRowActionSlotScope } from '../../support/slotScopeFactories'
import { useContainerModuleContext } from '../../composables/useContainerModuleContext'
import RendererToolbar from '../../non-data-components/RendererToolbar.vue'
import type { RendererToolbarProps } from '../../non-data-components/RendererToolbar.types'
import type { FilterNode } from '../../RendererFilter.types'
import type { ActionsAlign, ActionsFixed } from '../../support/RendererActions.types'
import RendererHostScope from '../../support/RendererHostScope.vue'
import { useTableFilters } from '../../layout/useTableFilters'
import { createActionCapability } from '../../../internal'

// ── 基础工具：通用读取与列投影辅助 ────────────────────────────────────────

// ── Props / slots 输入 ───────────────────────────────────────────────────

const props = withDefaults(defineProps<RTableProps>(), {
  type: 'r-table',
})

const STRUCTURAL_CHILD_TYPES = new Set(['r-toolbar', 'r-filter', 'r-actions'])

// 共享 props.children 允许文本子节点；表格列区只接受结构节点，局部显式收窄。
const allChildNodes = computed(() => getSparkNodeChildren(props.children))
const contentChildNodes = computed(() => allChildNodes.value.filter(child => !STRUCTURAL_CHILD_TYPES.has(child.type)))
const renderedContentChildNodes = computed(() => contentChildNodes.value.map(normalizeDefaultSortableTableNode))

const slots = useSlots()
const attrs = useAttrs()

function readLegacyStringAttr(name: string): string | undefined {
  const value = attrs[name]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readLegacyNumberLikeAttr(name: string): string | number | undefined {
  const value = attrs[name]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readLegacyActionsAlignAttr(name: string): ActionsAlign | undefined {
  const value = attrs[name]
  return value === 'left' || value === 'center' || value === 'right'
    ? value
    : undefined
}

function readLegacyActionsFixedAttr(name: string): ActionsFixed | undefined {
  const value = attrs[name]
  if (value === true || value === false) return value
  return value === 'left' || value === 'right'
    ? value
    : undefined
}

/** 从结构化 wrapper 节点上读取 props，统一访问 props.toolbar / props.filter / props.actions。 */
function childProp<T>(child: SparkNode | undefined, name: string): T | undefined {
  return child?.props?.[name] as T | undefined
}

/**
 * 兼容读取结构节点属性：优先 props.xx，缺失时回退到历史根级字段。
 * 说明：旧配置里 r-actions 可能直接写 width/label 到节点根级，导致宽度回退到默认值。
 */
function childCompatProp<T>(child: SparkNode | undefined, name: string): T | undefined {
  const propValue = child?.props?.[name]
  if (propValue !== undefined) return propValue as T

  const raw = child as unknown as Record<string, unknown> | undefined
  return raw?.[name] as T | undefined
}

function isAutoFilterCandidate(node: SparkNode): boolean {
  if (isRowFragmentNode(node)) return false

  const field = childCompatProp<unknown>(node, 'field')
  if (typeof field !== 'string' || field.trim().length === 0) return false

  const filterable = childCompatProp<unknown>(node, 'filterable')
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

  const field = childCompatProp<unknown>(node, 'field')
    ?? childCompatProp<unknown>(node, 'fieldName')
    ?? childCompatProp<unknown>(node, 'prop')
    ?? childCompatProp<unknown>(node, 'property')
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

function createScopedRowFragmentConfig(node: SparkNode, scope: Record<string, unknown>): SparkNode {
  // 关键桥接：把当前行 scope 注入为 slotScope。
  // RowFragment -> RendererHostScope -> DATA_ROW 将沿此通道完成上下文传递。
  return {
    ...node,
    props: {
      ...(node.props ?? {}),
      slotScope: scope,
    },
  }
}

const toolbarNode = computed(() => props.toolbar ?? allChildNodes.value.find(child => child.type === 'r-toolbar'))
const filterNode = computed(() => props.filter ?? allChildNodes.value.find(child => child.type === 'r-filter'))
const actionsNode = computed(() => props.actions ?? allChildNodes.value.find(child => child.type === 'r-actions'))
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

const legacyRowActionsWidth = computed<string | number | undefined>(() => {
  if (typeof props.rowActionsWidth === 'string' || typeof props.rowActionsWidth === 'number') {
    return props.rowActionsWidth
  }
  const value = props.tableProps?.['rowActionsWidth']
  if (typeof value === 'string' || typeof value === 'number') return value
  return readLegacyNumberLikeAttr('rowActionsWidth')
})

const legacyRowActionsLabel = computed<string | undefined>(() => {
  if (typeof props.rowActionsLabel === 'string' && props.rowActionsLabel.length > 0) {
    return props.rowActionsLabel
  }
  const value = props.tableProps?.['rowActionsLabel']
  if (typeof value === 'string' && value.length > 0) return value
  return readLegacyStringAttr('rowActionsLabel')
})

const legacyRowActionsAlign = computed<ActionsAlign | undefined>(() => {
  if (props.rowActionsAlign === 'left' || props.rowActionsAlign === 'center' || props.rowActionsAlign === 'right') {
    return props.rowActionsAlign
  }
  const value = props.tableProps?.['rowActionsAlign']
  if (value === 'left' || value === 'center' || value === 'right') return value
  return readLegacyActionsAlignAttr('rowActionsAlign')
})

const legacyRowActionsFixed = computed<ActionsFixed | undefined>(() => {
  if (
    props.rowActionsFixed === true
    || props.rowActionsFixed === false
    || props.rowActionsFixed === 'left'
    || props.rowActionsFixed === 'right'
  ) {
    return props.rowActionsFixed
  }
  const value = props.tableProps?.['rowActionsFixed']
  if (value === true || value === false || value === 'left' || value === 'right') return value
  return readLegacyActionsFixedAttr('rowActionsFixed')
})

const baseElTableProps = computed<Record<string, unknown>>(() => {
  const raw = props.tableProps ?? {}
  const {
    rowActionsWidth: _rowActionsWidth,
    rowActionsLabel: _rowActionsLabel,
    rowActionsAlign: _rowActionsAlign,
    rowActionsFixed: _rowActionsFixed,
    ...tableProps
  } = raw

  return {
    border: true,
    resizable: true,
    ...tableProps,
  }
})
const effectiveDataKey = computed(() => props.dataKey)

// ── SPARK 上下文与数据源：解析 DataKey → DataView，并向下游提供 DATA_SOURCE ──

const { sparkConsume, sparkProvide, registerApi, logger } = useSparkPageComponent(props)

const pageDataSet = sparkConsume(PAGE_DATASET)
const pageService = sparkConsume(PAGE_SERVICE)
const moduleContext = useContainerModuleContext(sparkConsume(MODULE_CONTEXT))

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

sparkProvide(HOST_FIELD_MODE, 'table')

// ── 工具栏区：读取提升后的 props.toolbar，并向工具栏子树提供内置动作宿主能力 ──

const {
  toolbarPositionValue,
  toolbarClassValue,
  visibleToolbarConfigs,
  showToolbar,
} = useContainerToolbar({
  toolbar: computed(() => getSparkNodeChildren(toolbarNode.value?.children)),
  toolbarPosition: computed(() => childProp<ToolbarPosition>(toolbarNode.value, 'position')),
  toolbarClass: computed(() => childProp<string>(toolbarNode.value, 'class')),
  modelPermission,
  dataSource: resolvedView,
})

/**
 * 工具栏属性逐项对接：
 * 仅允许 RendererToolbar 已声明的 props 进入运行时，禁止结构化透传整包 childMeta。
 */
const toolbarComponentProps = computed<Partial<RendererToolbarProps>>(() => {
  return mapNodeProps<RendererToolbarProps>({
    source: toolbarNode.value?.props,
    map: {
      type: 'type',
      children: 'children',
      tail: 'tail',
      gap: 'gap',
      zoneGap: 'zoneGap',
      align: 'align',
      justify: 'justify',
    },
    ignoreSourceKeys: ['position', 'class'],
    context: 'RendererTable.toolbar',
    unknownPolicy: 'error',
    logger,
  })
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
  filteredRows,
})

// ── 零代码 API：桥接原生 el-table 实例，并向页面脚本暴露表格能力 ─────────

const nativeTableRef = ref<NativeTableLike | null>(null)

const {
  dispatch,
  tableApi,
  isBuiltinActionDisabled,
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

// DataView → el-table 当前行单向同步
watch(
  () => resolvedView.value?.currentRow,
  async (row) => {
    await nextTick()
    nativeTableRef.value?.setCurrentRow?.(row ?? null)
  },
)

const toolbarActionHost = createActionCapability({
  isDisabled(action) {
    return isBuiltinActionDisabled(action)
  },
  execute(action) {
    handleBuiltinToolbarAction(action)
  },
})

// ── 行操作区：结构化 actions + row-actions 命名插槽共同组成行操作列 ─────

const {
  actionPositionValue: rowActionsPositionValue,
  showActionsLeft: showRowActionsLeft,
  showActionsRight: showRowActionsRight,
  getScopedActionConfigs: getScopedRowActions,
} = useContainerActions<{ row: IDataRow, index: number }>({
  actionConfigs: computed(() => getSparkNodeChildren(actionsNode.value?.children)),
  actionPosition: computed(() => childProp<LateralActionPosition>(actionsNode.value, 'position') ?? 'right'),
  actionClass: computed(() => childProp<string>(actionsNode.value, 'class') ?? ''),
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

const rowActionsAlignValue = computed<ActionsAlign | undefined>(() => {
  const align = childCompatProp<ActionsAlign>(actionsNode.value, 'align')
  if (align === 'left' || align === 'center' || align === 'right') return align
  return legacyRowActionsAlign.value
})

const rowActionsHeaderAlignValue = computed<ActionsAlign>(() => {
  return rowActionsAlignValue.value ?? 'center'
})

const rowActionsFixedValue = computed<ActionsFixed | undefined>(() => {
  const fixed = childCompatProp<ActionsFixed>(actionsNode.value, 'fixed')
  if (fixed === true || fixed === false || fixed === 'left' || fixed === 'right') return fixed
  return legacyRowActionsFixed.value
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
  const label = childCompatProp<string>(actionsNode.value, 'label')
    ?? legacyRowActionsLabel.value
    ?? '操作'
  const width = childCompatProp<number | string>(actionsNode.value, 'width')
    ?? legacyRowActionsWidth.value
    ?? 160
  const align = rowActionsAlignValue.value
  const headerAlign = rowActionsHeaderAlignValue.value
  const fixed = rowActionsFixedValue.value
  return {
    label,
    width,
    ...(align !== undefined ? { align } : {}),
    headerAlign,
    ...(fixed !== undefined ? { fixed } : {}),
    resizable: true,
  }
})

/** 为 row-actions 命名插槽构造统一上下文，确保模板插槽与内置动作拿到同一套作用域。 */
function getRowActionSlotScope(row: IDataRow, index: number) {
  return createRowActionSlotScope({
    dataSource: resolvedView.value,
    modelPermission: modelPermission.value,
    moduleContext: moduleContext.value,
    row,
    index,
  })
}

function resolveRowActionScope(scope: Record<string, unknown>) {
  // 从 el-table 默认 slot scope 提取 row / $index。
  // 这里采用 fail-safe 默认值，保证作用域函数在测试桩与真实环境下都可执行。
  return {
    row: (scope['row'] as IDataRow | undefined) ?? {},
    index: typeof scope['$index'] === 'number' ? scope['$index'] : 0,
  }
}

function getScopedRowActionConfigs(scope: Record<string, unknown>): SparkNode[] {
  // 基于当前行上下文做动作可见性与 props 绑定投影。
  const { row, index } = resolveRowActionScope(scope)
  return getScopedRowActions({ row, index })
}

function getScopedRowActionRow(scope: Record<string, unknown>): IDataRow {
  return resolveRowActionScope(scope).row
}

function getScopedRowActionCapability(scope: Record<string, unknown>) {
  // 行动作能力对象：统一封装禁用态判断和执行入口，供 RendererHostScope 透传给按钮子树。
  const { row, index } = resolveRowActionScope(scope)
  return createActionCapability({
    isDisabled(action) {
      return isBuiltinActionDisabled(action, { row, index })
    },
    execute(action) {
      handleBuiltinRowAction(action, row, index)
    },
  })
}

function getScopedRowActionSlotScope(scope: Record<string, unknown>): object {
  // 给 row-actions 命名插槽提供与内置动作同源的上下文，避免业务插槽与内置行为语义漂移。
  const { row, index } = resolveRowActionScope(scope)
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

