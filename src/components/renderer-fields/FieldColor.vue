<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #table-cell="{ row, value }">
      <span class="color-cell">
        <span class="color-chip" :style="{ backgroundColor: getRowRawStringValue(row) || '#ffffff' }"></span>
        <span>{{ value }}</span>
      </span>
    </template>
    <template #form>
      <el-color-picker
        :model-value="fieldValue"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      />
    </template>
    <template #tree>
      <span class="color-cell">
        <span class="color-chip" :style="{ backgroundColor: currentRawStringValue || '#ffffff' }"></span>
        <span>{{ currentDisplayValue }}</span>
      </span>
    </template>
    <template #detail>
      <div class="field-display">
        <span class="field-label">{{ fieldCtx.displayLabel }}：</span>
        <span class="color-cell">
          <span class="color-chip" :style="{ backgroundColor: currentRawStringValue || '#ffffff' }"></span>
          <span class="field-value">{{ currentDisplayValue }}</span>
        </span>
      </div>
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
  type: 'r-color',
  fallbackValue: '',
  formatDisplay: value => String(value ?? ''),
})

const {
  fieldValue,
  currentRawStringValue,
  isCurrentFieldEditable,
  currentDisplayValue,
  getRowRawStringValue,
  syncValue,
} = permission

const fieldCtx = useFieldContext(props, permission)

function handleChange(value: string | null): void {
  const next = value ?? ''
  emit('update:modelValue', next)
  syncValue(next)
}
</script>

<style scoped>
.color-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.color-chip {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid #dcdfe6;
  box-sizing: border-box;
}
</style>