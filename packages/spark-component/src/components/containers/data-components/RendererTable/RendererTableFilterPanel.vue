<template>
  <div
    v-if="visible"
    :class="['renderer-table-filter-panel', { 'renderer-table-filter-panel--empty': rows.length === 0 }]"
  >
    <SparkComponentRenderer :config="filterRendererConfig" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SparkComponentRenderer, type SparkNode } from '../../../internal'
import type { IDataRow } from '@spark-view/spark-data'

interface RendererTableFilterPanelProps {
  visible: boolean
  rows: IDataRow[]
  filterClass: string
  filterModel: Record<string, unknown>
  filterConfigs: SparkNode[]
  activeFilterCount: number
  collapsible: boolean
  collapsed: boolean
  gridColumns: number
  gridGap: number | string
  gridAutoRows: string
  autoFitMinWidth: string
  itemSpan: number
  actionSpan: number
  onSearch: () => Promise<void>
  onReset: () => void | Promise<void>
  onToggleCollapsed: () => void
}

const props = defineProps<RendererTableFilterPanelProps>()

const filterRendererConfig = computed<SparkNode>(() => ({
  type: 'r-filter',
  props: {
    class: props.filterClass,
    model: props.filterModel,
    configs: props.filterConfigs,
    activeCount: props.activeFilterCount,
    collapsible: props.collapsible,
    collapsed: props.collapsed,
    gridColumns: props.gridColumns,
    gridGap: props.gridGap,
    gridAutoRows: props.gridAutoRows,
    autoFitMinWidth: props.autoFitMinWidth,
    itemSpan: props.itemSpan,
    actionSpan: props.actionSpan,
    searchAction: props.onSearch,
    resetAction: props.onReset,
    toggleCollapsedAction: props.onToggleCollapsed,
  },
}))
</script>

<style scoped>
.renderer-table-filter-panel {
  width: 100%;
}
</style>
