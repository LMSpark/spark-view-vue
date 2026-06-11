<!--
@module @spark-appworks/spark-component:components/fields/data-components/FieldTimePicker
FieldTimePicker 模块，属于 SPARK component field-level/data-field。
组件目录: fields/data-components。
该 DTS shard 当前不导出 ClassModel symbol。
-->
<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-time-picker
        :model-value="fieldValue"
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
 * @description 时间选择字段，绑定时间字符串或 Date 值。
 */
import { useBasicFieldState } from './composables/useBasicFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from './composables/useControlledFieldChange'
import { coerceStringOrDateValue } from './composables/fieldValueCoercion'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { RTimePickerProps } from './FieldTimePicker.props'

const props = withDefaults(defineProps<RTimePickerProps>(), {
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

const emit = defineEmits<FieldValueUpdateEmits<string | Date>>()

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
  coerce: coerceStringOrDateValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { fieldValue, isCurrentFieldEditable } = permission

async function handleChange(value: string | Date): Promise<void> {
  await handleControlledChange(value)
}
</script>

