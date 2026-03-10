<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-date-picker
        :model-value="fieldValue as string | Date | Array<string | Date>"
        :type="isRangeFilter ? 'daterange' : 'date'"
        :placeholder="isRangeFilter ? undefined : '选择日期'"
        :start-placeholder="isRangeFilter ? '开始日期' : undefined"
        :end-placeholder="isRangeFilter ? '结束日期' : undefined"
        :range-separator="isRangeFilter ? '至' : undefined"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
import type { ComponentConfig } from '@spark-view/spark-component'
import { useFieldPermission } from './useFieldPermission'
import { useFieldContext } from './useFieldContext'
import FieldContextRenderer from './FieldContextRenderer.vue'

interface Props {
  config?: ComponentConfig
  name?: string
  label?: string
  width?: number
  sparkChildren?: ComponentConfig[]
  modelValue?: string | Date | Array<string | Date>
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: string | Date | Array<string | Date>]
}>()

function formatDateValue(value: unknown): string {
  if (!value) return ''
  if (Array.isArray(value)) return value.map(item => formatDateValue(item)).join(' ~ ')
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toLocaleDateString()
  return String(value)
}

const isRangeFilter =
  props.config?.props?.['filterMode'] === 'range'
  || props.config?.props?.['filterVariant'] === 'range'
  || props.config?.props?.['filterRange'] === true

const permission = useFieldPermission<string | Date | Array<string | Date>>({
  props,
  type: 'r-date',
  fallbackValue: '',
  formatDisplay: formatDateValue,
})

const { fieldValue, isCurrentFieldEditable, syncValue } = permission
const fieldCtx = useFieldContext(props, permission)

const handleChange = (val: string | Date | Array<string | Date>) => {
  emit('update:modelValue', val)
  syncValue(val)
}
</script>
