<!--
@module @spark-appworks/spark-component:components/display/non-data-components/DisplayCalendar
DisplayCalendar 模块，属于 SPARK component display/static-display。
组件目录: display/non-data-components。
该 DTS shard 当前不导出 ClassModel symbol。
-->
<template>
  <el-calendar
    v-if="isVisible"
    v-model="modelDate"
    :range="range"
  >
    <template v-if="$slots['date-cell']" #date-cell="scope">
      <slot name="date-cell" v-bind="scope" />
    </template>
    <template v-if="$slots['header']" #header="scope">
      <slot name="header" v-bind="scope" />
    </template>
  </el-calendar>
</template>

<script setup lang="ts">
/**
 * @description 日历展示组件，支持日期范围和选中绑定。
 */
import { ref } from 'vue'
import { useSparkPageComponent } from '../../internal'
import type { RDisplayCalendarProps } from './DisplayCalendar.props'

const props = withDefaults(defineProps<RDisplayCalendarProps>(), {
  type: 'display-calendar',
})

const { isVisible } = useSparkPageComponent(props)

const modelDate = ref(props.value ?? new Date())
</script>


