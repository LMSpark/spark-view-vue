<!--
/**
 * @skill r-editor
 * @description 编辑面板 dock 组件。在容器（r-tree）内使用时由容器提取并渲染为侧边编辑区；独立使用时渲染子节点。
 * @input { type: 'r-editor', props?: { position?, width?, class? }, children?: SparkNode[] }
 */
-->
<template>
  <div v-if="children.length > 0" class="dock-editor">
    <SparkComponentRenderer
      v-for="(child, i) in children"
      :key="nodeId(child) ?? `dock-editor-${i}`"
      :config="child"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkComponent, type SparkNode } from '../../internal'

interface Props {
  type?: string
  id?: string
  children?: SparkNode[]
  /** 编辑区位置 @default 'right' */
  position?: 'top' | 'bottom' | 'left' | 'right'
  /** 编辑区宽度 */
  width?: string | number
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-editor',
})

useSparkComponent(props)

const children = computed(() => getSparkNodeChildren(props.children))
</script>

<style scoped>
.dock-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
