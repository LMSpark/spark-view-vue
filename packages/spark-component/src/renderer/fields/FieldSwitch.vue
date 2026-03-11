<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-switch
        :model-value="fieldValue"
        :active-text="activeText"
        :inactive-text="inactiveText"
        :disabled="!isCurrentFieldEditable"
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
  modelValue?: boolean
  activeText?: string
  inactiveText?: string
}

const props = withDefaults(defineProps<Props>(), {
  activeText: '是',
  inactiveText: '否',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

function formatSwitchValue(value: unknown): string {
  return value ? props.activeText : props.inactiveText
}

const permission = useFieldPermission<boolean>({
  props,
  type: 'r-switch',
  fallbackValue: false,
  formatDisplay: formatSwitchValue,
})

const { fieldValue, isCurrentFieldEditable, syncValue } = permission
const fieldCtx = useFieldContext(props, permission)

function handleChange(value: boolean): void {
  emit('update:modelValue', value)
  syncValue(value)
}
</script>
