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
import type { SparkNode } from '../../internal'
import { useBasicFieldState } from './composables/useBasicFieldState'
import { useRangeFilterMode } from './composables/useRangeFilterMode'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'

interface Props extends SparkNode {
  /** 字段绑定名 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
  /** 双向绑定值，日期范围时为数组 */
  modelValue?: string | Date | Array<string | Date>
  /** 筛选模式 */
  filterMode?: string
  /** 筛选变体 */
  filterVariant?: string
  /** 范围筛选标记 */
  filterRange?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-date',
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
