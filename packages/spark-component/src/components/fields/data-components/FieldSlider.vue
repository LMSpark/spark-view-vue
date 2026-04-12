<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-slider
        :model-value="fieldValue"
        :min="min"
        :max="max"
        :step="step"
        :disabled="!isCurrentFieldEditable"
        :show-input="showInput"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @skill r-slider
 * @description 滑块字段，绑定 number 值，基于 el-slider 支持最小/最大/步长控制及输入框辅助。
 */
import { useBasicFieldState } from './composables/useBasicFieldState'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { SparkRuntimeProps } from '../../shared-types.js'

interface Props extends SparkRuntimeProps<'r-slider'> {
  /** 字段绑定名 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
  /** 双向绑定值 */
  modelValue?: number
  /** 最小值 */
  min?: number
  /** 最大值 */
  max?: number
  /** 步长 */
  step?: number
  /** 显示输入框 */
  showInput?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-slider',
  min: 0,
  max: 100,
  step: 1,
  showInput: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<number>({
  props,
  fieldType: 'r-slider',
  fallbackValue: 0,
  formatDisplay: value => String(value ?? 0),
  emitUpdate: value => emit('update:modelValue', value),
})

const { fieldValue, isCurrentFieldEditable } = permission

async function handleChange(value: number): Promise<void> {
  await handleControlledChange(value)
}
</script>
