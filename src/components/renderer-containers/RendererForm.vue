<!--
/**
 * @skill r-form
 * @description 表单容器，绑定 DataView.currentRow 实现双向编辑，子字段组件通过 CONTEXT_DATA 读写表单值
 * @provides DATA_SOURCE
 * @provides CONTEXT_DATA
 * @provides FIELD_CONTEXT
 * @consumes PAGE_DATASET
 * @input { dataKey: string }
 * @example { "type": "r-form", "dataKey": "Users@currentRow", "children": [] }
 */
-->
<template>
  <div :class="['renderer-form-layout', `renderer-form-layout--${toolbarPositionValue}`]">
    <div v-if="showToolbar" :class="['renderer-form-toolbar', toolbarClassValue]">
      <SparkComponentRenderer
        v-for="(action, index) in visibleToolbarConfigs"
        :key="action.id ?? `r-form-toolbar-${index}`"
        :config="action"
      />
      <slot name="toolbar" v-bind="getToolbarSlotScope()" />
    </div>

    <div class="renderer-form-main">
      <el-form :model="formModel" v-bind="$attrs">
        <div v-if="gridChildren.length" class="renderer-form-grid" :style="gridStyle">
          <div
            v-for="(child, i) in gridChildren"
            :key="child.id ?? `r-form-child-${i}`"
            class="renderer-form-grid-item"
            :style="getChildGridStyle(child)"
          >
            <SparkComponentRenderer :config="child" />
          </div>
        </div>
        <slot v-else v-bind="getDefaultSlotScope()" />
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * RendererForm - 表单容器组件
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
  labelWidth?: string
  gridColumns?: number
  gridGap?: number | string
  gridAutoRows?: string
}

const props = withDefaults(defineProps<Props>(), {
  labelWidth: '100px',
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
  props.config ?? { type: 'r-form' }
)
const pageDataSet = consume(PAGE_DATASET)

const { resolvedDataSource: resolvedView } = useContainerDataSource<DataView>({
  dataKey: effectiveDataKey,
  pageDataSet,
  fallbackSource: computed(() => props.dataView ?? null),
  mapView: view => view,
  provideDataSource: view => sparkProvide(DATA_SOURCE, view),
  logger,
  logPrefix: 'RendererForm',
})

const resolvedSource = computed<IDataSource | null>(() => resolvedView.value as IDataSource | null)
const { contextData: formModel, modelPermission } = useContainerContextData({
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

sparkProvide(FIELD_CONTEXT, 'form')
sparkProvide(CONTEXT_DATA, formModel)

function getToolbarSlotScope() {
  return createCurrentRowSlotScope({
    dataSource: resolvedView.value,
    modelPermission: modelPermission.value,
    row: formModel,
    model: formModel,
  })
}

function getDefaultSlotScope() {
  return createCurrentRowSlotScope({
    dataSource: resolvedView.value,
    modelPermission: modelPermission.value,
    row: formModel,
    model: formModel,
  })
}
</script>

<style scoped>
.renderer-form-layout {
  display: flex;
  gap: 12px;
  width: 100%;
}

.renderer-form-layout--top,
.renderer-form-layout--bottom {
  flex-direction: column;
}

.renderer-form-layout--bottom {
  flex-direction: column-reverse;
}

.renderer-form-layout--right {
  flex-direction: row-reverse;
}

.renderer-form-main {
  min-width: 0;
  flex: 1;
}

.renderer-form-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.renderer-form-layout--left .renderer-form-toolbar,
.renderer-form-layout--right .renderer-form-toolbar {
  flex-direction: column;
  align-items: stretch;
}

.renderer-form-grid-item {
  min-width: 0;
}
</style>
