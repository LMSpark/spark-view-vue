<template>
  <div v-loading="loading" class="page-config-editor">
    <div class="pce-header">
      <span class="pce-header__title">配置文件</span>
      <div class="pce-header__actions">
        <el-select
          v-if="activeFile === 'pagedata.json'"
          :model-value="pageDataEditorMode"
          size="small"
          style="width: 140px"
          @update:model-value="handlePageDataEditorModeChange"
        >
          <el-option label="对象" value="tree" :disabled="!pageDataObjectEditorAvailable" />
          <el-option label="表格" value="table" :disabled="!pageDataObjectEditorAvailable" />
          <el-option label="源码" value="text" />
        </el-select>
        <span
          v-if="activeFile === 'pagedata.json' && pageDataEditorMode === 'table'"
          class="pce-header__hint"
        >
          结构化模式支持树表、Schema 提示和过滤
        </span>
        <el-button size="small" type="primary" :loading="saving" :disabled="!hasChanges" @click="handleSave">
          保存
        </el-button>
        <el-button size="small" @click="loadFiles">重新加载</el-button>
      </div>
    </div>
    <el-tabs v-model="activeFile" type="card" class="pce-tabs">
      <el-tab-pane v-for="fname in FILE_NAMES" :key="fname" :label="fname" :name="fname">
        <PageDataVxeTreeEditor
          v-if="fname === 'pagedata.json' && pageDataEditorMode !== 'text'"
          :model-value="files[fname] ?? ''"
          :document-value="pageDataDocument"
          class="pce-json-editor"
          height="420px"
          :schema="PAGE_DATA_JSON_SCHEMA"
          @update:document-value="handlePageDataDocumentChange"
        />
        <SparkJsonEditor
          v-else-if="isJsonFile(fname)"
          :model-value="files[fname] ?? ''"
          class="pce-json-editor"
          height="420px"
          mode="text"
          :schema="fname === 'pagedata.json' ? PAGE_DATA_JSON_SCHEMA : null"
          :enable-schema-validation="fname === 'pagedata.json'"
          :enable-schema-enum-renderer="fname === 'pagedata.json'"
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
import {
  canUseStructuredPageDataEditor,
  canonicalizePageDataJson,
  canonicalizePageDataValue,
  PAGE_DATA_JSON_SCHEMA,
} from '../pageDataJsonSchema'
import PageDataVxeTreeEditor from './PageDataVxeTreeEditor.vue'
import { usePageDataEditorMode } from '../composables/usePageDataEditorMode'

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
const pageDataDocument = ref<Record<string, unknown> | null>(null)

const hasChanges = computed(() => Object.values(dirty).some(Boolean))
const {
  pageDataEditorMode,
  pageDataObjectEditorAvailable,
  handlePageDataEditorModeChange,
} = usePageDataEditorMode({
  getRawText: () => files['pagedata.json'] ?? '',
  applyCanonicalText: (text) => {
    files['pagedata.json'] = text
    dirty['pagedata.json'] = true
  },
})

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
  if (fname === 'pagedata.json' && pageDataEditorMode.value !== 'text') {
    const canonicalPageData = canonicalizePageDataJson(value)
    files[fname] = canonicalPageData.text
    pageDataDocument.value = canonicalPageData.value
    dirty[fname] = true
    return
  }

  files[fname] = value
  if (fname === 'pagedata.json') {
    syncPageDataDocument(value)
  }
  dirty[fname] = true
}

function handlePageDataDocumentChange(value: Record<string, unknown>) {
  const canonicalPageData = canonicalizePageDataValue(value)
  files['pagedata.json'] = canonicalPageData.text
  pageDataDocument.value = canonicalPageData.value
  dirty['pagedata.json'] = true
}

function syncPageDataDocument(rawText: string) {
  if (!rawText.trim()) {
    pageDataDocument.value = null
    return
  }

  try {
    pageDataDocument.value = canonicalizePageDataJson(rawText).value
  } catch {
    pageDataDocument.value = null
  }
}

function handleFileInput(fname: string, event: Event) {
  const target = event.target as HTMLTextAreaElement
  handleFileValueChange(fname, target.value)
}

async function loadFiles() {
  loading.value = true
  pageDataDocument.value = null
  for (const fname of FILE_NAMES) {
    dirty[fname] = false
    files[fname] = ''
  }
  try {
    await Promise.all(FILE_NAMES.map(async (fname) => {
      try {
        const data = await http.get<Record<string, string>>(`${getPageApi()}/${encodeURIComponent(props.pageId)}/${fname}`)
        const content = data['content'] ?? ''
        files[fname] = fname === 'pagedata.json' && content.trim() && canUseStructuredPageDataEditor(content)
          ? canonicalizePageDataJson(content).text
          : content
        if (fname === 'pagedata.json') {
          syncPageDataDocument(files[fname])
        }
      } catch {
        if (fname === 'pagedata.json') {
          pageDataDocument.value = null
        }
      }
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
    for (const fname of FILE_NAMES) {
      if (fname === 'pagedata.json' && (files[fname] ?? '').trim()) {
        const canonicalPageData = canonicalizePageDataJson(files[fname] ?? '')
        body[fname] = canonicalPageData.text
        files[fname] = canonicalPageData.text
        pageDataDocument.value = canonicalPageData.value
        continue
      }
      body[fname] = files[fname] ?? ''
    }
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
  align-items: center;
}

.pce-header__hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
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
