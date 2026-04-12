<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-time-select
        :model-value="fieldValue as string"
        :placeholder="placeholder"
        :start="start"
        :end="end"
        :step="step"
        :min-time="minTime"
        :max-time="maxTime"
        :disabled="!isCurrentFieldEditable"
        :clearable="clearable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @skill r-time-select
 * @description 时间间隔选择字段，绑定时间字符串值，基于 el-time-select 提供固定间隔的时间列表选择。
 */
import { useBasicFieldState } from './composables/useBasicFieldState'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { SparkRuntimeProps } from '../../shared-types.js'

interface Props extends SparkRuntimeProps<'r-time-select'> {
  /** 字段绑定名 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
  /** 双向绑定值 */
  modelValue?: string
  /** 占位文本 */
  placeholder?: string
  /** 起始时间 */
  start?: string
  /** 结束时间 */
  end?: string
  /** 时间间隔步长 */
  step?: string
  /** 最小可选时间 */
  minTime?: string
  /** 最大可选时间 */
  maxTime?: string
  /** 可清空 */
  clearable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-time-select',
  placeholder: '选择时间',
  start: '08:30',
  end: '18:30',
  step: '00:15',
  clearable: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<string>({
  props,
  fieldType: 'r-time-select',
  fallbackValue: '',
  formatDisplay: value => (value != null ? String(value) : ''),
  emitUpdate: value => emit('update:modelValue', value),
})

const { fieldValue, isCurrentFieldEditable } = permission

async function handleChange(value: string): Promise<void> {
  await handleControlledChange(value)
}
</script>
