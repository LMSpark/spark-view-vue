<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #table-cell="{ row }">
      <span class="html-editor-text">{{ getPlainTableValue(row) }}</span>
    </template>
    <template #form>
      <div class="html-editor" :class="{ 'is-disabled': !isCurrentFieldEditable }">
        <div class="html-editor-toolbar">
          <el-button size="small" :disabled="!isCurrentFieldEditable || sourceMode" @click="applyCommand('bold')">B</el-button>
          <el-button size="small" :disabled="!isCurrentFieldEditable || sourceMode" @click="applyCommand('italic')">I</el-button>
          <el-button size="small" :disabled="!isCurrentFieldEditable || sourceMode" @click="applyCommand('underline')">U</el-button>
          <el-button size="small" :disabled="!isCurrentFieldEditable || sourceMode" @click="applyCommand('insertUnorderedList')">• List</el-button>
          <el-button size="small" :disabled="!isCurrentFieldEditable || sourceMode" @click="applyCommand('insertOrderedList')">1. List</el-button>
          <el-button size="small" class="toggle-source" :disabled="!isCurrentFieldEditable" @click="toggleSourceMode">
            {{ sourceMode ? '预览' : 'HTML' }}
          </el-button>
        </div>

        <el-input
          v-if="sourceMode"
          :model-value="htmlValue"
          type="textarea"
          :rows="rows"
          :disabled="!isCurrentFieldEditable"
          placeholder="请输入 HTML 内容"
          @update:model-value="handleSourceChange"
        />

        <div
          v-else
          ref="editorRef"
          class="html-editor-surface"
          :contenteditable="isCurrentFieldEditable"
          @input="handleSurfaceInput"
        />
      </div>
    </template>
    <template #tree>
      <span class="html-editor-text">{{ plainValue }}</span>
    </template>
    <template #detail>
      <div class="field-display html-editor-preview">
        <span class="field-label">{{ fieldCtx.displayLabel }}：</span>
        <div class="field-value" v-html="htmlValue"></div>
      </div>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @skill-description 富文本编辑器字段，绑定 HTML 字符串值，内置加粗/斜体/列表工具栏和 HTML 源码编辑模式。
 */
import { ref } from 'vue'
import type { SparkNode } from '../../internal'
import { useBasicFieldState } from './composables/useBasicFieldState'
import { stripHtml, useHtmlEditorState } from './composables/useHtmlEditorState'
import FieldContextRenderer from '../non-data-components/FieldContextRenderer.vue'

interface Props extends SparkNode {
  /** 字段绑定名 */
  field?: string
  /** 显示标签 */
  label?: string
  /** r-table 内列宽 */
  width?: number
  /** 双向绑定值（HTML 字符串） */
  modelValue?: string
  /** 编辑器高度行数 */
  rows?: number
}

const props = withDefaults(defineProps<Props>(), {
  type: 'r-html-editor',
  rows: 10,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const { permission, fieldCtx } = useBasicFieldState<string>({
  props,
  fieldType: 'r-html-editor',
  fallbackValue: '',
  formatDisplay: stripHtml,
  emitUpdate: value => emit('update:modelValue', value),
})

const {
  fieldValue,
  isCurrentFieldEditable,
  syncValue,
  getRowRawValue,
} = permission

const editorRef = ref<HTMLElement | null>(null)

const {
  sourceMode,
  htmlValue,
  plainValue,
  handleSourceChange,
  handleSurfaceInput,
  applyCommand,
  toggleSourceMode,
  getPlainTableValue,
} = useHtmlEditorState({
  editorRef,
  fieldValue,
  isCurrentFieldEditable,
  syncValue,
  emitUpdate: value => emit('update:modelValue', value),
  getRowRawValue,
})
</script>

<style scoped>
.html-editor {
  width: 100%;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  overflow: hidden;
  background: #fff;
}

.html-editor.is-disabled {
  background: #f5f7fa;
}

.html-editor-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid #ebeef5;
  background: #f5f7fa;
}

.html-editor-surface {
  min-height: 180px;
  padding: 12px;
  outline: none;
}

.html-editor-text {
  word-break: break-word;
}

.html-editor-preview :deep(p) {
  margin: 0 0 8px;
}
</style>