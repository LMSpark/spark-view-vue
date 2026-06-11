<!--
@module @spark-appworks/spark-component:components/display/non-data-components/DisplayCountdown
DisplayCountdown 模块，属于 SPARK component display/static-display。
组件目录: display/non-data-components。
该 DTS shard 当前不导出 ClassModel symbol。
-->
<template>
  <el-countdown
    v-if="isVisible"
    :value="targetTime"
    :format="format"
    :prefix="prefix"
    :suffix="suffix"
    :title="title"
    :value-style="valueStyle"
    @finish="handleFinish"
    @change="handleChange"
  />
</template>

<script setup lang="ts">
/**
 * @description 倒计时组件，支持自定义格式和结束事件。
 */
import { computed } from 'vue'
import { useSparkPageComponent } from '../../internal'
import type { RDisplayCountdownProps } from './DisplayCountdown.props'

const props = withDefaults(defineProps<RDisplayCountdownProps>(), {
  type: 'display-countdown',
  format: 'HH:mm:ss',
})

const emit = defineEmits<{
  /** Countdown finished; 倒计时到达目标时间。 */
  finish: []
  /**
   * Countdown tick changed; 剩余时间数值更新。
   * @param value Remaining milliseconds.
   */
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


