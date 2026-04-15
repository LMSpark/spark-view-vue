<template>
  <div :class="['renderer-table-layout', `renderer-table-layout--${toolbarPositionValue}`]">
    <!-- 工具栏 -->
    <RendererHostScope v-if="showToolbar" :host="toolbarHost">
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
      >
        <!--
          列区必须在编译后直接成为 el-table 的子级。
          这里直接串联三类列内容，不再引入额外透明包装层：
          1. 配置驱动列（props.children）
          2. 模板驱动列（默认 slot）
          3. 行操作列（左右）
        -->
        <!-- 行操作列（左） -->
        <RendererActionHost
          v-if="showRowActionsLeftValue"
          host-tag="el-table-column"
          :host-attrs="rowActionColumnAttrs"
          :resolve-actions="getScopedRowActionConfigs"
          :resolve-row="getScopedRowActionRow"
          :resolve-host="getScopedRowActionHost"
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
          v-for="(child, index) in contentChildNodes"
          :key="nodeId(child) ?? `r-table-child-${index}`"
          :config="child"
        />

        <!-- 模板驱动补充列：支持直接手写 el-table-column -->
        <slot />

        <!-- 行操作列（右） -->
        <RendererActionHost
          v-if="showRowActionsRightValue"
          host-tag="el-table-column"
          :host-attrs="rowActionColumnAttrs"
          :resolve-actions="getScopedRowActionConfigs"
          :resolve-row="getScopedRowActionRow"
          :resolve-host="getScopedRowActionHost"
          :resolve-slot-scope="getScopedRowActionSlotScope"
          action-key-prefix="r-table-row-action"
          :wrapper-class="['renderer-table-row-actions', rowActionsClassValue]"
        >
          <template #actions="scope">
            <slot name="row-actions" v-bind="scope" />
          </template>
        </RendererActionHost>
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
import { computed, getCurrentInstance, nextTick, ref, watch, useSlots } from 'vue'
import {
  useSparkPageComponent, SparkComponentRenderer,
  getSparkNodeChildren, nodeId, type SparkNode,
  PAGE_DATASET, DATA_SOURCE, MODULE_CONTEXT,
} from '../../../internal'
import type { RTableProps } from './RendererTable.props'
import type { IDataRow, DataView } from '@spark-view/spark-data'
import { PAGE_SERVICE } from '@spark-view/spark-utils'
import { createRendererTableZeroCode, type NativeTableLike } from './zero-code'
import { useRendererTableViewState } from './view-state'
import RendererActionHost from '../../support/RendererActionHost.vue'
import { mapNodeProps } from '../../support'
import { useContainerActions, type LateralActionPosition } from '../../useContainerActions'
import { useContainerDataSource, useContainerDataSourceEffects } from '../../useContainerDataSource'
import { useContainerSlots } from '../../layout/useContainerSlots'
import { useContainerToolbar, type ToolbarPosition } from '../../layout/useContainerToolbar'
import RendererFilter from '../../RendererFilter.vue'
import { createRowActionSlotScope } from '../../slotScopeFactories'
import { useModuleContext } from '../../context/useModuleContext'
import RendererToolbar from '../../non-data-components/RendererToolbar.vue'
import type { RendererToolbarProps } from '../../non-data-components/RendererToolbar.types'
import type { FilterNode } from '../../RendererFilter.types'
import RendererHostScope from '../../support/RendererHostScope.vue'
import { useTableFilters } from '../../layout/useTableFilters'
import type { SparkComponentHost } from '../../../internal'

// ── 基础工具 ─────────────────────────────────────────────────────────────

// ── Props / slots 输入 ───────────────────────────────────────────────────

const props = withDefaults(defineProps<RTableProps>(), {
  type: 'r-table',
})

const STRUCTURAL_CHILD_TYPES = new Set(['r-toolbar', 'r-filter', 'r-actions'])

// 共享 props.children 允许文本子节点；表格列区只接受结构节点，局部显式收窄。
const allChildNodes = computed(() => getSparkNodeChildren(props.children))
const contentChildNodes = computed(() => allChildNodes.value.filter(child => !STRUCTURAL_CHILD_TYPES.has(child.type)))

const slots = useSlots()
const currentInstance = getCurrentInstance()

function normalizePropNameVariants(name: string): string[] {
  const kebab = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
  const camel = kebab.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase())
  return Array.from(new Set([name, kebab, camel]))
}

function collectDeclaredPropKeys(raw: unknown): ReadonlySet<string> | undefined {
  if (!raw) return undefined
  const normalized = new Set<string>()

  if (Array.isArray(raw)) {
    for (const key of raw) {
      if (typeof key !== 'string') continue
      for (const variant of normalizePropNameVariants(key)) normalized.add(variant)
    }
    return normalized
  }

  if (typeof raw !== 'object') return undefined

  for (const key of Object.keys(raw as Record<string, unknown>)) {
    for (const variant of normalizePropNameVariants(key)) normalized.add(variant)
  }
  return normalized
}

const declaredElTablePropKeys = computed<ReadonlySet<string> | undefined>(() => {
  const components = currentInstance?.appContext.components
  if (!components) return undefined
  const elTableComponent = (components['ElTable'] ?? components['el-table']) as { props?: unknown } | undefined
  return collectDeclaredPropKeys(elTableComponent?.props)
})

/** 从结构化 wrapper 节点上读取 props，统一访问 props.toolbar / props.filter / props.actions。 */
function childProp<T>(child: SparkNode | undefined, name: string): T | undefined {
  return child?.props?.[name] as T | undefined
}

const toolbarNode = computed(() => props.toolbar ?? allChildNodes.value.find(child => child.type === 'r-toolbar'))
const filterNode = computed(() => props.filter ?? allChildNodes.value.find(child => child.type === 'r-filter'))
const actionsNode = computed(() => props.actions ?? allChildNodes.value.find(child => child.type === 'r-actions'))
const normalizedFilterNode = computed<FilterNode | undefined>(() => {
  const node = filterNode.value
  if (node?.type !== 'r-filter') return undefined
  return node as FilterNode
})

// ── 基础输入解析：DataKey 与传给 el-table 的显式 tableProps ───────────────

const baseElTableProps = computed<Record<string, unknown>>(() => ({ ...(props.tableProps ?? {}) }))
const effectiveDataKey = computed(() => props.dataKey)

// ── SPARK 上下文与数据源：解析 DataKey → DataView，并向下游提供 DATA_SOURCE ──

const { host: tableHost, sparkConsume, sparkProvide, registerApi, logger } = useSparkPageComponent(props)

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

tableHost.setHost({ fieldMode: 'table' })

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
  filterChildren: computed(() => getSparkNodeChildren(filterNode.value?.children)),
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
  filtersCollapsed,
  toggleFiltersCollapsed,
} = useRendererTableViewState({
  filterNode: normalizedFilterNode,
  baseElTableProps,
  resolvedView,
  filteredRows,
  declaredElTablePropKeys,
  warnUnknownTableProp: (propName: string) => {
    logger.warn(`[RendererTable] tableProps 包含 el-table 未声明属性: ${propName}`)
  },
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

const toolbarHost: SparkComponentHost = {
  variant: 'toolbar',
  isDisabled(action) {
    return isBuiltinActionDisabled(action)
  },
  execute(action) {
    handleBuiltinToolbarAction(action)
  },
}

// ── 行操作区：结构化 actions + row-actions 命名插槽共同组成行操作列 ─────

const {
  actionPositionValue: rowActionsPositionValue,
  actionClassValue: rowActionsClassValue,
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

/** 行操作列统一属性（仅 child props + defaults） */
const rowActionColumnAttrs = computed(() => {
  const label = childProp<string>(actionsNode.value, 'label') ?? '操作'
  const width = childProp<number | string>(actionsNode.value, 'width') ?? 160
  const rawAlign = childProp<string>(actionsNode.value, 'align')
  const align = rawAlign === 'left' || rawAlign === 'center' || rawAlign === 'right' ? rawAlign : 'left'
  const childFixed = childProp<boolean | 'left' | 'right'>(actionsNode.value, 'fixed')
  const fixed: boolean | 'left' | 'right' = childFixed ?? rowActionsPositionValue.value
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

function resolveRowActionScope(scope: Record<string, unknown>) {
  return {
    row: (scope['row'] as IDataRow | undefined) ?? {},
    index: typeof scope['$index'] === 'number' ? scope['$index'] : 0,
  }
}

function getScopedRowActionConfigs(scope: Record<string, unknown>): SparkNode[] {
  const { row, index } = resolveRowActionScope(scope)
  return getScopedRowActions({ row, index })
}

function getScopedRowActionRow(scope: Record<string, unknown>): IDataRow {
  return resolveRowActionScope(scope).row
}

function getScopedRowActionHost(scope: Record<string, unknown>): SparkComponentHost {
  const { row, index } = resolveRowActionScope(scope)
  return {
    variant: 'row-action',
    isDisabled(action) {
      return isBuiltinActionDisabled(action, { row, index })
    },
    execute(action) {
      handleBuiltinRowAction(action, row, index)
    },
  }
}

function getScopedRowActionSlotScope(scope: Record<string, unknown>): object {
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

