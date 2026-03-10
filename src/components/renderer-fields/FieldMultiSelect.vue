<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-select
        :model-value="fieldValue"
        :placeholder="placeholder"
        :clearable="clearable"
        :filterable="filterable"
        :disabled="!isCurrentFieldEditable"
        multiple
        collapse-tags
        collapse-tags-tooltip
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
import type { ComponentConfig } from '@spark-view/spark-component'
import { useFieldContext } from './useFieldContext'
import FieldContextRenderer from './FieldContextRenderer.vue'

type MultiValue = Array<string | number | boolean>

interface Props {
  config?: ComponentConfig
  name?: string
  label?: string
  width?: number
  sparkChildren?: ComponentConfig[]
  modelValue?: MultiValue
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
  'update:modelValue': [value: MultiValue]
}>()

const optionResult = useOptionField<MultiValue>({
  props,
  type: 'r-multi-select',
  fallbackValue: [],
})

const { options, fieldValue, isCurrentFieldEditable, syncValue } = optionResult
const fieldCtx = useFieldContext(props, optionResult)

function handleChange(value: MultiValue): void {
  emit('update:modelValue', value)
  syncValue(value)
}
</script>