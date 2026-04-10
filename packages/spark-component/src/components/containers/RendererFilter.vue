<!--
/**
 * @skill r-filter
 * @description 筛选区组件。在容器（r-table）内使用时由容器提取并渲染筛选表单；独立使用时渲染子节点。
 * @input { type: 'r-filter', props?: { columns?, collapsible?, gridColumns?, ... }, children?: SparkNode[] }
 */
-->
<template>
  <div v-if="children.length > 0" class="renderer-filter">
    <SparkComponentRenderer
      v-for="(child, i) in children"
      :key="nodeId(child) ?? `r-filter-${i}`"
      :config="child"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * @skill-description 筛选区组件，在 r-table 中作为筛选表单区域提取渲染，支持折叠和网格布局。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId } from '../internal'
import type { RendererFilterProps as Props } from './RendererFilter.types'

const props = withDefaults(defineProps<Props>(), {
  type: 'r-filter',
})

const children = computed(() => getSparkNodeChildren(props.children))
</script>

<style scoped>
.renderer-filter {
  width: 100%;
}
</style>
