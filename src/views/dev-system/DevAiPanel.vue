<template>
  <div class="dev-ai-panel">
    <!-- AI 输入区 -->
    <div class="ai-section">
      <div class="ai-section__label">Page ID</div>
      <el-input
        v-model="pageId"
        placeholder="页面标识（如 order-list）"
        :disabled="loading"
        size="small"
        clearable
      />
    </div>

    <div class="ai-section">
      <div class="ai-section__label">提示词</div>
      <el-input
        v-model="prompt"
        type="textarea"
        :rows="4"
        placeholder="描述你想创建的页面..."
        :disabled="loading"
      />
    </div>

    <el-button
      type="primary"
      :loading="loading"
      style="width: 100%"
      size="default"
      @click="handleGenerate"
    >
      🚀 生成页面
    </el-button>

    <el-divider />

    <div class="ai-section">
      <div class="ai-section__label">反馈 / 追加需求</div>
      <el-input
        v-model="feedback"
        type="textarea"
        :rows="3"
        placeholder="描述需要改进的地方（留空则仅基于日志迭代）"
        :disabled="loading"
      />
    </div>

    <el-button
      type="warning"
      :loading="loading"
      :disabled="!hasFiles"
      style="width: 100%"
      size="default"
      @click="handleIterate"
    >
      🔄 迭代修改
    </el-button>

    <!-- AI 说明 -->
    <div v-if="explanation" class="ai-explanation">
      <div class="ai-section__label">AI 说明</div>
      <div class="ai-explanation__text">{{ explanation }}</div>
    </div>

    <!-- 操作按钮 -->
    <div class="ai-actions">
      <el-button size="small" @click="refreshFiles">📂 刷新文件</el-button>
      <el-button size="small" @click="refreshLogs">📋 刷新日志</el-button>
      <el-button
        size="small"
        type="success"
        :disabled="!hasFiles"
        @click="navigateToPage"
      >
        🔗 预览页面
      </el-button>
    </div>

    <!-- 文件预览 / 日志 -->
    <el-divider />
    <div class="ai-section__label">
      Session: <code class="session-code">{{ sessionId }}</code>
    </div>

    <el-tabs v-model="previewTab" type="border-card" class="ai-preview-tabs">
      <el-tab-pane label="📄 文件" name="files">
        <div v-if="Object.keys(files).length" class="ai-file-list">
          <div v-for="(content, name) in files" :key="name" class="ai-file-item">
            <div class="ai-file-name">{{ name }}</div>
            <pre class="ai-file-code">{{ content }}</pre>
          </div>
        </div>
        <div v-else class="ai-empty">生成后此处显示文件内容</div>
      </el-tab-pane>
      <el-tab-pane label="📋 日志" name="logs">
        <div v-if="logs.length" class="ai-log-list">
          <div v-for="(log, idx) in logs" :key="idx" class="ai-log-entry">
            <span class="ai-log-level">{{ formatLogLevel(log.level) }}</span>
            <span class="ai-log-time">{{ new Date(log.timestamp).toLocaleTimeString() }}</span>
            <span class="ai-log-msg">{{ log.message }}</span>
          </div>
        </div>
        <div v-else class="ai-empty">点击「刷新日志」查看</div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  getAILoop,
  readPageFiles,
  onPageConfigChange,
  type PageFiles,
  type LogSnapshot,
  type FileChangeEvent,
} from '@/services/ai-loop'
import type { DevState } from './useDevState'

const props = defineProps<{ state: DevState }>()
const router = useRouter()

const pageId = ref('my-page')
const prompt = ref('')
const feedback = ref('')
const loading = ref(false)
const files = ref<PageFiles>({})
const explanation = ref('')
const logs = ref<LogSnapshot[]>([])
const previewTab = ref('files')

const loop = computed(() => getAILoop())
const sessionId = computed(() => loop.value?.sessionId ?? '(未初始化)')
const hasFiles = computed(() => Object.keys(files.value).length > 0)

// 当选中节点有 pageId 时，自动同步到 AI 面板
watch(() => props.state.editForm.pageId, (val) => {
  if (val) pageId.value = val
})

// SSE 监听文件变更
let unsubSSE: (() => void) | null = null

onMounted(() => {
  unsubSSE = onPageConfigChange((event: FileChangeEvent) => {
    if (event.pageId === pageId.value) {
      props.state.addStatus(`文件变更: ${event.file}`, 'info')
      void refreshFiles()
      // 同步刷新工作区文件编辑器
      if (props.state.editForm.pageId === pageId.value) {
        void props.state.loadPageFiles(pageId.value)
      }
    }
  })
})

onUnmounted(() => { unsubSSE?.() })

async function handleGenerate() {
  if (!loop.value) {
    props.state.addStatus('AI Loop 未初始化，请确认 config.features.enableAI = true', 'error')
    return
  }
  if (!pageId.value.trim() || !prompt.value.trim()) {
    props.state.addStatus('请输入 Page ID 和提示词', 'warning')
    return
  }
  loading.value = true
  props.state.addStatus(`⏳ AI 生成中... pageId=${pageId.value}`, 'info')
  try {
    const resp = await loop.value.generate(pageId.value.trim(), prompt.value.trim())
    files.value = resp.files
    explanation.value = resp.explanation ?? ''
    props.state.addStatus(`✅ 生成完成，写入 ${Object.keys(resp.files).length} 个文件`, 'success')
    // 同步刷新工作区
    if (props.state.editForm.pageId === pageId.value.trim()) {
      void props.state.loadPageFiles(pageId.value.trim())
    }
    void props.state.loadPages()
  } catch (err) {
    props.state.addStatus(`❌ 生成失败: ${err instanceof Error ? err.message : String(err)}`, 'error')
  } finally {
    loading.value = false
  }
}

async function handleIterate() {
  if (!loop.value) {
    props.state.addStatus('AI Loop 未初始化', 'error')
    return
  }
  if (!pageId.value.trim()) {
    props.state.addStatus('请输入 Page ID', 'warning')
    return
  }
  loading.value = true
  props.state.addStatus(`⏳ AI 迭代中... feedback=${feedback.value || '(无)'}`, 'info')
  try {
    const resp = await loop.value.iterate(
      pageId.value.trim(),
      feedback.value.trim() || undefined,
    )
    files.value = resp.files
    explanation.value = resp.explanation ?? ''
    props.state.addStatus(`✅ 迭代完成，修改 ${Object.keys(resp.files).length} 个文件`, 'success')
    feedback.value = ''
    if (props.state.editForm.pageId === pageId.value.trim()) {
      void props.state.loadPageFiles(pageId.value.trim())
    }
  } catch (err) {
    props.state.addStatus(`❌ 迭代失败: ${err instanceof Error ? err.message : String(err)}`, 'error')
  } finally {
    loading.value = false
  }
}

async function refreshFiles() {
  if (!pageId.value.trim()) return
  try {
    files.value = await readPageFiles(pageId.value.trim())
    props.state.addStatus('📂 已刷新 AI 文件', 'info')
  } catch {
    props.state.addStatus('读取文件失败', 'error')
  }
}

function refreshLogs() {
  if (!loop.value) return
  logs.value = loop.value.collector.peek(pageId.value.trim() || undefined)
  props.state.addStatus(`📋 已刷新日志 (${logs.value.length} 条)`, 'info')
}

function navigateToPage() {
  if (!pageId.value.trim()) return
  void router.push(`/${pageId.value.trim()}`)
}

function formatLogLevel(level: string) {
  const map: Record<string, string> = { error: '🔴', warn: '🟡', info: '🔵', debug: '⚪' }
  return map[level] ?? '⚫'
}
</script>

<style scoped>
.dev-ai-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  height: 100%;
  overflow-y: auto;
}

.ai-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ai-section__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.ai-explanation {
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-7);
  border-radius: 6px;
  padding: 10px 12px;
}
.ai-explanation__text {
  font-size: 13px;
  color: var(--el-color-primary);
  line-height: 1.6;
  white-space: pre-wrap;
}

.ai-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.session-code {
  background: var(--el-fill-color-light);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  font-size: 11px;
}

.ai-preview-tabs {
  flex: 1;
  min-height: 200px;
}
.ai-preview-tabs :deep(.el-tabs__content) {
  max-height: 400px;
  overflow: auto;
}

.ai-file-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ai-file-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  padding: 4px 0;
}
.ai-file-code {
  margin: 0;
  padding: 8px;
  background: #1e1e1e;
  color: #d4d4d4;
  border-radius: 4px;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow: auto;
}

.ai-log-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ai-log-entry {
  display: flex;
  gap: 6px;
  font-size: 12px;
  font-family: monospace;
  padding: 2px 4px;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}
.ai-log-level { flex-shrink: 0; }
.ai-log-time { color: var(--el-text-color-placeholder); flex-shrink: 0; }
.ai-log-msg { color: var(--el-text-color-primary); word-break: break-word; }

.ai-empty {
  text-align: center;
  color: var(--el-text-color-placeholder);
  padding: 24px;
  font-size: 13px;
}
</style>
