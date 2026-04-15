<template>
  <el-calendar
    v-if="isVisible"
    v-model="modelDate"
    :range="range"
    v-bind="hostProps"
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
 * @skill display-calendar
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


