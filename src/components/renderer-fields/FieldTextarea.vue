<template>
  <template v-if="context === 'table'">
    <el-table-column :label="displayLabel" :prop="fieldName" :width="width">
      <template #default="{ row }">
        <span v-if="!isTableCellHidden(row)" class="textarea-display">{{ getTableCellDisplayValue(row) }}</span>
      </template>
    </el-table-column>
  </template>

  <el-form-item v-else-if="context === 'form' && !isCurrentFieldHidden" :label="displayLabel">
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
  </el-form-item>

  <template v-else-if="context === 'tree'">
    <span v-if="!isCurrentFieldHidden" class="textarea-display">{{ currentDisplayValue }}</span>
  </template>

  <div v-else-if="!isCurrentFieldHidden" class="field-display">
    <span class="field-label">{{ displayLabel }}：</span>
    <span class="field-value textarea-display">{{ currentDisplayValue }}</span>
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
  type: 'r-textarea',
  fallbackValue: '',
})

function handleChange(value: string): void {
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

.textarea-display {
  white-space: pre-wrap;
  word-break: break-word;
}
</style>