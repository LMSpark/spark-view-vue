<template>
  <template v-if="context === 'table'">
    <el-table-column :label="displayLabel" :prop="fieldName" :width="width">
      <template #default="{ row }">
        <span v-if="!isTableCellHidden(row)">{{ getTableCellDisplayValue(row) }}</span>
      </template>
    </el-table-column>
  </template>

  <el-form-item v-else-if="context === 'form' && !isCurrentFieldHidden" :label="displayLabel">
    <el-checkbox
      :model-value="fieldValue"
      :disabled="!isCurrentFieldEditable"
      @update:model-value="handleChange"
    >
      {{ checkboxText || displayLabel }}
    </el-checkbox>
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
import type { ComponentConfig } from '@spark-view/spark-component'
import { useFieldPermission } from './useFieldPermission'

interface Props {
  config?: ComponentConfig
  name?: string
  label?: string
  width?: number
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
} = useFieldPermission<boolean>({
  props,
  type: 'r-checkbox',
  fallbackValue: false,
  formatDisplay: formatCheckboxValue,
})

function handleChange(value: boolean): void {
  emit('update:modelValue', value)
  syncValue(value)
}

void fieldName
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