<script setup lang="ts">
/**
 * AI Studio — 可视化 AI 页面配置闭环操作面板
 *
 * 功能：
 *   1. 输入 pageId + 提示词 → 调用 AI → 生成页面配置
 *   2. 查看 AI 返回的 4 文件内容（rule.json / pagedata.json / script.js / style.css）
 *   3. 查看日志收集结果
 *   4. 输入反馈 → 迭代修改
 *   5. 跳转到生成的页面预览
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  getAILoop,
  readPageFiles,
  onPageConfigChange,
  type PageFiles,
  type LogSnapshot,
  type FileChangeEvent,
} from '@/services/ai-loop'

// ─── 状态 ──────────────────────────────────────────────────────────────────

const router = useRouter()

const pageId = ref('my-page')
const prompt = ref('')
const feedback = ref('')
const activeFileTab = ref('rule.json')
const files = ref<PageFiles>({})
const explanation = ref('')
const loading = ref(false)
const logs = ref<LogSnapshot[]>([])
const statusMessages = ref<Array<{ text: string; type: 'success' | 'warning' | 'error' | 'info'; time: string }>>([])

const loop = computed(() => getAILoop())
const sessionId = computed(() => loop.value?.sessionId ?? '(未初始化)')

const fileTabList = ['rule.json', 'pagedata.json', 'script.js', 'style.css'] as const

const currentFileContent = computed(() => {
  const key = activeFileTab.value as keyof PageFiles
  return files.value[key] ?? ''
})

const hasFiles = computed(() => Object.keys(files.value).length > 0)

// ─── SSE 监听 ─────────────────────────────────────────────────────────────

let unsubSSE: (() => void) | null = null

onMounted(() => {
  unsubSSE = onPageConfigChange((event: FileChangeEvent) => {
    if (event.pageId === pageId.value) {
      addStatus(`文件变更: ${event.file}`, 'info')
      void refreshFiles()
    }
  })
})

onUnmounted(() => {
  unsubSSE?.()
})

// ─── 操作函数 ─────────────────────────────────────────────────────────────

function addStatus(text: string, type: 'success' | 'warning' | 'error' | 'info' = 'info') {
  const now = new Date()
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
  statusMessages.value.unshift({ text, type, time })
  if (statusMessages.value.length > 50) {
    statusMessages.value = statusMessages.value.slice(0, 50)
  }
}

async function handleGenerate() {
  if (!loop.value) {
    addStatus('AI Loop 未初始化，请确认 config.features.enableAI = true', 'error')
    return
  }
  if (!pageId.value.trim()) {
    addStatus('请输入 Page ID', 'warning')
    return
  }
  if (!prompt.value.trim()) {
    addStatus('请输入提示词', 'warning')
    return
  }
  loading.value = true
  addStatus(`⏳ 生成中... pageId=${pageId.value}`, 'info')
  try {
    const resp = await loop.value.generate(pageId.value.trim(), prompt.value.trim())
    files.value = resp.files
    explanation.value = resp.explanation ?? ''
    addStatus(`✅ 生成完成，写入 ${Object.keys(resp.files).length} 个文件`, 'success')
  } catch (err) {
    addStatus(`❌ 生成失败: ${err instanceof Error ? err.message : String(err)}`, 'error')
  } finally {
    loading.value = false
  }
}

async function handleIterate() {
  if (!loop.value) {
    addStatus('AI Loop 未初始化', 'error')
    return
  }
  if (!pageId.value.trim()) {
    addStatus('请输入 Page ID', 'warning')
    return
  }
  loading.value = true
  addStatus(`⏳ 迭代中... feedback=${feedback.value || '(无)'}`, 'info')
  try {
    const resp = await loop.value.iterate(
      pageId.value.trim(),
      feedback.value.trim() || undefined,
    )
    files.value = resp.files
    explanation.value = resp.explanation ?? ''
    addStatus(`✅ 迭代完成，修改 ${Object.keys(resp.files).length} 个文件`, 'success')
    feedback.value = ''
  } catch (err) {
    addStatus(`❌ 迭代失败: ${err instanceof Error ? err.message : String(err)}`, 'error')
  } finally {
    loading.value = false
  }
}

async function refreshFiles() {
  if (!pageId.value.trim()) return
  try {
    files.value = await readPageFiles(pageId.value.trim())
    addStatus('📂 已刷新文件内容', 'info')
  } catch {
    addStatus('读取文件失败', 'error')
  }
}

function refreshLogs() {
  if (!loop.value) return
  logs.value = loop.value.collector.peek(pageId.value.trim() || undefined)
  addStatus(`📋 已刷新日志 (${logs.value.length} 条)`, 'info')
}

function navigateToPage() {
  if (!pageId.value.trim()) return
  const target = `/${pageId.value.trim()}`
  // AI 新生成的页面路由尚未注册到当前 Vue Router 实例，
  // 需要整页跳转让应用重新加载 routes.json
  const resolved = router.resolve(target)
  if (resolved.matched.length > 0) {
    void router.push(target)
  } else {
    window.location.href = target
  }
}

function formatLogLevel(level: string) {
  const map: Record<string, string> = { error: '🔴', warn: '🟡', info: '🔵', debug: '⚪' }
  return map[level] ?? '⚫'
}
</script>

<template>
  <div class="ai-studio">
    <!-- 顶部标题栏 -->
    <div class="ai-studio__header">
      <div class="ai-studio__title">
        <span style="font-size: 20px; margin-right: 8px">🤖</span>
        <span>AI Studio</span>
      </div>
      <div class="ai-studio__session">
        Session: <code>{{ sessionId }}</code>
      </div>
    </div>

    <div class="ai-studio__body">
      <!-- 左栏：输入区 -->
      <div class="ai-studio__left">
        <!-- Page ID -->
        <div class="ai-studio__field">
          <label class="ai-studio__label">Page ID</label>
          <el-input
            v-model="pageId"
            placeholder="页面标识（如 order-list）"
            :disabled="loading"
            clearable
          />
        </div>

        <!-- 提示词 -->
        <div class="ai-studio__field">
          <label class="ai-studio__label">提示词</label>
          <el-input
            v-model="prompt"
            type="textarea"
            :rows="5"
            placeholder="描述你想创建的页面...&#10;例：创建一个订单管理页面，包含订单表格和订单详情"
            :disabled="loading"
          />
        </div>

        <!-- 生成按钮 -->
        <el-button
          type="primary"
          :loading="loading"
          style="width: 100%"
          @click="handleGenerate"
        >
          🚀 生成页面
        </el-button>

        <!-- 分隔线 -->
        <el-divider>迭代修改</el-divider>

        <!-- 反馈 -->
        <div class="ai-studio__field">
          <label class="ai-studio__label">反馈 / 追加需求</label>
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
          @click="handleIterate"
        >
          🔄 迭代修改
        </el-button>

        <!-- AI 说明 -->
        <div v-if="explanation" class="ai-studio__explanation">
          <div class="ai-studio__label">AI 说明</div>
          <div class="ai-studio__explanation-text">{{ explanation }}</div>
        </div>

        <!-- 操作按钮组 -->
        <div class="ai-studio__actions">
          <el-button size="small" @click="refreshFiles">📂 刷新文件</el-button>
          <el-button size="small" @click="refreshLogs">📋 刷新日志</el-button>
          <el-button
            size="small"
            type="success"
            :disabled="!hasFiles"
            @click="navigateToPage"
          >
            🔗 跳转到页面
          </el-button>
        </div>
      </div>

      <!-- 右栏：文件预览 + 日志 -->
      <div class="ai-studio__right">
        <!-- 文件标签页 -->
        <el-tabs v-model="activeFileTab" type="border-card" class="ai-studio__tabs">
          <el-tab-pane
            v-for="file in fileTabList"
            :key="file"
            :label="file"
            :name="file"
          />
          <el-tab-pane label="📋 日志" name="__logs__" />
        </el-tabs>

        <!-- 文件内容 -->
        <div v-if="activeFileTab !== '__logs__'" class="ai-studio__code-panel">
          <pre
            v-if="currentFileContent"
            class="ai-studio__code"
          >{{ currentFileContent }}</pre>
          <div v-else class="ai-studio__empty">
            暂无内容 — 点击「生成页面」开始
          </div>
        </div>

        <!-- 日志面板 -->
        <div v-else class="ai-studio__log-panel">
          <div v-if="logs.length === 0" class="ai-studio__empty">
            暂无日志 — 点击「刷新日志」查看
          </div>
          <div v-for="(log, idx) in logs" :key="idx" class="ai-studio__log-entry">
            <span class="ai-studio__log-level">{{ formatLogLevel(log.level) }}</span>
            <span class="ai-studio__log-time">{{
              new Date(log.timestamp).toLocaleTimeString()
            }}</span>
            <span class="ai-studio__log-msg">{{ log.message }}</span>
            <span v-if="log.meta" class="ai-studio__log-meta">{{
              JSON.stringify(log.meta)
            }}</span>
          </div>
        </div>

        <!-- 状态消息 -->
        <div class="ai-studio__status">
          <div class="ai-studio__label" style="margin-bottom: 4px">操作日志</div>
          <div
            v-for="(msg, idx) in statusMessages"
            :key="idx"
            class="ai-studio__status-entry"
            :class="`ai-studio__status-entry--${msg.type}`"
          >
            <span class="ai-studio__status-time">{{ msg.time }}</span>
            {{ msg.text }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-studio {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.ai-studio__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
}

.ai-studio__title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  display: flex;
  align-items: center;
}

.ai-studio__session {
  font-size: 12px;
  color: #909399;
}
.ai-studio__session code {
  background: #f0f2f5;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
}

.ai-studio__body {
  flex: 1;
  display: flex;
  gap: 16px;
  padding: 16px;
  overflow: hidden;
}

.ai-studio__left {
  width: 360px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

.ai-studio__right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
}

.ai-studio__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ai-studio__label {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
}

.ai-studio__explanation {
  background: #ecf5ff;
  border: 1px solid #b3d8ff;
  border-radius: 6px;
  padding: 10px 12px;
}
.ai-studio__explanation-text {
  font-size: 13px;
  color: #409eff;
  line-height: 1.6;
  white-space: pre-wrap;
}

.ai-studio__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.ai-studio__tabs {
  flex-shrink: 0;
}

.ai-studio__code-panel {
  flex: 1;
  overflow: auto;
  background: #1e1e1e;
  border-radius: 6px;
  min-height: 200px;
}

.ai-studio__code {
  margin: 0;
  padding: 16px;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: #d4d4d4;
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-studio__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #c0c4cc;
  font-size: 14px;
}

.ai-studio__log-panel {
  flex: 1;
  overflow-y: auto;
  background: #fafafa;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  padding: 8px;
  min-height: 200px;
}

.ai-studio__log-entry {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 3px 6px;
  font-size: 12px;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  border-bottom: 1px solid #f0f2f5;
}

.ai-studio__log-level {
  flex-shrink: 0;
}

.ai-studio__log-time {
  color: #909399;
  flex-shrink: 0;
}

.ai-studio__log-msg {
  color: #303133;
  word-break: break-word;
}

.ai-studio__log-meta {
  color: #909399;
  font-size: 11px;
  word-break: break-word;
}

.ai-studio__status {
  max-height: 150px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  padding: 8px 10px;
  flex-shrink: 0;
}

.ai-studio__status-entry {
  font-size: 12px;
  padding: 2px 0;
  color: #606266;
}
.ai-studio__status-entry--success { color: #67c23a; }
.ai-studio__status-entry--warning { color: #e6a23c; }
.ai-studio__status-entry--error   { color: #f56c6c; }
.ai-studio__status-entry--info    { color: #909399; }

.ai-studio__status-time {
  color: #c0c4cc;
  margin-right: 6px;
  font-family: monospace;
}
</style>
