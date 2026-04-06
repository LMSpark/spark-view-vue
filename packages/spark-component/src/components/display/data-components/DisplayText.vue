<template>
  <component
    :is="tag"
    v-if="isVisible"
    :class="['r-text-display', textClass]"
    :style="textStyle"
    v-bind="$attrs"
  >
    <template v-if="prefix">{{ prefix }}</template>{{ formattedValue }}<template v-if="suffix">{{ suffix }}</template>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSparkPageComponent, type SparkNode } from '../../internal'
import { useDisplayDataSource } from '../composables/useDisplayDataSource'

interface Props extends SparkNode {
  value?: unknown
  field?: string
  tag?: string
  prefix?: string
  suffix?: string
  format?: 'number' | 'currency' | 'percent' | 'date'
  precision?: number
  placeholder?: string
  textClass?: string
  textStyle?: Record<string, string> | string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-text-display',
  tag: 'span',
  precision: 2,
  placeholder: '-',
})

const { isVisible } = useSparkPageComponent(props)

const { resolvedValue: dataValue } = useDisplayDataSource(props)

const formattedValue = computed(() => {
  const v = dataValue.value
  if (v === undefined || v === null || v === '') return props.placeholder

  if (props.format === 'number' && typeof v === 'number') {
    return v.toLocaleString('zh-CN', { minimumFractionDigits: props.precision, maximumFractionDigits: props.precision })
  }
  if (props.format === 'currency' && typeof v === 'number') {
    return v.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: props.precision })
  }
  if (props.format === 'percent' && typeof v === 'number') {
    return `${(v * 100).toFixed(props.precision)}%`
  }
  if (props.format === 'date') {
    const d = new Date(v as string | number)
    return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('zh-CN')
  }

  return String(v)
})
</script>

<style scoped>
.r-text-display {
  display: inline;
}
</style>
