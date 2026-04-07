<!--
/**
 * @skill r-footer
 * @description 底部区域 dock 组件。在容器（r-dialog/r-drawer）内使用时由容器提取并渲染为底部操作区。
 * @input { type: 'r-footer', props?: { class? }, children?: SparkNode[] }
 */
-->
<template>
  <div v-if="children.length > 0" class="dock-footer">
    <SparkComponentRenderer
      v-for="(child, i) in children"
      :key="nodeId(child) ?? `dock-footer-${i}`"
      :config="child"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * @skill-description 底部 dock，在 r-dialog/r-drawer 中作为底部操作区域提取渲染。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkComponent, type SparkNode } from '../../internal'

interface Props {
  type?: string
  id?: string
  children?: SparkNode[]
  /** 区域宽度 */
  width?: string | number
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-footer',
})

useSparkComponent(props)

const children = computed(() => getSparkNodeChildren(props.children))
</script>

<style scoped>
.dock-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
</style>
