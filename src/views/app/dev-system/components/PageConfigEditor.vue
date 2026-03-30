<template>
  <div v-loading="loading" class="page-config-editor">
    <div class="pce-header">
      <span class="pce-header__title">配置文件</span>
      <div class="pce-header__actions">
        <el-button size="small" type="primary" :loading="saving" :disabled="!hasChanges" @click="handleSave">
          保存
        </el-button>
        <el-button size="small" @click="loadFiles">重新加载</el-button>
      </div>
    </div>
    <el-tabs v-model="activeFile" type="card" class="pce-tabs">
      <el-tab-pane v-for="fname in FILE_NAMES" :key="fname" :label="fname" :name="fname">
        <SparkJsonEditor
          v-if="isJsonFile(fname)"
          :model-value="files[fname] ?? ''"
          class="pce-json-editor"
          height="420px"
          mode="text"
          @update:model-value="handleFileValueChange(fname, $event)"
        />
        <SparkCodeEditor
          v-else-if="isCodeFile(fname)"
          :model-value="files[fname] ?? ''"
          :language="resolveCodeLanguage(fname)"
          class="pce-code-editor"
          height="420px"
          @update:model-value="handleFileValueChange(fname, $event)"
        />
        <textarea
          v-else
          :value="files[fname]"
          class="pce-textarea"
          spellcheck="false"
          @input="handleFileInput(fname, $event)"
        />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { SparkCodeEditor, SparkJsonEditor } from '@spark-view/spark-component'

import { getPageApi } from '@/services/api-paths'
import { http } from '@/services/http'

const FILE_NAMES = ['rule.json', 'pagedata.json', 'script.js', 'style.css'] as const

const props = defineProps<{
  pageId: string
}>()

const activeFile = ref<string>('rule.json')
const files = reactive<Record<string, string>>({
  'rule.json': '', 'pagedata.json': '', 'script.js': '', 'style.css': '',
})
const dirty = reactive<Record<string, boolean>>({
  'rule.json': false, 'pagedata.json': false, 'script.js': false, 'style.css': false,
})
const loading = ref(false)
const saving = ref(false)

const hasChanges = computed(() => Object.values(dirty).some(Boolean))

function isJsonFile(fname: string): boolean {
  return fname.endsWith('.json')
}

function isCodeFile(fname: string): boolean {
  return fname.endsWith('.js') || fname.endsWith('.css')
}

function resolveCodeLanguage(fname: string): 'javascript' | 'css' {
  return fname.endsWith('.css') ? 'css' : 'javascript'
}

function handleFileValueChange(fname: string, value: string) {
  files[fname] = value
  dirty[fname] = true
}

function handleFileInput(fname: string, event: Event) {
  const target = event.target as HTMLTextAreaElement
  handleFileValueChange(fname, target.value)
}

async function loadFiles() {
  loading.value = true
  for (const fname of FILE_NAMES) {
    dirty[fname] = false
    files[fname] = ''
  }
  try {
    await Promise.all(FILE_NAMES.map(async (fname) => {
      try {
        const data = await http.get<Record<string, string>>(`${getPageApi()}/${encodeURIComponent(props.pageId)}/${fname}`)
        files[fname] = data['content'] ?? ''
      } catch { /* ignore single file failure */ }
    }))
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  if (!props.pageId) return
  saving.value = true
  try {
    const body: Record<string, string> = {}
    for (const fname of FILE_NAMES) body[fname] = files[fname] ?? ''
    await http.post(`${getPageApi()}/${encodeURIComponent(props.pageId)}/__batch`, body)
    for (const fname of FILE_NAMES) dirty[fname] = false
    ElMessage.success('配置文件已保存')
  } catch (e) {
    ElMessage.error(`保存失败: ${String(e)}`)
  } finally {
    saving.value = false
  }
}

watch(() => props.pageId, () => {
  if (props.pageId) void loadFiles()
}, { immediate: true })
</script>

<style scoped>
.page-config-editor {
  display: flex;
  flex-direction: column;
  min-height: 300px;
}

.pce-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.pce-header__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.pce-header__actions {
  display: flex;
  gap: 6px;
}

.pce-tabs :deep(.el-tabs__content) {
  padding: 0;
}

.pce-json-editor {
  min-height: 420px;
}

.pce-code-editor {
  min-height: 420px;
}

.pce-textarea {
  display: block;
  width: 100%;
  min-height: 300px;
  padding: 10px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.5;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  resize: vertical;
  tab-size: 2;
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-primary);
  box-sizing: border-box;
}

.pce-textarea:focus {
  outline: none;
  border-color: var(--el-color-primary);
}
</style>
