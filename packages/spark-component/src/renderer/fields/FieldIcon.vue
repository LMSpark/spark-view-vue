<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #table-cell="{ row, value }">
      <span class="icon-cell">
        <i v-if="getRowRawStringValue(row)" :class="iconClass(getRowRawStringValue(row))"></i>
        <span>{{ value }}</span>
      </span>
    </template>
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
        >
          <div class="icon-option">
            <i v-if="option.value" :class="iconClass(String(option.value))"></i>
            <span>{{ option.label }}</span>
          </div>
        </el-option>
      </el-select>
    </template>
    <template #tree>
      <span class="icon-cell">
        <i v-if="currentRawStringValue" :class="iconClass(currentRawStringValue)"></i>
        <span>{{ currentDisplayValue }}</span>
      </span>
    </template>
    <template #detail>
      <div class="field-display">
        <span class="field-label">{{ fieldCtx.displayLabel }}：</span>
        <span class="icon-cell">
          <i v-if="currentRawStringValue" :class="iconClass(currentRawStringValue)"></i>
          <span class="field-value">{{ currentDisplayValue }}</span>
        </span>
      </div>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
import type { SparkNode } from '../_pkg'
import { useOptionField } from './useFieldOptions'
import { useFieldContext } from './useFieldContext'
import FieldContextRenderer from './FieldContextRenderer.vue'

interface Props {
  config?: SparkNode
  field?: string
  label?: string
  width?: number
  sparkChildren?: SparkNode[]
  modelValue?: string
  options?: unknown[]
  optionLabelField?: string
  optionValueField?: string
  placeholder?: string
  clearable?: boolean
  filterable?: boolean
  classPrefix?: string
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '请选择图标',
  clearable: true,
  filterable: true,
  classPrefix: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const optionResult = useOptionField<string>({
  props,
  type: 'r-icon',
  fallbackValue: '',
})

const {
  options,
  fieldValue,
  currentRawStringValue,
  isCurrentFieldEditable,
  currentDisplayValue,
  getRowRawStringValue,
  syncValue,
} = optionResult

const fieldCtx = useFieldContext(props, optionResult)

function iconClass(value: string): string {
  return props.classPrefix ? `${props.classPrefix}${value}` : value
}

function handleChange(value: string | number | boolean): void {
  const next = String(value ?? '')
  emit('update:modelValue', next)
  syncValue(next)
}
</script>

<style scoped>
.icon-cell,
.icon-option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
</style>