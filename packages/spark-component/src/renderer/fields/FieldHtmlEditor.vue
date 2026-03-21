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
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { SparkNode } from '../_pkg'
import type { IDataRow } from '@spark-view/spark-data'
import { useFieldPermission } from './useFieldPermission'
import { useFieldContext } from './useFieldContext'
import FieldContextRenderer from './FieldContextRenderer.vue'

interface Props {
  config?: SparkNode
  field?: string
  label?: string
  width?: number
  sparkChildren?: SparkNode[]
  modelValue?: string
  rows?: number
}

const props = withDefaults(defineProps<Props>(), {
  rows: 10,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function stripHtml(value: unknown): string {
  return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

const permission = useFieldPermission<string>({
  props,
  type: 'r-html-editor',
  fallbackValue: '',
  formatDisplay: stripHtml,
})

const {
  fieldValue,
  isCurrentFieldEditable,
  syncValue,
  getRowRawValue,
} = permission

const fieldCtx = useFieldContext(props, permission)

const editorRef = ref<HTMLElement | null>(null)
const sourceMode = ref(false)
const htmlValue = computed(() => String(fieldValue.value ?? ''))
const plainValue = computed(() => stripHtml(htmlValue.value))

function syncEditorSurface(): void {
  if (sourceMode.value) return
  if (editorRef.value && editorRef.value.innerHTML !== htmlValue.value) {
    editorRef.value.innerHTML = htmlValue.value
  }
}

function updateValue(value: string): void {
  emit('update:modelValue', value)
  syncValue(value)
}

function handleSourceChange(value: string): void {
  updateValue(value)
}

function handleSurfaceInput(event: Event): void {
  const target = event.target as HTMLElement
  updateValue(target.innerHTML)
}

function applyCommand(command: string): void {
  if (!editorRef.value || sourceMode.value || !isCurrentFieldEditable.value) return
  editorRef.value.focus()
  if (typeof document.execCommand === 'function') {
    document.execCommand(command, false)
    updateValue(editorRef.value.innerHTML)
  }
}

function toggleSourceMode(): void {
  sourceMode.value = !sourceMode.value
  void nextTick(() => syncEditorSurface())
}

function getPlainTableValue(row: IDataRow): string {
  return stripHtml(getRowRawValue(row))
}

watch(htmlValue, () => {
  syncEditorSurface()
})

onMounted(() => {
  syncEditorSurface()
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