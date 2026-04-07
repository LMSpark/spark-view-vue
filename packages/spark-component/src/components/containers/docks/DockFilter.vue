<!--
/**
 * @skill r-filter
 * @description 筛选区 dock 组件。在容器（r-table）内使用时由容器提取并渲染筛选表单；独立使用时渲染子节点。
 * @input { type: 'r-filter', props?: { columns?, collapsible?, gridColumns?, ... }, children?: SparkNode[] }
 */
-->
<template>
  <div v-if="children.length > 0" class="dock-filter">
    <SparkComponentRenderer
      v-for="(child, i) in children"
      :key="nodeId(child) ?? `dock-filter-${i}`"
      :config="child"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * @skill-description 筛选区 dock，在 r-table 中作为筛选表单区域提取渲染，支持折叠和网格布局。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkComponent, type SparkNode } from '../../internal'
import type { DockFilterItem } from '../../../core/types.js'

interface Props {
  type?: string
  id?: string
  children?: SparkNode[]
  /** 筛选列 */
  columns?: Array<string | DockFilterItem>
  /** 是否可折叠 @default false */
  collapsible?: boolean
  /** 默认折叠 @default false */
  defaultCollapsed?: boolean
  /** 自适应最小宽度 @default '220px' */
  autoFitMinWidth?: string
  /** 单项跨列数 @default 1 */
  itemSpan?: number
  /** 网格列数 @default 24 */
  gridColumns?: number
  /** 网格间距 @default 12 */
  gridGap?: number | string
  /** 网格行高 @default 'minmax(32px, auto)' */
  gridAutoRows?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-filter',
})

useSparkComponent(props)

const children = computed(() => getSparkNodeChildren(props.children))
</script>

<style scoped>
.dock-filter {
  width: 100%;
}
</style>
