<!--
/**
 * @skill r-footer
 * @description 底部区域组件。在容器（r-dialog/r-drawer）内使用时由容器提取并渲染为底部操作区。
 * @input { type: 'r-footer', props?: { class? }, children?: SparkNode[] }
 */
-->
<template>
  <div v-if="children.length > 0" class="renderer-footer">
    <SparkComponentRenderer
      v-for="(child, i) in children"
      :key="nodeId(child) ?? `r-footer-${i}`"
      :config="child"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * @skill r-footer
 * @description 底部组件，在 r-dialog/r-drawer 中作为底部操作区域提取渲染。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId } from '../internal'
import type { RendererFooterProps as Props } from './RendererFooter.types'

const props = withDefaults(defineProps<Props>(), {
  type: 'r-footer',
})

const children = computed(() => getSparkNodeChildren(props.children))
</script>

<style scoped>
.renderer-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
</style>
