<template>
  <div class="rule-editor">
    <!-- ═══ 主体双栏 ═══ -->
    <div class="re-body">
      <!-- 左侧：4 文件编辑器（rule.json / pagedata.json / script.js / style.css） -->
      <div class="re-tree">
        <DevFileEditor :state="props.state" :show-ai-bar="false" />
      </div>

      <!-- 右侧：AI 助手 -->
      <div class="re-ai">
        <div class="re-ai__header">
          <NavIcon name="Cpu" :size="16" />
          <span>AI 设计助手</span>
          <el-tag size="small" type="success" effect="plain" class="re-ai__new-tag">NEW</el-tag>
        </div>

        <div class="re-ai__feature-tip">
          仅保留聊天模式，所有 AI 修改统一走细粒度编辑执行链路。
        </div>

        <div class="re-ai__form">
          <div class="re-ai__chat-widget">
            <AiChatWidget
              mode="multi"
              title="Rule 聊天助手"
              placeholder="支持文本、附件、语音输入；可连续多轮对话"
              :compact="true"
              :sender="ruleEditChatSender"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { ElMessage } from 'element-plus'
import AiChatWidget from '@/components/AiChatWidget.vue'
import type { AiChatSender } from '@/composables/useAiChat'
import NavIcon from '@/components/NavIcon.vue'
import DevFileEditor from './DevFileEditor.vue'
import { useRuleEditSession } from './composables/useRuleEditSession'
import { PAGE_FILE_NAMES } from './useDevState'
import type { DevState } from './useDevState'

const props = defineProps<{ state: DevState }>()

async function ensureRuleContextLoaded() {
  await Promise.all(PAGE_FILE_NAMES.map(name => props.state.loadPageFile(name)))
}

const session = useRuleEditSession({
  getContextFiles: () => ({ ...props.state.editFiles }),
  ensureContextLoaded: ensureRuleContextLoaded,
  onApply: (files) => {
    for (const name of PAGE_FILE_NAMES) {
      if (files[name] !== undefined) props.state.updatePageFile(name, files[name])
    }
  },
  onStatus: (msg, type) => ElMessage({ message: msg, type, duration: 4000 }),
})

watch(() => props.state.activePageId.value, (next, prev) => {
  if (next !== prev) session.reset()
})

// Keep session nodeTree in sync whenever rule.json is edited (via DevFileEditor or onApply).
watch(() => props.state.editFiles['rule.json'], (text) => {
  if (text) session.loadRuleJson(text)
})

const ruleEditChatSender: AiChatSender = async (request) => {
  const latestUserMessage = [...request.historyMsgs]
    .reverse()
    .find(message => message.role === 'user')

  const prompt = latestUserMessage?.content?.trim() ?? ''
  if (!prompt) return

  request.onDelta?.('已接收需求，正在执行 rule.json 细粒度编辑...\n')

  let streamed = false
  await session.runLlm(prompt, {
    onDelta: (delta) => {
      streamed = true
      request.onDelta?.(delta)
    },
    onReasoning: (reasoning) => {
      request.onReasoning?.(reasoning)
    },
  })
  if (streamed) return
  const latest = session.log.value[0]
  if (!latest) {
    request.onDelta?.('细粒度编辑已执行完成。')
    return
  }
  if (latest.type === 'error') {
    throw new Error(`${latest.tag}: ${latest.text}`)
  }
  request.onDelta?.(`${latest.tag}: ${latest.text}`)
}
</script>

<style scoped>
.rule-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--el-bg-color);
}

/* ── 主体双栏 ── */
.re-body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

/* ── 左侧树区域 ── */
.re-tree {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--el-border-color-light);
}

.re-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

/* ── 右侧 AI 面板 ── */
.re-ai {
  width: 320px;
  display: flex;
  flex-direction: column;
  background: #fff;
}

.re-ai__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  font-size: 14px;
  font-weight: 600;
  color: #7c3aed;
  border-bottom: 1px solid #e2e8f0;
}

.re-ai__new-tag {
  margin-left: auto;
}

.re-ai__feature-tip {
  margin: 10px 14px 0;
  padding: 8px 10px;
  border: 1px dashed #86efac;
  border-radius: 8px;
  background: #f0fdf4;
  color: #166534;
  font-size: 12px;
  line-height: 1.5;
}

.re-ai__form {
  padding: 14px;
  border-bottom: 1px solid #f1f5f9;
}

.re-ai__chat-widget {
  margin-top: 8px;
}

.re-ai__chat-widget :deep(.ai-chat-widget.compact) {
  height: 100%;
  min-height: 0;
}
</style>
