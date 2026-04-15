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
 * @description 文件上传字段，绑定文件路径字符串。
 * @api autoUpload - 自动上传（默认 true）
 * @api showFileList - 显示文件列表（默认 true）
 * @api limit - 最大上传数量（默认 1）
 * @api listType - 文件展示模式（'text'|'picture'|'picture-card'）
 */
import { computed } from 'vue'
import { useFileFieldActions } from '../actions/useFileFieldActions'
import { useBasicFieldState } from './composables/useBasicFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from './composables/useControlledFieldChange'
import { useUploadBrowseFieldState } from './composables/useFileFieldState'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { RUploadProps } from './FieldUpload.props'

const props = withDefaults(defineProps<RUploadProps>(), {
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

const emit = defineEmits<FieldValueUpdateEmits<string>>()

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<string>({
  props,
  fieldType: 'r-upload',
  fallbackValue: '',
  formatDisplay: value => String(value ?? ''),
  emitUpdate: value => emitFieldValueUpdate(emit, value),
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

