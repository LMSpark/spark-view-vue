<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-rate
        :model-value="fieldValue"
        :max="max"
        :allow-half="allowHalf"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
import type { SparkNode } from '../../internal'
import { useBasicFieldState } from './composables/useBasicFieldState'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'

interface Props extends SparkNode {
  /** 字段绑定名 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
  /** 双向绑定值 */
  modelValue?: number
  /** 最大值 */
  max?: number
  /** 允许半星 */
  allowHalf?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-rate',
  max: 5,
  allowHalf: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<number>({
  props,
  fieldType: 'r-rate',
  fallbackValue: 0,
  formatDisplay: value => String(value ?? 0),
  emitUpdate: value => emit('update:modelValue', value),
})

const { fieldValue, isCurrentFieldEditable } = permission

async function handleChange(value: number): Promise<void> {
  await handleControlledChange(value)
}
</script>