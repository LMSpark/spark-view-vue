<template>
  <template v-if="context === 'table'">
    <el-table-column :label="displayLabel" :prop="fieldName" :width="width">
      <template #default="{ row }">
        <span v-if="!isTableCellHidden(row)" class="icon-cell">
          <i v-if="getRawIcon(row)" :class="iconClass(getRawIcon(row))"></i>
          <span>{{ getTableCellDisplayValue(row) }}</span>
        </span>
      </template>
    </el-table-column>
  </template>

  <el-form-item v-else-if="context === 'form' && !isCurrentFieldHidden" :label="displayLabel">
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
  </el-form-item>

  <template v-else-if="context === 'tree'">
    <span v-if="!isCurrentFieldHidden" class="icon-cell">
      <i v-if="currentRawIcon" :class="iconClass(currentRawIcon)"></i>
      <span>{{ currentDisplayValue }}</span>
    </span>
  </template>

  <div v-else-if="!isCurrentFieldHidden" class="field-display">
    <span class="field-label">{{ displayLabel }}：</span>
    <span class="icon-cell">
      <i v-if="currentRawIcon" :class="iconClass(currentRawIcon)"></i>
      <span class="field-value">{{ currentDisplayValue }}</span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { IDataRow } from '@spark-view/spark-data'
import type { ComponentConfig } from '@spark-view/spark-component'
import { useFieldPermission } from './useFieldPermission'
import { useFieldOptions } from './useFieldOptions'

interface Props {
  config?: ComponentConfig
  name?: string
  label?: string
  width?: number
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

const { options, formatOptionValue } = useFieldOptions(props)
const {
  fieldName,
  displayLabel,
  context,
  fieldValue,
  isCurrentFieldHidden,
  isCurrentFieldEditable,
  currentDisplayValue,
  isTableCellHidden,
  getTableCellDisplayValue,
  syncValue,
} = useFieldPermission<string>({
  props,
  type: 'r-icon',
  fallbackValue: '',
  formatDisplay: formatOptionValue,
})

const currentRawIcon = computed(() => String(fieldValue.value ?? ''))

function iconClass(value: string): string {
  return props.classPrefix ? `${props.classPrefix}${value}` : value
}

function getRawIcon(row: IDataRow): string {
  if (!fieldName.value) return ''
  return String(row[fieldName.value] ?? '')
}

function handleChange(value: string | number | boolean): void {
  const next = String(value ?? '')
  emit('update:modelValue', next)
  syncValue(next)
}

void options
</script>

<style scoped>
.field-display {
  margin-bottom: 12px;
  line-height: 32px;
}
.field-label {
  color: #606266;
  font-weight: 500;
  margin-right: 8px;
}
.field-value {
  color: #303133;
}
.icon-cell,
.icon-option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
</style>