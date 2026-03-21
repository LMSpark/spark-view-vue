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
import type { SparkNode } from '../_pkg'
import { useFieldContext } from './useFieldContext'
import FieldContextRenderer from './FieldContextRenderer.vue'

interface Props {
  config?: SparkNode
  field?: string
  label?: string
  width?: number
  sparkChildren?: SparkNode[]
  modelValue?: string | number
  options?: unknown[]
  optionLabelField?: string
  optionValueField?: string
  placeholder?: string
  clearable?: boolean
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
const fieldCtx = useFieldContext(props, optionResult)

function handleChange(value: string | number): void {
  emit('update:modelValue', value)
  syncValue(value)
}
</script>