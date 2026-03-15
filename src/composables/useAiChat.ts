import { ref } from 'vue'
import { createFetchClient } from '@spark-view/spark-utils'
import { http, createAuthHeaders } from '@/services/http'

// ── Types ────────────────────────────────────────────────────────────────────

export interface FileAttachment {
  fileId: string
  name: string
  size: number
  mimeType: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** DeepSeek-reasoner 的推理思考过程（reasoning_content） */
  reasoning?: string
  attachments?: FileAttachment[]
  timestamp: Date
  /** true 表示 AI 仍在流式输出中 */
  streaming?: boolean
  /** token 用量统计（流完成后填入） */
  usage?: TokenUsage
}

export interface TokenUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  /** DeepSeek 上下文缓存命中 token 数 */
  promptCacheHitTokens?: number
  promptCacheMissTokens?: number
}

export type ChatMode = 'multi' | 'single'

// ── Composable ───────────────────────────────────────────────────────────────

export function useAiChat(options?: {
  mode?: ChatMode
  systemPrompt?: string | undefined
}) {
  const mode = options?.mode ?? 'multi'
  const systemPrompt = options?.systemPrompt

  const messages = ref<ChatMessage[]>([])
  const isStreaming = ref(false)
  const error = ref<string | null>(null)

  // ── 发送文本消息（可携带附件） ────────────────────────────────────────────

  async function send(text: string, attachments?: FileAttachment[]) {
    const trimmed = text.trim()
    if (!trimmed && !attachments?.length) return
    if (isStreaming.value) return

    error.value = null

    // 添加用户消息
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      ...(attachments !== undefined ? { attachments } : {}),
      timestamp: new Date(),
    }
    messages.value.push(userMsg)

    // 准备 AI 回复占位
    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      streaming: true,
    }
    messages.value.push(assistantMsg)
    // 从 reactive 数组取回 proxy 引用，确保后续属性修改触发 Vue 响应式更新
    const reactiveMsg = messages.value[messages.value.length - 1] as ChatMessage
    isStreaming.value = true

    try {
      // 多轮模式：把所有历史（除最后一条助手占位）发给后端
      // 单轮模式：只发当前用户消息
      const historyMsgs: Array<{ role: string; content: string }> =
        mode === 'multi'
          ? messages.value
              .slice(0, -1) // 去掉刚插入的助手占位
              .map((m) => ({ role: m.role, content: m.content }))
          : [{ role: 'user', content: trimmed }]

      // 附件信息拼接到最后一条用户消息内容（文本化描述，LLM 无法理解二进制附件）
      if (attachments !== undefined && attachments.length > 0) {
        const lastUserIdx = historyMsgs.length - 1
        const last = historyMsgs[lastUserIdx]
        if (last !== undefined) {
          const attachDesc = attachments.map((a) => `[附件: ${a.name}]`).join(' ')
          historyMsgs[lastUserIdx] = {
            ...last,
            content: `${last.content}\n${attachDesc}`,
          }
        }
      }

      const sseClient = createFetchClient()
      const events = await sseClient.streamSSE({
        url: '/api/ai/chat/stream',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...createAuthHeaders() },
        data: { messages: historyMsgs, mode, systemPrompt },
      })

      for await (const event of events) {
        if (event.data === '[DONE]') break

        try {
          const parsed = JSON.parse(event.data) as Record<string, unknown>
          if (parsed['done'] === true) break

          // DeepSeek-reasoner: 推理过程增量
          const reasoning = parsed['reasoning']
          if (typeof reasoning === 'string' && reasoning) {
            reactiveMsg.reasoning = (reactiveMsg.reasoning ?? '') + reasoning
          }

          // 正文内容增量
          const delta = parsed['delta']
          if (typeof delta === 'string' && delta) {
            reactiveMsg.content += delta
          }

          // token 用量统计（DeepSeek stream_options.include_usage）
          const usageRaw = parsed['usage']
          if (usageRaw !== null && typeof usageRaw === 'object') {
            const u = usageRaw as Record<string, unknown>
            const usage: TokenUsage = {}
            if (typeof u['prompt_tokens'] === 'number') usage.promptTokens = u['prompt_tokens']
            if (typeof u['completion_tokens'] === 'number') usage.completionTokens = u['completion_tokens']
            if (typeof u['total_tokens'] === 'number') usage.totalTokens = u['total_tokens']
            if (typeof u['prompt_cache_hit_tokens'] === 'number') usage.promptCacheHitTokens = u['prompt_cache_hit_tokens']
            if (typeof u['prompt_cache_miss_tokens'] === 'number') usage.promptCacheMissTokens = u['prompt_cache_miss_tokens']
            reactiveMsg.usage = usage
          }
        } catch {
          // 跳过非 JSON 行
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '请求失败'
      error.value = msg
      reactiveMsg.content = `⚠️ ${msg}`
    } finally {
      reactiveMsg.streaming = false
      isStreaming.value = false
    }
  }

  // ── 文件上传 ─────────────────────────────────────────────────────────────

  async function uploadFile(file: File): Promise<FileAttachment> {
    const fd = new FormData()
    fd.append('file', file)
    return await http.post<FileAttachment>('/api/ai/upload', fd)
  }

  // ── 清空会话 ─────────────────────────────────────────────────────────────

  function clear() {
    messages.value = []
    error.value = null
    isStreaming.value = false
  }

  return {
    messages,
    isStreaming,
    error,
    send,
    uploadFile,
    clear,
  }
}
