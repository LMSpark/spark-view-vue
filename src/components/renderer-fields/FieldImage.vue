<template>
  <template v-if="context === 'table'">
    <el-table-column :label="displayLabel" :prop="fieldName" :width="width">
      <template #default="{ row }">
        <template v-if="!isTableCellHidden(row)">
          <img v-if="showImage(getRawImage(row))" :src="getRawImage(row)" class="image-thumb" alt="image" />
          <span v-else>{{ getTableCellDisplayValue(row) }}</span>
        </template>
      </template>
    </el-table-column>
  </template>

  <el-form-item v-else-if="context === 'form' && !isCurrentFieldHidden" :label="displayLabel">
    <div class="image-field-form">
      <el-input
        :model-value="fieldValue"
        :disabled="!isCurrentFieldEditable"
        placeholder="图片地址或已上传图片路径"
        @update:model-value="handleChange"
      />
      <img v-if="showImage(currentRawImage)" :src="currentRawImage" class="image-preview" alt="image" />
    </div>
  </el-form-item>

  <template v-else-if="context === 'tree'">
    <span v-if="!isCurrentFieldHidden" class="tree-node-image">
      <img v-if="showImage(currentRawImage)" :src="currentRawImage" class="image-thumb" alt="image" />
      <span v-else>{{ currentDisplayValue }}</span>
    </span>
  </template>

  <div v-else-if="!isCurrentFieldHidden" class="field-display">
    <span class="field-label">{{ displayLabel }}：</span>
    <span class="field-value">
      <img v-if="showImage(currentRawImage)" :src="currentRawImage" class="image-preview" alt="image" />
      <span v-else>{{ currentDisplayValue }}</span>
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
  type: 'r-image',
  fallbackValue: '',
  formatDisplay: value => String(value ?? ''),
})

const currentRawImage = computed(() => String(fieldValue.value ?? ''))

function showImage(value: string): boolean {
  return !!value && !value.includes('***')
}

function getRawImage(row: IDataRow): string {
  if (!fieldName.value) return ''
  return String(row[fieldName.value] ?? '')
}

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
.image-field-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.image-thumb {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  object-fit: cover;
  border: 1px solid #dcdfe6;
}
.image-preview {
  max-width: 160px;
  max-height: 120px;
  border-radius: 6px;
  border: 1px solid #dcdfe6;
  object-fit: cover;
}
</style>