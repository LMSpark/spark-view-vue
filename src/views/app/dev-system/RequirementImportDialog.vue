<!--
@module app:views/app/dev-system/RequirementImportDialog
职责：提供 DevSystem 的 RequirementImportDialog 能力，围绕 .docx 文件上传、文本解析和 AI 需求导入。
边界：只负责 UI 交互和状态展示，AI 调用和项目模型写入由 useDevState 方法处理。
AI用途：理解需求文档导入的用户交互流程时，用本模块定位 views/app/dev-system/RequirementImportDialog。
-->
<template>
  <el-dialog
    v-model="visible"
    title="导入需求文档"
    width="640px"
    :close-on-click-modal="false"
    @close="handleClose"
  >
    <div class="requirement-import">
      <!-- 文件上传区域 -->
      <div
        class="requirement-import__upload"
        :class="{ 'requirement-import__upload--dragover': isDragOver }"
        @dragover.prevent="isDragOver = true"
        @dragleave.prevent="isDragOver = false"
        @drop.prevent="handleDrop"
      >
        <input
          ref="fileInput"
          type="file"
          accept=".docx"
          style="display: none"
          @change="handleFileChange"
        />
        <div class="requirement-import__upload-content">
          <NavIcon name="Upload" :size="24" />
          <p class="requirement-import__upload-text">
            将 .docx 文件拖拽到此处，或
            <el-button type="primary" link @click="fileInput?.click()">
              点击选择文件
            </el-button>
          </p>
          <p class="requirement-import__upload-hint">仅支持 .docx 格式的需求文档</p>
        </div>
      </div>

      <!-- 文件名 + 解析状态 -->
      <div v-if="state.requirementImportFileName.value" class="requirement-import__file-info">
        <NavIcon name="Document" :size="14" />
        <span class="requirement-import__filename">
          {{ state.requirementImportFileName.value }}
        </span>
        <el-icon v-if="state.requirementImportParsing.value" class="is-loading">
          <NavIcon name="Loading" :size="14" />
        </el-icon>
        <el-tag v-else-if="state.requirementImportDocumentText.value" size="small" type="success">
          已解析
        </el-tag>
      </div>

      <!-- 文档预览 -->
      <div v-if="state.requirementImportDocumentText.value" class="requirement-import__preview">
        <div class="requirement-import__preview-header">
          <span>文档内容预览</span>
          <el-tag size="small" type="info">
            {{ state.requirementImportDocumentText.value.length }} 字符
          </el-tag>
        </div>
        <el-input
          type="textarea"
          :rows="8"
          :model-value="previewText"
          readonly
          resize="none"
        />
      </div>
    </div>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button
        type="primary"
        :loading="state.requirementImportAiRunning.value"
        :disabled="!state.requirementImportDocumentText.value || state.requirementImportParsing.value"
        @click="state.runRequirementImportAi()"
      >
        {{ state.requirementImportAiRunning.value ? 'AI 正在生成...' : '开始 AI 导入' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import NavIcon from '@/components/NavIcon.vue'
import type { DevState } from './useDevState'

const props = defineProps<{
  state: DevState
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const fileInput = ref<HTMLInputElement | null>(null)
const isDragOver = ref(false)

const previewText = computed(() => {
  const text = props.state.requirementImportDocumentText.value
  if (!text) return ''
  const maxPreview = 2000
  return text.length > maxPreview
    ? `${text.slice(0, maxPreview)}\n\n... (共 ${text.length} 字符，已截断预览)`
    : text
})

function handleFileChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    void props.state.handleRequirementFileSelected(file)
  }
  // 重置 input 以便再次选择同一文件
  input.value = ''
}

function handleDrop(event: DragEvent): void {
  isDragOver.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) {
    void props.state.handleRequirementFileSelected(file)
  }
}

function handleClose(): void {
  props.state.closeRequirementImportDialog()
}
</script>

<style scoped>
.requirement-import {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.requirement-import__upload {
  border: 2px dashed var(--el-border-color);
  border-radius: 8px;
  padding: 24px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s, background-color 0.2s;
}

.requirement-import__upload:hover,
.requirement-import__upload--dragover {
  border-color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
}

.requirement-import__upload-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-regular);
}

.requirement-import__upload-text {
  margin: 0;
  font-size: 14px;
}

.requirement-import__upload-hint {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.requirement-import__file-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  font-size: 13px;
}

.requirement-import__filename {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.requirement-import__preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.requirement-import__preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-regular);
}
</style>
