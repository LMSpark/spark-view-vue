<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-date-picker
        :model-value="fieldValue as string | Date | Array<string | Date>"
        :type="resolvedPickerType"
        :placeholder="isRangeType ? undefined : placeholder"
        :start-placeholder="isRangeType ? startPlaceholder : undefined"
        :end-placeholder="isRangeType ? endPlaceholder : undefined"
        :range-separator="isRangeType ? rangeSeparator : undefined"
        :format="format"
        :value-format="valueFormat"
        :disabled="!isCurrentFieldEditable"
        :clearable="clearable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @skill r-date
 * @description 日期选择字段，绑定日期/字符串值。
 * @api type - 选择器类型（'date'|'datetime'|'daterange' 等）
 * @api format - 显示格式
 * @api valueFormat - 绑定值格式
 */
import { computed } from 'vue'
import { useBasicFieldState } from './composables/useBasicFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from './composables/useControlledFieldChange'
import { useRangeFilterMode } from './composables/useRangeFilterMode'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { RDateProps, DatePickerType } from './FieldDate.props'

const props = withDefaults(defineProps<RDateProps>(), {
  type: 'r-date',
  placeholder: '选择日期',
  startPlaceholder: '开始日期',
  endPlaceholder: '结束日期',
  rangeSeparator: '至',
  clearable: true,
})

const emit = defineEmits<FieldValueUpdateEmits<string | Date | Array<string | Date>>>()

function formatDateValue(value: unknown): string {
  if (!value) return ''
  if (Array.isArray(value)) return value.map(item => formatDateValue(item)).join(' ~ ')
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toLocaleDateString()
  return String(value)
}

const isRangeFilter = useRangeFilterMode(props)

const RANGE_TYPES = new Set<string>(['daterange', 'datetimerange', 'monthrange', 'yearrange'])

const resolvedPickerType = computed((): DatePickerType => {
  if (props.dateType) return props.dateType
  return isRangeFilter.value ? 'daterange' : 'date'
})

const isRangeType = computed(() => RANGE_TYPES.has(resolvedPickerType.value))

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<string | Date | Array<string | Date>>({
  props,
  fieldType: 'r-date',
  fallbackValue: '',
  formatDisplay: formatDateValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { fieldValue, isCurrentFieldEditable } = permission

async function handleChange(value: string | Date | Array<string | Date>): Promise<void> {
  await handleControlledChange(value)
}
</script>

