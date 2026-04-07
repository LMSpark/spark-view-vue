<!--
/**
 * @skill r-actions
 * @description 操作列/操作区 dock 组件。在容器内使用时由容器提取并渲染；独立使用时横向排列子节点。
 * @input { type: 'r-actions', props?: { position?, label?, width?, align?, fixed?, class? }, children?: SparkNode[] }
 */
-->
<template>
  <div v-if="children.length > 0" class="dock-actions">
    <SparkComponentRenderer
      v-for="(child, i) in children"
      :key="nodeId(child) ?? `dock-action-${i}`"
      :config="child"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * @skill-description 操作列/区域 dock，在 r-table 中作为操作列提取渲染，独立使用时以 flex 布局渲染操作按钮。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkComponent, type SparkNode } from '../../internal'

interface Props {
  type?: string
  id?: string
  children?: SparkNode[]
  /** 操作列位置 @default 'right' */
  position?: 'left' | 'right'
  /** 列标题 @default '操作' */
  label?: string
  /** 列宽 @default 160 */
  width?: string | number
  /** 对齐方式 @default 'left' */
  align?: 'left' | 'center' | 'right'
  /** 固定列 */
  fixed?: boolean | 'left' | 'right'
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-actions',
})

useSparkComponent(props)

const children = computed(() => getSparkNodeChildren(props.children))
</script>

<style scoped>
.dock-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
</style>
