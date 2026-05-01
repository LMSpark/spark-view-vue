<template>
  <div :class="['renderer-list-layout', `renderer-list-layout--${toolbarPositionValue}`]">
    <div v-if="showToolbar" :class="['renderer-list-toolbar', toolbarClassValue]">
        <SparkComponentRenderer
          v-for="(action, index) in visibleToolbarConfigs"
          :key="nodeId(action) ?? `r-list-toolbar-${index}`"
          :config="action"
        />
    </div>

    <div class="renderer-list-main renderer-list" :style="listStyle" v-bind="listPropsValue">
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
                v-if="showItemActionsLeft"
                :class="['renderer-list-item-actions', itemActionsClassValue]"
              >
                <RendererHostScope :row="row">
                  <SparkComponentRenderer :config="rawItemActionsToolbarConfig" />
                </RendererHostScope>
              </div>

              <div :class="itemClass" :style="itemStyle">
                <component :is="itemBodyWrapperTag" v-bind="itemBodyWrapperAttrs">
                  <div class="renderer-list-item-body" :style="itemContentGridStyle">
                    <RendererHostScope :row="row">
                      <div
                        v-for="(child, childIndex) in itemContentChildren"
                        :key="nodeId(child) ?? `r-list-item-child-${childIndex}`"
                        class="renderer-list-grid-item"
                        :style="getItemContentChildGridStyle(child)"
                      >
                        <SparkComponentRenderer :config="child" />
                      </div>
                    </RendererHostScope>
                    <slot
                      v-if="!itemContentChildren.length"
                      v-bind="getRowScope(row, index)"
                    />
                  </div>
                </component>
              </div>

              <div
                v-if="showItemActionsRight"
                :class="['renderer-list-item-actions', itemActionsClassValue]"
              >
                <RendererHostScope :row="row">
                  <SparkComponentRenderer :config="rawItemActionsToolbarConfig" />
                </RendererHostScope>
              </div>
            </div>
          </div>
        </template>
        <div v-else-if="emptyText" class="renderer-list-empty">{{ emptyText }}</div>
        <slot v-else v-bind="getDefaultScope()" />
      </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @skill r-list
 * @description 列表容器，绑定 DataView.rows 以 CSS Grid 网格卡片布局渲染数据项，支持项选择和操作区域。
 * @category container
 * @binding dataKey-driven
 * @provides DATA_SOURCE
 * @consumes PAGE_DATASET
 * @notes 使用结构化 `toolbar` / `actions` 区域声明工具栏与列表项操作
 */
import { computed, toRef, useSlots } from 'vue'
import type { CSSProperties } from 'vue'
import {
  useSparkPageComponent,
  SparkComponentRenderer,
  getSparkNodeChildren,
  nodeId,
  DATA_SOURCE,
  MODULE_CONTEXT,
  type SparkNode,
} from '../../../internal'
import type { RListProps } from './RendererList.props'
import type { DataView, IDataRow } from '@spark-view/spark-data'
import type { RendererListApi } from './types'
import { useContainerDataSource } from '../../composables/useContainerDataSource'
import { useRendererListViewState } from './view-state'
import { useContainerGrid } from '../../layout/useContainerGrid'
import type { ToolbarPosition } from '../../layout'
import { createRowScope, createToolbarScope } from '../../support/scopeFactories'
import type { ActionsPosition } from '../../support/RendererActions.types'
import { useContainerModuleContext } from '../../composables/useContainerModuleContext'
import { createRendererListZeroCode } from './zero-code'
import RendererHostScope from '../../support/RendererHostScope.vue'

const props = withDefaults(defineProps<RListProps>(), {
  type: 'r-list',
  columns: 1,
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

// 仅消费结构化 props.toolbar / props.actions；children 直接作为内容节点，不再做结构分流。
const toolbarNode = computed(() => props.toolbar)
const actionsNode = computed(() => props.actions)

const mergedChildren = computed<SparkNode[]>(() => {
  return getSparkNodeChildren(props.children)
})
const hasDefaultSlot = computed(() => slots['default'] !== undefined)

const { sparkConsume, sparkProvide, registerApi, logger } = useSparkPageComponent(props)
const moduleContext = useContainerModuleContext(sparkConsume(MODULE_CONTEXT))

const { resolvedDataSource: resolvedView, modelPermission } = useContainerDataSource<DataView>({
  externalDataSource: toRef(props, 'dataSource'),
  dataKey: toRef(props, 'dataKey'),
  sparkConsume,
  mapView: view => view,
  provideDataSource: (view: DataView) => sparkProvide(DATA_SOURCE, view),
  logger,
  logPrefix: 'RendererList',
})

const { listRows } = useRendererListViewState({
  resolvedView,
})
const showListItems = computed(() => listRows.value.length > 0 && (mergedChildren.value.length > 0 || hasDefaultSlot.value))

const visibleToolbarConfigs = computed(() => getSparkNodeChildren(toolbarNode.value?.children))
const toolbarPositionValue = computed<ToolbarPosition>(() => {
  const position = toolbarNode.value?.position
  return (position === 'top' || position === 'bottom' || position === 'left' || position === 'right')
    ? position as ToolbarPosition
    : 'top'
})
const toolbarClassValue = computed(() => {
  const className = toolbarNode.value?.class
  return typeof className === 'string' ? className : 'renderer-toolbar-default'
})
const showToolbar = computed(() => visibleToolbarConfigs.value.length > 0)

const itemActionConfigs = computed(() => getSparkNodeChildren(actionsNode.value?.children))
const itemActionsPositionValue = computed<ActionsPosition>(() => {
  const position = actionsNode.value?.position
  return position === 'left' || position === 'right' ? position : 'right'
})
const itemActionsClassValue = computed(() => {
  const className = actionsNode.value?.class
  return typeof className === 'string' ? className : ''
})
const showItemActionsLeft = computed(() => itemActionConfigs.value.length > 0 && itemActionsPositionValue.value === 'left')
const showItemActionsRight = computed(() => itemActionConfigs.value.length > 0 && itemActionsPositionValue.value === 'right')

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
  const value = props.gridGap
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

function scopeBase() {
  return {
    dataSource: resolvedView.value,
    modelPermission: modelPermission.value,
    moduleContext: moduleContext.value,
  }
}

function getRowScope(row: IDataRow, index: number) {
  return createRowScope({
    ...scopeBase(),
    row,
    index,
  })
}

const rawItemActionsToolbarConfig = computed<SparkNode>(() => ({
  type: 'r-toolbar',
  children: itemActionConfigs.value,
}))

async function handleItemClick(row: IDataRow, index: number, event: Event) {
  await dispatch('item-click', row, index, event)
}

function getDefaultScope() {
  return createToolbarScope(scopeBase(), {
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
