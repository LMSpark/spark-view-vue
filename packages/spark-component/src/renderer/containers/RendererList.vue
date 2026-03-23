<!--
/**
 * @skill r-list
 * @description 列表容器，通过 DataKey 绑定 DataView.rows，按卡片/列表重复渲染子字段组件
 * @provides DATA_SOURCE
 * @consumes PAGE_DATASET
 * @input { dataKey: string, props: { columns?: number, gap?: number|string, rowKey?: string, gridColumns?: number, gridGap?: number|string, gridAutoRows?: string, toolbar?: SparkNode[], itemActions?: SparkNode[] } }
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
import { computed, inject, useSlots } from 'vue'
import type { CSSProperties } from 'vue'
import { useSparkComponent, SparkComponentRenderer } from '../_pkg'
import type { SparkNode } from '../_pkg'
import type { IDataRow, IDataSource, DataView, IModelPermission } from '@spark-view/spark-data'
import { PAGE_DATASET, DATA_SOURCE, SPARK_NODE_CONFIG_KEY, LIST_API } from '../_pkg'
import type { RendererListApi } from '../_pkg'
import RendererListItemScope from './RendererListItemScope.vue'
import { useContainerActions } from './useContainerActions'
import type { LateralActionPosition } from './useContainerActions'
import { useContainerInput } from './useContainerInput'
import { useContainerDataSource } from './useContainerDataSource'
import { useContainerSlots } from './useContainerSlots'
import { useContainerToolbar } from './useContainerToolbar'
import type { ToolbarPosition } from './useContainerToolbar'
import { createRowActionSlotScope, createToolbarSlotScope } from './useContainerSlotScopes'

interface Props {
  /** 数据绑定键 */
  dataKey?: string
  /** 直接传入的 DataView */
  dataView?: DataView | undefined
  /** 工具栏按钮配置 */
  toolbar?: SparkNode[]
  /** 工具栏位置 */
  toolbarPosition?: ToolbarPosition
  /** 工具栏 CSS 类名 */
  toolbarClass?: string
  /** 列表项操作按钮配置 */
  itemActions?: SparkNode[]
  /** 列表项操作位置 */
  itemActionsPosition?: LateralActionPosition
  /** 操作区 CSS 类名 */
  itemActionsClass?: string
  /** 列数 */
  columns?: number
  /** 列表项间距 */
  gap?: number | string
  /** 最小项宽度 */
  minItemWidth?: string
  /** 行唯一键字段 */
  rowKey?: string
  /** 空数据提示文案 */
  emptyText?: string
  /** 列表项 CSS 类名 */
  itemClass?: string
  /** 列表项行内样式 */
  itemStyle?: CSSProperties
  /** 使用卡片包裹 */
  useCard?: boolean
  /** 卡片阴影模式 */
  cardShadow?: 'always' | 'hover' | 'never'
  /** CSS Grid 列数 */
  gridColumns?: number
  /** 栅格间距 */
  gridGap?: number | string
  /** 栅格行高 */
  gridAutoRows?: string
  /** 项跨列数 */
  itemColSpan?: number
  /** 项跨行数 */
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
const nodeConfig = inject(SPARK_NODE_CONFIG_KEY, undefined)

const { effectiveDataKey, configChildren: mergedChildren } = useContainerInput({
  config: computed(() => nodeConfig),
  dataKey: computed(() => props.dataKey),
})
const hasDefaultSlot = computed(() => slots['default'] !== undefined)

const { consume, provide: sparkProvide, registerApi, logger } = useSparkComponent(
  nodeConfig ?? { type: 'r-list' }
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
  config: computed(() => nodeConfig),
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
  config: computed(() => nodeConfig),
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

// ── r-list 包装 API ──────────────────────────────────────────────────────

const listApi: RendererListApi = {
  getDataSource() {
    return resolvedView.value ?? null
  },
  getRows() {
    return listRows.value
  },
  getItemCount() {
    return listRows.value.length
  },
  async refresh() {
    const view = resolvedView.value
    if (!view?.dataTable?.api?.list) return
    await view.refresh()
  },
}

sparkProvide(LIST_API, listApi)
registerApi(listApi)

defineExpose(listApi)

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