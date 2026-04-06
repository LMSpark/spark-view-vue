<template>
  <el-backtop
    v-if="isVisible"
    :target="target"
    :visibility-height="visibilityHeight"
    :right="right"
    :bottom="bottom"
    v-bind="$attrs"
  >
    <SparkComponentRenderer
      v-for="(child, index) in resolvedChildren"
      :key="nodeId(child) ?? `r-backtop-child-${index}`"
      :config="child"
    />
  </el-backtop>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent, type SparkNode } from '../../internal'

interface Props extends SparkNode {
  children?: SparkNode[]
  target?: string
  visibilityHeight?: number
  right?: number
  bottom?: number
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-backtop',
  visibilityHeight: 200,
  right: 40,
  bottom: 40,
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>
