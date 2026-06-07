<template>
  <el-progress
    v-if="isVisible"
    :percentage="resolvedPercentage"
    :type="progressType"
    :stroke-width="strokeWidth"
    :text-inside="textInside"
    :status="status"
    :indeterminate="indeterminate"
    :duration="duration"
    :color="color"
    :width="circleWidth"
    :show-text="showText"
    :stroke-linecap="strokeLinecap"
    :format="formatFn"
  />
</template>

<script setup lang="ts">
/**
 * @description 进度条展示组件，支持动态颜色。
 */
import { computed } from 'vue'
import { useSparkPageComponent } from '../../internal'
import { useDisplayDataSource } from '../useDisplayDataSource'
import type { RProgressProps } from './DisplayProgress.props'

const props = withDefaults(defineProps<RProgressProps>(), {
  type: 'r-progress',
  progressType: 'line',
  strokeWidth: 6,
  textInside: false,
  indeterminate: false,
  duration: 3,
  showText: true,
  strokeLinecap: 'round',
})

const { isVisible } = useSparkPageComponent(props)

const { resolvedValue: dataValue } = useDisplayDataSource(props)

const resolvedPercentage = computed(() => {
  if (props.percentage !== undefined) return props.percentage
  const v = dataValue.value
  if (typeof v === 'number') return v
  return 0
})

const formatFn = computed(() => {
  if (props.formatText) {
    return (percentage: number) => props.formatText!.replace('{value}', String(percentage))
  }
  return undefined
})
</script>


