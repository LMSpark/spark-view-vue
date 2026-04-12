<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-time-picker
        :model-value="fieldValue as string | Date"
        :placeholder="placeholder"
        :is-range="isRange"
        :range-separator="rangeSeparator"
        :start-placeholder="startPlaceholder"
        :end-placeholder="endPlaceholder"
        :arrow-control="arrowControl"
        :format="format"
        :disabled="!isCurrentFieldEditable"
        :clearable="clearable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @skill r-time-picker
 * @description 时间选择字段，绑定时间字符串或 Date 值，基于 el-time-picker 支持时间范围选择。
 */
import { useBasicFieldState } from './composables/useBasicFieldState'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { SparkRuntimeProps } from '../../shared-types.js'

interface Props extends SparkRuntimeProps<'r-time-picker'> {
  /** 字段绑定名 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
  /** 双向绑定值 */
  modelValue?: string | Date
  /** 占位文本 */
  placeholder?: string
  /** 是否为范围选择 */
  isRange?: boolean
  /** 范围分隔符 */
  rangeSeparator?: string
  /** 范围开始占位 */
  startPlaceholder?: string
  /** 范围结束占位 */
  endPlaceholder?: string
  /** 箭头控制 */
  arrowControl?: boolean
  /** 时间格式 */
  format?: string
  /** 可清空 */
  clearable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-time-picker',
  placeholder: '选择时间',
  isRange: false,
  rangeSeparator: '至',
  startPlaceholder: '开始时间',
  endPlaceholder: '结束时间',
  arrowControl: false,
  format: 'HH:mm:ss',
  clearable: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: string | Date]
}>()

function formatTimeValue(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toLocaleTimeString()
  return String(value)
}

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<string | Date>({
  props,
  fieldType: 'r-time-picker',
  fallbackValue: '',
  formatDisplay: formatTimeValue,
  emitUpdate: value => emit('update:modelValue', value),
})

const { fieldValue, isCurrentFieldEditable } = permission

async function handleChange(value: string | Date): Promise<void> {
  await handleControlledChange(value)
}
</script>
