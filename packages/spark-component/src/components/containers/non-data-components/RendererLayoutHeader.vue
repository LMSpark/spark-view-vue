<template>
  <el-header v-if="isVisible" :height="headerHeight" v-bind="$attrs">
    <SparkComponentRenderer
      v-for="(child, index) in resolvedChildren"
      :key="nodeId(child) ?? `r-layout-header-child-${index}`"
      :config="child"
    />
  </el-header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent, type SparkNode } from '../../internal'

interface Props extends SparkNode {
  children?: SparkNode[]
  /** 头部高度 */
  headerHeight?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-layout-header',
  headerHeight: '60px',
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>
