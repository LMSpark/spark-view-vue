<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <div v-if="isRangeFilter" class="field-number-range">
        <el-input-number
          :model-value="rangeStart"
          :min="min"
          :max="max"
          :precision="precision"
          :disabled="!isCurrentFieldEditable"
          @update:model-value="handleRangeStartChange"
        />
        <span class="field-number-range-separator">至</span>
        <el-input-number
          :model-value="rangeEnd"
          :min="min"
          :max="max"
          :precision="precision"
          :disabled="!isCurrentFieldEditable"
          @update:model-value="handleRangeEndChange"
        />
      </div>
      <el-input-number
        v-else
        :model-value="fieldValue as number"
        :min="min"
        :max="max"
        :precision="precision"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
import type { SparkNode } from '../_pkg'
import { useFieldPermission } from './useFieldPermission'
import { useFieldContext } from './useFieldContext'
import FieldContextRenderer from './FieldContextRenderer.vue'

interface Props extends SparkNode {
  /** 字段绑定名 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
  /** 双向绑定值，范围模式时为元组 */
  modelValue?: number | [number | undefined, number | undefined]
  /** 最小值 */
  min?: number
  /** 最大值 */
  max?: number
  /** 小数精度 */
  precision?: number
  /** 筛选模式（'range' 启用范围输入） */
  filterMode?: string
  /** 筛选变体 */
  filterVariant?: string
  /** 范围筛选标记 */
  filterRange?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-number',
})

const emit = defineEmits<{
  'update:modelValue': [value: number | [number | undefined, number | undefined]]
}>()

function formatNumberValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(item => formatNumberValue(item)).join(' ~ ')
  if (typeof value === 'number') return String(value)
  if (value === null || value === undefined || value === '') return '0'
  return String(value)
}

const isRangeFilter =
  props.filterMode === 'range'
  || props.filterVariant === 'range'
  || props.filterRange === true

const permission = useFieldPermission<number | [number | undefined, number | undefined]>({
  props,
  type: 'r-number',
  fallbackValue: 0,
  formatDisplay: formatNumberValue,
})

const { fieldValue, isCurrentFieldEditable, syncValue } = permission
const fieldCtx = useFieldContext({ width: props.width }, permission)

const rangeStart = Array.isArray(fieldValue.value) ? fieldValue.value[0] : undefined
const rangeEnd = Array.isArray(fieldValue.value) ? fieldValue.value[1] : undefined

const handleChange = (val: number) => {
  emit('update:modelValue', val)
  syncValue(val)
}

const handleRangeStartChange = (val: number | undefined) => {
  const next: [number | undefined, number | undefined] = [val, rangeEnd]
  emit('update:modelValue', next)
  syncValue(next)
}

const handleRangeEndChange = (val: number | undefined) => {
  const next: [number | undefined, number | undefined] = [rangeStart, val]
  emit('update:modelValue', next)
  syncValue(next)
}
</script>

<style scoped>
.field-number-range {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.field-number-range-separator {
  color: #606266;
}
</style>
