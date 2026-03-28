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
        @row-click="handleRowClick"
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
import { computed, defineComponent, ref, useAttrs, useSlots } from 'vue'
import { useSparkComponent, SparkComponentRenderer } from '../../../internal'
import { nodeId, type SparkNode } from '../../../internal'
import type { RendererTableApi } from './types'
import type { ContainerDocks } from '../../../../core/types'
import type { IDataRow, DataView } from '@spark-view/spark-data'
import { PAGE_SERVICE } from '@spark-view/spark-utils'
import { PAGE_DATASET, DATA_SOURCE } from '../../../internal'
import { MODULE_CONTEXT } from '../../../internal'
import { createRendererTableZeroCode } from './zero-code'
import { useRendererTableInput } from './input'
import { useRendererTableViewState } from './view-state'
import { useContainerActions } from '../../actions/useContainerActions'
import type { LateralActionPosition } from '../../actions/useContainerActions'
import { useContainerDataSource, useContainerDataSourceEffects } from '../../data/useContainerDataSource'
import { useContainerSlots } from '../../layout/useContainerSlots'
import { useContainerToolbar } from '../../layout/useContainerToolbar'
import type { ToolbarPosition } from '../../layout/useContainerToolbar'
import { createRowActionSlotScope } from '../../slotScopeFactories'
import { useModuleContext } from '../../context/useModuleContext'
import RendererFieldScope from '../RendererFieldScope.vue'
import { useTableFilters } from '../../layout/useTableFilters'
import {
  type AddRowHandler,
  type EditRowHandler,
  type RemoveRowHandler,
  type RowClickHandler,
  type RowSelectionHandler,
  type CurrentRowChangeHandler,
} from '../../support/index.js'
import {
  isBuiltinAction,
  getBuiltinActionLabel,
  getBuiltinButtonType,
  getBuiltinButtonSize,
  getBuiltinButtonPlain,
  getBuiltinButtonText,
  getBuiltinButtonLink,
  getBuiltinButtonClass,
} from '../../builtin-actions'

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
  onRowClick?: RowClickHandler
  onSelectionChange?: RowSelectionHandler
  onCurrentChange?: CurrentRowChangeHandler
  onAddRow?: AddRowHandler
  onEditRow?: EditRowHandler
  onRemoveRow?: RemoveRowHandler
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-table',
  docks: () => ({}),
})

const attrs = useAttrs()
const slots = useSlots()
const {
  baseTableAttrs,
  effectiveDataKey,
  dockedToolbar,
  dockedFilters,
  dockedRowActions,
  sparkChildren,
  legacyFilterColumnsValue,
  legacyRowActionsPositionValue,
  legacyRowActionsAlignValue,
  legacyRowActionsFixedValue,
  readStringAttr,
  readBooleanAttr,
  readNumberAttr,
  readNumberOrStringAttr,
  assertNoLegacyTableStructures,
} = useRendererTableInput({
  props,
  attrs: attrs as Readonly<Record<string, unknown>>,
})

const ElTableColumns = defineComponent({
  name: 'ElTableColumns',
  setup(_, { slots: componentSlots }) {
    return () => componentSlots['default']?.() ?? []
  },
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

const {
  tableData,
  tableAttrs,
  filterCollapsibleValue,
  filterAutoFitMinWidthValue,
  filterItemSpanValue,
  filtersCollapsed,
  toggleFiltersCollapsed,
} = useRendererTableViewState({
  props,
  baseTableAttrs,
  resolvedView,
  filteredRows,
  readStringAttr,
  readBooleanAttr,
  readNumberAttr,
})

// ── 视图状态 ──────────────────────────────────────────────────────────────

const nativeTableRef = ref<{
  clearSelection?: () => void
  toggleRowSelection?: (row: IDataRow, selected?: boolean) => void
  setCurrentRow?: (row: IDataRow | null) => void
  doLayout?: () => void
} | null>(null)

const {
  dispatch,
  tableApi,
  isBuiltinActionDisabled,
  handleBuiltinToolbarAction,
  handleBuiltinRowAction,
}: {
  dispatch: (eventName: string, ...args: unknown[]) => Promise<{ cancel: boolean }>
  tableApi: RendererTableApi
  isBuiltinActionDisabled: (action: SparkNode, scope?: { row?: IDataRow; index?: number }) => boolean
  handleBuiltinToolbarAction: (action: SparkNode) => void
  handleBuiltinRowAction: (action: SparkNode, row: IDataRow, index: number) => void
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

