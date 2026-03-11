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
import type { ComponentConfig } from '../_pkg'
import { useFieldPermission } from './useFieldPermission'
import { useFieldContext } from './useFieldContext'
import FieldContextRenderer from './FieldContextRenderer.vue'

interface Props {
  config?: ComponentConfig
  name?: string
  label?: string
  width?: number
  sparkChildren?: ComponentConfig[]
  modelValue?: number
  min?: number
  max?: number
  step?: number
  showInput?: boolean
}

const props = withDefaults(defineProps<Props>(), {
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
const fieldCtx = useFieldContext(props, permission)

function handleChange(value: number): void {
  emit('update:modelValue', value)
  syncValue(value)
}
</script>