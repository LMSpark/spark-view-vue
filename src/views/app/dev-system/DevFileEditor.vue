<!--
@module app:views/app/dev-system/DevFileEditor
职责：提供 DevSystem 的 DevFileEditor 能力，围绕 模块入口、副作用注册或内部组合逻辑 支撑配置调试、节点编辑、预览或开发态状态管理。
边界：只服务开发系统 UI 和调试流程，不作为运行中页面配置真源，也不绕过 ProjectWorkspace 保存链路。
AI用途：需要理解开发系统如何编辑节点和文件时，用本模块定位 views/app/dev-system/DevFileEditor。
-->
<template>
  <div class="dev-file-editor">
    <template v-if="state.activePageId.value">
      <div class="file-header">
        <div class="file-header__meta">
          <span class="file-page-id"><NavIcon name="Tickets" :size="14" /> {{ state.activePageId.value }}</span>
          <el-tag v-if="resolvedActiveFile === 'pagedata.json' && state.pageDataError.value" size="small" type="danger" effect="dark">DataSet 解析失败</el-tag>
        </div>
        <div class="file-header__actions">
          <el-tooltip content="从服务端重新加载此文件" placement="bottom" :show-after="600">
            <el-button size="small" :disabled="!state.activePageId.value" @click="refreshFile">
              <NavIcon name="Refresh" :size="14" />
            </el-button>
          </el-tooltip>
          <el-tooltip content="保存当前文件到服务端" placement="bottom" :show-after="600">
            <el-button
              type="primary"
              size="small"
              :disabled="!fileEditor.isDirty.value"
              :loading="state.pageIoBusy.value"
              @click="saveFile"
            >
              <NavIcon name="DocumentChecked" :size="14" /> 保存
            </el-button>
          </el-tooltip>
          <span v-if="resolvedActiveFile === 'pagedata.json'" class="action-divider" />
          <el-button-group v-if="resolvedActiveFile === 'pagedata.json'" class="action-group">
            <el-tooltip content="结构合法时进入 DataSet 可视化设计器" placement="bottom" :show-after="600">
              <el-button size="small" :type="pageDataViewMode === 'visual' ? 'primary' : 'default'" :disabled="Boolean(state.pageDataError.value)" @click="setPageDataViewMode('visual')">
                <NavIcon name="Coin" :size="14" /> 可视化
              </el-button>
            </el-tooltip>
            <el-tooltip content="直接编辑 pagedata.json 原始文本" placement="bottom" :show-after="600">
              <el-button size="small" :type="pageDataViewMode === 'text' ? 'primary' : 'default'" @click="setPageDataViewMode('text')">
                <NavIcon name="Document" :size="14" /> 文本
              </el-button>
            </el-tooltip>
          </el-button-group>
          <span class="action-divider" />
          <el-button
            size="small"
            :type="showVersionPanel ? 'primary' : 'default'"
            :disabled="!state.activePageId.value"
            @click="toggleVersionPanel"
          >
            <NavIcon name="Clock" :size="14" /> 版本
          </el-button>
        </div>
      </div>

      <el-tabs v-if="showTabs" v-model="localActiveFile" type="card" class="file-tab-bar">
        <el-tab-pane v-for="f in props.state.pageFileNames" :key="f" :name="f">
          <template #label>
            <span class="file-tab-label" :class="{ 'file-dirty': fileEditor.isFileDirty(f) }">
              <NavIcon :name="fileIcon(f)" :size="13" /> {{ f }}
            </span>
          </template>
        </el-tab-pane>
      </el-tabs>

      <div class="editor-body" v-loading="!fileEditor.isReady.value">
        <div v-if="resolvedActiveFile === 'pagedata.json'" class="editor-area" :class="{ 'editor-area--dataset': pageDataViewMode === 'visual' }">
          <DevDataSetDesigner
            v-if="pageDataViewMode === 'visual'"
            :state="state"
            class="code-input editor-dataset"
          />
          <el-input
            v-else
            :model-value="fileEditor.text.value"
            type="textarea"
            resize="none"
            readonly
            class="code-input code-input--pagedata-text"
          />
        </div>

        <div v-else class="editor-area">
          <JsonTreeEditor
            v-if="resolvedActiveFile === 'rule.json'"
            type="json-tree-editor"
            :model-value="fileEditor.text.value"
            :policy="rulePolicy"
            :schema="RULE_JSON_SCHEMA"
            class="code-input code-input--json"
            height="100%"
            @update:model-value="(val: unknown) => state.project.writePageFile({ fileName: 'rule.json', text: String(val) })"
          />
          <SparkCodeEditor
            v-else-if="isCodeFile(resolvedActiveFile)"
            :model-value="fileEditor.text.value"
            :language="resolveCodeLanguage(resolvedActiveFile)"
            readonly
            class="code-input code-input--code"
            height="100%"
          />
          <el-input
            v-else
            :model-value="fileEditor.text.value"
            type="textarea"
            :autosize="{ minRows: 30, maxRows: 60 }"
            readonly
            class="code-input"
          />
        </div>

        <!-- ── 版本侧栏（内联） ── -->
        <transition name="slide-version">
          <div v-if="showVersionPanel" class="version-side">
            <div class="vs-header">
              <span class="vs-title">版本历史</span>
              <el-button size="small" type="primary" :loading="creatingVersion" @click="createVersion">
                <NavIcon name="Plus" :size="12" /> 存档
              </el-button>
            </div>
            <div class="vs-file">{{ resolvedActiveFile }}</div>
            <div v-loading="remoteVersionLoading" class="vs-list">
              <div v-if="remotePageVersions.length === 0 && !remoteVersionLoading" class="vs-empty">暂无版本</div>
              <div v-for="v in remotePageVersions" :key="v.version" class="vs-row" :class="{ 'vs-row--current': v.isCurrent }">
                <span class="version-badge">v{{ v.version }}</span>
                <span class="vs-time">{{ formatVersionTime(v.createdAt) }}</span>
                <el-tag v-if="v.isCurrent" size="small" type="success" effect="plain" round>当前</el-tag>
                <span class="vs-spacer" />
                <el-button v-if="!v.isCurrent" size="small" type="primary" text :loading="restoringVersion === v.version" @click="restoreVersion(v.version)">恢复</el-button>
                <el-button v-if="!v.isCurrent" size="small" type="danger" text @click="confirmDeleteVersion(v)"><NavIcon name="Delete" :size="12" /></el-button>
              </div>
            </div>
          </div>
        </transition>
      </div>
    </template>
    <el-empty v-else description="请从左侧树中选择一个配置页面开始编辑" class="empty-hint" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { SparkCodeEditor, JsonTreeEditor } from '@spark-appworks/spark-component'
import { createRuleJsonSchema, createRuleTreePolicy } from '@/services/project-model-artifacts'
import { ElMessageBox } from 'element-plus'
import { useDevFileEditor } from './composables/useDevFileEditor'
import type { DevState } from './useDevState'
import type { PageNodeFileName, PageNodeFileVersionSummary } from '@spark-appworks/spark-project-model'
import NavIcon from '@/components/NavIcon.vue'
import DevDataSetDesigner from './DevDataSetDesigner.vue'

const rulePolicy = createRuleTreePolicy()
const RULE_JSON_SCHEMA = createRuleJsonSchema()

const props = withDefaults(defineProps<{
  state: DevState
  activeFile?: PageNodeFileName
  showTabs?: boolean
}>(), {
  showTabs: true,
})

const emit = defineEmits<{
  (e: 'active-file-change', file: PageNodeFileName): void
}>()

const localActiveFile = ref<PageNodeFileName>('rule.json')
const showVersionPanel = ref(false)
const remoteVersionLoading = ref(false)
const restoringVersion = ref<number | null>(null)
const creatingVersion = ref(false)
const remotePageVersions = ref<PageNodeFileVersionSummary[]>([])
const pageDataViewMode = ref<'visual' | 'text'>('visual')
const pageDataViewModePinned = ref(false)
const resolvedActiveFile = computed<PageNodeFileName>(() => props.activeFile ?? localActiveFile.value)
const showTabs = computed(() => props.showTabs)
const fileEditor = useDevFileEditor(props.state, resolvedActiveFile)
const host = computed(() => props.state.editor)
const project = computed(() => props.state.project)

function alignActivePage(): boolean {
  const pageId = props.state.activePageId.value.trim()
  if (!pageId) return false
  if (project.value.getActivePage()?.pageId !== pageId) {
    project.value.setActivePage(pageId)
  }
  return true
}

watch(() => props.activeFile, (nextFile) => {
  if (nextFile && nextFile !== localActiveFile.value) {
    localActiveFile.value = nextFile
  }
}, { immediate: true })

watch(resolvedActiveFile, (nextFile) => {
  emit('active-file-change', nextFile)
}, { immediate: true })

watch(() => props.state.activePageId.value, () => {
  showVersionPanel.value = false
  remotePageVersions.value = []
})

watch([resolvedActiveFile, () => props.state.activePageId.value], () => {
  if (resolvedActiveFile.value !== 'pagedata.json') return
  resetPageDataViewMode()
}, { immediate: true })

watch(() => props.state.pageDataError.value, (nextError) => {
  if (resolvedActiveFile.value !== 'pagedata.json') return
  if (nextError) {
    pageDataViewMode.value = 'text'
    pageDataViewModePinned.value = false
    return
  }
  if (!pageDataViewModePinned.value) {
    pageDataViewMode.value = 'visual'
  }
})

function isCodeFile(name: string): boolean {
  return name.endsWith('.js') || name.endsWith('.css')
}

function resolveCodeLanguage(name: string): 'javascript' | 'css' {
  return name.endsWith('.css') ? 'css' : 'javascript'
}

function fileIcon(name: string): string {
  if (name === 'rule.json') return 'Crop'
  if (name === 'pagedata.json') return 'Coin'
  if (name === 'script.js') return 'Lightning'
  if (name === 'style.css') return 'Brush'
  return 'Document'
}

function resetPageDataViewMode() {
  pageDataViewModePinned.value = false
  pageDataViewMode.value = props.state.pageDataError.value ? 'text' : 'visual'
}

function setPageDataViewMode(mode: 'visual' | 'text') {
  pageDataViewModePinned.value = true
  pageDataViewMode.value = mode
}

function saveFile() {
  void fileEditor.save()
}

function refreshFile() {
  void fileEditor.refresh()
}

async function loadVersions() {
  if (!alignActivePage()) return
  remoteVersionLoading.value = true
  try {
    remotePageVersions.value = await host.value.listRemotePageVersions(resolvedActiveFile.value)
  } catch (e) {
    props.state.addStatus(`读取后端版本失败: ${String(e)}`, 'error')
    remotePageVersions.value = []
  } finally {
    remoteVersionLoading.value = false
  }
}

function toggleVersionPanel() {
  showVersionPanel.value = !showVersionPanel.value
  if (showVersionPanel.value) {
    void loadVersions()
  }
}

async function restoreVersion(version: number) {
  const pageId = props.state.activePageId.value
  if (!pageId || !alignActivePage()) return
  restoringVersion.value = version
  try {
    await host.value.restoreRemotePageVersion(version, resolvedActiveFile.value)
    props.state.addStatus(`页面 ${pageId} 已将 ${resolvedActiveFile.value} 版本 v${version} 恢复为当前版`, 'success')
    await loadVersions()
  } catch (e) {
    props.state.addStatus(`恢复版本失败: ${String(e)}`, 'error')
  } finally {
    restoringVersion.value = null
  }
}

async function createVersion() {
  if (!alignActivePage()) return
  creatingVersion.value = true
  try {
    await fileEditor.save()
    await host.value.createRemotePageVersion(resolvedActiveFile.value)
    props.state.addStatus(`${resolvedActiveFile.value} 已创建新版本快照`, 'success')
    await loadVersions()
  } catch (e) {
    props.state.addStatus(`创建版本快照失败: ${String(e)}`, 'error')
  } finally {
    creatingVersion.value = false
  }
}

async function confirmDeleteVersion(row: PageNodeFileVersionSummary) {
  try {
    await ElMessageBox.confirm(
      `确定删除版本 v${row.version} 吗？此操作不可撤销。`,
      '删除版本',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  if (!alignActivePage()) return
  try {
    await host.value.deleteRemotePageVersion(row.version, resolvedActiveFile.value)
    props.state.addStatus(`${resolvedActiveFile.value} 版本 v${row.version} 已删除`, 'success')
    await loadVersions()
  } catch (e) {
    props.state.addStatus(`删除版本失败: ${String(e)}`, 'error')
  }
}

function formatVersionTime(raw: string | null | undefined): string {
  if (!raw) return '-'
  try {
    const d = new Date(raw)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  } catch {
    return raw
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

/* ── Header ─────────────────────────────────────── */
.file-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
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
  gap: 6px;
}

.action-group {
  display: inline-flex;
}

.action-divider {
  display: inline-block;
  width: 1px;
  height: 20px;
  background: var(--el-border-color-lighter);
  margin: 0 2px;
  flex-shrink: 0;
}

.file-page-id {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-color-primary);
}

/* ── Tabs ────────────────────────────────────────── */
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

/* ── Editor Body (flex row) ──────────────────── */
.editor-body {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

/* ── Editor ────────────────────────────────── */
.editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  padding: 8px 12px 12px;
}

.editor-area--dataset {
  padding: 0;
  background: #f8fafc;
}

.editor-dataset {
  min-width: 0;
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

.code-input--pagedata-text :deep(.el-textarea),
.code-input--pagedata-text :deep(.el-textarea__inner) {
  height: 100%;
  min-height: 100%;
}

.code-input--pagedata-text :deep(.el-textarea__inner) {
  resize: none;
  border-radius: 8px;
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
  content: ' \2022';
}

/* ── Version Side Panel ───────────────────── */
.version-side {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
  overflow: hidden;
}

.vs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color-extra-light);
  flex-shrink: 0;
}

.vs-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.vs-file {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  padding: 4px 12px;
  flex-shrink: 0;
}

.vs-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 8px;
}

.vs-empty {
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  padding: 24px 0;
}

.vs-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 4px;
  font-size: 12px;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}

.vs-row--current {
  background: var(--el-color-success-light-9);
  border-radius: 4px;
}

.vs-time {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.vs-spacer {
  flex: 1;
}

.version-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

/* slide transition */
.slide-version-enter-active,
.slide-version-leave-active {
  transition: width 0.25s ease, opacity 0.25s ease;
  overflow: hidden;
}

.slide-version-enter-from,
.slide-version-leave-to {
  width: 0;
  opacity: 0;
}

.empty-hint {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
