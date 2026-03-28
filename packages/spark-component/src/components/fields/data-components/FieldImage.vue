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
import type { SparkNode } from '../../internal'
import { useFileFieldActions } from '../actions/useFileFieldActions'
import { useBasicFieldState } from './composables/useBasicFieldState'
import { useUploadBrowseFieldState } from './composables/useFileFieldState'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'

interface Props extends SparkNode {
  /** 字段绑定名 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
  /** 双向绑定值（图片路径） */
  modelValue?: string
  /** 上传 URL */
  action?: string
  /** 接受文件类型 */
  accept?: string
  /** 多选 */
  multiple?: boolean
  /** 多图分隔符 */
  separator?: string
  /** 占位提示 */
  placeholder?: string
  /** 上传按钮文案 */
  buttonText?: string
  /** 只读模式按钮文案 */
  readonlyButtonText?: string
  /** 可清除 */
  clearable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-image',
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

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<string>({
  props,
  fieldType: 'r-image',
  fallbackValue: '',
  formatDisplay: value => String(value ?? ''),
  emitUpdate: value => emit('update:modelValue', value),
})

const {
  displayLabel,
  fieldName,
  pageService,
  currentRawStringValue,
  isCurrentFieldEditable,
  currentDisplayValue,
  getRowRawStringValue,
} = permission

const { hasBrowseCapability, hasUploadCapability, primaryAction, browseFiles, uploadFiles } = useFileFieldActions({
  pageService,
  isEditable: isCurrentFieldEditable,
})

function showImage(value: string): boolean {
  return !!value && !value.includes('***')
}

async function updateValue(value: string): Promise<void> {
  await handleControlledChange(value)
}

const {
  canPrimaryAction,
  primaryActionText,
  showClearButton,
  handlePrimaryAction,
  clearValue,
} = useUploadBrowseFieldState({
  displayLabel,
  fieldName,
  currentRawStringValue,
  isCurrentFieldEditable,
  hasBrowseCapability,
  hasUploadCapability,
  primaryAction,
  buttonText: computed(() => props.buttonText),
  readonlyButtonText: computed(() => props.readonlyButtonText),
  canClear: computed(() => props.clearable),
  action: computed(() => props.action),
  accept: computed(() => props.accept),
  multiple: computed(() => props.multiple),
  separator: computed(() => props.separator),
  browseFiles,
  uploadFiles,
  updateValue,
})
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