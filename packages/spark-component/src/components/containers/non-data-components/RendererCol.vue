<template>
  <el-col
    v-if="isVisible"
    :span="span"
    :offset="offset"
    :push="push"
    :pull="pull"
    :xs="xs"
    :sm="sm"
    :md="md"
    :lg="lg"
    :xl="xl"
    :tag="tag"
    v-bind="$attrs"
  >
    <SparkComponentRenderer
      v-for="(child, index) in resolvedChildren"
      :key="nodeId(child) ?? `r-col-child-${index}`"
      :config="child"
    />
  </el-col>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent, type SparkNode } from '../../internal'

type ResponsiveValue = number | { span?: number; offset?: number; push?: number; pull?: number }

interface Props extends SparkNode {
  children?: SparkNode[]
  span?: number
  offset?: number
  push?: number
  pull?: number
  xs?: ResponsiveValue
  sm?: ResponsiveValue
  md?: ResponsiveValue
  lg?: ResponsiveValue
  xl?: ResponsiveValue
  tag?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-col',
  span: 24,
  offset: 0,
  push: 0,
  pull: 0,
  tag: 'div',
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>
