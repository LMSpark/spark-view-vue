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
 * @skill display-countdown
 * @description 倒计时组件，基于 el-countdown 显示目标时间倒计时，支持自定义格式和结束事件。
 */
import { computed } from 'vue'
import { useSparkPageComponent } from '../../internal'
import type { RDisplayCountdownProps } from './DisplayCountdown.props'

const props = withDefaults(defineProps<RDisplayCountdownProps>(), {
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
