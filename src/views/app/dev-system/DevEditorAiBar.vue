<template>
  <aside class="ai-assistant">
    <div class="ai-assistant__header">
      <span class="ai-assistant__title">AI 设计助手</span>
      <el-tag size="small" type="success" effect="plain" class="ai-assistant__new-tag">NEW</el-tag>
    </div>

    <div class="ai-assistant__tip">
      {{ isRuleFile
        ? 'rule.json 已接入细粒度编辑会话，当前统一通过聊天模式驱动编辑。'
        : '旧整模生成/文件写回链已删除。当前文件不再支持从这里直接回写。' }}
    </div>

    <template v-if="isRuleFile">
      <div class="ai-assistant__form">
        <div class="ai-assistant__chat-wrap">
          <AiChatWidget
            mode="multi"
            title="Rule 聊天助手"
            placeholder="支持文本、附件、语音输入；可连续多轮对话"
            :compact="true"
            :sender="ruleEditChatSender"
          />
        </div>
      </div>
    </template>

    <el-alert
      v-else
      title="该入口已下线旧 AI 写回链"
      type="info"
      :closable="false"
      show-icon
    >
      当前文件仍可手动编辑；若需 AI 改写，请使用 DataSet 设计器中的聊天入口。
    </el-alert>
  </aside>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import AiChatWidget from '@/components/AiChatWidget.vue'
import type { AiChatSender } from '@/composables/useAiChat'
import { useRuleEditSession } from './composables/useRuleEditSession'

interface Props {
  pageId: string
  fileName: string
  fileContent: string
  contextFiles?: Record<string, string>
  ensureContextLoaded?: () => Promise<void>
  enabled?: boolean
}

const props = withDefaults(defineProps<Props>(), { enabled: true })

const emit = defineEmits<{
  (e: 'apply', content: string): void
  (e: 'status', message: string, type: 'success' | 'warning' | 'error'): void
}>()

const isRuleFile = computed(() => props.fileName === 'rule.json')

// ── Rule edit session (tool layer) ────────────────────────────────
const {
  log: ruleLog,
  runLlm,
  reset: resetRuleEdit,
  loadRuleJson,
} = useRuleEditSession({
  getContextFiles: () => ({ ...(props.contextFiles ?? {}), [props.fileName]: props.fileContent }),
  ...(props.ensureContextLoaded ? { ensureContextLoaded: props.ensureContextLoaded } : {}),
  onApply: (files) => {
    const nextContent = files[props.fileName] ?? files['rule.json']
    if (typeof nextContent === 'string') emit('apply', nextContent)
  },
  onStatus: (msg, type) => emit('status', msg, type),
})

watch(() => [props.pageId, props.fileName] as const, ([pageId, fileName], [prevPageId, prevFileName]) => {
  if (pageId !== prevPageId || fileName !== prevFileName) {
    resetRuleEdit()
  }
})

watch(() => props.fileContent, (text) => {
  if (isRuleFile.value && text) loadRuleJson(text)
})

// ── Chat sender: proxies to ruleEdit.runLlm ──────────────────────
const ruleEditChatSender: AiChatSender = async (request) => {
  const prompt = [...request.historyMsgs].reverse().find(m => m.role === 'user')?.content?.trim() ?? ''
  if (!prompt) return
  if (!props.enabled) throw new Error('当前页面未就绪，无法执行 AI 编辑')
  request.onDelta?.('已接收需求，正在执行 rule.json 细粒度编辑...\n')
  let streamed = false
  await runLlm(prompt, {
    onDelta: (delta) => {
      streamed = true
      request.onDelta?.(delta)
    },
    onReasoning: (reasoning) => {
      request.onReasoning?.(reasoning)
    },
  })
  if (streamed) return
  const latest = ruleLog.value[0]
  if (!latest) { request.onDelta?.('细粒度编辑已执行完成。'); return }
  if (latest.type === 'error') throw new Error(`${latest.tag}: ${latest.text}`)
  request.onDelta?.(`${latest.tag}: ${latest.text}`)
}
</script>

<style scoped>
.ai-assistant {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background: #fff;
  border-left: 1px solid var(--el-border-color-lighter);
}

.ai-assistant__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid #e2e8f0;
}

.ai-assistant__title {
  font-size: 14px;
  font-weight: 600;
  color: #7c3aed;
}

.ai-assistant__new-tag {
  margin-left: auto;
}

.ai-assistant__tip {
  margin: 10px 14px 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f0fdf4;
  border: 1px dashed #86efac;
  color: #166534;
  font-size: 12px;
  line-height: 1.5;
}

.ai-assistant__form {
  padding: 14px;
  border-bottom: 1px solid #f1f5f9;
  min-height: 0;
}

.ai-assistant__chat-wrap {
  margin-top: 8px;
}

.ai-assistant__chat-wrap :deep(.ai-chat-widget.compact) {
  height: 100%;
  min-height: 0;
}

@media (max-width: 1280px) {
  .ai-assistant {
    width: 280px;
  }
}
</style>
