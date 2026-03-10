<template>
  <template v-if="context === 'table'">
    <el-table-column :label="displayLabel" :prop="fieldName" :width="width">
      <template #default="{ row }">
        <span v-if="!isTableCellHidden(row)" class="file-path">{{ getTableCellDisplayValue(row) }}</span>
      </template>
    </el-table-column>
  </template>

  <el-form-item v-else-if="context === 'form' && !isCurrentFieldHidden" :label="displayLabel">
    <div class="file-path-field">
      <el-input
        :model-value="currentDisplayValue"
        readonly
        :placeholder="placeholder"
      />
      <el-button class="primary-action-button" :disabled="!canPrimaryAction" @click="handlePrimaryAction">{{ primaryActionText }}</el-button>
      <el-button v-if="showClearButton" class="clear-action-button" @click="clearValue">清空</el-button>
    </div>
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
import { useFileFieldActions } from './useFileFieldActions'

interface Props {
  config?: ComponentConfig
  name?: string
  label?: string
  width?: number
  modelValue?: string
  action?: string
  accept?: string
  multiple?: boolean
  separator?: string
  placeholder?: string
  buttonText?: string
  readonlyButtonText?: string
  clearable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  action: '#',
  accept: '',
  multiple: false,
  separator: ', ',
  placeholder: '请选择文件路径',
  buttonText: '上传',
  readonlyButtonText: '浏览',
  clearable: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const {
  fieldName,
  displayLabel,
  context,
  pageService,
  currentRawStringValue,
  isCurrentFieldHidden,
  isCurrentFieldEditable,
  currentDisplayValue,
  isTableCellHidden,
  getTableCellDisplayValue,
  syncValue,
} = useFieldPermission<string>({
  props,
  type: 'r-file-path',
  fallbackValue: '',
  formatDisplay: value => String(value ?? ''),
})

const { hasBrowseCapability, hasUploadCapability, primaryAction, browseFiles, uploadFiles } = useFileFieldActions({
  pageService,
  isEditable: isCurrentFieldEditable,
})

const canUpload = computed(() => hasUploadCapability.value && props.action.trim().length > 0 && props.action !== '#')
const canPrimaryAction = computed(() => (primaryAction.value === 'upload' ? canUpload.value : hasBrowseCapability.value))
const primaryActionText = computed(() => (primaryAction.value === 'upload' ? props.buttonText : props.readonlyButtonText))
const showClearButton = computed(() => props.clearable && isCurrentFieldEditable.value && currentRawStringValue.value.length > 0)

function updateValue(value: string): void {
  emit('update:modelValue', value)
  syncValue(value)
}

function handleBrowse(): void {
  void browseFiles({
    title: displayLabel.value,
    accept: props.accept,
    multiple: props.multiple,
    currentValue: currentRawStringValue.value,
  })
}

function handleUpload(): void {
  void uploadFiles({
    action: props.action,
    accept: props.accept,
    multiple: props.multiple,
    fieldName: fieldName.value || 'file',
    currentValue: currentRawStringValue.value,
  }).then((files) => {
    if (files.length === 0) return
    const nextValue = files.map(file => file.url ?? file.name).join(props.separator)
    updateValue(nextValue)
  })
}

function handlePrimaryAction(): void {
  if (primaryAction.value === 'browse') {
    handleBrowse()
    return
  }
  handleUpload()
}

function clearValue(): void {
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
.file-path-field {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.file-path-field :deep(.el-input) {
  flex: 1;
}
.file-path {
  font-family: Consolas, 'Courier New', monospace;
  word-break: break-all;
}
</style>