<template>
  <el-breadcrumb-item
    v-if="isVisible"
    :to="to"
    :replace="replace"
    v-bind="$attrs"
  >
    {{ label }}
  </el-breadcrumb-item>
</template>

<script setup lang="ts">
import { useSparkPageComponent, type SparkNode } from '../../internal'

interface Props extends SparkNode {
  label?: string
  to?: string | Record<string, unknown>
  replace?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-breadcrumb-item',
  replace: false,
})

const { isVisible } = useSparkPageComponent(props)
</script>
