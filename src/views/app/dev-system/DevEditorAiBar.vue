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
    </el-radio-group>

    <template v-if="mode !== 'chat'">
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

    <div v-else class="ai-assistant__chat-wrap">
      <AiChatWidget
        mode="multi"
        title="DataSet 聊天助手"
        placeholder="支持文本、附件、语音输入；可连续多轮对话"
        :compact="true"
      />
    </div>

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

interface Props {
  pageId: string
  fileName: string
  fileContent: string
  enabled?: boolean
}

type AiMode = 'edit' | 'generate' | 'chat'

const props = withDefaults(defineProps<Props>(), {
  enabled: true,
})

const emit = defineEmits<{
  (e: 'apply', content: string): void
  (e: 'status', message: string, type: 'success' | 'warning' | 'error'): void
}>()

const loop = computed(() => getAILoop())
const mode = ref<AiMode>('edit')
const loading = ref(false)
const requestText = ref('')
const suggestedContent = ref('')
const showResultDialog = ref(false)

const isPageDataFile = computed(() => props.fileName === 'pagedata.json')

function getFileType(): 'json' | 'js' | 'css' {
  if (props.fileName.endsWith('.json')) return 'json'
  if (props.fileName.endsWith('.js')) return 'js'
  return 'css'
}

function buildPrompt(currentMode: Exclude<AiMode, 'chat'>): string {
  const fileType = getFileType()
  const lang = fileType === 'json' ? 'json' : fileType === 'js' ? 'javascript' : 'css'
  const context = [
    `当前文件: ${props.fileName}`,
    `页面ID: ${props.pageId}`,
    '',
    '用户需求:',
    requestText.value,
    '',
    '文件内容:',
    `\`\`\`${lang}`,
    props.fileContent,
    '\`\`\`',
  ].join('\n')

  if (isPageDataFile.value) {
    if (currentMode === 'edit') {
      return `${context}\n\n你是 SPARK DataSet 细粒度编辑助手。只做与用户需求直接相关的最小必要改动，不要无关重写。输出可直接写回 pagedata.json 的完整内容。`
    }
    return `${context}\n\n你是 SPARK 数据建模助手。基于用户需求重新组织 DataSet（tables、tableRelations、views.default），输出可直接写回 pagedata.json 的完整内容。`
  }

  if (currentMode === 'edit') {
    return `${context}\n\n请基于用户需求对当前文件做最小必要修改，保持原有结构和风格，返回完整文件内容。`
  }
  return `${context}\n\n请根据用户需求对当前文件进行重构式生成，保证内容完整可用，返回完整文件内容。`
}

async function handleApplyByMode() {
  if (!props.enabled || !loop.value) return
  if (mode.value === 'chat') return

  const trimmed = requestText.value.trim()
  if (!trimmed) {
    emit('status', '请先输入你的修改需求', 'warning')
    return
  }

  loading.value = true
  try {
    const targetFile = props.fileName as PageFileName
    const result = await runAiFileWriteback({
      loop: loop.value,
      pageId: props.pageId,
      prompt: buildPrompt(mode.value),
      targetFile,
      contextFiles: {
        [targetFile]: props.fileContent,
      },
      callbacks: {
        onDelta() {},
        onReasoning() {},
        onPhase() {},
      },
    })

    if (!result.content) {
      emit('status', '未生成可应用内容，请调整需求后重试', 'warning')
      return
    }

    suggestedContent.value = result.content
    emit('status', `AI 已完成${mode.value === 'edit' ? '细粒度编辑' : '整模生成'}（${result.source}）`, 'success')
  } catch (err) {
    emit('status', `AI 操作失败: ${err instanceof Error ? err.message : String(err)}`, 'error')
  } finally {
    loading.value = false
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

@media (max-width: 1280px) {
  .ai-assistant {
    width: 280px;
  }
}
</style>
