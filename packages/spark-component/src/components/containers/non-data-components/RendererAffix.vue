<template>
  <el-affix
    v-if="isVisible"
    :offset="offset"
    :position="position"
    :target="target"
    :z-index="zIndex"
    v-bind="$attrs"
  >
    <SparkComponentRenderer
      v-for="(child, index) in resolvedChildren"
      :key="nodeId(child) ?? `r-affix-child-${index}`"
      :config="child"
    />
  </el-affix>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent, type SparkNode } from '../../internal'

interface Props extends SparkNode {
  children?: SparkNode[]
  offset?: number
  position?: 'top' | 'bottom'
  target?: string
  zIndex?: number
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-affix',
  offset: 0,
  position: 'top',
  zIndex: 100,
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>
