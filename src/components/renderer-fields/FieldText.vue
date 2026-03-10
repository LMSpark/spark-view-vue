<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-input
        :model-value="fieldValue as string"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
import type { ComponentConfig } from '@spark-view/spark-component'
import { useFieldPermission } from './useFieldPermission'
import { useFieldContext } from './useFieldContext'
import FieldContextRenderer from './FieldContextRenderer.vue'

interface Props {
  config?: ComponentConfig
  name?: string
  label?: string
  width?: number
  sparkChildren?: ComponentConfig[]
  modelValue?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const permission = useFieldPermission<string>({
  props,
  type: 'r-text',
  fallbackValue: '',
})

const { fieldValue, isCurrentFieldEditable, syncValue } = permission
const fieldCtx = useFieldContext(props, permission)

const handleChange = (val: string) => {
  emit('update:modelValue', val)
  syncValue(val)
}
</script>

