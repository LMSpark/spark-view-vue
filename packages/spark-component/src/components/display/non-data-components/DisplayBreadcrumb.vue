<template>
  <el-breadcrumb
    v-if="isVisible"
    :separator="separator"
    :separator-icon="separatorIcon"
    v-bind="$attrs"
  >
    <SparkComponentRenderer
      v-for="(child, index) in resolvedChildren"
      :key="nodeId(child) ?? `r-breadcrumb-child-${index}`"
      :config="child"
    />
  </el-breadcrumb>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent, type SparkNode } from '../../internal'

interface Props extends SparkNode {
  children?: SparkNode[]
  separator?: string
  separatorIcon?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-breadcrumb',
  separator: '/',
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>
