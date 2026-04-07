<!--
/**
 * @skill r-header
 * @description 头部区域 dock 组件。在容器（r-dialog/r-drawer/r-section）内使用时由容器提取并渲染为头部操作区。
 * @input { type: 'r-header', props?: { class? }, children?: SparkNode[] }
 */
-->
<template>
  <div v-if="children.length > 0" class="dock-header">
    <SparkComponentRenderer
      v-for="(child, i) in children"
      :key="nodeId(child) ?? `dock-header-${i}`"
      :config="child"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * @skill-description 头部 dock，在 r-dialog/r-drawer/r-section 中作为顶部操作区域提取渲染。
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
  type: 'r-header',
})

useSparkComponent(props)

const children = computed(() => getSparkNodeChildren(props.children))
</script>

<style scoped>
.dock-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
