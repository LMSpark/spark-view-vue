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
 * @skill-description 日期选择字段，绑定日期/字符串值，基于 el-date-picker 支持年/月/日/日期时间/范围等多种模式。
 */
import { computed } from 'vue'
import type { SparkNode } from '../../internal'
import { useBasicFieldState } from './composables/useBasicFieldState'
import { useRangeFilterMode } from './composables/useRangeFilterMode'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'

type DatePickerType = 'year' | 'month' | 'date' | 'dates' | 'datetime' | 'week'
  | 'datetimerange' | 'daterange' | 'monthrange' | 'yearrange'

interface Props extends SparkNode {
  /** 字段绑定名 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
  /** 双向绑定值，日期范围时为数组 */
  modelValue?: string | Date | (string | Date)[]
  /** 日期选择器类型 */
  dateType?: DatePickerType
  /** 占位文本 */
  placeholder?: string
  /** 范围开始占位 */
  startPlaceholder?: string
  /** 范围结束占位 */
  endPlaceholder?: string
  /** 范围分隔符 */
  rangeSeparator?: string
  /** 显示格式 */
  format?: string
  /** 值格式 */
  valueFormat?: string
  /** 可清空 */
  clearable?: boolean
  /** 筛选模式 */
  filterMode?: string
  /** 筛选变体 */
  filterVariant?: string
  /** 范围筛选标记 */
  filterRange?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-date',
  placeholder: '选择日期',
  startPlaceholder: '开始日期',
  endPlaceholder: '结束日期',
  rangeSeparator: '至',
  clearable: true,
})

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
  emitUpdate: value => emit('update:modelValue', value),
})

const { fieldValue, isCurrentFieldEditable } = permission

async function handleChange(value: string | Date | Array<string | Date>): Promise<void> {
  await handleControlledChange(value)
}
</script>
