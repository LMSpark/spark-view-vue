<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-checkbox
        :model-value="fieldValue"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      >
        {{ checkboxText || displayLabel }}
      </el-checkbox>
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
  modelValue?: boolean
  checkedText?: string
  uncheckedText?: string
  checkboxText?: string
}

const props = withDefaults(defineProps<Props>(), {
  checkedText: '是',
  uncheckedText: '否',
  checkboxText: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

function formatCheckboxValue(value: unknown): string {
  return value ? props.checkedText : props.uncheckedText
}

const permission = useFieldPermission<boolean>({
  props,
  type: 'r-checkbox',
  fallbackValue: false,
  formatDisplay: formatCheckboxValue,
})

const { fieldValue, isCurrentFieldEditable, displayLabel, syncValue } = permission
const fieldCtx = useFieldContext(props, permission)

function handleChange(value: boolean): void {
  emit('update:modelValue', value)
  syncValue(value)
}
</script>
