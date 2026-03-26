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
import type { SparkNode } from '../internal'
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

const permission = useFieldPermission<number>({
  props,
  type: 'r-rate',
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