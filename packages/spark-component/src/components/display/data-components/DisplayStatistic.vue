<!--
@module @spark-appworks/spark-component:components/display/data-components/DisplayStatistic
DisplayStatistic 模块，属于 SPARK component display/data-display。
组件目录: display/data-components。
该 DTS shard 当前不导出 ClassModel symbol。
-->
<template>
  <el-statistic
    v-if="isVisible"
    :title="title"
    :value="resolvedValue"
    :precision="precision"
    :decimal-separator="decimalSeparator"
    :group-separator="groupSeparator"
    :prefix="prefix"
    :suffix="suffix"
    :value-style="valueStyle"
  />
</template>

<script setup lang="ts">
/**
 * @description 统计数值展示组件，支持精度、前后缀和千分位分隔。
 */
import { computed } from 'vue'
import { useSparkPageComponent } from '../../internal'
import { useDisplayDataSource } from '../useDisplayDataSource'
import type { RStatisticProps } from './DisplayStatistic.props'

const props = withDefaults(defineProps<RStatisticProps>(), {
  type: 'r-statistic',
  precision: 0,
  decimalSeparator: '.',
  groupSeparator: ',',
})

const { isVisible } = useSparkPageComponent(props)

const { resolvedValue: dataValue } = useDisplayDataSource(props)

const resolvedValue = computed(() => {
  if (props.value !== undefined) return props.value
  const v = dataValue.value
  if (typeof v === 'number') return v
  if (typeof v === 'string') return v
  return 0
})
</script>


