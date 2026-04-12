<template>
  <el-calendar
    v-if="isVisible"
    v-model="modelDate"
    :range="range"
    v-bind="$attrs"
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
 * @description 日历展示组件，基于 el-calendar 显示月历视图，支持日期范围和选中绑定。
 */
import { ref } from 'vue'
import { useSparkPageComponent } from '../../internal'
import type { SparkRuntimeProps } from '../../shared-types.js'

interface Props extends SparkRuntimeProps<'display-calendar'> {
  /** 当前日期 */
  modelValue?: Date
  /** 日期范围 [start, end] */
  range?: [Date, Date]
}

const props = withDefaults(defineProps<Props>(), {
  type: 'display-calendar',
})

const { isVisible } = useSparkPageComponent(props)

const modelDate = ref(props.modelValue ?? new Date())
</script>
