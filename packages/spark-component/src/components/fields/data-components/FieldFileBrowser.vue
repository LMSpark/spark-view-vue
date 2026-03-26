<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #table-cell="{ value }">
      <span class="file-browser-value">{{ value }}</span>
    </template>
    <template #form>
      <div class="file-browser-field">
        <el-input
          :model-value="fieldValue"
          readonly
          :placeholder="placeholder"
        />
        <el-button class="browse-action-button" :disabled="!hasBrowseCapability" @click="openFileDialog">{{ buttonText }}</el-button>
        <el-button v-if="showClearButton" class="clear-action-button" @click="clearValue">清空</el-button>
      </div>
    </template>
    <template #tree>
      <span class="file-browser-value">{{ currentDisplayValue }}</span>
    </template>
    <template #detail>
      <div class="field-display">
        <span class="field-label">{{ fieldCtx.displayLabel }}：</span>
        <span class="field-value file-browser-value">{{ currentDisplayValue }}</span>
      </div>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SparkNode } from '../../internal'
import { useFieldPermission } from '../context/useFieldPermission'
import { useFileFieldActions } from '../actions/useFileFieldActions'
import { useFieldContext } from '../context/useFieldContext'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'

interface Props extends SparkNode {
  /** 字段绑定名 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
  /** 双向绑定值（文件路径） */
  modelValue?: string
  /** 接受文件类型 */
  accept?: string
  /** 多选 */
  multiple?: boolean
  /** 可清除 */
  clearable?: boolean
  /** 多文件分隔符 */
  separator?: string
  /** 占位提示 */
  placeholder?: string
  /** 上传按钮文案 */
  buttonText?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-file-browser',
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

const permission = useFieldPermission<string>({
  props,
  type: 'r-file-browser',
  fallbackValue: '',
  formatDisplay: value => String(value ?? ''),
})

const {
  displayLabel,
  pageService,
  fieldValue,
  currentRawStringValue,
  isCurrentFieldEditable,
  currentDisplayValue,
  syncValue,
} = permission

const fieldCtx = useFieldContext({ type: props.type, width: props.width }, permission)

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