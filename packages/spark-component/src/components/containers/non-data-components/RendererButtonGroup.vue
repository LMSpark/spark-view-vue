<template>
  <el-button-group v-if="isVisible" v-bind="$attrs">
    <SparkComponentRenderer
      v-for="(child, index) in resolvedChildren"
      :key="nodeId(child) ?? `r-button-group-child-${index}`"
      :config="child"
    />
  </el-button-group>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent, type SparkNode } from '../../internal'

interface Props extends SparkNode {
  children?: SparkNode[]
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-button-group',
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>
