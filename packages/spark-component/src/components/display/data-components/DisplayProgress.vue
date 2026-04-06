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
    v-bind="$attrs"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSparkPageComponent, type SparkNode } from '../../internal'
import { useDisplayDataSource } from '../composables/useDisplayDataSource'

type ProgressColor = string | Array<{ color: string; percentage: number }>

interface Props extends SparkNode {
  percentage?: number
  value?: number
  field?: string
  progressType?: 'line' | 'circle' | 'dashboard'
  strokeWidth?: number
  textInside?: boolean
  status?: 'success' | 'exception' | 'warning'
  indeterminate?: boolean
  duration?: number
  color?: ProgressColor
  circleWidth?: number
  showText?: boolean
  strokeLinecap?: 'butt' | 'round' | 'square'
  formatText?: string
}

const props = withDefaults(defineProps<Props>(), {
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
