<template>
  <el-divider
    v-if="isVisible"
    :direction="direction"
    :border-style="borderStyle"
    :content-position="contentPosition"
    v-bind="$attrs"
  >
    <template v-if="content">{{ content }}</template>
  </el-divider>
</template>

<script setup lang="ts">
import { useSparkPageComponent, type SparkNode } from '../../internal'

interface Props extends SparkNode {
  direction?: 'horizontal' | 'vertical'
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'double' | 'none'
  contentPosition?: 'left' | 'center' | 'right'
  content?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-divider',
  direction: 'horizontal',
  borderStyle: 'solid',
  contentPosition: 'center',
})

const { isVisible } = useSparkPageComponent(props)
</script>
