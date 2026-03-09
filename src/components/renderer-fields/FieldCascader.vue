<template>
  <template v-if="context === 'table'">
    <el-table-column :label="displayLabel" :prop="fieldName" :width="width">
      <template #default="{ row }">
        <span v-if="!isTableCellHidden(row)">{{ getTableCellDisplayValue(row) }}</span>
      </template>
    </el-table-column>
  </template>

  <el-form-item v-else-if="context === 'form' && !isCurrentFieldHidden" :label="displayLabel">
    <el-cascader
      :model-value="fieldValue"
      :options="options"
      :props="cascaderProps"
      :placeholder="placeholder"
      :clearable="clearable"
      :filterable="filterable"
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
import { computed } from 'vue'
import { useFieldPermission } from './useFieldPermission'
import { useFieldOptions } from './useFieldOptions'
import type { ComponentConfig } from '@spark-view/spark-component'

type FieldPrimitive = string | number | boolean
type CascaderPath = FieldPrimitive[]
type CascaderValue = CascaderPath | CascaderPath[]

interface Props {
  config?: ComponentConfig
  name?: string
  label?: string
  width?: number
  modelValue?: CascaderValue
  options?: unknown[]
  optionLabelField?: string
  optionValueField?: string
  optionChildrenField?: string
  placeholder?: string
  clearable?: boolean
  filterable?: boolean
  multiple?: boolean
  checkStrictly?: boolean
  emitPath?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '请选择',
  clearable: true,
  filterable: false,
  multiple: false,
  checkStrictly: false,
  emitPath: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: CascaderValue]
}>()

const { options, formatCascaderValue } = useFieldOptions(props)
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
} = useFieldPermission<CascaderValue>({
  props,
  type: 'r-cascader',
  fallbackValue: [],
  formatDisplay: formatCascaderValue,
})

const cascaderProps = computed(() => ({
  multiple: props.multiple,
  checkStrictly: props.checkStrictly,
  emitPath: props.emitPath,
}))

function handleChange(value: CascaderValue): void {
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