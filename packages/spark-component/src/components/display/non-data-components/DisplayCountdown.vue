<template>
  <el-countdown
    v-if="isVisible"
    :value="targetTime"
    :format="format"
    :prefix="prefix"
    :suffix="suffix"
    :title="title"
    :value-style="valueStyle"
    v-bind="$attrs"
    @finish="handleFinish"
    @change="handleChange"
  />
</template>

<script setup lang="ts">
/**
 * @skill-description 倒计时组件，基于 el-countdown 显示目标时间倒计时，支持自定义格式和结束事件。
 */
import { computed, type CSSProperties } from 'vue'
import { useSparkPageComponent, type SparkNode } from '../../internal'

interface Props extends SparkNode {
  /** 目标时间（时间戳或 Date） */
  value?: number | Date
  /** 格式化字符串，如 HH:mm:ss */
  format?: string
  /** 前缀文本 */
  prefix?: string
  /** 后缀文本 */
  suffix?: string
  /** 标题 */
  title?: string
  /** 值样式 */
  valueStyle?: CSSProperties
}

const props = withDefaults(defineProps<Props>(), {
  type: 'display-countdown',
  format: 'HH:mm:ss',
})

const emit = defineEmits<{
  finish: []
  change: [value: number]
}>()

const { isVisible } = useSparkPageComponent(props)

const targetTime = computed(() => {
  if (props.value instanceof Date) return props.value.getTime()
  return props.value ?? Date.now()
})

function handleFinish() {
  emit('finish')
}

function handleChange(value: number) {
  emit('change', value)
}
</script>
