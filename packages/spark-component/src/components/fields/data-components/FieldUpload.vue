<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #table-cell="{ value }">
      <span class="file-path">{{ value }}</span>
    </template>
    <template #form>
      <div class="upload-field">
        <el-input
          :model-value="currentDisplayValue"
          readonly
          :placeholder="placeholder"
        />
        <el-button class="primary-action-button" type="primary" :disabled="!canPrimaryAction" @click="handlePrimaryAction">{{ primaryActionText }}</el-button>
        <el-button v-if="showClearButton" class="clear-action-button" @click="handleRemove">清空</el-button>
      </div>
    </template>
    <template #tree>
      <span class="file-path">{{ currentDisplayValue }}</span>
    </template>
    <template #detail>
      <div class="field-display">
        <span class="field-label">{{ fieldCtx.displayLabel }}：</span>
        <span class="field-value file-path">{{ currentDisplayValue }}</span>
      </div>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @skill r-upload
 * @description 文件上传字段，绑定文件路径字符串，基于 el-upload 支持列表/图片/卡片等多种文件展示模式。
 */
import { computed } from 'vue'
import { useFileFieldActions } from '../actions/useFileFieldActions'
import { useBasicFieldState } from './composables/useBasicFieldState'
import { useUploadBrowseFieldState } from './composables/useFileFieldState'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { SparkRuntimeProps } from '../../shared-types.js'

interface Props extends SparkRuntimeProps<'r-upload'> {
  /** 字段绑定名 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
  /** 双向绑定值（文件路径） */
  modelValue?: string
  /** 上传 URL */
  action?: string
  /** 接受文件类型 */
  accept?: string
  /** 上传按钮文案 */
  buttonText?: string
  /** 自动上传 */
  autoUpload?: boolean
  /** 显示文件列表 */
  showFileList?: boolean
  /** 最大文件数 */
  limit?: number
  /** 列表展示类型 */
  listType?: 'text' | 'picture' | 'picture-card'
  /** 多文件分隔符 */
  separator?: string
  /** 占位提示 */
  placeholder?: string
  /** 只读模式按钮文案 */
  readonlyButtonText?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-upload',
  action: '#',
  accept: '',
  buttonText: '点击上传',
  autoUpload: true,
  showFileList: true,
  limit: 1,
  listType: 'text',
  separator: ', ',
  placeholder: '请选择文件',
  readonlyButtonText: '浏览',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<string>({
  props,
  fieldType: 'r-upload',
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
} = permission

const { hasBrowseCapability, hasUploadCapability, primaryAction, browseFiles, uploadFiles } = useFileFieldActions({
  pageService,
  isEditable: isCurrentFieldEditable,
})

async function updateValue(value: string): Promise<void> {
  await handleControlledChange(value)
}

const {
  canPrimaryAction,
  primaryActionText,
  showClearButton,
  handlePrimaryAction,
  clearValue: handleRemove,
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
  canClear: computed(() => props.showFileList),
  action: computed(() => props.action),
  accept: computed(() => props.accept),
  multiple: computed(() => props.limit > 1),
  separator: computed(() => props.separator),
  browseFiles,
  uploadFiles,
  updateValue,
})
</script>

<style scoped>
.upload-field {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.upload-field :deep(.el-input) {
  flex: 1;
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
