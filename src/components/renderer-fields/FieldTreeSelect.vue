<template>
  <template v-if="context === 'table'">
    <el-table-column :label="displayLabel" :prop="fieldName" :width="width">
      <template #default="{ row }">
        <span v-if="!isTableCellHidden(row)">{{ getTableCellDisplayValue(row) }}</span>
      </template>
    </el-table-column>
  </template>

  <el-form-item v-else-if="context === 'form' && !isCurrentFieldHidden" :label="displayLabel">
    <el-tree-select
      :model-value="fieldValue"
      :data="options"
      :placeholder="placeholder"
      :clearable="clearable"
      :filterable="filterable"
      :multiple="multiple"
      :check-strictly="checkStrictly"
      :default-expand-all="defaultExpandAll"
      :render-after-expand="renderAfterExpand"
      :disabled="!isCurrentFieldEditable"
      @update:model-value="handleChange"
    />
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
import { useOptionField } from './useFieldOptions'
import type { ComponentConfig } from '@spark-view/spark-component'

type FieldPrimitive = string | number | boolean
type TreeSelectValue = FieldPrimitive | FieldPrimitive[]

interface Props {
  config?: ComponentConfig
  name?: string
  label?: string
  width?: number
  modelValue?: TreeSelectValue
  options?: unknown[]
  optionLabelField?: string
  optionValueField?: string
  optionChildrenField?: string
  placeholder?: string
  clearable?: boolean
  filterable?: boolean
  multiple?: boolean
  checkStrictly?: boolean
  defaultExpandAll?: boolean
  renderAfterExpand?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '请选择',
  clearable: true,
  filterable: false,
  multiple: false,
  checkStrictly: false,
  defaultExpandAll: false,
  renderAfterExpand: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: TreeSelectValue]
}>()

const {
  options,
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
} = useOptionField<TreeSelectValue>({
  props,
  type: 'r-tree-select',
  fallbackValue: '',
})

function handleChange(value: TreeSelectValue): void {
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