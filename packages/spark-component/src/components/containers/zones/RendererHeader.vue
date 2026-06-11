<!--
@module @spark-appworks/spark-component:components/containers/zones/RendererHeader
RendererHeader 模块，属于 SPARK component container/zone-container。
组件目录: containers/zones。
该 DTS shard 当前不导出 ClassModel symbol。
-->
<template>
  <div v-if="children.length > 0" class="renderer-header">
    <SparkComponentRenderer
      v-for="(child, i) in children"
      :key="nodeId(child) ?? `r-header-${i}`"
      :config="child"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * @description 头部组件，在 r-dialog/r-drawer/r-section 中作为顶部操作区域提取渲染。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId } from '../../internal'
import type { RHeaderProps as Props } from './RendererHeader.types'

const props = withDefaults(defineProps<Props>(), {
  type: 'r-header',
})

const children = computed(() => getSparkNodeChildren(props.children))
</script>

<style scoped>
.renderer-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
