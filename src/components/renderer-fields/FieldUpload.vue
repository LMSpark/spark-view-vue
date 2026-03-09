<template>
  <template v-if="context === 'table'">
    <el-table-column :label="displayLabel" :prop="fieldName" :width="width">
      <template #default="{ row }">
        <span v-if="!isTableCellHidden(row)" class="file-path">{{ getTableCellDisplayValue(row) }}</span>
      </template>
    </el-table-column>
  </template>

  <el-form-item v-else-if="context === 'form' && !isCurrentFieldHidden" :label="displayLabel">
    <el-upload
      :action="action"
      :accept="accept"
      :disabled="!isCurrentFieldEditable"
      :limit="limit"
      :list-type="listType"
      :show-file-list="showFileList"
      :auto-upload="autoUpload"
      :file-list="fileList"
      @success="handleSuccess"
      @remove="handleRemove"
    >
      <el-button v-if="listType !== 'picture-card'" type="primary" :disabled="!isCurrentFieldEditable">{{ buttonText }}</el-button>
      <div v-else class="upload-card-trigger">+</div>
    </el-upload>
  </el-form-item>

  <template v-else-if="context === 'tree'">
    <span v-if="!isCurrentFieldHidden" class="file-path">{{ currentDisplayValue }}</span>
  </template>

  <div v-else-if="!isCurrentFieldHidden" class="field-display">
    <span class="field-label">{{ displayLabel }}：</span>
    <span class="field-value file-path">{{ currentDisplayValue }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ComponentConfig } from '@spark-view/spark-component'
import { useFieldPermission } from './useFieldPermission'

interface UploadLikeFile {
  name: string
  url?: string
}

interface Props {
  config?: ComponentConfig
  name?: string
  label?: string
  width?: number
  modelValue?: string
  action?: string
  accept?: string
  buttonText?: string
  autoUpload?: boolean
  showFileList?: boolean
  limit?: number
  listType?: 'text' | 'picture' | 'picture-card'
}

const props = withDefaults(defineProps<Props>(), {
  action: '#',
  accept: '',
  buttonText: '点击上传',
  autoUpload: true,
  showFileList: true,
  limit: 1,
  listType: 'text',
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
  type: 'r-upload',
  fallbackValue: '',
  formatDisplay: value => String(value ?? ''),
})

const fileList = computed<UploadLikeFile[]>(() => {
  const value = String(fieldValue.value ?? '')
  if (!value) return []
  const name = value.split('/').pop() || value
  return [{ name, url: value }]
})

function extractUploadValue(response: unknown, fallbackName: string): string {
  if (!response || typeof response !== 'object') return fallbackName
  const record = response as Record<string, unknown>
  const candidate = record['url'] ?? record['path'] ?? record['filePath'] ?? record['data']
  if (typeof candidate === 'string') return candidate
  if (candidate && typeof candidate === 'object') {
    const nested = candidate as Record<string, unknown>
    const nestedValue = nested['url'] ?? nested['path'] ?? nested['filePath']
    if (typeof nestedValue === 'string') return nestedValue
  }
  return fallbackName
}

function updateValue(value: string): void {
  emit('update:modelValue', value)
  syncValue(value)
}

function handleSuccess(response: unknown, uploadFile: { name?: string }): void {
  const fallbackName = uploadFile.name ?? ''
  updateValue(extractUploadValue(response, fallbackName))
}

function handleRemove(): void {
  updateValue('')
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
.file-path {
  font-family: Consolas, 'Courier New', monospace;
  word-break: break-all;
}
.upload-card-trigger {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed #c0c4cc;
  border-radius: 6px;
  color: #909399;
  font-size: 20px;
}
</style>