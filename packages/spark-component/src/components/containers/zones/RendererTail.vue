<!--
@module @spark-appworks/spark-component:components/containers/zones/RendererTail
RendererTail 模块，属于 SPARK component container/zone-container。
组件目录: containers/zones。
该 DTS shard 当前不导出 ClassModel symbol。
-->
<template>
  <div v-if="children.length > 0" class="renderer-tail">
    <SparkComponentRenderer
      v-for="(child, i) in children"
      :key="nodeId(child) ?? `r-tail-${i}`"
      :config="child"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * @description 尾部组件，在 r-toolbar 中作为工具栏末尾区域提取渲染。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId } from '../../internal'
import type { RTailProps as Props } from './RendererTail.types'

const props = withDefaults(defineProps<Props>(), {
  type: 'r-tail',
})

const children = computed(() => getSparkNodeChildren(props.children))
</script>

<style scoped>
.renderer-tail {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
</style>
