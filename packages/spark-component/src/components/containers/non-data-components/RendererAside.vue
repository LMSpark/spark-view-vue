<template>
  <el-aside v-if="isVisible" :width="asideWidth" v-bind="$attrs">
    <SparkComponentRenderer
      v-for="(child, index) in resolvedChildren"
      :key="nodeId(child) ?? `r-aside-child-${index}`"
      :config="child"
    />
  </el-aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent, type SparkNode } from '../../internal'

interface Props extends SparkNode {
  children?: SparkNode[]
  /** 侧边栏宽度 */
  asideWidth?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-aside',
  asideWidth: '300px',
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>
