<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-checkbox-group :model-value="fieldValue" :disabled="!isCurrentFieldEditable" @update:model-value="handleChange">
        <component
          :is="buttonStyle ? 'el-checkbox-button' : 'el-checkbox'"
          v-for="option in options"
          :key="String(option.value)"
          :label="option.value"
          :disabled="option.disabled"
        >
          {{ option.label }}
        </component>
      </el-checkbox-group>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
import { useOptionField } from './useFieldOptions'
import { useFieldContext } from './useFieldContext'
import FieldContextRenderer from './FieldContextRenderer.vue'

type MultiValue = Array<string | number | boolean>

interface Props {
  /** 字段绑定名 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
  /** 双向绑定值（数组） */
  modelValue?: MultiValue
  /** 选项列表 */
  options?: unknown[]
  /** 选项标签字段 */
  optionLabelField?: string
  /** 选项值字段 */
  optionValueField?: string
  /** 按钮风格 */
  buttonStyle?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  buttonStyle: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: MultiValue]
}>()

const optionResult = useOptionField<MultiValue>({
  props,
  type: 'r-checkbox-group',
  fallbackValue: [],
})

const { options, fieldValue, isCurrentFieldEditable, syncValue } = optionResult
const fieldCtx = useFieldContext({ width: props.width }, optionResult)

function handleChange(value: MultiValue): void {
  emit('update:modelValue', value)
  syncValue(value)
}
</script>