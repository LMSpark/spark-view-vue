<template>
  <template v-if="context === 'table'">
    <el-table-column :label="displayLabel" :prop="fieldName" :width="width">
      <template #default="{ row }">
        <span v-if="!isTableCellHidden(row)" class="file-browser-value">{{ getTableCellDisplayValue(row) }}</span>
      </template>
    </el-table-column>
  </template>

  <el-form-item v-else-if="context === 'form' && !isCurrentFieldHidden" :label="displayLabel">
    <div class="file-browser-field">
      <el-input
        :model-value="fieldValue"
        readonly
        :placeholder="placeholder"
        :disabled="!isCurrentFieldEditable"
      />
      <el-button :disabled="!isCurrentFieldEditable" @click="openFileDialog">{{ buttonText }}</el-button>
      <el-button v-if="clearable" :disabled="!isCurrentFieldEditable" @click="clearValue">清空</el-button>
      <input
        ref="fileInputRef"
        class="file-browser-input"
        type="file"
        :accept="accept"
        :multiple="multiple"
        @change="handleFileChange"
      >
    </div>
  </el-form-item>

  <template v-else-if="context === 'tree'">
    <span v-if="!isCurrentFieldHidden" class="file-browser-value">{{ currentDisplayValue }}</span>
  </template>

  <div v-else-if="!isCurrentFieldHidden" class="field-display">
    <span class="field-label">{{ displayLabel }}：</span>
    <span class="field-value file-browser-value">{{ currentDisplayValue }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { ComponentConfig } from '@spark-view/spark-component'
import { useFieldPermission } from './useFieldPermission'

interface Props {
  config?: ComponentConfig
  name?: string
  label?: string
  width?: number
  modelValue?: string
  accept?: string
  multiple?: boolean
  clearable?: boolean
  separator?: string
  placeholder?: string
  buttonText?: string
}

const props = withDefaults(defineProps<Props>(), {
  accept: '',
  multiple: false,
  clearable: true,
  separator: ', ',
  placeholder: '请选择文件',
  buttonText: '浏览',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const fileInputRef = ref<HTMLInputElement | null>(null)

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
  type: 'r-file-browser',
  fallbackValue: '',
  formatDisplay: value => String(value ?? ''),
})

function updateValue(value: string): void {
  emit('update:modelValue', value)
  syncValue(value)
}

function openFileDialog(): void {
  fileInputRef.value?.click()
}

function clearValue(): void {
  updateValue('')
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

function handleFileChange(event: Event): void {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files ?? [])
  const nextValue = files.map(file => file.name).join(props.separator)
  updateValue(nextValue)
  target.value = ''
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

.file-browser-field {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.file-browser-field :deep(.el-input) {
  flex: 1;
}

.file-browser-input {
  display: none;
}

.file-browser-value {
  word-break: break-all;
}
</style>