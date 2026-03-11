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
import type { ComponentConfig } from '../_pkg'
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
const fieldCtx = useFieldContext(props, optionResult)

function handleChange(value: MultiValue): void {
  emit('update:modelValue', value)
  syncValue(value)
}
</script>