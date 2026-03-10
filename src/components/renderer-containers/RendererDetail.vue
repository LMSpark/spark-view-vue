<!--
/**
 * @skill r-detail
 * @description 只读详情容器，绑定 DataView.currentRow 展示当前行字段，不支持编辑回写
 * @provides DATA_SOURCE
 * @provides CONTEXT_DATA
 * @provides FIELD_CONTEXT
 * @consumes PAGE_DATASET
 * @input { dataKey: string }
 * @example { "type": "r-detail", "dataKey": "Users@currentRow", "children": [] }
 */
-->
<template>
  <div :class="['renderer-detail-layout', `renderer-detail-layout--${toolbarPositionValue}`]">
    <div v-if="showToolbar" :class="['renderer-detail-toolbar', toolbarClassValue]">
      <SparkComponentRenderer
        v-for="(action, index) in visibleToolbarConfigs"
        :key="action.id ?? `r-detail-toolbar-${index}`"
        :config="action"
      />
      <slot name="toolbar" v-bind="getToolbarSlotScope()" />
    </div>

    <div class="renderer-detail-main">
      <div class="renderer-detail" v-bind="$attrs">
        <div v-if="gridChildren.length" class="renderer-detail-grid" :style="gridStyle">
          <div
            v-for="(child, i) in gridChildren"
            :key="child.id ?? `r-detail-child-${i}`"
            class="renderer-detail-grid-item"
            :style="getChildGridStyle(child)"
          >
            <SparkComponentRenderer :config="child" />
          </div>
        </div>
        <slot v-else v-bind="getDefaultSlotScope()" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * RendererDetail - 详情展示容器组件
 */
import { computed, useSlots } from 'vue'
import { useSparkComponent, SparkComponentRenderer } from '@spark-view/spark-component'
import type { ComponentConfig } from '@spark-view/spark-component'
import type { DataView, IDataSource } from '@spark-view/spark-data'
import { PAGE_DATASET, DATA_SOURCE } from '@spark-view/spark-component'
import { FIELD_CONTEXT, CONTEXT_DATA } from '../capability-keys'
import { useContainerGrid } from './useContainerGrid'
import { useContainerDataSource } from './useContainerDataSource'
import { useContainerContextData } from './useContainerContextData'
import { useContainerToolbar } from './useContainerToolbar'
import type { ToolbarPosition } from './useContainerToolbar'
import { createCurrentRowSlotScope } from './useContainerSlotScopes'

interface Props {
  config?: ComponentConfig
  dataKey?: string
  /** bindRules 从 rule.children 提取的子组件配置（form-create 路径） */
  sparkChildren?: ComponentConfig[]
  /** 直接传入的 DataView（备用） */
  dataView?: DataView | undefined
  toolbar?: ComponentConfig[]
  toolbarPosition?: ToolbarPosition
  toolbarClass?: string
  gridColumns?: number
  gridGap?: number | string
  gridAutoRows?: string
}

const props = withDefaults(defineProps<Props>(), {
  toolbarPosition: 'top',
  toolbarClass: '',
  gridColumns: 24,
  gridGap: 0,
  gridAutoRows: 'minmax(32px, auto)',
})
const slots = useSlots()

const effectiveDataKey = computed(() =>
  (props.config?.props?.['dataKey'] as string | undefined) ?? props.dataKey
)
const configChildren = computed(() => props.config?.children ?? props.sparkChildren ?? [])
const { gridChildren, gridStyle, getChildGridStyle } = useContainerGrid({
  children: configChildren,
  columns: computed(() => props.gridColumns),
  gap: computed(() => props.gridGap),
  autoRows: computed(() => props.gridAutoRows),
})

const { consume, provide: sparkProvide, logger } = useSparkComponent(
  props.config ?? { type: 'r-detail' }
)
const pageDataSet = consume(PAGE_DATASET)

const { resolvedDataSource: resolvedView } = useContainerDataSource<DataView>({
  dataKey: effectiveDataKey,
  pageDataSet,
  fallbackSource: computed(() => props.dataView ?? null),
  mapView: view => view,
  provideDataSource: view => sparkProvide(DATA_SOURCE, view),
  logger,
  logPrefix: 'RendererDetail',
})

const resolvedSource = computed<IDataSource | null>(() => resolvedView.value as IDataSource | null)
const { contextData: detailData, modelPermission } = useContainerContextData({
  source: resolvedSource,
})

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

sparkProvide(FIELD_CONTEXT, 'detail')
sparkProvide(CONTEXT_DATA, detailData)

function getToolbarSlotScope() {
  return createCurrentRowSlotScope({
    dataSource: resolvedView.value,
    modelPermission: modelPermission.value,
    row: detailData,
    model: detailData,
  })
}

function getDefaultSlotScope() {
  return createCurrentRowSlotScope({
    dataSource: resolvedView.value,
    modelPermission: modelPermission.value,
    row: detailData,
    model: detailData,
  })
}
</script>

<style scoped>
.renderer-detail-layout {
  display: flex;
  gap: 12px;
  width: 100%;
}

.renderer-detail-layout--top,
.renderer-detail-layout--bottom {
  flex-direction: column;
}

.renderer-detail-layout--bottom {
  flex-direction: column-reverse;
}

.renderer-detail-layout--right {
  flex-direction: row-reverse;
}

.renderer-detail-main {
  min-width: 0;
  flex: 1;
}

.renderer-detail-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.renderer-detail-layout--left .renderer-detail-toolbar,
.renderer-detail-layout--right .renderer-detail-toolbar {
  flex-direction: column;
  align-items: stretch;
}

.renderer-detail-grid-item {
  min-width: 0;
}
</style>
