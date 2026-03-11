<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #table-cell="{ row, value }">
      <img v-if="showImage(getRowRawStringValue(row))" :src="getRowRawStringValue(row)" class="image-thumb" alt="image" />
      <span v-else>{{ value }}</span>
    </template>
    <template #form>
      <div class="image-field-form">
        <div class="image-field-toolbar">
          <el-input
            :model-value="currentDisplayValue"
            readonly
            :placeholder="placeholder"
          />
          <el-button class="primary-action-button" type="primary" :disabled="!canPrimaryAction" @click="handlePrimaryAction">{{ primaryActionText }}</el-button>
          <el-button v-if="showClearButton" class="clear-action-button" @click="clearValue">清空</el-button>
        </div>
        <img v-if="showImage(currentRawStringValue)" :src="currentRawStringValue" class="image-preview" alt="image" />
      </div>
    </template>
    <template #tree>
      <span class="tree-node-image">
        <img v-if="showImage(currentRawStringValue)" :src="currentRawStringValue" class="image-thumb" alt="image" />
        <span v-else>{{ currentDisplayValue }}</span>
      </span>
    </template>
    <template #detail>
      <div class="field-display">
        <span class="field-label">{{ fieldCtx.displayLabel }}：</span>
        <span class="field-value">
          <img v-if="showImage(currentRawStringValue)" :src="currentRawStringValue" class="image-preview" alt="image" />
          <span v-else>{{ currentDisplayValue }}</span>
        </span>
      </div>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ComponentConfig } from '../_pkg'
import { useFieldPermission } from './useFieldPermission'
import { useFileFieldActions } from './useFileFieldActions'
import { useFieldContext } from './useFieldContext'
import FieldContextRenderer from './FieldContextRenderer.vue'

interface Props {
  config?: ComponentConfig
  name?: string
  label?: string
  width?: number
  sparkChildren?: ComponentConfig[]
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
  accept: 'image/*',
  multiple: false,
  separator: ', ',
  placeholder: '请选择图片',
  buttonText: '上传图片',
  readonlyButtonText: '浏览',
  clearable: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const permission = useFieldPermission<string>({
  props,
  type: 'r-image',
  fallbackValue: '',
  formatDisplay: value => String(value ?? ''),
})

const {
  displayLabel,
  fieldName,
  pageService,
  currentRawStringValue,
  isCurrentFieldEditable,
  currentDisplayValue,
  getRowRawStringValue,
  syncValue,
} = permission

const fieldCtx = useFieldContext(props, permission)

const { hasBrowseCapability, hasUploadCapability, primaryAction, browseFiles, uploadFiles } = useFileFieldActions({
  pageService,
  isEditable: isCurrentFieldEditable,
})

const canUpload = computed(() => hasUploadCapability.value && props.action.trim().length > 0 && props.action !== '#')
const canPrimaryAction = computed(() => (primaryAction.value === 'upload' ? canUpload.value : hasBrowseCapability.value))
const primaryActionText = computed(() => (primaryAction.value === 'upload' ? props.buttonText : props.readonlyButtonText))
const showClearButton = computed(() => props.clearable && isCurrentFieldEditable.value && currentRawStringValue.value.length > 0)

function showImage(value: string): boolean {
  return !!value && !value.includes('***')
}

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
.image-field-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.image-field-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.image-field-toolbar :deep(.el-input) {
  flex: 1;
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