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
/**
 * @skill r-number
 * @description 数字输入字段，绑定 number 值，基于 el-input-number，筛选模式下支持范围（最小-最大）双输入。
 * @api filterMode - 'range' 启用范围过滤模式
 */
import { useBasicFieldState } from './composables/useBasicFieldState'
import { useNumberFieldState } from './composables/useNumberFieldState'
import { useRangeFilterMode } from './composables/useRangeFilterMode'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { RNumberProps } from './FieldNumber.props'

const props = withDefaults(defineProps<RNumberProps>(), {
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

const isRangeFilter = useRangeFilterMode(props)

const { permission, fieldCtx } = useBasicFieldState<number | [number | undefined, number | undefined]>({
  props,
  fieldType: 'r-number',
  fallbackValue: 0,
  formatDisplay: formatNumberValue,
  emitUpdate: value => emit('update:modelValue', value),
})

const { fieldValue, isCurrentFieldEditable, syncValue } = permission

const {
  rangeStart,
  rangeEnd,
  handleChange,
  handleRangeStartChange,
  handleRangeEndChange,
} = useNumberFieldState({
  fieldValue,
  emitUpdate: value => emit('update:modelValue', value),
  syncValue,
})
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
