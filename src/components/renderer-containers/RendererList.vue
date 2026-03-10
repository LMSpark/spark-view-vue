<!--
/**
 * @skill r-list
 * @description 列表容器，通过 DataKey 绑定 DataView.rows，按卡片/列表重复渲染子字段组件
 * @provides DATA_SOURCE
 * @consumes PAGE_DATASET
 * @input { dataKey: string, props: { columns?: number, gap?: number|string, rowKey?: string, gridColumns?: number, gridGap?: number|string, gridAutoRows?: string, toolbar?: ComponentConfig[], itemActions?: ComponentConfig[] } }
 * @example { "type": "r-list", "dataKey": "Users@rows", "children": [{ "type": "r-text", "name": "name" }] }
 */
-->
<template>
  <div :class="['renderer-list-layout', `renderer-list-layout--${toolbarPositionValue}`]">
    <div v-if="showToolbar" :class="['renderer-list-toolbar', toolbarClassValue]">
      <SparkComponentRenderer
        v-for="(action, index) in visibleToolbarConfigs"
        :key="action.id ?? `r-list-toolbar-${index}`"
        :config="action"
      />
      <slot
        name="toolbar"
        v-bind="getToolbarSlotScope()"
      />
    </div>

    <div class="renderer-list-main">
      <div class="renderer-list" :style="listStyle" v-bind="$attrs">
        <template v-if="showListItems">
          <div
            v-for="(row, index) in listRows"
            :key="getItemKey(row, index)"
            class="renderer-list-cell"
            :style="itemGridStyle"
          >
            <div :class="['renderer-list-item-shell', `renderer-list-item-shell--${itemActionsPositionValue}`]">
              <div v-if="showItemActionsLeftValue" :class="['renderer-list-item-actions', itemActionsClassValue]">
                <SparkComponentRenderer
                  v-for="(action, actionIndex) in getScopedItemActions({ row, index })"
                  :key="action.id ?? `r-list-item-action-left-${actionIndex}`"
                  :config="action"
                />
                <slot
                  name="item-actions"
                  v-bind="getItemActionSlotScope(row, index)"
                />
              </div>

              <RendererListItemScope
                :row="row"
                :children="mergedChildren"
                :data-source="resolvedView"
                :item-class="itemClass"
                :item-style="itemStyle"
                :use-card="useCard"
                :card-shadow="cardShadow"
                :grid-columns="gridColumns"
                :grid-gap="gridGap"
                :grid-auto-rows="gridAutoRows"
              >
                <slot
                  v-if="!mergedChildren.length"
                  v-bind="getRowSlotScope(row, index)"
                />
              </RendererListItemScope>

              <div v-if="showItemActionsRightValue" :class="['renderer-list-item-actions', itemActionsClassValue]">
                <SparkComponentRenderer
                  v-for="(action, actionIndex) in getScopedItemActions({ row, index })"
                  :key="action.id ?? `r-list-item-action-right-${actionIndex}`"
                  :config="action"
                />
                <slot
                  name="item-actions"
                  v-bind="getItemActionSlotScope(row, index)"
                />
              </div>
            </div>
          </div>
        </template>
        <div v-else-if="emptyText" class="renderer-list-empty">{{ emptyText }}</div>
        <slot v-else v-bind="getDefaultSlotScope()" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useSlots } from 'vue'
import type { CSSProperties } from 'vue'
import { useSparkComponent, SparkComponentRenderer } from '@spark-view/spark-component'
import type { ComponentConfig } from '@spark-view/spark-component'
import type { IDataRow, IDataSource, DataView, IModelPermission } from '@spark-view/spark-data'
import { PAGE_DATASET, DATA_SOURCE } from '@spark-view/spark-component'
import RendererListItemScope from './RendererListItemScope.vue'
import { useContainerActions } from './useContainerActions'
import type { LateralActionPosition } from './useContainerActions'
import { useContainerDataSource } from './useContainerDataSource'
import { useContainerSlots } from './useContainerSlots'
import { useContainerToolbar } from './useContainerToolbar'
import type { ToolbarPosition } from './useContainerToolbar'
import { createRowActionSlotScope, createToolbarSlotScope } from './useContainerSlotScopes'

interface Props {
  config?: ComponentConfig
  dataKey?: string
  sparkChildren?: ComponentConfig[]
  dataView?: DataView | undefined
  toolbar?: ComponentConfig[]
  toolbarPosition?: ToolbarPosition
  toolbarClass?: string
  itemActions?: ComponentConfig[]
  itemActionsPosition?: LateralActionPosition
  itemActionsClass?: string
  columns?: number
  gap?: number | string
  minItemWidth?: string
  rowKey?: string
  emptyText?: string
  itemClass?: string
  itemStyle?: CSSProperties
  useCard?: boolean
  cardShadow?: 'always' | 'hover' | 'never'
  gridColumns?: number
  gridGap?: number | string
  gridAutoRows?: string
  itemColSpan?: number
  itemRowSpan?: number
}

const props = withDefaults(defineProps<Props>(), {
  toolbarPosition: 'top',
  toolbarClass: '',
  itemActionsPosition: 'right',
  itemActionsClass: '',
  columns: 1,
  gap: 0,
  minItemWidth: '',
  rowKey: 'id',
  emptyText: '暂无数据',
  itemClass: '',
  itemStyle: () => ({}),
  useCard: false,
  cardShadow: 'hover',
  gridColumns: 24,
  gridGap: 0,
  gridAutoRows: 'minmax(32px, auto)',
  itemRowSpan: 1,
})
const slots = useSlots()

const effectiveDataKey = computed(() =>
  (props.config?.props?.['dataKey'] as string | undefined) ?? props.dataKey
)
const mergedChildren = computed(() => props.config?.children ?? props.sparkChildren ?? [])
const hasDefaultSlot = computed(() => slots['default'] !== undefined)

const { consume, provide: sparkProvide, logger } = useSparkComponent(
  props.config ?? { type: 'r-list' }
)
const pageDataSet = consume(PAGE_DATASET)

const { resolvedDataSource: resolvedView } = useContainerDataSource<DataView>({
  dataKey: effectiveDataKey,
  pageDataSet,
  fallbackSource: computed(() => props.dataView ?? null),
  mapView: view => view,
  provideDataSource: view => sparkProvide(DATA_SOURCE, view),
  logger,
  logPrefix: 'RendererList',
})

const listRows = computed<IDataRow[]>(() => resolvedView.value?.rows ?? [])
const modelPermission = computed<IModelPermission | undefined>(() =>
  (resolvedView.value as IDataSource | null | undefined)?._modelPerm
)
const showListItems = computed(() => listRows.value.length > 0 && (mergedChildren.value.length > 0 || hasDefaultSlot.value))

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

const {
  actionPositionValue: itemActionsPositionValue,
  actionClassValue: itemActionsClassValue,
  showActionsLeft: showItemActionsLeft,
  showActionsRight: showItemActionsRight,
  getScopedActionConfigs: getScopedItemActions,
} = useContainerActions<{ row: IDataRow, index: number }>({
  config: computed(() => props.config),
  actionConfigs: computed(() => props.itemActions),
  actionPosition: computed(() => props.itemActionsPosition),
  actionClass: computed(() => props.itemActionsClass),
  actionPropKey: 'itemActions',
  actionPositionPropKey: 'itemActionsPosition',
  actionClassPropKey: 'itemActionsClass',
  modelPermission,
  resolveScope: ({ row, index }) => ({
    row,
    listenerArgs: [row, index],
    scopedProps: { row, rowIndex: index, $index: index },
  }),
})

const {
  showActionsLeftValue: showItemActionsLeftValue,
  showActionsRightValue: showItemActionsRightValue,
} = useContainerSlots({
  slots,
  actionSlotName: 'item-actions',
  actionPosition: itemActionsPositionValue,
  showActionsLeft: showItemActionsLeft,
  showActionsRight: showItemActionsRight,
})

const normalizedGridGap = computed(() => {
  const value = props.gridGap ?? props.gap
  return typeof value === 'number' ? `${value}px` : value
})

const normalizedItemColSpan = computed(() => {
  if (typeof props.itemColSpan === 'number' && Number.isFinite(props.itemColSpan)) {
    return Math.max(1, Math.trunc(props.itemColSpan))
  }

  if (props.columns > 1) {
    return Math.max(1, Math.floor(props.gridColumns / props.columns))
  }

  return props.gridColumns
})

const normalizedItemRowSpan = computed(() => {
  if (typeof props.itemRowSpan === 'number' && Number.isFinite(props.itemRowSpan)) {
    return Math.max(1, Math.trunc(props.itemRowSpan))
  }
  return 1
})

const listStyle = computed<Record<string, string>>(() => {
  return {
    display: 'grid',
    gap: normalizedGridGap.value,
    gridTemplateColumns: `repeat(${Math.max(props.gridColumns, 1)}, minmax(0, 1fr))`,
    gridAutoRows: props.gridAutoRows,
    alignItems: 'start',
  }
})

const itemGridStyle = computed<CSSProperties>(() => ({
  gridColumn: `span ${normalizedItemColSpan.value} / span ${normalizedItemColSpan.value}`,
  gridRow: `span ${normalizedItemRowSpan.value} / span ${normalizedItemRowSpan.value}`,
  minWidth: 0,
}))

function getItemKey(row: IDataRow, index: number): string | number {
  const keyValue = row[props.rowKey]
  if (typeof keyValue === 'string' || typeof keyValue === 'number') return keyValue
  return `${props.rowKey}-${index}`
}

function getToolbarSlotScope() {
  return createToolbarSlotScope({
    dataSource: resolvedView.value,
    modelPermission: modelPermission.value,
  }, {
    rows: listRows.value,
  })
}

function getRowSlotScope(row: IDataRow, index: number) {
  return createRowActionSlotScope({
    dataSource: resolvedView.value,
    modelPermission: modelPermission.value,
    row,
    index,
  })
}

function getItemActionSlotScope(row: IDataRow, index: number) {
  return createRowActionSlotScope({
    dataSource: resolvedView.value,
    modelPermission: modelPermission.value,
    row,
    index,
  })
}

function getDefaultSlotScope() {
  return createToolbarSlotScope({
    dataSource: resolvedView.value,
    modelPermission: modelPermission.value,
  }, {
    rows: listRows.value,
  })
}
</script>

<style scoped>
.renderer-list-layout {
  display: flex;
  gap: 12px;
  width: 100%;
}

.renderer-list-layout--top,
.renderer-list-layout--bottom {
  flex-direction: column;
}

.renderer-list-layout--bottom {
  flex-direction: column-reverse;
}

.renderer-list-layout--right {
  flex-direction: row-reverse;
}

.renderer-list-main {
  min-width: 0;
  flex: 1;
}

.renderer-list {
  width: 100%;
}

.renderer-list-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.renderer-list-layout--left .renderer-list-toolbar,
.renderer-list-layout--right .renderer-list-toolbar {
  flex-direction: column;
  align-items: stretch;
}

.renderer-list-cell {
  min-width: 0;
}

.renderer-list-item-shell {
  display: flex;
  gap: 8px;
  min-width: 0;
  align-items: stretch;
}

.renderer-list-item-shell--right {
  flex-direction: row;
}

.renderer-list-item-shell--left {
  flex-direction: row-reverse;
}

.renderer-list-item-actions {
  display: inline-flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  gap: 8px;
  flex-shrink: 0;
}

.renderer-list-empty {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #909399;
  border: 1px dashed #dcdfe6;
  border-radius: 8px;
  background: #fafafa;
}
</style>