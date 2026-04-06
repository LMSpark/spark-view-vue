<template>
  <el-carousel-item
    v-if="isVisible"
    :name="itemName"
    :label="label"
    v-bind="$attrs"
  >
    <SparkComponentRenderer
      v-for="(child, index) in resolvedChildren"
      :key="nodeId(child) ?? `r-carousel-item-child-${index}`"
      :config="child"
    />
  </el-carousel-item>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { SparkComponentRenderer, getSparkNodeChildren, nodeId, useSparkPageComponent, type SparkNode } from '../../internal'

interface Props extends SparkNode {
  children?: SparkNode[]
  itemName?: string
  label?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-carousel-item',
})

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>
