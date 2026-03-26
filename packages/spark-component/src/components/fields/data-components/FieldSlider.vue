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
import type { SparkNode } from '../../internal'
import { useFieldPermission } from '../context/useFieldPermission'
import { useFieldContext } from '../context/useFieldContext'
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

const permission = useFieldPermission<number>({
  props,
  type: 'r-slider',
  fallbackValue: 0,
  formatDisplay: value => String(value ?? 0),
})

const { fieldValue, isCurrentFieldEditable, syncValue } = permission
const fieldCtx = useFieldContext({ type: props.type, width: props.width }, permission)

function handleChange(value: number): void {
  emit('update:modelValue', value)
  syncValue(value)
}
</script>