<!--
/**
 * @skill r-list
 * @description 列表容器，通过 DataKey 绑定 DataView.rows，按卡片/列表重复渲染子字段组件，支持 dock 分区工具栏与项操作区
 * @provides DATA_SOURCE
 * @consumes PAGE_DATASET
 * @input { dataKey: string, props: { docks?: { toolbar?: { position?: 'top'|'bottom'|'left'|'right', class?: string }, actions?: { position?: 'left'|'right', class?: string } }, columns?: number, gap?: number|string, rowKey?: string, gridColumns?: number, gridGap?: number|string, gridAutoRows?: string } }
 * @example { "type": "r-list", "dataKey": "Users@rows", "children": [{ "type": "r-text", "name": "name" }] }
 */
-->
<template>
  <div :class="['renderer-list-layout', `renderer-list-layout--${toolbarPositionValue}`]">
    <div v-if="showToolbar" :class="['renderer-list-toolbar', toolbarClassValue]">
      <SparkComponentRenderer
        v-for="(action, index) in visibleToolbarConfigs"
        :key="nodeId(action) ?? `r-list-toolbar-${index}`"
        :config="action"
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
            <div
              :class="['renderer-list-item-shell', `renderer-list-item-shell--${itemActionsPositionValue}`]"
              @click="handleItemClick(row, index, $event)"
            >
              <div v-if="showItemActionsLeftValue" :class="['renderer-list-item-actions', itemActionsClassValue]">
                <SparkComponentRenderer
                  v-for="(action, actionIndex) in getScopedItemActions({ row, index })"
                  :key="nodeId(action) ?? `r-list-item-action-left-${actionIndex}`"
                  :config="action"
                />
                <slot
                  name="item-actions"
                  v-bind="getItemActionSlotScope(row, index)"
                />
              </div>

              <RendererListItemScope
                type="r-list-item"
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
                  :key="nodeId(action) ?? `r-list-item-action-right-${actionIndex}`"
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
import { computed, useAttrs, useSlots } from 'vue'
import type { CSSProperties } from 'vue'
import { useSparkComponent, SparkComponentRenderer } from '../../../internal'
import { getDockedChildren, nodeId, type SparkNode } from '../../../internal'
import type { ContainerDocks } from '../../../../core/types'
import type { DataView, IDataRow } from '@spark-view/spark-data'
import { PAGE_DATASET, DATA_SOURCE, FIELD_CONTEXT } from '../../../internal'
import type { RendererListApi } from './types'
import RendererListItemScope from '../RendererListItemScope.vue'
import { useContainerActions } from '../../actions/useContainerActions'
import type { LateralActionPosition } from '../../actions/useContainerActions'
import { useContainerDataSource, useContainerDataSourceEffects } from '../../data/useContainerDataSource'
import { useContainerSlots } from '../../layout/useContainerSlots'
import { useContainerToolbar } from '../../layout/useContainerToolbar'
import type { ToolbarPosition } from '../../layout/useContainerToolbar'
import { createRowActionSlotScope, createToolbarSlotScope } from '../../slotScopeFactories'
import { createRendererListZeroCode } from './zero-code'
import {
  type AddRowHandler,
  type EditRowHandler,
  type RemoveRowHandler,
  type RowClickHandler,
} from '../../support/index.js'

interface Props extends SparkNode {
  /** 数据绑定键 */
  dataKey?: string
  /** 子节点（列表项内容配置） */
  children?: SparkNode[]
  /** 停靠区域显示配置 */
  docks?: ContainerDocks
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
  onItemClick?: RowClickHandler
  onAddRow?: AddRowHandler
  onEditRow?: EditRowHandler
  onRemoveRow?: RemoveRowHandler
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-list',
  docks: () => ({}),
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
const attrs = useAttrs()
const slots = useSlots()

function readStringAttr(name: string): string | undefined {
  const value = attrs[name]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

const legacyItemActionsPositionValue = computed<LateralActionPosition | undefined>(() => {
  const value = readStringAttr('itemActionsPosition')
  return value === 'left' || value === 'right' ? value : undefined
})

const legacyItemActionsValue = computed<SparkNode[]>(() => {
  const value = attrs['itemActions']
  return Array.isArray(value) ? value as SparkNode[] : []
})

assertNoLegacyListStructures()

const effectiveDataKey = computed(() => props.dataKey)
const mergedChildren = computed<SparkNode[]>(() => {
  return getDockedChildren(props.children)
})
const dockedToolbar = computed(() => getDockedChildren(props.children, 'toolbar'))
const dockedItemActions = computed(() => getDockedChildren(props.children, 'actions'))
const hasDefaultSlot = computed(() => slots['default'] !== undefined)

const { sparkConsume, sparkProvide, registerApi, logger } = useSparkComponent(props)
const pageDataSet = sparkConsume(PAGE_DATASET)

const { resolvedDataSource: resolvedView, modelPermission } = useContainerDataSource<DataView>({
  dataKey: effectiveDataKey,
  pageDataSet,
  mapView: view => view,
})

useContainerDataSourceEffects({
  resolvedDataSource: resolvedView,
  provideDataSource: (view: DataView) => sparkProvide(DATA_SOURCE, view),
  logger,
  logPrefix: 'RendererList',
})

sparkProvide(FIELD_CONTEXT, 'list')

const listRows = computed<IDataRow[]>(() => resolvedView.value?.rows ?? [])
const showListItems = computed(() => listRows.value.length > 0 && (mergedChildren.value.length > 0 || hasDefaultSlot.value))

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
  actionPositionValue: itemActionsPositionValue,
  actionClassValue: itemActionsClassValue,
  showActionsLeft: showItemActionsLeft,
  showActionsRight: showItemActionsRight,
  getScopedActionConfigs: getScopedItemActions,
} = useContainerActions<{ row: IDataRow, index: number }>({
  actionConfigs: computed(() => dockedItemActions.value),
  actionPosition: computed(() => props.docks?.actions?.position as LateralActionPosition | undefined ?? legacyItemActionsPositionValue.value ?? 'right'),
  actionClass: computed(() => props.docks?.actions?.class ?? readStringAttr('itemActionsClass') ?? ''),
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

const {
  dispatch,
  listApi,
}: {
  dispatch: (eventName: string, ...args: unknown[]) => Promise<{ cancel: boolean }>
  listApi: RendererListApi
} = createRendererListZeroCode({
  props,
  resolvedView,
  listRows,
})

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

async function handleItemClick(row: IDataRow, index: number, event: Event) {
  await dispatch('item-click', row, index, event)
}

function getDefaultSlotScope() {
  return createToolbarSlotScope({
    dataSource: resolvedView.value,
    modelPermission: modelPermission.value,
  }, {
    rows: listRows.value,
  })
}

function assertNoLegacyListStructures(): void {
  if (legacyItemActionsValue.value.length > 0) {
    throw new Error('[RendererList] props.itemActions 已废除。请将列表项动作节点移动到 children，并声明 dock: "actions"。')
  }
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
