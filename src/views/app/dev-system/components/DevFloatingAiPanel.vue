<template>
  <div v-if="props.state.activePageId.value" class="floating-ai-panel">
    <div class="floating-ai-panel__frame">
      <div class="floating-ai-panel__summary">
        <div class="floating-ai-panel__summary-main">
          <span class="floating-ai-panel__title">AI 编辑面板</span>
          <span class="floating-ai-panel__context">
            {{ props.state.activePageId.value }}
            <template v-if="props.activeFile"> · {{ props.activeFile }}</template>
          </span>
        </div>
        <div class="floating-ai-panel__summary-actions">
          <el-tooltip content="撤销上一条 AI 页面事务" placement="bottom" :show-after="600">
            <el-button size="small" :disabled="!props.state.canPageEditTransactionBack()" @click="props.state.undoPageEditTransaction()">
              <NavIcon name="RefreshLeft" :size="14" />
            </el-button>
          </el-tooltip>
          <el-tooltip content="重做上一条 AI 页面事务" placement="bottom" :show-after="600">
            <el-button size="small" :disabled="!props.state.canPageEditTransactionForward()" @click="props.state.redoPageEditTransaction()">
              <NavIcon name="RefreshRight" :size="14" />
            </el-button>
          </el-tooltip>
          <el-tag v-if="props.state.getPageEditTransactionCount() > 0" size="small" type="info" effect="plain">
            AI 事务 {{ props.state.getPageEditTransactionCount() }}
          </el-tag>
        </div>
      </div>

      <div v-if="supportsAiEditing" class="floating-ai-panel__body">
        <div class="floating-ai-panel__rule-tip" :class="{ 'floating-ai-panel__rule-tip--dataset': isPageDataFile }">
          {{ currentAiTip }}
        </div>
        <el-alert
          v-if="isPageDataFile && pageDataBlockReason"
          class="floating-ai-panel__dataset-alert"
          title="存在未导出 DataSet 改动"
          type="warning"
          :closable="false"
          show-icon
        >
          {{ pageDataBlockReason }}
        </el-alert>
        <AiChatWidget
          storage-key="devsystem-global-ai-chat"
          mode="multi"
          :title="currentAiTitle"
          :placeholder="currentAiPlaceholder"
          :compact="true"
          :sender="currentAiSender"
        />
        <div v-if="isPageDataFile && pageDataTaskSteps.length > 0" class="floating-ai-panel__dataset-section">
          <div class="floating-ai-panel__section-label">执行任务</div>
          <div
            v-for="step in pageDataTaskSteps"
            :key="step.id"
            class="floating-ai-panel__task-step"
          >
            <span class="floating-ai-panel__task-icon">
              {{ step.status === 'done' ? '✅' : step.status === 'running' ? '⏳' : '⬜' }}
            </span>
            <span class="floating-ai-panel__task-name">{{ step.action }}</span>
          </div>
        </div>
        <div v-if="isPageDataFile && pageDataSseTraceHtml" class="floating-ai-panel__dataset-section">
          <div class="floating-ai-panel__section-label">SSE 与 LLM 交互</div>
          <div class="floating-ai-panel__trace" v-html="pageDataSseTraceHtml" />
        </div>
      </div>

      <div v-else-if="props.activeFile" class="floating-ai-panel__body">
        <el-alert
          title="当前文件暂未接入模型级 AI"
          type="info"
          :closable="false"
          show-icon
        >
          当前浮层仅支持页面 4 文件模型编辑；请切到 rule.json、pagedata.json、script.js 或 style.css。
        </el-alert>
      </div>

      <div v-else class="floating-ai-panel__placeholder">
        <el-alert
          title="切换到页面文件后可使用 AI"
          type="info"
          :closable="false"
          show-icon
        >
          当前工作区不是页面文件视图；请切到 rule.json、pagedata.json、script.js 或 style.css。
        </el-alert>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import AiChatWidget from '@/components/AiChatWidget.vue'
import NavIcon from '@/components/NavIcon.vue'
import type { AiChatSender } from '@/composables/useAiChat'
import type { AiChatSendRequest } from '@/composables/useAiChat'
import { usePageDataEditSession } from '../composables/usePageDataEditSession'
import { usePageModelSessionHost } from '../composables/usePageModelSessionHost'
import { useRuleEditSession } from '../composables/useRuleEditSession'
import { PAGE_FILE_NAMES } from '../useDevState'
import type { DevState, PageFileName } from '../useDevState'

interface Props {
  state: DevState
  activeFile: PageFileName | null
}

const props = defineProps<Props>()

const sharedSessionHost = usePageModelSessionHost({
  getContextModel: () => props.state.readPageEditModel(),
  bootstrapTag: 'dev-floating-ai-panel-bootstrap',
  buildContextSignature(model) {
    return JSON.stringify({
      pageId: props.state.activePageId.value ?? '',
      ruleJson: model.ruleJson,
      pageDataJson: model.pageDataJson,
      scriptJs: model.scriptJs,
      styleCss: model.styleCss,
    })
  },
})

const supportsAiEditing = computed(() => {
  return props.activeFile === 'rule.json'
    || props.activeFile === 'script.js'
    || props.activeFile === 'style.css'
    || props.activeFile === 'pagedata.json'
})

const isPageDataFile = computed(() => props.activeFile === 'pagedata.json')

const pageDataSession = usePageDataEditSession({
  getContextModel: () => props.state.readPageEditModel(),
  getPageId: () => props.state.activePageId.value ?? '',
  sessionHost: sharedSessionHost,
  ensureContextLoaded: ensureAllContextFilesLoaded,
  onApplyPageData: (pageDataJson, options) => {
    props.state.applyPageEditModelPatch({ pageDataJson }, options)
  },
  onStatus: (message, type) => {
    props.state.addStatus(message, type === 'success' ? 'success' : type === 'warning' ? 'warning' : 'error')
  },
})

const pageDataBlockReason = computed(() => {
  if (!props.state.pageDataDesignerDirty.value) return ''
  return '当前 DataSet 设计器存在未导出的本地改动。AI 结果仍会直接导入设计器；可使用设计器 Ctrl+Z / 重做，或顶部 AI 页面事务撤销进行回退。'
})

const pageDataTip = computed(() => {
  if (pageDataBlockReason.value) {
    return 'pagedata.json 当前直接对接页面模型；即使设计器里还有未导出改动，AI 结果也会导入当前模型，并保留 DataSet 本地撤销链和 AI 页面事务撤销链。'
  }
  return 'pagedata.json 当前直接对接页面模型；AI 会在同页 4 文件上下文中读取 rule/script/style 语境，并只修改 pagedata 对应数据模型。'
})

const pageDataTaskSteps = computed(() => pageDataSession.runtime.taskSteps.value)

const pageDataSseTraceHtml = computed(() => {
  const lines = pageDataSession.runtime.sseLines.value
  if (lines.length === 0) return ''
  return lines.join('\n')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')
})

const pageModelTip = computed(() => {
  if (props.activeFile === 'script.js') {
    return 'script.js 当前复用页面模型级 tool 会话；AI 直接读写统一的 4 文件页面模型。'
  }
  if (props.activeFile === 'style.css') {
    return 'style.css 当前复用页面模型级 tool 会话；AI 直接读写统一的 4 文件页面模型。'
  }
  return 'rule.json 当前直接走页面模型级 tool 会话；AI 直接读写统一的 4 文件页面模型。'
})

const currentAiTip = computed(() => isPageDataFile.value ? pageDataTip.value : pageModelTip.value)
const currentAiTitle = computed(() => isPageDataFile.value ? 'DataSet 模型级编辑' : '页面模型级编辑')
const currentAiPlaceholder = computed(() => isPageDataFile.value
  ? '支持多轮对话；当前会在同页 4 文件上下文中直接修改 pagedata 对应数据模型'
  : '支持多轮对话；当前会通过 stills tool 层执行 4 文件模型级编辑')

const ruleSession = useRuleEditSession({
  getContextModel: () => props.state.readPageEditModel(),
  sessionHost: sharedSessionHost,
  ensureContextLoaded: ensureAllContextFilesLoaded,
  onApplyModel: (model) => {
    props.state.applyPageEditModel(model)
  },
  onStatus: (message, type) => {
    props.state.addStatus(message, type === 'success' ? 'success' : type === 'warning' ? 'warning' : 'error')
  },
})

watch(() => props.state.activePageId.value, (pageId, previousPageId) => {
  if (pageId !== previousPageId) {
    sharedSessionHost.resetSync()
    ruleSession.reset()
    pageDataSession.reset()
  }
})

async function ensureAllContextFilesLoaded() {
  await Promise.all(PAGE_FILE_NAMES.map(name => props.state.loadPageFile(name)))
}

function buildContinuationPrompt(prompt: string, historyMsgs: AiChatSendRequest['historyMsgs']): string {
  const hasBackendSession = sharedSessionHost.getResumeSessionOptions().resumeSessionId !== undefined
  const previousMessages = historyMsgs.slice(0, -1).filter(message => message.role !== 'system')
  if (hasBackendSession || previousMessages.length === 0) {
    return prompt
  }

  const transcript = previousMessages
    .slice(-8)
    .map((message) => `${message.role === 'assistant' ? 'AI' : '用户'}: ${message.content}`)
    .join('\n')

  return [
    '[全局对话延续]',
    `当前页面: ${props.state.activePageId.value ?? 'unknown'}`,
    `当前焦点文件: ${props.activeFile ?? 'unknown'}`,
    '以下是最近对话摘录；当前真实读写必须以当前页面重新 bootstrap 后的 4 文件模型为准。',
    transcript,
    '',
    '[本轮用户需求]',
    prompt,
  ].join('\n')
}

const pageModelChatSender: AiChatSender = async (request) => {
  const prompt = [...request.historyMsgs].reverse().find(message => message.role === 'user')?.content?.trim() ?? ''
  if (!prompt) return
  request.onDelta?.('已接收需求，正在执行页面模型级编辑...\n')
  let streamed = false
  await ruleSession.runLlm(buildContinuationPrompt(prompt, request.historyMsgs), {
    onDelta: (delta) => {
      streamed = true
      request.onDelta?.(delta)
    },
    onReasoning: (reasoning) => {
      request.onReasoning?.(reasoning)
    },
  })
  if (streamed) return
  const latest = ruleSession.log.value[0]
  if (!latest) {
    request.onDelta?.('模型级编辑已执行完成。')
    return
  }
  if (latest.type === 'error') {
    throw new Error(`${latest.tag}: ${latest.text}`)
  }
  request.onDelta?.(`${latest.tag}: ${latest.text}`)
}

const pageDataModelChatSender: AiChatSender = async (request) => {
  const prompt = [...request.historyMsgs].reverse().find(message => message.role === 'user')?.content?.trim() ?? ''
  if (!prompt) return

  request.onDelta?.('已接收需求，正在执行 DataSet 模型级编辑...\n')

  const result = await pageDataSession.runLlm(buildContinuationPrompt(prompt, request.historyMsgs), {
    onDelta(delta) {
      request.onDelta?.(delta)
    },
    onReasoning(reasoning) {
      request.onReasoning?.(reasoning)
    },
  })

  if (result.startsWith('DataSet 模型编辑失败:')) {
    throw new Error(result)
  }

  request.onDelta?.(`\n\n${result}`)
}

const currentAiSender = computed<AiChatSender>(() => isPageDataFile.value ? pageDataModelChatSender : pageModelChatSender)
</script>

<style scoped>
.floating-ai-panel {
  position: fixed;
  top: calc(var(--spark-header-height) + 24px);
  right: 24px;
  bottom: calc(var(--spark-footer-height) + 24px);
  width: min(360px, calc(100vw - 48px));
  z-index: 2100;
  pointer-events: none;
}

.floating-ai-panel__frame {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 320px;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 18px;
  background: color-mix(in srgb, var(--el-bg-color) 94%, white 6%);
  box-shadow: 0 16px 40px rgb(15 23 42 / 0.18);
  pointer-events: auto;
}

.floating-ai-panel__summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: linear-gradient(135deg, rgb(255 255 255 / 0.98), rgb(241 245 249 / 0.92));
}

.floating-ai-panel__summary-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.floating-ai-panel__summary-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.floating-ai-panel__title {
  font-size: 13px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.floating-ai-panel__context {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.floating-ai-panel__body,
.floating-ai-panel__placeholder {
  flex: 1;
  min-height: 0;
}

.floating-ai-panel__body {
  display: flex;
  flex-direction: column;
}

.floating-ai-panel__placeholder {
  padding: 14px;
}

.floating-ai-panel__placeholder--inner {
  padding-top: 10px;
}

.floating-ai-panel__rule-tip {
  margin: 14px 14px 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: #eff6ff;
  border: 1px dashed #93c5fd;
  color: #1d4ed8;
  font-size: 12px;
  line-height: 1.5;
}

.floating-ai-panel__rule-tip--dataset {
  background: #ecfeff;
  border-color: #67e8f9;
  color: #0f766e;
}

.floating-ai-panel__body :deep(.ai-chat-widget.compact) {
  flex: 1;
  min-height: 0;
  padding: 14px;
}

.floating-ai-panel__dataset-section {
  margin: 0 14px 14px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background: color-mix(in srgb, var(--el-bg-color) 97%, #e2e8f0 3%);
  overflow: auto;
  max-height: 168px;
}

.floating-ai-panel__dataset-alert {
  margin: 10px 14px 0;
}

.floating-ai-panel__section-label {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.floating-ai-panel__task-step {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  line-height: 1.5;
}

.floating-ai-panel__task-step + .floating-ai-panel__task-step {
  margin-top: 6px;
}

.floating-ai-panel__task-icon {
  flex: 0 0 auto;
}

.floating-ai-panel__task-name {
  color: var(--el-text-color-primary);
  word-break: break-word;
}

.floating-ai-panel__trace {
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
  word-break: break-word;
}

.floating-ai-panel__trace :deep(code) {
  padding: 1px 4px;
  border-radius: 4px;
  background: rgb(148 163 184 / 0.12);
  font-size: 11px;
}

@media (max-width: 1280px) {
  .floating-ai-panel {
    right: 16px;
    bottom: 16px;
    width: min(340px, calc(100vw - 32px));
  }
}
</style>