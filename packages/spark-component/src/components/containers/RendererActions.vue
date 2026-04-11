<!--
/**
 * @skill r-actions
 * @description 操作列/操作区组件。在容器内使用时由容器提取并渲染；独立使用时横向排列子节点。
 * @input { type: 'r-actions', props?: { position?, label?, width?, align?, fixed?, class? }, children?: SparkNode[] }
 */
-->
<template>
  <RendererActionHost
    v-if="children.length > 0"
    :actions="children"
    action-key-prefix="r-action"
    wrapper-class="renderer-actions"
  />
</template>

<script setup lang="ts">
/**
 * @skill-description 操作列/区域组件，在 r-table 中作为操作列提取渲染，独立使用时以 flex 布局渲染操作按钮。
 */
import { computed } from 'vue'
import { getSparkNodeChildren } from '../internal'
import RendererActionHost from './support/RendererActionHost.vue'
import type { RendererActionsProps as Props } from './RendererActions.types'

const props = withDefaults(defineProps<Props>(), {
  type: 'r-actions',
})

const children = computed(() => getSparkNodeChildren(props.children))
</script>

<style scoped>
.renderer-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
</style>
