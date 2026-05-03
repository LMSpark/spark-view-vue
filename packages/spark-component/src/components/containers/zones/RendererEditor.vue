<template>
  <div v-if="children.length > 0" class="renderer-editor">
    <SparkComponentRenderer
      v-for="(child, i) in children"
      :key="nodeId(child) ?? `r-editor-${i}`"
      :config="child"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * @skill r-editor
 * @description 编辑面板组件，在 r-tree 中作为侧边编辑面板提取渲染，用于节点详情编辑。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId } from '../../internal'
import type { RendererEditorProps as Props } from './RendererEditor.types'

const props = withDefaults(defineProps<Props>(), {
  type: 'r-editor',
})

const children = computed(() => getSparkNodeChildren(props.children))
</script>

<style scoped>
.renderer-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
