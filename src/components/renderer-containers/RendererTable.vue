<!--
/**
 * @skill r-table
 * @description 数据表格容器，通过 DataKey 绑定 DataView，自动渲染行数据，支持当前行高亮、多选、分页
 * @provides DATA_SOURCE
 * @consumes PAGE_DATASET
 * @input { dataKey: string, props: { border?: boolean, stripe?: boolean, highlightCurrentRow?: boolean } }
 * @example { "type": "r-table", "dataKey": "Orders@rows", "props": { "border": true, "highlightCurrentRow": true } }
 */
-->
<template>
  <div :class="['renderer-table-layout', `renderer-table-layout--${toolbarPositionValue}`]">
    <!-- 工具栏 -->
    <div v-if="showToolbar" :class="['renderer-table-toolbar', toolbarClassValue]">
      <SparkComponentRenderer
        v-for="(action, index) in visibleToolbarConfigs"
        :key="action.id ?? `r-table-toolbar-${index}`"
        :config="action"
      />
      <slot
        name="toolbar"
        v-bind="getToolbarSlotScope()"
      />
    </div>

    <!-- 过滤区 -->
    <div v-if="hasFilters" :class="['renderer-table-filters', filterClassValue]">
      <RendererFieldScope
        :model="filterModel"
        :configs="filterConfigs"
        :data-source="resolvedView"
        :grid-columns="filterGridColumnsValue"
        :grid-gap="filterGridGapValue"
        :grid-auto-rows="filterGridAutoRowsValue"
      />
    </div>

    <div class="renderer-table-main">
      <el-table
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
                <SparkComponentRenderer
                  v-for="(action, index) in getScopedRowActions({ row, index: $index })"
                  :key="action.id ?? `r-table-row-action-left-${index}`"
                  :config="action"
                />
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
                <SparkComponentRenderer
                  v-for="(action, index) in getScopedRowActions({ row, index: $index })"
                  :key="action.id ?? `r-table-row-action-right-${index}`"
                  :config="action"
                />
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
import { computed, defineComponent, useSlots } from 'vue'
import { useSparkComponent, SparkComponentRenderer } from '@spark-view/spark-component'
import type { ComponentConfig } from '@spark-view/spark-component'
import type { IDataRow, IDataSource, DataView, IModelPermission } from '@spark-view/spark-data'
import { PAGE_DATASET, DATA_SOURCE } from '@spark-view/spark-component'
import { FIELD_CONTEXT } from '../capability-keys'
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

type RowActionsPosition = LateralActionPosition

interface Props {
  /** SPARK 配置驱动（主入口）— dataKey / children 均从此取 */
  config?: ComponentConfig
  /** DataKey 格式：tableName@field（与 config 同层冗余时以 config.props.dataKey 为准） */
  dataKey?: string
  /** bindRules 从 rule.children 提取的子组件配置（form-create 路径） */
  sparkChildren?: ComponentConfig[]
  /** 直接传入的 DataView（备用） */
  dataView?: DataView | undefined
  toolbar?: ComponentConfig[]
  toolbarPosition?: ToolbarPosition
  toolbarClass?: string
  filterColumns?: string[]
  filterClass?: string
  filterGridColumns?: number
  filterGridGap?: number | string
  filterGridAutoRows?: string
  rowActions?: ComponentConfig[]
  rowActionsPosition?: RowActionsPosition
  rowActionsLabel?: string
  rowActionsWidth?: string | number
  rowActionsAlign?: 'left' | 'center' | 'right'
  rowActionsFixed?: boolean | 'left' | 'right'
  rowActionsClass?: string
}

const props = withDefaults(defineProps<Props>(), {
  toolbarPosition: 'top',
  toolbarClass: '',
  filterColumns: () => [],
  filterClass: '',
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

const ElTableColumns = defineComponent({
  name: 'ElTableColumns',
  setup(_, { slots: componentSlots }) {
    return () => componentSlots['default']?.() ?? []
  },
})

// ── 输入解析 ──────────────────────────────────────────────────────────────

const { effectiveDataKey, mergedChildren } = useContainerInput({
  config: computed(() => props.config),
  dataKey: computed(() => props.dataKey),
  sparkChildren: computed(() => props.sparkChildren),
})

const legacyRowActionConfigs = computed(() =>
  mergedChildren.value.filter(child => /^Render[A-Z]/.test(child.type))
)

const sparkChildren = computed(() =>
  mergedChildren.value.filter(child => isCollectedTableColumn(child))
)

// ── SPARK 上下文与数据源 ───────────────────────────────────────────────────

const { consume, provide: sparkProvide, logger } = useSparkComponent(
  props.config ?? { type: 'r-table' }
)

const pageDataSet = consume(PAGE_DATASET)

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
  config: computed(() => props.config),
  toolbar: computed(() => props.toolbar),
  toolbarPosition: computed(() => props.toolbarPosition),
  toolbarClass: computed(() => props.toolbarClass),
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
} = useTableFilters({
  config: computed(() => props.config),
  children: sparkChildren,
  dataView: resolvedView,
  filterColumns: computed(() => props.filterColumns),
  filterClass: computed(() => props.filterClass),
  filterGridColumns: computed(() => props.filterGridColumns),
  filterGridGap: computed(() => props.filterGridGap),
  filterGridAutoRows: computed(() => props.filterGridAutoRows),
  logger,
})

const tableData = computed(() => filteredRows.value ?? tableRows.value)

// ── 行操作区 ──────────────────────────────────────────────────────────────

const {
  actionPositionValue: rowActionsPositionValue,
  actionClassValue: rowActionsClassValue,
  showActionsLeft: showRowActionsLeft,
  showActionsRight: showRowActionsRight,
  getScopedActionConfigs: getScopedRowActions,
} = useContainerActions<{ row: IDataRow, index: number }>({
  config: computed(() => props.config),
  actionConfigs: computed(() => {
    const explicit = (props.config?.props?.['rowActions'] as ComponentConfig[] | undefined) ?? props.rowActions ?? []
    return [...legacyRowActionConfigs.value, ...explicit]
  }),
  actionPosition: computed(() => props.rowActionsPosition),
  actionClass: computed(() => props.rowActionsClass),
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
  (props.config?.props?.['rowActionsLabel'] as string | undefined) ?? props.rowActionsLabel
)

const rowActionsWidthValue = computed(() =>
  (props.config?.props?.['rowActionsWidth'] as string | number | undefined) ?? props.rowActionsWidth
)

const rowActionsAlignValue = computed(() =>
  (props.config?.props?.['rowActionsAlign'] as 'left' | 'center' | 'right' | undefined) ?? props.rowActionsAlign
)

const rowActionsFixedValue = computed<boolean | 'left' | 'right'>(() => {
  const explicit = (props.config?.props?.['rowActionsFixed'] as boolean | 'left' | 'right' | undefined) ?? props.rowActionsFixed
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
  })
}

function getRowActionSlotScope(row: IDataRow, index: number) {
  return createRowActionSlotScope({
    dataSource: resolvedView.value,
    modelPermission: modelPermission.value,
    row,
    index,
  })
}

// ── 子节点分类 ────────────────────────────────────────────────────────────

function isCollectedTableColumn(config: ComponentConfig): boolean {
  if (/^Render[A-Z]/.test(config.type)) return false
  if (config.type === 'el-table-column') return true
  return config.type.startsWith('r-') && typeof config.name === 'string' && config.name.length > 0
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
