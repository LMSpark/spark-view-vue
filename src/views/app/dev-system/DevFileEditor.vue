<template>
  <div class="dev-file-editor">
    <template v-if="state.activePageId.value">
      <div class="file-header">
        <div class="file-header__meta">
          <span class="file-page-id"><NavIcon name="Tickets" :size="14" /> {{ state.activePageId.value }}</span>
          <el-tag v-if="state.pageBackendVersion.value !== null" size="small" type="success">后端版 v{{ state.pageBackendVersion.value }}</el-tag>
          <el-tag v-if="state.getFileSnapshotCount(resolvedActiveFile) > 0" size="small" type="info">快照 {{ state.getFileSnapshotCount(resolvedActiveFile) }}</el-tag>
          <el-tag v-if="resolvedActiveFile === 'pagedata.json' && state.pageDataSetError.value" size="small" type="danger">DataSet 解析失败</el-tag>
        </div>
        <div class="file-header__actions">
          <el-select
            v-if="resolvedActiveFile === 'pagedata.json'"
            :model-value="pageDataEditorMode"
            size="small"
            style="width: 140px"
            @update:model-value="handlePageDataEditorModeChange"
          >
            <el-option label="对象" value="tree" :disabled="!pageDataObjectEditorAvailable" />
            <el-option label="表格" value="table" :disabled="!pageDataObjectEditorAvailable" />
            <el-option label="源码" value="text" />
          </el-select>
          <el-button size="small" :disabled="!canUndoActiveFile()" @click="undoActiveFile">撤销</el-button>
          <el-button size="small" :disabled="!canRedoActiveFile()" @click="redoActiveFile">重做</el-button>
          <el-button size="small" :disabled="!state.activePageId.value" @click="openRemoteVersionHistory(resolvedActiveFile)">
            <NavIcon name="Collection" :size="14" /> 后端版本
          </el-button>
          <el-button
            v-if="state.fileDirty[resolvedActiveFile]"
            size="small"
            type="primary"
            :loading="state.fileSaving.value"
            @click="saveActiveFile"
          >
            <NavIcon name="DocumentChecked" :size="14" /> 保存当前
          </el-button>
          <el-button
            v-if="state.hasAnyFileDirty.value"
            size="small"
            :loading="state.fileSaving.value"
            @click="saveAllFiles"
          >
            <NavIcon name="FolderChecked" :size="14" /> 保存全部
          </el-button>
          <el-button size="small" @click="refreshActiveFile"><NavIcon name="Refresh" :size="14" /> 刷新当前</el-button>
        </div>
      </div>

      <div v-if="resolvedActiveFile === 'pagedata.json' && pageDataEditorMode === 'table'" class="file-notice">
        结构化模式支持树表、Schema 提示和过滤；源码模式适合精确调整 canonical JSON。
      </div>

      <el-tabs v-if="showTabs" v-model="localActiveFile" type="card" class="file-tab-bar">
        <el-tab-pane v-for="f in PAGE_FILE_NAMES" :key="f" :name="f">
          <template #label>
            <span class="file-tab-label" :class="{ 'file-dirty': state.fileDirty[f] }">
              <NavIcon :name="fileIcon(f)" :size="13" /> {{ f }}
            </span>
          </template>
        </el-tab-pane>
      </el-tabs>

      <div class="editor-area" v-loading="!state.fileLoaded.value">
        <PageDataVxeTreeEditor
          v-if="resolvedActiveFile === 'pagedata.json' && pageDataEditorMode !== 'text'"
          :model-value="state.editFiles[resolvedActiveFile] ?? ''"
          :document-value="state.pageDataDocument.value as Record<string, unknown> | null"
          class="code-input code-input--json"
          height="100%"
          :schema="PAGE_DATA_JSON_SCHEMA"
          @update:document-value="handleActivePageDataDocumentChange"
        />
        <SparkJsonEditor
          v-else-if="isJsonFile(resolvedActiveFile)"
          :model-value="state.editFiles[resolvedActiveFile] ?? ''"
          class="code-input code-input--json"
          height="100%"
          mode="text"
          :schema="resolvedActiveFile === 'pagedata.json' ? PAGE_DATA_JSON_SCHEMA : null"
          :enable-schema-validation="resolvedActiveFile === 'pagedata.json'"
          :enable-schema-enum-renderer="resolvedActiveFile === 'pagedata.json'"
          @update:model-value="handleActiveFileChange"
        />
        <SparkCodeEditor
          v-else-if="isCodeFile(resolvedActiveFile)"
          :model-value="state.editFiles[resolvedActiveFile] ?? ''"
          :language="resolveCodeLanguage(resolvedActiveFile)"
          class="code-input code-input--code"
          height="100%"
          @update:model-value="handleActiveFileChange"
        />
        <el-input
          v-else
          :model-value="state.editFiles[resolvedActiveFile]"
          type="textarea"
          :autosize="{ minRows: 30, maxRows: 60 }"
          class="code-input"
          @update:model-value="handleActiveFileChange"
        />
      </div>

      <el-dialog v-model="showRemoteVersionHistory" :title="`${remoteVersionTargetFile} 后端版本`" width="1120px" top="6vh">
        <el-empty
          v-if="!remoteVersionLoading && remotePageVersions.length === 0"
          description="当前页面还没有后端版本"
        />
        <div v-else class="remote-version-browser" v-loading="remoteVersionLoading">
          <div class="remote-version-browser__list">
            <el-table
              :data="remotePageVersions"
              size="small"
              border
              highlight-current-row
              height="460"
              @row-click="handleRemoteVersionRowClick"
            >
              <el-table-column prop="version" label="版本" width="80" />
              <el-table-column label="时间" width="180">
                <template #default="scope">
                  {{ formatHistoryTime(scope.row.updatedAt) }}
                </template>
              </el-table-column>
              <el-table-column label="变更文件" min-width="180">
                <template #default="scope">
                  {{ formatChangedFiles(scope.row.changedFiles) }}
                </template>
              </el-table-column>
              <el-table-column label="状态" width="160">
                <template #default="scope">
                  <div class="remote-version-status">
                    <el-tag v-if="scope.row.current" size="small" type="success">当前版</el-tag>
                    <el-tag v-if="scope.row.restoredFromVersion !== null" size="small" type="warning">
                      恢复自 v{{ scope.row.restoredFromVersion }}
                    </el-tag>
                  </div>
                </template>
              </el-table-column>
            </el-table>
          </div>
          <div class="remote-version-browser__preview" v-loading="remoteVersionPreviewLoading">
            <div v-if="remoteVersionPreview" class="remote-version-browser__preview-meta">
              <el-tag size="small" type="info">浏览版本 v{{ remoteVersionPreview.version }}</el-tag>
              <el-tag v-if="remoteVersionPreview.current" size="small" type="success">当前版</el-tag>
              <el-tag v-if="remoteVersionPreview.restoredFromVersion !== null" size="small" type="warning">
                恢复自 v{{ remoteVersionPreview.restoredFromVersion }}
              </el-tag>
              <span class="remote-version-browser__preview-time">{{ formatHistoryTime(remoteVersionPreview.updatedAt) }}</span>
            </div>
            <el-empty
              v-if="!remoteVersionPreview && !remoteVersionPreviewLoading"
              description="选择左侧版本后可浏览当前文件内容"
            />
            <SparkJsonEditor
              v-else-if="isJsonFile(remoteVersionTargetFile)"
              :model-value="remoteVersionPreviewContent"
              class="code-input code-input--json"
              height="460px"
              mode="text"
              :schema="remoteVersionTargetFile === 'pagedata.json' ? PAGE_DATA_JSON_SCHEMA : null"
              :enable-schema-validation="false"
              :enable-schema-enum-renderer="false"
              read-only
            />
            <SparkCodeEditor
              v-else
              :model-value="remoteVersionPreviewContent"
              :language="resolveCodeLanguage(remoteVersionTargetFile)"
              class="code-input code-input--code"
              height="460px"
              :read-only="true"
            />
          </div>
        </div>
        <template #footer>
          <el-button @click="showRemoteVersionHistory = false">关闭</el-button>
          <el-button
            type="primary"
            :disabled="!canRestoreRemoteVersion"
            :loading="restoringRemoteVersion"
            @click="restoreSelectedRemoteVersion"
          >设为当前版</el-button>
        </template>
      </el-dialog>
    </template>
    <el-empty v-else description="请从左侧树中选择一个配置页面开始编辑" class="empty-hint" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { SparkCodeEditor, SparkJsonEditor } from '@spark-view/spark-component'
import PageDataVxeTreeEditor from './components/PageDataVxeTreeEditor.vue'
import { PAGE_FILE_NAMES } from './useDevState'
import type { BackendPageVersionFile, BackendPageVersionSummary, DevState, PageFileName } from './useDevState'
import { canonicalizePageDataJson, PAGE_DATA_JSON_SCHEMA } from './pageDataJsonSchema'
import { usePageDataEditorMode } from './composables/usePageDataEditorMode'
import NavIcon from '@/components/NavIcon.vue'

const props = defineProps<{
  state: DevState
  activeFile?: PageFileName
  showTabs?: boolean
}>()

const localActiveFile = ref<PageFileName>('rule.json')
const showRemoteVersionHistory = ref(false)
const remoteVersionLoading = ref(false)
const remoteVersionPreviewLoading = ref(false)
const restoringRemoteVersion = ref(false)
const remoteVersionTargetFile = ref<PageFileName>('rule.json')
const remotePageVersions = ref<BackendPageVersionSummary[]>([])
const remoteVersionPreview = ref<BackendPageVersionFile | null>(null)
const selectedRemoteVersion = ref<number | null>(null)
const resolvedActiveFile = computed<PageFileName>(() => props.activeFile ?? localActiveFile.value)
const showTabs = computed(() => props.showTabs ?? true)
const remoteVersionPreviewContent = computed(() => remoteVersionPreview.value?.content ?? '')
const canRestoreRemoteVersion = computed(() => {
  if (restoringRemoteVersion.value) return false
  const version = selectedRemoteVersion.value
  if (version === null) return false
  const matched = remotePageVersions.value.find((item) => item.version === version)
  return Boolean(matched) && !matched?.current
})

const {
  pageDataEditorMode,
  pageDataObjectEditorAvailable,
  handlePageDataEditorModeChange,
} = usePageDataEditorMode({
  getRawText: () => props.state.editFiles['pagedata.json'] ?? '',
  applyCanonicalText: (text) => {
    props.state.updatePageFile('pagedata.json', text)
  },
})

watch(() => props.activeFile, (nextFile) => {
  if (nextFile && nextFile !== localActiveFile.value) {
    localActiveFile.value = nextFile
  }
}, { immediate: true })

watch(() => props.state.activePageId.value, () => {
  showRemoteVersionHistory.value = false
  remotePageVersions.value = []
  remoteVersionPreview.value = null
  selectedRemoteVersion.value = null
})

function isJsonFile(name: string): boolean {
  return name.endsWith('.json')
}

function isCodeFile(name: string): boolean {
  return name.endsWith('.js') || name.endsWith('.css')
}

function resolveCodeLanguage(name: string): 'javascript' | 'css' {
  return name.endsWith('.css') ? 'css' : 'javascript'
}

function handleActiveFileChange(value: string) {
  if (resolvedActiveFile.value === 'pagedata.json' && pageDataEditorMode.value !== 'text') {
    props.state.updatePageFile(resolvedActiveFile.value, canonicalizePageDataJson(value).text)
    return
  }

  props.state.updatePageFile(resolvedActiveFile.value, value)
}

function handleActivePageDataDocumentChange(value: Record<string, unknown>) {
  props.state.updatePageDataDocument(value)
}

function fileIcon(name: string): string {
  if (name === 'rule.json') return 'Crop'
  if (name === 'pagedata.json') return 'Coin'
  if (name === 'script.js') return 'Lightning'
  if (name === 'style.css') return 'Brush'
  return 'Document'
}

function saveActiveFile() {
  void props.state.saveByTab(resolvedActiveFile.value)
}

function saveAllFiles() {
  void props.state.savePageFiles()
}

function refreshActiveFile() {
  void props.state.refreshByTab(resolvedActiveFile.value)
}

function canUndoActiveFile(): boolean {
  return props.state.canUndoFileSnapshot(resolvedActiveFile.value)
}

function canRedoActiveFile(): boolean {
  return props.state.canRedoFileSnapshot(resolvedActiveFile.value)
}

function undoActiveFile() {
  props.state.undoFileSnapshot(resolvedActiveFile.value)
}

function redoActiveFile() {
  props.state.redoFileSnapshot(resolvedActiveFile.value)
}

function formatHistoryTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '-'
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
}

function formatChangedFiles(files: string[]): string {
  return files.length > 0 ? files.join(', ') : '-'
}

async function loadRemoteVersionPreview(version: number) {
  selectedRemoteVersion.value = version
  remoteVersionPreviewLoading.value = true
  try {
    remoteVersionPreview.value = await props.state.readRemotePageVersionFile(version, remoteVersionTargetFile.value)
  } finally {
    remoteVersionPreviewLoading.value = false
  }
}

async function loadRemoteVersionHistory(fileName: PageFileName, preferredVersion?: number | null) {
  remoteVersionTargetFile.value = fileName
  remoteVersionLoading.value = true
  remoteVersionPreview.value = null
  selectedRemoteVersion.value = null
  try {
    const versions = await props.state.listRemotePageVersions()
    remotePageVersions.value = versions
    const targetVersion = preferredVersion
      ?? versions.find((item) => item.current)?.version
      ?? versions[0]?.version
      ?? null
    if (targetVersion !== null) {
      await loadRemoteVersionPreview(targetVersion)
    }
  } finally {
    remoteVersionLoading.value = false
  }
}

function openRemoteVersionHistory(fileName: PageFileName) {
  showRemoteVersionHistory.value = true
  void loadRemoteVersionHistory(fileName)
}

function handleRemoteVersionRowClick(row: BackendPageVersionSummary) {
  void loadRemoteVersionPreview(row.version)
}

async function restoreSelectedRemoteVersion() {
  const version = selectedRemoteVersion.value
  if (version === null) return

  restoringRemoteVersion.value = true
  try {
    if (await props.state.restoreRemotePageVersion(version)) {
      localActiveFile.value = remoteVersionTargetFile.value
      await loadRemoteVersionHistory(remoteVersionTargetFile.value)
    }
  } finally {
    restoringRemoteVersion.value = false
  }
}
</script>

<style scoped>
.dev-file-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.file-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  padding: 12px 12px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.file-header__meta,
.file-header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.file-header__meta {
  min-width: 0;
  flex: 1;
}

.file-header__actions {
  justify-content: flex-end;
}

.file-page-id {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-color-primary);
}

.file-notice {
  margin: 8px 12px 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-7);
  color: var(--el-color-primary-dark-2);
  font-size: 12px;
}

.file-tab-bar {
  padding: 0 12px;
  flex-shrink: 0;
}

.file-tab-bar :deep(.el-tabs__header) {
  margin: 0;
}

.file-tab-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  padding: 8px 12px 12px;
}

.code-input {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.code-input--json,
.code-input--code {
  min-height: 0;
}

.code-input :deep(textarea) {
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
}

.file-dirty {
  color: var(--el-color-warning);
  font-weight: 600;
}

.file-dirty::after {
  content: ' •';
}

.remote-version-browser {
  display: grid;
  grid-template-columns: 420px minmax(0, 1fr);
  gap: 12px;
  min-height: 460px;
}

.remote-version-browser__list,
.remote-version-browser__preview {
  min-width: 0;
}

.remote-version-browser__preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.remote-version-browser__preview-meta,
.remote-version-status {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.remote-version-browser__preview-time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.empty-hint {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

@media (max-width: 1280px) {
  .remote-version-browser {
    grid-template-columns: 1fr;
  }
}
</style>
