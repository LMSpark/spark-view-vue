import { ref, onBeforeUnmount } from 'vue'
import { readCache, writeCache } from './aiSessionCache'

// ── Types ────────────────────────────────────────────────────────────────────

export interface FileAttachment {
  fileId: string
  name: string
  size: number
  mimeType: string
}

export interface TokenUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  promptCacheHitTokens?: number
  promptCacheMissTokens?: number
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

export type ChatMode = 'multi' | 'single'

export type RecoveryPolicy = 'layered' | 'manual' | 'strict'
export type CollaborationPolicy = 'auto' | 'critical-confirm' | 'plan-confirm' | 'step-confirm' | 'human-takeover'

export interface ToolLogEntry {
  type: 'info' | 'success' | 'error'
  tag: string
  text: string
  timestamp: string
}

export interface AiSessionMetaConfig {
  title?: string
  toolInstance?: string
  toolCatalog?: string
  toolGuide?: string
  promptTemplate?: string
  sseFcEnabled?: boolean
  humanCollabEnabled?: boolean
}

export interface AiSessionPolicies {
  recovery: RecoveryPolicy
  collaboration: CollaborationPolicy
}

export interface AiSessionSnapshot {
  version: 2
  pageId: string
  mode: ChatMode
  messages: ChatMessage[]
  toolLogs: ToolLogEntry[]
  config: AiSessionMetaConfig
  policies: AiSessionPolicies
  updatedAt: string
}

type MaybeGetter<T> = T | (() => T)

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

export interface StreamAiChatTextRequest {
  messages: Array<{ role: string; content: string }>
  mode?: ChatMode
  systemPrompt?: string
  signal?: AbortSignal
  onReasoning?: (reasoning: string) => void
  onDelta?: (delta: string) => void
  onUsage?: (usageRaw: Record<string, unknown>) => void
}

export type StreamAiChatText = (request: StreamAiChatTextRequest) => Promise<string>

export interface UseAiChatOptions {
  mode?: MaybeGetter<ChatMode>
  systemPrompt?: MaybeGetter<string | undefined>
  sender?: MaybeGetter<AiChatSender | undefined>
  storageKey?: MaybeGetter<string | undefined>
  pageId?: MaybeGetter<string | undefined>
  sessionConfig?: MaybeGetter<AiSessionMetaConfig | undefined>
  defaultRecoveryPolicy?: MaybeGetter<RecoveryPolicy | undefined>
  defaultCollaborationPolicy?: MaybeGetter<CollaborationPolicy | undefined>
  streamAiChatText?: StreamAiChatText | undefined
  parseTokenUsage?: ((usageRaw: Record<string, unknown>) => TokenUsage) | undefined
  uploadFile?: ((file: File) => Promise<FileAttachment>) | undefined
}

function resolveOption<T>(value: MaybeGetter<T> | undefined): T | undefined {
  if (typeof value === 'function') {
    return (value as (() => T))()
  }
  return value
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function parseTokenUsageDefault(raw: Record<string, unknown>): TokenUsage {
  const usage: TokenUsage = {}
  const promptTokens = toFiniteNumber(raw['prompt_tokens'])
  const completionTokens = toFiniteNumber(raw['completion_tokens'])
  const totalTokens = toFiniteNumber(raw['total_tokens'])
  const promptCacheHitTokens = toFiniteNumber(raw['prompt_cache_hit_tokens'])
  const promptCacheMissTokens = toFiniteNumber(raw['prompt_cache_miss_tokens'])

  if (promptTokens !== undefined) usage.promptTokens = promptTokens
  if (completionTokens !== undefined) usage.completionTokens = completionTokens
  if (totalTokens !== undefined) usage.totalTokens = totalTokens
  if (promptCacheHitTokens !== undefined) usage.promptCacheHitTokens = promptCacheHitTokens
  if (promptCacheMissTokens !== undefined) usage.promptCacheMissTokens = promptCacheMissTokens

  return usage
}

function serializeSnapshot(snapshot: AiSessionSnapshot): string {
  return JSON.stringify({
    ...snapshot,
    messages: snapshot.messages.map(message => ({
      ...message,
      timestamp: message.timestamp.toISOString(),
    })),
  })
}

function restoreMessages(raw: string): ChatMessage[] {
  const parsed = JSON.parse(raw) as Array<Omit<ChatMessage, 'timestamp'> & { timestamp: string }>
  if (!Array.isArray(parsed)) return []

  return parsed
    .filter(message => typeof message.content === 'string')
    .flatMap((message) => {
      if (message.streaming !== true) {
        return [{
          ...message,
          timestamp: new Date(message.timestamp),
        }]
      }

      const content = message.content.trim()
      const reasoning = message.reasoning?.trim() ?? ''
      if (content === '' && reasoning === '') {
        return []
      }

      const interruptionNotice = '⚠️ 上一轮响应已中断，请重新发送继续。'
      const nextContent = message.role === 'assistant' && !message.content.includes(interruptionNotice)
        ? `${message.content}${message.content.endsWith('\n') ? '' : '\n\n'}${interruptionNotice}`
        : message.content

      return [{
        ...message,
        content: nextContent,
        streaming: false,
        timestamp: new Date(message.timestamp),
      }]
    })
}

function restoreSnapshot(raw: string): AiSessionSnapshot | null {
  const parsed = JSON.parse(raw) as {
    version?: number
    pageId?: unknown
    mode?: ChatMode
    messages?: Array<Omit<ChatMessage, 'timestamp'> & { timestamp: string }>
    toolLogs?: ToolLogEntry[]
    config?: AiSessionMetaConfig
    policies?: Partial<AiSessionPolicies>
    updatedAt?: string
  }

  if (parsed.version !== 2) return null
  if (typeof parsed.pageId !== 'string' || parsed.pageId.trim() === '') return null
  if (!Array.isArray(parsed.messages)) return null

  const messages = parsed.messages
    .filter(message => typeof message.content === 'string')
    .map(message => ({
      ...message,
      streaming: false,
      timestamp: new Date(message.timestamp),
    }))

  return {
    version: 2,
    pageId: parsed.pageId,
    mode: parsed.mode === 'single' ? 'single' : 'multi',
    messages,
    toolLogs: Array.isArray(parsed.toolLogs) ? parsed.toolLogs : [],
    config: parsed.config ?? {},
    policies: {
      recovery: parsed.policies?.recovery ?? 'layered',
      collaboration: parsed.policies?.collaboration ?? 'critical-confirm',
    },
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
  }
}

// ── Composable ───────────────────────────────────────────────────────────────

export function useAiChat(options?: UseAiChatOptions) {
  const getMode = () => resolveOption(options?.mode) ?? 'multi'
  const getSystemPrompt = () => resolveOption(options?.systemPrompt)
  const getSender = () => resolveOption(options?.sender)
  const getPageId = () => resolveOption(options?.pageId) ?? 'global'
  const getStorageKey = () => {
    const explicit = resolveOption(options?.storageKey)
    if (explicit && explicit.trim() !== '') return explicit
    return `spark-ai-session:${getPageId()}`
  }
  const getSessionConfig = () => resolveOption(options?.sessionConfig) ?? {}
  const getDefaultRecoveryPolicy = () => resolveOption(options?.defaultRecoveryPolicy) ?? 'layered'
  const getDefaultCollaborationPolicy = () => resolveOption(options?.defaultCollaborationPolicy) ?? 'critical-confirm'
  const getParseTokenUsage = () => options?.parseTokenUsage ?? parseTokenUsageDefault

  const initialSnapshot = (() => {
    const storageKey = getStorageKey()
    if (!storageKey) {
      return {
        version: 2,
        pageId: getPageId(),
        mode: getMode(),
        messages: [],
        toolLogs: [],
        config: getSessionConfig(),
        policies: {
          recovery: getDefaultRecoveryPolicy(),
          collaboration: getDefaultCollaborationPolicy(),
        },
        updatedAt: new Date().toISOString(),
      } satisfies AiSessionSnapshot
    }

    try {
      const raw = readCache(storageKey)
      if (!raw) {
        return {
          version: 2,
          pageId: getPageId(),
          mode: getMode(),
          messages: [],
          toolLogs: [],
          config: getSessionConfig(),
          policies: {
            recovery: getDefaultRecoveryPolicy(),
            collaboration: getDefaultCollaborationPolicy(),
          },
          updatedAt: new Date().toISOString(),
        } satisfies AiSessionSnapshot
      }

      const snapshot = restoreSnapshot(raw)
      if (!snapshot) {
        const messages = restoreMessages(raw)
        return {
          version: 2,
          pageId: getPageId(),
          mode: getMode(),
          messages,
          toolLogs: [],
          config: getSessionConfig(),
          policies: {
            recovery: getDefaultRecoveryPolicy(),
            collaboration: getDefaultCollaborationPolicy(),
          },
          updatedAt: new Date().toISOString(),
        } satisfies AiSessionSnapshot
      }

      return {
        ...snapshot,
        pageId: getPageId(),
        mode: getMode(),
        config: {
          ...snapshot.config,
          ...getSessionConfig(),
        },
      }
    } catch {
      return {
        version: 2,
        pageId: getPageId(),
        mode: getMode(),
        messages: [],
        toolLogs: [],
        config: getSessionConfig(),
        policies: {
          recovery: getDefaultRecoveryPolicy(),
          collaboration: getDefaultCollaborationPolicy(),
        },
        updatedAt: new Date().toISOString(),
      } satisfies AiSessionSnapshot
    }
  })()

  const session = ref<AiSessionSnapshot>(initialSnapshot)
  const messages = ref<ChatMessage[]>(initialSnapshot.messages)
  const toolLogs = ref<ToolLogEntry[]>(initialSnapshot.toolLogs)
  const recoveryPolicy = ref<RecoveryPolicy>(initialSnapshot.policies.recovery)
  const collaborationPolicy = ref<CollaborationPolicy>(initialSnapshot.policies.collaboration)
  const isStreaming = ref(false)
  const error = ref<string | null>(null)

  function syncPersistedSession() {
    const storageKey = getStorageKey()
    if (!storageKey) return

    const snapshot: AiSessionSnapshot = {
      version: 2,
      pageId: getPageId(),
      mode: getMode(),
      messages: messages.value,
      toolLogs: toolLogs.value,
      config: {
        ...getSessionConfig(),
      },
      policies: {
        recovery: recoveryPolicy.value,
        collaboration: collaborationPolicy.value,
      },
      updatedAt: new Date().toISOString(),
    }

    session.value = snapshot

    try {
      // 即使 messages/toolLogs 都为空，也要持久化：policies、config、updatedAt
      // 仍需保留。只有显式切换 pageId 或调用清理 API 时才删除缓存。
      writeCache(storageKey, serializeSnapshot(snapshot))
    } catch {
      // ignore persistence errors in chat UI
    }
  }

  function appendToolLog(entry: Omit<ToolLogEntry, 'timestamp'>): void {
    toolLogs.value.push({ ...entry, timestamp: new Date().toISOString() })
    syncPersistedSession()
  }

  function setRecoveryPolicy(policy: RecoveryPolicy): void {
    recoveryPolicy.value = policy
    syncPersistedSession()
  }

  function setCollaborationPolicy(policy: CollaborationPolicy): void {
    collaborationPolicy.value = policy
    syncPersistedSession()
  }

  /** 当前活跃 SSE 流的 AbortController（用于取消在途请求） */
  let abortController: AbortController | null = null

  /** 组件卸载时中止活跃流 */
  onBeforeUnmount(() => {
    abortController?.abort()
    abortController = null
  })

  // ── 发送文本消息（可携带附件） ────────────────────────────────────────────

  async function send(text: string, attachments?: FileAttachment[]) {
    const trimmed = text.trim()
    if (!trimmed && !attachments?.length) return
    if (isStreaming.value) return

    const mode = getMode()
    const systemPrompt = getSystemPrompt()
    const sender = getSender()

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
    syncPersistedSession()

    // 准备 AI 回复占位
    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      streaming: true,
    }
    messages.value.push(assistantMsg)
    syncPersistedSession()
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

      abortController = new AbortController()
      const onReasoning = (reasoning: string) => {
        reactiveMsg.reasoning = (reactiveMsg.reasoning ?? '') + reasoning
        syncPersistedSession()
      }
      const onDelta = (delta: string) => {
        reactiveMsg.content += delta
        syncPersistedSession()
      }
      const onUsage = (usageRaw: Record<string, unknown>) => {
        reactiveMsg.usage = getParseTokenUsage()(usageRaw)
        syncPersistedSession()
      }

      if (sender !== undefined) {
        await sender({
          historyMsgs,
          mode,
          signal: abortController.signal,
          ...(systemPrompt !== undefined ? { systemPrompt } : {}),
          onReasoning,
          onDelta,
          onUsage,
        })
      } else if (options?.streamAiChatText) {
        await options.streamAiChatText({
          messages: historyMsgs,
          mode,
          signal: abortController.signal,
          ...(systemPrompt !== undefined ? { systemPrompt } : {}),
          onReasoning,
          onDelta,
          onUsage,
        })
      } else {
        throw new Error('[useAiChat] 缺少 sender 或 streamAiChatText 依赖。')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '请求失败'
      error.value = msg
      reactiveMsg.content = `⚠️ ${msg}`
      appendToolLog({ type: 'error', tag: 'chat-error', text: msg })
      syncPersistedSession()
    } finally {
      abortController = null
      reactiveMsg.streaming = false
      isStreaming.value = false
      syncPersistedSession()
    }
  }

  // ── 文件上传 ─────────────────────────────────────────────────────────────

  async function uploadFile(file: File): Promise<FileAttachment> {
    if (!options?.uploadFile) {
      throw new Error('[useAiChat] 缺少 uploadFile 依赖。')
    }
    return await options.uploadFile(file)
  }

  // ── 清空会话 ─────────────────────────────────────────────────────────────

  function clear() {
    // 中止活跃 SSE 流，防止 orphaned 写入（流仍持有旧 reactiveMsg 引用）
    abortController?.abort()
    abortController = null
    messages.value = []
    toolLogs.value = []
    error.value = null
    isStreaming.value = false
    syncPersistedSession()
  }

  return {
    session,
    toolLogs,
    recoveryPolicy,
    collaborationPolicy,
    messages,
    isStreaming,
    error,
    appendToolLog,
    setRecoveryPolicy,
    setCollaborationPolicy,
    send,
    uploadFile,
    clear,
  }
}
