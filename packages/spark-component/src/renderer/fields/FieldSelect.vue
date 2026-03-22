<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-select
        :model-value="fieldValue"
        :placeholder="placeholder"
        :clearable="clearable"
        :filterable="filterable"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      >
        <el-option
          v-for="option in options"
          :key="String(option.value)"
          :label="option.label"
          :value="option.value"
          :disabled="option.disabled"
        />
      </el-select>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
import { useOptionField } from './useFieldOptions'
import { useFieldContext } from './useFieldContext'
import FieldContextRenderer from './FieldContextRenderer.vue'

interface Props {
  /** 字段绑定名 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
  /** 双向绑定值 */
  modelValue?: string | number
  /** 选项列表 */
  options?: unknown[]
  /** 选项标签字段 */
  optionLabelField?: string
  /** 选项值字段 */
  optionValueField?: string
  /** 占位提示 */
  placeholder?: string
  /** 可清除 */
  clearable?: boolean
  /** 可搜索 */
  filterable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '请选择',
  clearable: true,
  filterable: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const optionResult = useOptionField<string | number>({
  props,
  type: 'r-select',
  fallbackValue: '',
})

const { options, fieldValue, isCurrentFieldEditable, syncValue } = optionResult
const fieldCtx = useFieldContext({ width: props.width }, optionResult)

function handleChange(value: string | number): void {
  emit('update:modelValue', value)
  syncValue(value)
}
</script>