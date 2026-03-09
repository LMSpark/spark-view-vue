<template>
  <template v-if="context === 'table'">
    <el-table-column :label="displayLabel" :prop="fieldName" :width="width">
      <template #default="{ row }">
        <span v-if="!isTableCellHidden(row)">{{ getTableCellDisplayValue(row) }}</span>
      </template>
    </el-table-column>
  </template>

  <el-form-item v-else-if="context === 'form' && !isCurrentFieldHidden" :label="displayLabel">
    <el-transfer
      :model-value="fieldValue"
      :data="transferData"
      :titles="titles"
      :filterable="filterable"
      :filter-placeholder="filterPlaceholder"
      :target-order="targetOrder"
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
import { useFieldPermission } from './useFieldPermission'
import { useFieldOptions } from './useFieldOptions'
import type { ComponentConfig } from '@spark-view/spark-component'

type TransferValue = Array<string | number>

interface Props {
  config?: ComponentConfig
  name?: string
  label?: string
  width?: number
  modelValue?: TransferValue
  options?: unknown[]
  optionLabelField?: string
  optionValueField?: string
  titles?: [string, string]
  filterable?: boolean
  filterPlaceholder?: string
  targetOrder?: 'original' | 'push' | 'unshift'
}

const props = withDefaults(defineProps<Props>(), {
  titles: () => ['待选', '已选'] as [string, string],
  filterable: false,
  filterPlaceholder: '请输入关键词',
  targetOrder: 'original',
})

const emit = defineEmits<{
  'update:modelValue': [value: TransferValue]
}>()

const { formatOptionValue, transferData } = useFieldOptions(props)
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
} = useFieldPermission<TransferValue>({
  props,
  type: 'r-transfer',
  fallbackValue: [],
  formatDisplay: formatOptionValue,
})

function handleChange(value: TransferValue): void {
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