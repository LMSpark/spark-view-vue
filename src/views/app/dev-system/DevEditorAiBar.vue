<template>
  <aside class="ai-assistant">
    <div class="ai-assistant__header">
      <span class="ai-assistant__title">AI 设计助手</span>
      <el-tag size="small" type="success" effect="plain">NEW</el-tag>
    </div>

    <div class="ai-assistant__tip">
      新增功能：聊天模式已接入细粒度编辑执行链路，支持文本/附件/语音输入后直接修改当前文件。
    </div>

    <el-radio-group v-model="mode" size="small" class="ai-assistant__mode">
      <el-radio-button label="edit">细粒度编辑</el-radio-button>
      <el-radio-button label="generate">整模生成</el-radio-button>
      <el-radio-button label="chat">聊天模式</el-radio-button>
      <el-radio-button v-if="isRuleFile" label="tool">直接工具</el-radio-button>
    </el-radio-group>

    <template v-if="mode !== 'chat' && mode !== 'tool'">
      <label class="ai-assistant__label">描述你的需求</label>
      <el-input
        v-model="requestText"
        type="textarea"
        :rows="5"
        resize="none"
        placeholder="例如：把 Orders 表新增 area 字段（string，标签 区域），并把 Customer.phone 改为可空字符串"
      />

      <el-button
        type="primary"
        :loading="loading"
        :disabled="!enabled"
        class="ai-assistant__submit"
        @click="handleApplyByMode"
      >
        {{ mode === 'edit' ? '应用细粒度编辑' : '应用整模生成' }}
      </el-button>

      <div v-if="suggestedContent" class="ai-assistant__result">
        <el-alert
          :title="`AI 已生成${mode === 'edit' ? '细粒度编辑' : '整模'}结果，点击应用覆盖当前文件`"
          type="success"
          :closable="false"
          show-icon
        />
        <div class="ai-assistant__result-actions">
          <el-button size="small" @click="showResultDialog = true">查看结果</el-button>
          <el-button size="small" type="primary" @click="applySuggestion">应用到当前文件</el-button>
        </div>
      </div>
    </template>

    <div v-else-if="mode === 'tool'" class="ai-assistant__tool-panel">
      <div class="ai-assistant__label">工具动作</div>
      <el-select
        v-model="toolAction"
        size="small"
        style="width:100%"
        @change="(v: string) => { toolParams = TOOL_PARAM_EXAMPLES[v] ?? '{}' }"
      >
        <el-option-group label="查询">
          <el-option v-for="a in TOOL_READ_ACTIONS" :key="a" :label="a" :value="a" />
        </el-option-group>
        <el-option-group label="变更">
          <el-option v-for="a in TOOL_WRITE_ACTIONS" :key="a" :label="a" :value="a" />
        </el-option-group>
      </el-select>

      <div class="ai-assistant__label" style="margin-top:4px">参数 (JSON)</div>
      <el-input
        v-model="toolParams"
        type="textarea"
        :rows="6"
        resize="none"
        placeholder="{}"
        class="ai-assistant__tool-params"
        spellcheck="false"
      />

      <el-button
        type="primary"
        size="small"
        :loading="loading"
        :disabled="!enabled"
        style="margin-top:6px"
        @click="execTool(toolAction, toolParams)"
      >执行</el-button>
    </div>

    <div v-else class="ai-assistant__chat-wrap">
      <AiChatWidget
        mode="multi"
        title="DataSet 聊天助手"
        placeholder="支持文本、附件、语音输入；可连续多轮对话"
        :compact="true"
        v-bind="isRuleFile ? { sender: ruleEditChatSender } : {}"
      />
    </div>

    <!-- Stills session panel: shared by edit + tool + chat for rule.json -->
    <template v-if="isRuleFile">
      <div class="ai-assistant__label">
        会话：
        <el-tag size="small" :type="ruleReady ? 'success' : 'info'" effect="plain">
          {{ ruleReady ? '已就绪' : '未初始化' }}
        </el-tag>
        <el-tag v-if="ruleDirty" size="small" type="warning" effect="plain" style="margin-left:4px">有待应用</el-tag>
      </div>
      <div class="ai-assistant__tool-btns">
        <el-button
          v-if="ruleDirty"
          type="success"
          size="small"
          :loading="loading"
          @click="exportAndApply()"
        >导出并应用</el-button>
        <el-button
          v-if="ruleReady"
          size="small"
          :disabled="loading"
          @click="resetRuleEdit()"
        >重置会话</el-button>
      </div>
      <div v-if="ruleAiBuffer" class="ai-assistant__streaming">
        <div class="ai-assistant__label">💬 AI 思考中...</div>
        <div class="ai-assistant__streaming-text">{{ ruleAiBuffer }}</div>
      </div>
      <div v-if="ruleLog.length" class="ai-assistant__tool-log">
        <div v-for="(entry, i) in ruleLog" :key="i" :class="['ai-assistant__tool-log-entry', `is-${entry.type}`]">
          <span class="ai-assistant__tool-log-tag">{{ entry.tag }}</span>
          <pre class="ai-assistant__tool-log-body">{{ entry.text }}</pre>
        </div>
      </div>
    </template>

    <el-dialog v-model="showResultDialog" title="AI 生成结果" width="70%" append-to-body>
      <pre class="ai-assistant__code">{{ suggestedContent }}</pre>
      <template #footer>
        <el-button @click="showResultDialog = false">关闭</el-button>
        <el-button type="primary" @click="applySuggestion">应用到当前文件</el-button>
      </template>
    </el-dialog>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { getAILoop } from '@spark-view/spark-ai'
import type { PageFileName } from './useDevState'
import AiChatWidget from '@/components/AiChatWidget.vue'
import { runAiFileWriteback } from './composables/useAiFileWriteback'
import type { AiChatSender } from '@/composables/useAiChat'
import {
  useRuleEditSession,
  TOOL_READ_ACTIONS,
  TOOL_WRITE_ACTIONS,
  TOOL_PARAM_EXAMPLES,
} from './composables/useRuleEditSession'

interface Props {
  pageId: string
  fileName: string
  fileContent: string
  contextFiles?: Record<string, string>
  enabled?: boolean
}

type AiMode = 'edit' | 'generate' | 'chat' | 'tool'

const props = withDefaults(defineProps<Props>(), { enabled: true })

const emit = defineEmits<{
  (e: 'apply', content: string): void
  (e: 'status', message: string, type: 'success' | 'warning' | 'error'): void
}>()

const loop = computed(() => getAILoop())
const mode = ref<AiMode>('edit')
const wbLoading = ref(false)
const requestText = ref('')
const suggestedContent = ref('')
const showResultDialog = ref(false)

const isPageDataFile = computed(() => props.fileName === 'pagedata.json')
const isRuleFile = computed(() => props.fileName === 'rule.json')

// ── Rule edit session (tool layer) ────────────────────────────────
const {
  ready: ruleReady,
  dirty: ruleDirty,
  busy: ruleBusy,
  aiBuffer: ruleAiBuffer,
  log: ruleLog,
  execTool,
  runLlm,
  exportAndApply,
  reset: resetRuleEdit,
} = useRuleEditSession({
  getContextFiles: () => ({ ...(props.contextFiles ?? {}), [props.fileName]: props.fileContent }),
  onApply: (files) => {
    const nextContent = files[props.fileName] ?? files['rule.json']
    if (typeof nextContent === 'string') emit('apply', nextContent)
  },
  onStatus: (msg, type) => emit('status', msg, type),
})

// Single busy flag covering both stills ops and writeback
const loading = computed(() => ruleBusy.value || wbLoading.value)

// ── Direct tool panel inputs (local UI state only) ────────────────
const toolAction = ref<string>('sparkNodeTree.listChildren')
const toolParams = ref<string>(TOOL_PARAM_EXAMPLES['sparkNodeTree.listChildren'] ?? '{}')

// ── Chat sender: proxies to ruleEdit.runLlm ──────────────────────
const ruleEditChatSender: AiChatSender = async (request) => {
  const prompt = [...request.historyMsgs].reverse().find(m => m.role === 'user')?.content?.trim() ?? ''
  if (!prompt) return
  request.onDelta?.('已接收需求，正在执行 rule.json 细粒度编辑...\n')
  await runLlm(prompt)
  const latest = ruleLog.value[0]
  if (!latest) { request.onDelta?.('细粒度编辑已执行完成。'); return }
  if (latest.type === 'error') throw new Error(`${latest.tag}: ${latest.text}`)
  request.onDelta?.(`${latest.tag}: ${latest.text}`)
}

// ── Writeback (non-rule files) ─────────────────────────────────
function buildPrompt(currentMode: Exclude<AiMode, 'chat' | 'tool'>): string {
  const ext = props.fileName.endsWith('.js') ? 'javascript' : props.fileName.endsWith('.css') ? 'css' : 'json'
  const ctx = [
    `当前文件: ${props.fileName}`,
    `页面ID: ${props.pageId}`,
    '',
    '用户需求:',
    requestText.value,
    '',
    '文件内容:',
    `\`\`\`${ext}`,
    props.fileContent,
    '\`\`\`',
  ].join('\n')
  if (isPageDataFile.value) {
    return currentMode === 'edit'
      ? `${ctx}

你是 SPARK DataSet 细粒度编辑助手。只做与用户需求直接相关的最小必要改动，不要无关重写。输出可直接写回 pagedata.json 的完整内容。`
      : `${ctx}

你是 SPARK 数据建模助手。基于用户需求重新组织 DataSet（tables、tableRelations、views.default），输出可直接写回 pagedata.json 的完整内容。`
  }
  return currentMode === 'edit'
    ? `${ctx}

请基于用户需求对当前文件做最小必要修改，保持原有结构和风格，返回完整文件内容。`
    : `${ctx}

请根据用户需求对当前文件进行重构式生成，保证内容完整可用，返回完整文件内容。`
}

async function handleApplyByMode() {
  if (!props.enabled || !loop.value) return
  if (mode.value === 'chat' || mode.value === 'tool') return
  const trimmed = requestText.value.trim()
  if (!trimmed) { emit('status', '请先输入你的修改需求', 'warning'); return }

  if (isRuleFile.value && mode.value === 'edit') {
    await runLlm(trimmed)
    return
  }

  wbLoading.value = true
  try {
    const targetFile = props.fileName as PageFileName
    const result = await runAiFileWriteback({
      loop: loop.value,
      pageId: props.pageId,
      prompt: buildPrompt(mode.value),
      targetFile,
      contextFiles: { [targetFile]: props.fileContent },
      callbacks: { onDelta() {}, onReasoning() {}, onPhase() {} },
    })
    if (!result.content) { emit('status', '未生成可应用内容，请调整需求后重试', 'warning'); return }
    suggestedContent.value = result.content
    emit('status', `AI 已完成${mode.value === 'edit' ? '细粒度编辑' : '整模生成'}（${result.source}）`, 'success')
  } catch (err) {
    emit('status', `AI 操作失败: ${err instanceof Error ? err.message : String(err)}`, 'error')
  } finally {
    wbLoading.value = false
  }
}

function applySuggestion() {
  if (!suggestedContent.value) return
  emit('apply', suggestedContent.value)
  emit('status', '已应用 AI 结果', 'success')
  showResultDialog.value = false
}
</script>

<style scoped>
.ai-assistant {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow: auto;
  padding: 12px;
  border-left: 1px solid var(--el-border-color-lighter);
  background: linear-gradient(180deg, #f7fbff 0%, #fdfdfd 100%);
}

.ai-assistant__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ai-assistant__title {
  font-size: 13px;
  font-weight: 700;
  color: var(--el-color-primary);
}

.ai-assistant__tip {
  padding: 8px 10px;
  border-radius: 8px;
  background: #e8f6ef;
  border: 1px dashed #8fd0ad;
  color: #2e6a4a;
  font-size: 12px;
  line-height: 1.5;
}

.ai-assistant__mode {
  width: 100%;
}

.ai-assistant__mode :deep(.el-radio-button__inner) {
  padding: 6px 10px;
}

.ai-assistant__label {
  font-size: 12px;
  color: var(--el-text-color-regular);
  font-weight: 600;
}

.ai-assistant__submit {
  width: 100%;
}

.ai-assistant__result {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-assistant__result-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.ai-assistant__chat-wrap {
  flex: 1;
  min-height: 360px;
}

.ai-assistant__tool-panel {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ai-assistant__streaming {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ai-assistant__streaming-text {
  padding: 6px 8px;
  border-radius: 6px;
  background: #f8faff;
  border: 1px solid #bfdbfe;
  color: #1e40af;
  font-size: 11px;
  line-height: 1.55;
  max-height: 100px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.ai-assistant__tool-btns {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.ai-assistant__tool-params :deep(textarea) {
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  font-size: 11px;
  line-height: 1.55;
}

.ai-assistant__tool-log {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 320px;
  overflow-y: auto;
}

.ai-assistant__tool-log-entry {
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
}

.ai-assistant__tool-log-entry.is-success {
  border-color: #bbf7d0;
}

.ai-assistant__tool-log-entry.is-error {
  border-color: #fecaca;
}

.ai-assistant__tool-log-tag {
  display: block;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 600;
  background: #f1f5f9;
  color: #475569;
  border-bottom: 1px solid #e5e7eb;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.is-success .ai-assistant__tool-log-tag {
  background: #f0fdf4;
  color: #166534;
  border-bottom-color: #bbf7d0;
}

.is-error .ai-assistant__tool-log-tag {
  background: #fef2f2;
  color: #991b1b;
  border-bottom-color: #fecaca;
}

.ai-assistant__tool-log-body {
  margin: 0;
  padding: 6px 8px;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  font-size: 11px;
  line-height: 1.5;
  color: #334155;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 180px;
  overflow: auto;
}

.ai-assistant__chat-wrap :deep(.ai-chat-widget.compact) {
  max-width: none;
  max-height: none;
  height: 100%;
}

.ai-assistant__code {
  margin: 0;
  max-height: 55vh;
  overflow: auto;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: #0b1020;
  color: #e2e8f0;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-assistant__trace,
.ai-assistant__rule-response {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ai-assistant__trace-text {
  padding: 8px 10px;
  border-radius: 6px;
  background: #0b1020;
  color: #94a3b8;
  font-size: 11px;
  line-height: 1.6;
  max-height: 200px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.ai-assistant__rule-response .ai-assistant__trace-text {
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
}

@media (max-width: 1280px) {
  .ai-assistant {
    width: 280px;
  }
}
</style>
