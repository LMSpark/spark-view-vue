<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-radio-group :model-value="fieldValue" :disabled="!isCurrentFieldEditable" @update:model-value="handleChange">
        <component
          :is="buttonStyle ? 'el-radio-button' : 'el-radio'"
          v-for="option in options"
          :key="String(option.value)"
          :label="option.value"
          :disabled="option.disabled"
        >
          {{ option.label }}
        </component>
      </el-radio-group>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
import { useOptionField } from './useFieldOptions'
import type { ComponentConfig } from '@spark-view/spark-component'
import { useFieldContext } from './useFieldContext'
import FieldContextRenderer from './FieldContextRenderer.vue'

interface Props {
  config?: ComponentConfig
  name?: string
  label?: string
  width?: number
  sparkChildren?: ComponentConfig[]
  modelValue?: string | number | boolean
  options?: unknown[]
  optionLabelField?: string
  optionValueField?: string
  buttonStyle?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  buttonStyle: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number | boolean]
}>()

const optionResult = useOptionField<string | number | boolean>({
  props,
  type: 'r-radio',
  fallbackValue: '',
})

const { options, fieldValue, isCurrentFieldEditable, syncValue } = optionResult
const fieldCtx = useFieldContext(props, optionResult)

function handleChange(value: string | number | boolean): void {
  emit('update:modelValue', value)
  syncValue(value)
}
</script>