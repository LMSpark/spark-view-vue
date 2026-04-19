import { ref, onBeforeUnmount } from 'vue'
import { http } from '@/services/http'
import { streamAiChatText, parseTokenUsage } from '@/services/ai-protocol'
import type { TokenUsage } from '@/services/ai-protocol'

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

export type { TokenUsage }

export type ChatMode = 'multi' | 'single'

export interface AiChatSendRequest {
  historyMsgs: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  mode: ChatMode
  systemPrompt?: string
  signal?: AbortSignal
  onReasoning?: (reasoning: string) => void
  onDelta?: (delta: string) => void
  onUsage?: (usageRaw: Record<string, unknown>) => void
}

export type AiChatSender = (request: AiChatSendRequest) => Promise<void>

// ── Composable ───────────────────────────────────────────────────────────────

export function useAiChat(options?: {
  mode?: ChatMode
  systemPrompt?: string | undefined
  sender?: AiChatSender
}) {
  const mode = options?.mode ?? 'multi'
  const systemPrompt = options?.systemPrompt
  const sender = options?.sender

  const messages = ref<ChatMessage[]>([])
  const isStreaming = ref(false)
  const error = ref<string | null>(null)

  /** 当前活跃 SSE 流的 AbortController（用于取消在途请求） */
  let _abortController: AbortController | null = null

  /** 组件卸载时中止活跃流 */
  onBeforeUnmount(() => {
    _abortController?.abort()
    _abortController = null
  })

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
      const historyMsgs: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> =
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

      _abortController = new AbortController()
      const onReasoning = (reasoning: string) => {
        reactiveMsg.reasoning = (reactiveMsg.reasoning ?? '') + reasoning
      }
      const onDelta = (delta: string) => {
        reactiveMsg.content += delta
      }
      const onUsage = (usageRaw: Record<string, unknown>) => {
        reactiveMsg.usage = parseTokenUsage(usageRaw)
      }

      if (sender !== undefined) {
        await sender({
          historyMsgs,
          mode,
          signal: _abortController.signal,
          ...(systemPrompt !== undefined ? { systemPrompt } : {}),
          onReasoning,
          onDelta,
          onUsage,
        })
      } else {
        await streamAiChatText({
          messages: historyMsgs,
          mode,
          signal: _abortController.signal,
          ...(systemPrompt !== undefined ? { systemPrompt } : {}),
          onReasoning,
          onDelta,
          onUsage,
        })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '请求失败'
      error.value = msg
      reactiveMsg.content = `⚠️ ${msg}`
    } finally {
      _abortController = null
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
    // 中止活跃 SSE 流，防止 orphaned 写入（流仍持有旧 reactiveMsg 引用）
    _abortController?.abort()
    _abortController = null
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
