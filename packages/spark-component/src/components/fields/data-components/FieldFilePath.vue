<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #table-cell="{ value }">
      <span class="file-path">{{ value }}</span>
    </template>
    <template #form>
      <div class="file-path-field">
        <el-input
          :model-value="currentDisplayValue"
          readonly
          :placeholder="placeholder"
        />
        <el-button class="primary-action-button" :disabled="!canPrimaryAction" @click="handlePrimaryAction">{{ primaryActionText }}</el-button>
        <el-button v-if="showClearButton" class="clear-action-button" @click="clearValue">清空</el-button>
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
 * @skill r-file-path
 * @description 文件上传路径字段，绑定文件路径字符串，支持单/多文件上传并返回服务端路径。
 */
import { computed } from 'vue'
import { useFileFieldActions } from '../actions/useFileFieldActions'
import { useBasicFieldState } from './composables/useBasicFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from './composables/useControlledFieldChange'
import { coerceStringValue } from './composables/fieldValueCoercion'
import { useUploadBrowseFieldState } from './composables/useFileFieldState'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'
import type { RFilePathProps } from './FieldFilePath.props'

const props = withDefaults(defineProps<RFilePathProps>(), {
  type: 'r-file-path',
  action: '#',
  accept: '',
  multiple: false,
  separator: ', ',
  placeholder: '请选择文件路径',
  buttonText: '上传',
  readonlyButtonText: '浏览',
  clearable: true,
})

const emit = defineEmits<FieldValueUpdateEmits<string>>()

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<string>({
  props,
  fieldType: 'r-file-path',
  fallbackValue: '',
  formatDisplay: value => String(value ?? ''),
  coerce: coerceStringValue,
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
