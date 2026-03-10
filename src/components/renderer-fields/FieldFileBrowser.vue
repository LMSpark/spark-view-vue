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
      />
      <el-button class="browse-action-button" :disabled="!hasBrowseCapability" @click="openFileDialog">{{ buttonText }}</el-button>
      <el-button v-if="showClearButton" class="clear-action-button" @click="clearValue">清空</el-button>
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

const {
  fieldName,
  displayLabel,
  context,
  pageService,
  fieldValue,
  currentRawStringValue,
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

const { hasBrowseCapability, browseFiles } = useFileFieldActions({
  pageService,
  isEditable: isCurrentFieldEditable,
})

const showClearButton = computed(() => props.clearable && isCurrentFieldEditable.value && currentRawStringValue.value.length > 0)

function updateValue(value: string): void {
  emit('update:modelValue', value)
  syncValue(value)
}

function openFileDialog(): void {
  void browseFiles({
    title: displayLabel.value,
    accept: props.accept,
    multiple: props.multiple,
    currentValue: currentRawStringValue.value,
  }).then((files) => {
    if (!isCurrentFieldEditable.value) return
    const nextValue = files.map(file => file.name).join(props.separator)
    if (nextValue.length > 0) {
      updateValue(nextValue)
    }
  })
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

.file-browser-field {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.file-browser-field :deep(.el-input) {
  flex: 1;
}

.file-browser-value {
  word-break: break-all;
}
</style>