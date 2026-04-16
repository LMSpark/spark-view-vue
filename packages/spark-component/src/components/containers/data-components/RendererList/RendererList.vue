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
      <div class="renderer-list" :style="listStyle" v-bind="listPropsValue">
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
              <div
                v-if="showItemActionsLeftValue"
                :class="['renderer-list-item-actions', itemActionsClassValue]"
              >
                <RendererHostDataScope
                  type="r-list-item-action-scope"
                  :children="getScopedItemActions({ row, index })"
                  :row="row"
                  child-key-prefix="r-list-item-action-left"
                />
                <slot name="item-actions" v-bind="getItemActionSlotScope(row, index)" />
              </div>

              <div :class="itemClass" :style="itemStyle">
                <RendererHostDataScope type="r-list-item" :row="row" :host="listFieldHost">
                  <component :is="itemBodyWrapperTag" v-bind="itemBodyWrapperAttrs">
                    <div class="renderer-list-item-body" :style="itemContentGridStyle">
                      <div
                        v-for="(child, childIndex) in itemContentChildren"
                        :key="nodeId(child) ?? `r-list-item-child-${childIndex}`"
                        class="renderer-list-grid-item"
                        :style="getItemContentChildGridStyle(child)"
                      >
                        <SparkComponentRenderer :config="child" />
                      </div>
                      <slot
                        v-if="!itemContentChildren.length"
                        v-bind="getRowSlotScope(row, index)"
                      />
                    </div>
                  </component>
                </RendererHostDataScope>
              </div>

              <div
                v-if="showItemActionsRightValue"
                :class="['renderer-list-item-actions', itemActionsClassValue]"
              >
                <RendererHostDataScope
                  type="r-list-item-action-scope"
                  :children="getScopedItemActions({ row, index })"
                  :row="row"
                  child-key-prefix="r-list-item-action-right"
                />
                <slot name="item-actions" v-bind="getItemActionSlotScope(row, index)" />
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
/**
 * @skill r-list
 * @description 列表容器，绑定 DataView.rows 以 CSS Grid 网格卡片布局渲染数据项，支持项选择和操作区域。
 * @category container
 * @binding datakey-driven
 * @provides DATA_SOURCE
 * @consumes PAGE_DATASET
 * @notes dock='toolbar' 声明工具栏节点；dock='actions' 声明列表项操作
 */
import { computed, useSlots } from 'vue'
import type { CSSProperties } from 'vue'
import { useSparkPageComponent, SparkComponentRenderer } from '../../../internal'
import { getSparkNodeChildren, nodeId, type SparkNode } from '../../../internal'
import type { RListProps } from './RendererList.props'
import type { DataView, IDataRow } from '@spark-view/spark-data'
import { PAGE_DATASET, DATA_SOURCE } from '../../../internal'
import type { RendererListApi } from './types'
import RendererHostDataScope from '../../support/RendererHostDataScope.vue'
import type { SparkComponentHost } from '../../../internal'
import { useContainerActions } from '../../useContainerActions'
import { useContainerDataSource, useContainerDataSourceEffects } from '../../useContainerDataSource'
import { useContainerSlots } from '../../layout/useContainerSlots'
import { useContainerToolbar } from '../../layout/useContainerToolbar'
import { useContainerGrid } from '../../layout/useContainerGrid'
import type { ToolbarPosition } from '../../layout/useContainerToolbar'
import { createRowActionSlotScope, createToolbarSlotScope } from '../../slotScopeFactories'
import { createRendererListZeroCode } from './zero-code'

const props = withDefaults(defineProps<RListProps>(), {
  type: 'r-list',
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
const listPropsValue = computed<Record<string, unknown>>(() => ({ ...(props.listProps ?? {}) }))
const slots = useSlots()

// r-toolbar / r-actions 子节点已由绑定层提升为 props，
// 此处 children 仅包含内容子节点。
const contentChildren = computed(() => props.children ?? [])

const effectiveDataKey = computed(() => props.dataKey)
const mergedChildren = computed<SparkNode[]>(() => {
  return getSparkNodeChildren(contentChildren.value)
})
const hasDefaultSlot = computed(() => slots['default'] !== undefined)

const { sparkConsume, sparkProvide, registerApi, logger } = useSparkPageComponent(props)
const pageDataSet = sparkConsume(PAGE_DATASET)

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
  logPrefix: 'RendererList',
})

const listFieldHost: SparkComponentHost = {
  fieldMode: 'detail',
}

const listRows = computed<IDataRow[]>(() => resolvedView.value?.rows ?? [])
const showListItems = computed(() => listRows.value.length > 0 && (mergedChildren.value.length > 0 || hasDefaultSlot.value))

const {
  toolbarPositionValue,
  toolbarClassValue,
  visibleToolbarConfigs,
  showToolbar,
} = useContainerToolbar({
  toolbar: computed(() => getSparkNodeChildren(props.toolbar?.children)),
  toolbarPosition: computed(() => props.toolbar?.props?.position as ToolbarPosition | undefined),
  toolbarClass: computed(() => props.toolbar?.props?.class),
  modelPermission,
  dataSource: computed(() => resolvedView.value),
})

const {
  actionPositionValue: itemActionsPositionValue,
  actionClassValue: itemActionsClassValue,
  showActionsLeft: showItemActionsLeft,
  showActionsRight: showItemActionsRight,
  getScopedActionConfigs: getScopedItemActions,
} = useContainerActions<{ row: IDataRow, index: number }>({
  actionConfigs: computed(() => getSparkNodeChildren(props.actions?.children)),
  actionPosition: computed(() => props.actions?.props?.position ?? 'right'),
  actionClass: computed(() => String(props.actions?.props?.class ?? '')),
  modelPermission,
  dataSource: computed(() => resolvedView.value),
  resolveScope: ({ row, index }) => ({
    row,
    listenerArgs: [row, index],
    scopedProps: { row, rowIndex: index },
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

const {
  gridChildren: itemContentChildren,
  gridStyle: itemContentGridStyle,
  getChildGridStyle: getItemContentChildGridStyle,
} = useContainerGrid({
  children: () => mergedChildren.value,
  columns: () => props.gridColumns,
  gap: () => props.gridGap,
  autoRows: () => props.gridAutoRows,
})

const itemBodyWrapperTag = computed(() => props.useCard ? 'el-card' : 'div')
const itemBodyWrapperAttrs = computed<Record<string, unknown>>(() => {
  if (!props.useCard) return {}
  return {
    shadow: props.cardShadow,
    class: 'renderer-list-card',
  }
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

.renderer-list-card {
  height: 100%;
}

.renderer-list-item-body {
  width: 100%;
}

.renderer-list-grid-item {
  min-width: 0;
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
