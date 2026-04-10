<!--
/**
 * @skill r-tail
 * @description 工具栏尾区组件。在 r-toolbar 内使用时由容器提取并渲染到尾区；独立使用时横向排列子节点。
 * @input { type: 'r-tail', props?: { class?, width? }, children?: SparkNode[] }
 */
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
 * @skill-description 尾部组件，在 r-toolbar 中作为工具栏末尾区域提取渲染。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId } from '../internal'
import type { RendererTailProps as Props } from './RendererTail.types'

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
