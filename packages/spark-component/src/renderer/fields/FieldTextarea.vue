<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #table-cell="{ value }">
      <span class="textarea-display">{{ value }}</span>
    </template>
    <template #form>
      <el-input
        :model-value="fieldValue as string"
        type="textarea"
        :rows="rows"
        :autosize="autosize"
        :maxlength="maxlength"
        :show-word-limit="showWordLimit"
        :placeholder="placeholder"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      />
    </template>
    <template #tree>
      <span class="textarea-display">{{ currentDisplayValue }}</span>
    </template>
    <template #detail>
      <div class="field-display">
        <span class="field-label">{{ fieldCtx.displayLabel }}：</span>
        <span class="field-value textarea-display">{{ currentDisplayValue }}</span>
      </div>
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
  modelValue?: string
  rows?: number
  autosize?: boolean | { minRows?: number; maxRows?: number }
  maxlength?: number
  showWordLimit?: boolean
  placeholder?: string
}

const props = withDefaults(defineProps<Props>(), {
  rows: 4,
  autosize: false,
  showWordLimit: false,
  placeholder: '请输入内容',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const permission = useFieldPermission<string>({
  props,
  type: 'r-textarea',
  fallbackValue: '',
})

const { fieldValue, isCurrentFieldEditable, currentDisplayValue, syncValue } = permission
const fieldCtx = useFieldContext(props, permission)

function handleChange(value: string): void {
  emit('update:modelValue', value)
  syncValue(value)
}
</script>

<style scoped>
.textarea-display {
  white-space: pre-wrap;
  word-break: break-word;
}
</style>