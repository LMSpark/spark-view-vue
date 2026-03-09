<template>
  <template v-if="context === 'table'">
    <el-table-column :label="displayLabel" :prop="fieldName" :width="width">
      <template #default="{ row }">
        <span v-if="!isTableCellHidden(row)">{{ getTableCellDisplayValue(row) }}</span>
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
      />
    </el-select>
  </el-form-item>

  <template v-else-if="context === 'tree'">
    <span v-if="!isCurrentFieldHidden" class="tree-node-text">{{ currentDisplayValue }}</span>
  </template>

  <div v-else-if="!isCurrentFieldHidden" class="field-display">
    <span class="field-label">{{ displayLabel }}：</span>
    <span class="field-value">{{ currentDisplayValue }}</span>
  </div>
</template>

<script setup lang="ts">
import { useFieldPermission } from './useFieldPermission'
import { useFieldOptions } from './useFieldOptions'
import type { ComponentConfig } from '@spark-view/spark-component'

interface Props {
  config?: ComponentConfig
  name?: string
  label?: string
  width?: number
  modelValue?: string | number | boolean
  options?: unknown[]
  optionLabelField?: string
  optionValueField?: string
  placeholder?: string
  clearable?: boolean
  filterable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '请选择',
  clearable: true,
  filterable: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number | boolean]
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
} = useFieldPermission<string | number | boolean>({
  props,
  type: 'r-select',
  fallbackValue: '',
  formatDisplay: formatOptionValue,
})

function handleChange(value: string | number | boolean): void {
  emit('update:modelValue', value)
  syncValue(value)
}

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
</style>