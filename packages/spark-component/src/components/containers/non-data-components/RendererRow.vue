<template>
  <el-row
    v-if="isVisible"
    :gutter="gutter"
    :justify="justify"
    :align="align"
    :tag="tag"
    v-bind="$attrs"
  >
    <SparkComponentRenderer
      v-for="(child, index) in resolvedChildren"
      :key="nodeId(child) ?? `r-row-child-${index}`"
      :config="child"
    />
  </el-row>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent, type SparkNode } from '../../internal'

interface Props extends SparkNode {
  children?: SparkNode[]
  gutter?: number
  justify?: 'start' | 'end' | 'center' | 'space-around' | 'space-between' | 'space-evenly'
  align?: 'top' | 'middle' | 'bottom'
  tag?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-row',
  gutter: 0,
  justify: 'start',
  align: 'top',
  tag: 'div',
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>
