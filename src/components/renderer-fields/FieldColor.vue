<template>
  <template v-if="context === 'table'">
    <el-table-column :label="displayLabel" :prop="fieldName" :width="width">
      <template #default="{ row }">
        <template v-if="!isTableCellHidden(row)">
          <span class="color-cell">
            <span class="color-chip" :style="{ backgroundColor: getRawColor(row) || '#ffffff' }"></span>
            <span>{{ getTableCellDisplayValue(row) }}</span>
          </span>
        </template>
      </template>
    </el-table-column>
  </template>

  <el-form-item v-else-if="context === 'form' && !isCurrentFieldHidden" :label="displayLabel">
    <el-color-picker
      :model-value="fieldValue"
      :disabled="!isCurrentFieldEditable"
      @update:model-value="handleChange"
    />
  </el-form-item>

  <template v-else-if="context === 'tree'">
    <span v-if="!isCurrentFieldHidden" class="color-cell">
      <span class="color-chip" :style="{ backgroundColor: currentRawColor || '#ffffff' }"></span>
      <span>{{ currentDisplayValue }}</span>
    </span>
  </template>

  <div v-else-if="!isCurrentFieldHidden" class="field-display">
    <span class="field-label">{{ displayLabel }}：</span>
    <span class="color-cell">
      <span class="color-chip" :style="{ backgroundColor: currentRawColor || '#ffffff' }"></span>
      <span class="field-value">{{ currentDisplayValue }}</span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { IDataRow } from '@spark-view/spark-data'
import type { ComponentConfig } from '@spark-view/spark-component'
import { useFieldPermission } from './useFieldPermission'

interface Props {
  config?: ComponentConfig
  name?: string
  label?: string
  width?: number
  modelValue?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

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
  type: 'r-color',
  fallbackValue: '',
  formatDisplay: value => String(value ?? ''),
})

const currentRawColor = computed(() => String(fieldValue.value ?? ''))

function getRawColor(row: IDataRow): string {
  if (!fieldName.value) return ''
  return String(row[fieldName.value] ?? '')
}

function handleChange(value: string | null): void {
  const next = value ?? ''
  emit('update:modelValue', next)
  syncValue(next)
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