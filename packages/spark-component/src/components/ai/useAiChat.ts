import { computed, ref, onBeforeUnmount } from 'vue'
import { readCache, writeCache } from './aiSessionCache'

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * 用户随消息上传的文件附件描述。
 *
 * 这里只保存文件元信息和后端返回的 fileId，不保存文件二进制内容；
 * 聊天历史恢复后可以用这些字段展示附件名称、大小和类型。
 */
export interface FileAttachment {
  /** 文件服务返回的稳定标识，用于后续下载、预览或传给业务 sender。 */
  fileId: string
  /** 用户看到的文件名。 */
  name: string
  /** 文件大小，单位 byte。 */
  size: number
  /** MIME 类型，例如 text/plain、image/png。 */
  mimeType: string
}

/**
 * 单次 LLM 请求的 token 用量统计。
 *
 * 字段名使用前端统一语义，由 parseTokenUsage 把不同供应商的 usage
 * 响应归一化后写入 assistant 消息。
 */
export interface TokenUsage {
  /** 输入 prompt 消耗的 token 数。 */
  promptTokens?: number
  /** 模型输出消耗的 token 数。 */
  completionTokens?: number
  /** 总 token 数。 */
  totalTokens?: number
  /** 命中 prompt cache 的 token 数。 */
  promptCacheHitTokens?: number
  /** 未命中 prompt cache 的 token 数。 */
  promptCacheMissTokens?: number
}

/**
 * 聊天窗口中的一条可见消息。
 *
 * 这是运行态消息结构；落到 localStorage 时会先投影为精简诊断消息，
 * 不直接保存所有运行态字段。
 */
export interface ChatMessage {
  /** 前端生成的消息 ID，用于渲染 key、typewriter 状态和局部更新。 */
  id: string
  /** 消息角色。当前 UI 只直接展示用户和助手消息。 */
  role: 'user' | 'assistant'
  /** 消息正文；assistant 在流式输出中会不断追加。 */
  content: string
  /** DeepSeek-reasoner 的推理思考过程（reasoning_content） */
  reasoning?: string
  /** 用户消息携带的附件。 */
  attachments?: FileAttachment[]
  /** 消息创建时间；落盘时序列化为 ISO string。 */
  timestamp: Date
  /** true 表示 AI 仍在流式输出中 */
  streaming?: boolean
  /** 归属的并发 turn。用户消息和助手占位共用同一个 turnId。 */
  turnId?: string
  /** 发送顺序，用于 UI 展示和上下文快照裁剪。 */
  turnSeq?: number
  /** turn 生命周期状态。 */
  turnStatus?: AiTurnStatus
  /** 本轮使用的已提交上下文修订号。 */
  baseRevision?: number
  /** token 用量统计（流完成后填入） */
  usage?: TokenUsage
}

export type ChatMode = 'multi' | 'single'
export type AiTurnStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled'
export type AiTurnOverflowPolicy = 'reject' | 'queue' | 'cancel-oldest'

/**
 * 前端 turn 并发策略。
 *
 * 这是 UI 调度层配置，只决定同一个 AiChatWidget 内如何排队或并发调用 sender；
 * 后端仍按 sessionId/turnId 识别请求。
 */
export interface AiTurnConcurrencyConfig {
  /** 允许同时请求 LLM 的最大 turn 数。默认 1，保持旧的串行行为。 */
  maxParallelTurns?: number
  /** 达到并发上限后的策略。默认 reject；queue 会排队等待空闲槽位。 */
  overflow?: AiTurnOverflowPolicy
}

/**
 * 一次用户输入对应的前端 turn 元信息。
 *
 * 完整对象会传给业务 sender，便于前端诊断和 UI 调度；具体 transport
 * 可以只把后端协议需要的 turnId 下发。
 */
export interface AiTurnRequestMeta {
  /** 前端生成的 turn ID，用于前后端通信关联和 SSE 诊断归属。 */
  turnId: string
  /** 当前会话内的发送序号，从 1 开始递增。 */
  seq: number
  /** 本 turn 创建时可见的已提交消息数；仅前端 UI/诊断使用。 */
  baseRevision: number
  /** 进入队列的时间。 */
  queuedAt: string
  /** 实际开始调用 sender 的时间。 */
  startedAt: string
  /** 创建本 turn 时的最大并发配置快照。 */
  maxParallelTurns: number
}

export type RecoveryPolicy = 'layered' | 'manual' | 'strict'
export type CollaborationPolicy = 'auto' | 'critical-confirm' | 'plan-confirm' | 'step-confirm' | 'human-takeover'

/**
 * 面板内的工具/系统日志。
 *
 * 主要用于展示非对话类状态，例如工具执行进度、错误提示、诊断上报结果。
 */
export interface ToolLogEntry {
  /** 日志等级，决定 UI 颜色和图标语义。 */
  type: 'info' | 'success' | 'error'
  /** 机器可读标签，便于过滤或聚合。 */
  tag: string
  /** 展示给用户的日志文本。 */
  text: string
  /** 日志产生时间，ISO string。 */
  timestamp: string
}

/**
 * 已持久化的 SSE 事件记录。
 *
 * 这是诊断数据，不直接参与下一轮 prompt；用于还原流式事件、排查工具调用和
 * 前后端 turn/session 对齐问题。
 */
export interface AiSseEventEntry {
  /** 前端生成的事件记录 ID。 */
  id: string
  /** 事件发生时间，ISO string。 */
  timestamp: string
  /** 后端/transport 返回的会话 ID。 */
  sessionId?: string
  /** 前端生成的流标识，通常包含业务、模块和 turn 信息。 */
  streamKey?: string
  /** 事件归属范围，用于诊断面板按业务实例或 turn 聚合。 */
  scope?: AiSseEventScope
  /** SSE event 名称，例如 delta、result、tool-result、done。 */
  type: string
  /** SSE payload 字符串；保持原始文本便于诊断。 */
  data: string
}

/**
 * SSE 事件的业务归属信息。
 *
 * 由 App AI transport 附加，帮助把底层 SSE 事件映射回业务注册、
 * 业务实例、事件模块和前端 turn。
 */
export interface AiSseEventScope {
  /** 业务根注册 ID，例如 manualLeave、pageDesign。 */
  businessRegistrationId: string
  /** 业务实例 ID，例如某个请假草稿或页面 ID。 */
  businessInstanceId: string
  /** 产生事件的模块 ID，例如 llm 或具体工具模块。 */
  eventModuleId: string
  /** 归属的前端 turn ID。 */
  turnId: string
}

/**
 * sender/transport 推给 useAiChat 的即时 SSE 事件输入。
 *
 * useAiChat 会补齐 id/timestamp 后保存为 AiSseEventEntry。
 */
export interface AiSseEventInput {
  /** 可选事件时间；缺省时由前端写入当前时间。 */
  timestamp?: string
  /** 后端会话 ID。 */
  sessionId?: string
  /** 诊断流标识。 */
  streamKey?: string
  /** 业务归属信息。 */
  scope?: AiSseEventScope
  /** SSE event 名称。 */
  type: string
  /** SSE payload 文本。 */
  data: string
}

/**
 * 已持久化的 Function Calling 调用账本记录。
 *
 * 记录工具名、入参、结果、耗时和错误上报状态，便于问题复盘；
 * 不作为业务状态来源。
 */
export interface AiFcCallRecord {
  /** 前端生成的账本记录 ID。 */
  id: string
  /** 调用完成或记录生成时间，ISO string。 */
  timestamp: string
  /** 归属的前端 turn ID；与 round 分离，round 仍表示 AI core/tool-loop 轮次。 */
  turnId?: string
  /** 工具名或 action 名。 */
  toolName: string
  /** 调用参数，保持原始结构。 */
  args: unknown
  /** 所属 LLM/tool loop 轮次。 */
  round: number
  /** LLM 返回的 tool call ID。 */
  callId?: string
  /** 工具调用结果状态。 */
  status: 'success' | 'error'
  /** 工具返回结果。 */
  result?: unknown
  /** 归一化后的错误消息。 */
  error?: string
  /** 工具执行耗时，单位 ms。 */
  durationMs?: number
  /** 错误诊断上报状态。 */
  reportStatus?: AiFcErrorReportStatus
  /** 诊断系统返回的报告 ID。 */
  reportId?: string
  /** 错误上报失败原因。 */
  reportError?: string
  /** 错误上报完成时间，ISO string。 */
  reportedAt?: string
}

/**
 * sender/transport 推给 useAiChat 的工具调用记录输入。
 *
 * 进入状态前会补齐 id/timestamp，并把 error 归一化为字符串。
 */
export interface AiFcCallInput {
  /** 可选调用时间；缺省时由前端写入当前时间。 */
  timestamp?: string
  /** 可选前端 turn ID；用于并发 turn 下的 FC 诊断归档。 */
  turnId?: string
  /** 工具名或 action 名。 */
  toolName: string
  /** 调用参数。 */
  args: unknown
  /** 所属 LLM/tool loop 轮次。 */
  round: number
  /** LLM 返回的 tool call ID。 */
  callId?: string
  /** 工具调用结果状态。 */
  status: 'success' | 'error'
  /** 工具返回结果。 */
  result?: unknown
  /** 原始错误对象，后续会归一化。 */
  error?: unknown
  /** 工具执行耗时，单位 ms。 */
  durationMs?: number
}

export type AiFcErrorReportStatus = 'pending' | 'reported' | 'failed'

/**
 * Function Calling 错误诊断上报结果。
 */
export interface AiFcErrorReportResult {
  /** 诊断系统返回的报告 ID。 */
  reportId?: string
  /** 服务端记录时间戳。 */
  serverTimestamp?: number
}

export type AiFcErrorReporter = (
  record: AiFcCallRecord,
) => Promise<AiFcErrorReportResult | void>

/**
 * 会话展示与业务配置元信息。
 *
 * 这些字段只参与运行态 session，不进入 localStorage 诊断快照；
 * 面板恢复时从当前业务注册/组件配置重新获取。
 */
export interface AiSessionMetaConfig {
  /** 面板标题。 */
  title?: string
  /** 当前工具实例说明或版本。 */
  toolInstance?: string
  /** 工具目录文本或摘要。 */
  toolCatalog?: string
  /** 工具使用指南。 */
  toolGuide?: string
  /** 业务 prompt 模板摘要。 */
  promptTemplate?: string
  /** 是否启用 SSE function-call 循环。 */
  sseFcEnabled?: boolean
  /** 是否启用人工协作能力。 */
  humanCollabEnabled?: boolean
}

/**
 * 会话策略快照。
 */
export interface AiSessionPolicies {
  /** 失败恢复策略。 */
  recovery: RecoveryPolicy
  /** 人工协作策略。 */
  collaboration: CollaborationPolicy
}

/**
 * useAiChat 运行时完整会话快照。
 *
 * 这是前端 UI 状态，不是后端权威会话历史；写入 localStorage 时会投影为
 * AiSessionStorageSnapshot，只保留诊断和可见恢复所需字段。
 */
export interface AiSessionSnapshot {
  /** 快照版本。当前结构版本为 3。 */
  version: 3
  /** 业务页 ID；用于缓存管理和诊断聚合。 */
  pageId: string
  /** 聊天模式。 */
  mode: ChatMode
  /** 可见聊天消息。 */
  messages: ChatMessage[]
  /** 工具/系统日志。 */
  toolLogs: ToolLogEntry[]
  /** SSE 诊断事件。 */
  sseEvents: AiSseEventEntry[]
  /** Function Calling 调用账本。 */
  fcCalls: AiFcCallRecord[]
  /** 会话配置快照。 */
  config: AiSessionMetaConfig
  /** 策略配置快照。 */
  policies: AiSessionPolicies
  /** 快照更新时间，ISO string。 */
  updatedAt: string
}

export type AiStoredChatMessage = Omit<ChatMessage, 'timestamp' | 'baseRevision' | 'streaming'> & {
  timestamp: string
  streaming?: true
}

/**
 * localStorage 中的精简诊断快照。
 *
 * 不保存可由当前业务注册重建的 config/policies，也不保存只用于发送瞬间的
 * baseRevision；目标是支撑刷新恢复和问题复盘，而不是复制完整运行态。
 */
export interface AiSessionStorageSnapshot {
  version: 3
  pageId: string
  mode: ChatMode
  messages: AiStoredChatMessage[]
  toolLogs: ToolLogEntry[]
  /** 仅保存非文本增量类 SSE 事件；delta/reasoning 已由 messages 承载。 */
  sseEvents: AiSseEventEntry[]
  fcCalls: AiFcCallRecord[]
  updatedAt: string
}

type MaybeGetter<T> = T | (() => T)

/**
 * AiChatWidget 发给业务 sender 的请求。
 *
 * sender 通过回调把流式文本、SSE 事件、token usage 和 FC 账本回灌给 UI。
 */
export interface AiChatSendRequest {
  /** 本轮应发送给 LLM/业务宿主的消息历史。 */
  historyMsgs: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  /** 聊天模式。 */
  mode: ChatMode
  /** 前端 turn 元信息。 */
  turn?: AiTurnRequestMeta
  /** 当前恢复/协作策略。 */
  policies?: AiSessionPolicies
  /** 业务注入的 system prompt。 */
  systemPrompt?: string
  /** 本轮取消信号。 */
  signal?: AbortSignal
  /** 推理内容增量回调。 */
  onReasoning?: (reasoning: string) => void
  /** 助手正文增量回调。 */
  onDelta?: (delta: string) => void
  /** usage 原始对象回调。 */
  onUsage?: (usageRaw: Record<string, unknown>) => void
  /** SSE 诊断事件回调。 */
  onSseEvent?: (event: AiSseEventInput) => void
  /** FC 调用账本回调。 */
  onFcCall?: (record: AiFcCallInput) => void
}

export type AiChatSender = (request: AiChatSendRequest) => Promise<void>

/**
 * 默认文本流接口的请求结构。
 *
 * 当调用方没有提供完整 sender 时，AiChatWidget 可退回到 streamAiChatText。
 */
export interface StreamAiChatTextRequest {
  /** 要发送给 LLM 的消息列表。 */
  messages: Array<{ role: string; content: string }>
  /** 聊天模式。 */
  mode?: ChatMode
  /** 前端 turn 元信息。 */
  turn?: AiTurnRequestMeta
  /** system prompt。 */
  systemPrompt?: string
  /** 本轮取消信号。 */
  signal?: AbortSignal
  /** 推理内容增量回调。 */
  onReasoning?: (reasoning: string) => void
  /** 助手正文增量回调。 */
  onDelta?: (delta: string) => void
  /** usage 原始对象回调。 */
  onUsage?: (usageRaw: Record<string, unknown>) => void
}

export type StreamAiChatText = (request: StreamAiChatTextRequest) => Promise<string>

/**
 * useAiChat 的组合式配置。
 *
 * 大多数选项支持 getter，便于 AppAiPanel 按当前业务上下文动态切换 storageKey、
 * sender、prompt 和策略。
 */
export interface UseAiChatOptions {
  /** 默认聊天模式。 */
  mode?: MaybeGetter<ChatMode>
  /** system prompt。 */
  systemPrompt?: MaybeGetter<string | undefined>
  /** 业务 sender。 */
  sender?: MaybeGetter<AiChatSender | undefined>
  /** localStorage key；未传时使用 spark-ai-session:${pageId}。 */
  storageKey?: MaybeGetter<string | undefined>
  /** 禁用快照读写。 */
  disablePersistence?: MaybeGetter<boolean | undefined>
  /** 业务页 ID。 */
  pageId?: MaybeGetter<string | undefined>
  /** 会话配置元信息。 */
  sessionConfig?: MaybeGetter<AiSessionMetaConfig | undefined>
  /** 默认恢复策略。 */
  defaultRecoveryPolicy?: MaybeGetter<RecoveryPolicy | undefined>
  /** 默认人工协作策略。 */
  defaultCollaborationPolicy?: MaybeGetter<CollaborationPolicy | undefined>
  /** turn 并发调度配置。 */
  turnConcurrency?: MaybeGetter<AiTurnConcurrencyConfig | undefined>
  /** 简化文本流接口。 */
  streamAiChatText?: StreamAiChatText | undefined
  /** usage 归一化函数。 */
  parseTokenUsage?: ((usageRaw: Record<string, unknown>) => TokenUsage) | undefined
  /** 文件上传函数。 */
  uploadFile?: ((file: File) => Promise<FileAttachment>) | undefined
  /** FC 错误诊断上报函数。 */
  reportFcError?: MaybeGetter<AiFcErrorReporter | undefined>
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

function isEmptySseMonitorEvent(entry: AiSseEventInput): boolean {
  const data = entry.data.trim()
  return data === '' || (entry.type === 'done' && data === '{}')
}

const INTERRUPTED_RESPONSE_NOTICE = '⚠️ 上一轮响应已中断，请重新发送继续。'
const TRANSIENT_TEXT_SSE_EVENT_TYPES = new Set(['delta', 'reasoning'])

function toStoredMessage(message: ChatMessage): AiStoredChatMessage {
  const stored: AiStoredChatMessage = {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp.toISOString(),
  }

  if (message.reasoning !== undefined && message.reasoning.trim() !== '') stored.reasoning = message.reasoning
  if (message.attachments !== undefined && message.attachments.length > 0) stored.attachments = message.attachments
  if (message.streaming === true) stored.streaming = true
  if (message.turnId !== undefined) stored.turnId = message.turnId
  if (message.turnSeq !== undefined) stored.turnSeq = message.turnSeq
  if (message.turnStatus !== undefined) stored.turnStatus = message.turnStatus
  if (message.usage !== undefined) stored.usage = message.usage

  return stored
}

function serializeSnapshot(snapshot: AiSessionSnapshot): string {
  const stored: AiSessionStorageSnapshot = {
    version: 3,
    pageId: snapshot.pageId,
    mode: snapshot.mode,
    messages: snapshot.messages.map(toStoredMessage),
    toolLogs: snapshot.toolLogs,
    sseEvents: snapshot.sseEvents.filter(event => !TRANSIENT_TEXT_SSE_EVENT_TYPES.has(event.type)),
    fcCalls: snapshot.fcCalls,
    updatedAt: snapshot.updatedAt,
  }
  return JSON.stringify(stored)
}

function isUnsettledTurnStatus(status: unknown): status is Extract<AiTurnStatus, 'queued' | 'running'> {
  return status === 'queued' || status === 'running'
}

function restoreMessage(message: AiStoredChatMessage): ChatMessage[] {
  const wasInterrupted = message.streaming === true || isUnsettledTurnStatus(message.turnStatus)
  if (!wasInterrupted) {
    return [{
      ...message,
      timestamp: new Date(message.timestamp),
    }]
  }

  const content = message.content.trim()
  const reasoning = message.reasoning?.trim() ?? ''
  if (message.role === 'assistant' && content === '' && reasoning === '') {
    return []
  }

  const nextContent = message.role === 'assistant' && !message.content.includes(INTERRUPTED_RESPONSE_NOTICE)
    ? `${message.content}${message.content.endsWith('\n') ? '' : '\n\n'}${INTERRUPTED_RESPONSE_NOTICE}`
    : message.content

  return [{
    ...message,
    content: nextContent,
    streaming: false,
    turnStatus: 'cancelled',
    timestamp: new Date(message.timestamp),
  }]
}

function restoreSnapshot(raw: string): AiSessionSnapshot | null {
  const parsed = JSON.parse(raw) as {
    version?: number
    pageId?: unknown
    mode?: ChatMode
    messages?: AiStoredChatMessage[]
    toolLogs?: ToolLogEntry[]
    sseEvents?: AiSseEventEntry[]
    fcCalls?: AiFcCallRecord[]
    updatedAt?: string
  }

  if (parsed.version !== 3) return null
  if (typeof parsed.pageId !== 'string' || parsed.pageId.trim() === '') return null
  if (!Array.isArray(parsed.messages)) return null

  const messages = parsed.messages
    .filter(message => typeof message.content === 'string')
    .flatMap(restoreMessage)

  return {
    version: 3,
    pageId: parsed.pageId,
    mode: parsed.mode === 'single' ? 'single' : 'multi',
    messages,
    toolLogs: Array.isArray(parsed.toolLogs) ? parsed.toolLogs : [],
    sseEvents: Array.isArray(parsed.sseEvents) ? parsed.sseEvents : [],
    fcCalls: Array.isArray(parsed.fcCalls) ? parsed.fcCalls : [],
    config: {},
    policies: {
      recovery: 'layered',
      collaboration: 'critical-confirm',
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
  const getDisablePersistence = () => resolveOption(options?.disablePersistence) === true
  const getSessionConfig = () => resolveOption(options?.sessionConfig) ?? {}
  const getDefaultRecoveryPolicy = () => resolveOption(options?.defaultRecoveryPolicy) ?? 'layered'
  const getDefaultCollaborationPolicy = () => resolveOption(options?.defaultCollaborationPolicy) ?? 'critical-confirm'
  const getParseTokenUsage = () => options?.parseTokenUsage ?? parseTokenUsageDefault
  const getReportFcError = () => resolveOption(options?.reportFcError)

  function createEmptySnapshot(): AiSessionSnapshot {
    return {
      version: 3,
      pageId: getPageId(),
      mode: getMode(),
      messages: [],
      toolLogs: [],
      sseEvents: [],
      fcCalls: [],
      config: getSessionConfig(),
      policies: {
        recovery: getDefaultRecoveryPolicy(),
        collaboration: getDefaultCollaborationPolicy(),
      },
      updatedAt: new Date().toISOString(),
    }
  }

  const initialSnapshot = (() => {
    const storageKey = getStorageKey()
    if (getDisablePersistence() || !storageKey) {
      return createEmptySnapshot()
    }

    try {
      const raw = readCache(storageKey)
      if (!raw) {
        return createEmptySnapshot()
      }

      const snapshot = restoreSnapshot(raw)
      if (!snapshot) {
        return createEmptySnapshot()
      }

      return {
        ...snapshot,
        pageId: getPageId(),
        mode: getMode(),
        config: getSessionConfig(),
        policies: {
          recovery: getDefaultRecoveryPolicy(),
          collaboration: getDefaultCollaborationPolicy(),
        },
      }
    } catch {
      return createEmptySnapshot()
    }
  })()

  const session = ref<AiSessionSnapshot>(initialSnapshot)
  const messages = ref<ChatMessage[]>(initialSnapshot.messages)
  const toolLogs = ref<ToolLogEntry[]>(initialSnapshot.toolLogs)
  const sseEvents = ref<AiSseEventEntry[]>(initialSnapshot.sseEvents)
  const fcCalls = ref<AiFcCallRecord[]>(initialSnapshot.fcCalls)
  const recoveryPolicy = ref<RecoveryPolicy>(initialSnapshot.policies.recovery)
  const collaborationPolicy = ref<CollaborationPolicy>(initialSnapshot.policies.collaboration)
  const isStreaming = ref(false)
  const activeTurnCount = ref(0)
  const queuedTurnCount = ref(0)
  const error = ref<string | null>(null)
  const PERSIST_DEBOUNCE_MS = 80
  const TYPEWRITER_INTERVAL_MS = 16
  const TYPEWRITER_CHARS_PER_TICK = 4
  let persistTimer: ReturnType<typeof setTimeout> | undefined
  const typewriterStates = new Map<string, {
    target: ChatMessage
    queue: string
    timer: ReturnType<typeof setTimeout> | undefined
  }>()
  const runningTurns = new Map<string, {
    turnId: string
    seq: number
    abortController: AbortController
    userMsg: ChatMessage
    assistantMsg: ChatMessage
  }>()
  const queuedTurns: PendingTurn[] = []
  let nextTurnSeq = Math.max(0, ...messages.value.map((message) => message.turnSeq ?? 0)) + 1

  interface NormalizedTurnConcurrency {
    maxParallelTurns: number
    overflow: AiTurnOverflowPolicy
  }

  interface PendingTurn {
    turnId: string
    seq: number
    baseRevision: number
    queuedAt: string
    mode: ChatMode
    systemPrompt?: string
    sender: AiChatSender | undefined
    historyMsgs: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
    userMsg: ChatMessage
    assistantMsg: ChatMessage
    resolve?: () => void
  }

  function getTurnConcurrency(): NormalizedTurnConcurrency {
    const raw = resolveOption(options?.turnConcurrency)
    const maxParallelTurns = Math.max(1, Math.floor(raw?.maxParallelTurns ?? 1))
    const overflow = raw?.overflow ?? 'reject'
    return { maxParallelTurns, overflow }
  }

  const maxParallelTurns = computed(() => getTurnConcurrency().maxParallelTurns)
  const canSend = computed(() => {
    const concurrency = getTurnConcurrency()
    if (concurrency.overflow !== 'reject') return true
    return activeTurnCount.value < concurrency.maxParallelTurns
  })

  function buildSessionSnapshot(): AiSessionSnapshot {
    return {
      version: 3,
      pageId: getPageId(),
      mode: getMode(),
      messages: messages.value,
      toolLogs: toolLogs.value,
      sseEvents: sseEvents.value,
      fcCalls: fcCalls.value,
      config: {
        ...getSessionConfig(),
      },
      policies: {
        recovery: recoveryPolicy.value,
        collaboration: collaborationPolicy.value,
      },
      updatedAt: new Date().toISOString(),
    }
  }

  function writeSessionSnapshot(snapshot: AiSessionSnapshot): void {
    if (getDisablePersistence()) return
    const storageKey = getStorageKey()
    if (!storageKey) return

    try {
      writeCache(storageKey, serializeSnapshot(snapshot))
    } catch {
      // ignore persistence errors in chat UI
    }
  }

  function flushPersistedSession(snapshot: AiSessionSnapshot = buildSessionSnapshot()): void {
    if (persistTimer !== undefined) {
      clearTimeout(persistTimer)
      persistTimer = undefined
    }
    session.value = snapshot
    writeSessionSnapshot(snapshot)
  }

  function schedulePersistedSession(delayMs = PERSIST_DEBOUNCE_MS): void {
    if (isStreaming.value) {
      return
    }
    if (persistTimer !== undefined) return
    persistTimer = setTimeout(() => {
      persistTimer = undefined
      flushPersistedSession()
    }, delayMs)
  }

  function syncPersistedSession(persistOptions?: { flush?: boolean; delayMs?: number }) {
    const snapshot = buildSessionSnapshot()
    session.value = snapshot

    if (persistOptions?.flush === true) {
      flushPersistedSession(snapshot)
      return
    }

    schedulePersistedSession(persistOptions?.delayMs)
  }

  function syncTurnCounters(): void {
    activeTurnCount.value = runningTurns.size
    queuedTurnCount.value = queuedTurns.length
    isStreaming.value = runningTurns.size > 0 || queuedTurns.length > 0
  }

  function clearTypewriterTimer(messageId: string): void {
    const state = typewriterStates.get(messageId)
    if (state?.timer === undefined) return
    clearTimeout(state.timer)
    state.timer = undefined
  }

  function drainTypewriterQueue(messageId: string): void {
    const state = typewriterStates.get(messageId)
    if (state === undefined) return
    state.timer = undefined
    if (state.queue === '') return

    const chunk = state.queue.slice(0, TYPEWRITER_CHARS_PER_TICK)
    state.queue = state.queue.slice(chunk.length)
    state.target.content += chunk
    syncPersistedSession()

    if (state.queue !== '') {
      state.timer = setTimeout(() => drainTypewriterQueue(messageId), TYPEWRITER_INTERVAL_MS)
    }
  }

  function getTypewriterState(target: ChatMessage): {
    target: ChatMessage
    queue: string
    timer: ReturnType<typeof setTimeout> | undefined
  } {
    const existing = typewriterStates.get(target.id)
    if (existing !== undefined) return existing
    const next = { target, queue: '', timer: undefined }
    typewriterStates.set(target.id, next)
    return next
  }

  function enqueueAssistantDelta(target: ChatMessage, delta: string): void {
    if (delta === '') return
    const state = getTypewriterState(target)
    state.queue += delta
    state.timer ??= setTimeout(() => drainTypewriterQueue(target.id), TYPEWRITER_INTERVAL_MS)
  }

  function flushAssistantTypewriter(target?: ChatMessage): void {
    const ids = target !== undefined ? [target.id] : Array.from(typewriterStates.keys())
    for (const id of ids) {
      const state = typewriterStates.get(id)
      if (state === undefined) continue
      clearTypewriterTimer(id)
      if (state.queue !== '') {
        state.target.content += state.queue
        state.queue = ''
        syncPersistedSession()
      }
      typewriterStates.delete(id)
    }
  }

  function cancelAssistantTypewriter(target?: ChatMessage): void {
    const ids = target !== undefined ? [target.id] : Array.from(typewriterStates.keys())
    for (const id of ids) {
      clearTypewriterTimer(id)
      typewriterStates.delete(id)
    }
  }

  function appendToolLog(entry: Omit<ToolLogEntry, 'timestamp'>): void {
    toolLogs.value.push({ ...entry, timestamp: new Date().toISOString() })
    syncPersistedSession()
  }

  function appendSseEvent(entry: AiSseEventInput): void {
    if (isEmptySseMonitorEvent(entry)) return

    const next: AiSseEventEntry = {
      id: crypto.randomUUID(),
      timestamp: entry.timestamp ?? new Date().toISOString(),
      type: entry.type,
      data: entry.data,
      ...(entry.sessionId !== undefined ? { sessionId: entry.sessionId } : {}),
      ...(entry.streamKey !== undefined ? { streamKey: entry.streamKey } : {}),
      ...(entry.scope !== undefined ? { scope: entry.scope } : {}),
    }
    sseEvents.value.push(next)
    syncPersistedSession()
  }

  function safeStringify(value: unknown): string {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  function normalizeFcError(fcError: unknown): string | undefined {
    if (fcError === undefined) return undefined
    if (fcError instanceof Error) return fcError.message
    return typeof fcError === 'string' ? fcError : safeStringify(fcError)
  }

  async function reportFcCallError(record: AiFcCallRecord): Promise<void> {
    const reporter = getReportFcError()
    if (reporter === undefined) return

    record.reportStatus = 'pending'
    syncPersistedSession()

    try {
      const result = await reporter(record)
      record.reportStatus = 'reported'
      record.reportedAt = new Date().toISOString()
      if (result?.reportId !== undefined) {
        record.reportId = result.reportId
      }
      syncPersistedSession()
    } catch (reportError) {
      const message = normalizeFcError(reportError) ?? 'FC 错误回传失败'
      record.reportStatus = 'failed'
      record.reportError = message
      appendToolLog({ type: 'error', tag: 'fc-error-report', text: message })
      syncPersistedSession()
    }
  }

  function appendFcCall(entry: AiFcCallInput): void {
    const fcError = normalizeFcError(entry.error)
    const next: AiFcCallRecord = {
      id: crypto.randomUUID(),
      timestamp: entry.timestamp ?? new Date().toISOString(),
      ...(entry.turnId !== undefined ? { turnId: entry.turnId } : {}),
      toolName: entry.toolName,
      args: entry.args,
      round: entry.round,
      status: entry.status,
      ...(entry.callId !== undefined ? { callId: entry.callId } : {}),
      ...(entry.result !== undefined ? { result: entry.result } : {}),
      ...(fcError !== undefined ? { error: fcError } : {}),
      ...(entry.durationMs !== undefined ? { durationMs: entry.durationMs } : {}),
    }
    fcCalls.value.push(next)
    syncPersistedSession()
    if (next.status === 'error') {
      void reportFcCallError(next)
    }
  }

  function setRecoveryPolicy(policy: RecoveryPolicy): void {
    recoveryPolicy.value = policy
    syncPersistedSession()
  }

  function setCollaborationPolicy(policy: CollaborationPolicy): void {
    collaborationPolicy.value = policy
    syncPersistedSession()
  }

  function getFirstUnsettledSeq(): number | undefined {
    const seqs = [
      ...Array.from(runningTurns.values()).map((turn) => turn.seq),
      ...queuedTurns.map((turn) => turn.seq),
    ]
    return seqs.length > 0 ? Math.min(...seqs) : undefined
  }

  function isCommittedHistoryMessage(message: ChatMessage, firstUnsettledSeq: number | undefined): boolean {
    if (message.content.trim() === '') return false
    if (message.streaming === true) return false
    if (message.turnStatus === 'queued' || message.turnStatus === 'running') return false
    if (firstUnsettledSeq !== undefined && (message.turnSeq ?? 0) >= firstUnsettledSeq) return false
    return true
  }

  function withAttachmentText(content: string, attachments?: FileAttachment[]): string {
    if (attachments === undefined || attachments.length === 0) return content
    const attachDesc = attachments.map((attachment) => `[附件: ${attachment.name}]`).join(' ')
    return content.trim() === '' ? attachDesc : `${content}\n${attachDesc}`
  }

  function buildHistoryMsgs(
    mode: ChatMode,
    content: string,
    attachments?: FileAttachment[],
  ): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
    const currentUserContent = withAttachmentText(content, attachments)
    if (mode === 'single') {
      return [{ role: 'user', content: currentUserContent }]
    }

    const firstUnsettledSeq = getFirstUnsettledSeq()
    const committed = messages.value
      .filter((message) => isCommittedHistoryMessage(message, firstUnsettledSeq))
      .map((message) => ({ role: message.role, content: message.content }))
    return [...committed, { role: 'user', content: currentUserContent }]
  }

  function findOldestRunningTurn() {
    return Array.from(runningTurns.values()).sort((a, b) => a.seq - b.seq)[0]
  }

  function drainQueuedTurns(): void {
    const concurrency = getTurnConcurrency()
    while (runningTurns.size < concurrency.maxParallelTurns && queuedTurns.length > 0) {
      const next = queuedTurns.shift()
      if (next === undefined) break
      void startTurn(next)
    }
    syncTurnCounters()
  }

  async function startTurn(turn: PendingTurn): Promise<void> {
    const concurrency = getTurnConcurrency()
    const abortController = new AbortController()
    const startedAt = new Date().toISOString()
    turn.userMsg.turnStatus = 'running'
    turn.assistantMsg.turnStatus = 'running'
    turn.assistantMsg.streaming = true
    runningTurns.set(turn.turnId, {
      turnId: turn.turnId,
      seq: turn.seq,
      abortController,
      userMsg: turn.userMsg,
      assistantMsg: turn.assistantMsg,
    })
    syncTurnCounters()
    syncPersistedSession()

    let failed = false
    let cancelled = false
    try {
      const onReasoning = (reasoning: string) => {
        turn.assistantMsg.reasoning = (turn.assistantMsg.reasoning ?? '') + reasoning
        syncPersistedSession()
      }
      const onDelta = (delta: string) => {
        enqueueAssistantDelta(turn.assistantMsg, delta)
      }
      const onUsage = (usageRaw: Record<string, unknown>) => {
        turn.assistantMsg.usage = getParseTokenUsage()(usageRaw)
        syncPersistedSession()
      }
      const onSseEvent = (event: AiSseEventInput) => {
        appendSseEvent(event)
      }
      const onFcCall = (record: AiFcCallInput) => {
        appendFcCall(record)
      }

      if (turn.sender !== undefined) {
        await turn.sender({
          historyMsgs: turn.historyMsgs,
          mode: turn.mode,
          turn: {
            turnId: turn.turnId,
            seq: turn.seq,
            baseRevision: turn.baseRevision,
            queuedAt: turn.queuedAt,
            startedAt,
            maxParallelTurns: concurrency.maxParallelTurns,
          },
          policies: {
            recovery: recoveryPolicy.value,
            collaboration: collaborationPolicy.value,
          },
          signal: abortController.signal,
          ...(turn.systemPrompt !== undefined ? { systemPrompt: turn.systemPrompt } : {}),
          onReasoning,
          onDelta,
          onUsage,
          onSseEvent,
          onFcCall,
        })
      } else if (options?.streamAiChatText) {
        await options.streamAiChatText({
          messages: turn.historyMsgs,
          mode: turn.mode,
          turn: {
            turnId: turn.turnId,
            seq: turn.seq,
            baseRevision: turn.baseRevision,
            queuedAt: turn.queuedAt,
            startedAt,
            maxParallelTurns: concurrency.maxParallelTurns,
          },
          signal: abortController.signal,
          ...(turn.systemPrompt !== undefined ? { systemPrompt: turn.systemPrompt } : {}),
          onReasoning,
          onDelta,
          onUsage,
        })
      } else {
        throw new Error('[useAiChat] 缺少 sender 或 streamAiChatText 依赖。')
      }
    } catch (e) {
      cancelled = abortController.signal.aborted
      if (!cancelled) {
        failed = true
        cancelAssistantTypewriter(turn.assistantMsg)
        const msg = e instanceof Error ? e.message : '请求失败'
        error.value = msg
        turn.assistantMsg.content = `⚠️ ${msg}`
        appendToolLog({ type: 'error', tag: 'chat-error', text: msg })
        syncPersistedSession()
      }
    } finally {
      flushAssistantTypewriter(turn.assistantMsg)
      runningTurns.delete(turn.turnId)
      turn.assistantMsg.streaming = false
      const status: AiTurnStatus = failed ? 'error' : (cancelled ? 'cancelled' : 'done')
      turn.userMsg.turnStatus = status
      turn.assistantMsg.turnStatus = status
      syncTurnCounters()
      // 所有在途/排队 turn 都结束后立即落盘，确保关闭面板前已持久化完整结果。
      syncPersistedSession({ flush: runningTurns.size === 0 && queuedTurns.length === 0 })
      drainQueuedTurns()
      turn.resolve?.()
    }
  }

  function queueTurn(turn: PendingTurn): Promise<void> {
    return new Promise((resolve) => {
      turn.resolve = resolve
      queuedTurns.push(turn)
      turn.userMsg.turnStatus = 'queued'
      turn.assistantMsg.turnStatus = 'queued'
      turn.assistantMsg.streaming = true
      syncTurnCounters()
      syncPersistedSession()
    })
  }

  function scheduleTurn(turn: PendingTurn): Promise<void> {
    const concurrency = getTurnConcurrency()
    if (runningTurns.size < concurrency.maxParallelTurns) {
      return startTurn(turn)
    }
    if (concurrency.overflow === 'queue') {
      return queueTurn(turn)
    }
    if (concurrency.overflow === 'cancel-oldest') {
      findOldestRunningTurn()?.abortController.abort()
      return queueTurn(turn)
    }
    turn.userMsg.turnStatus = 'cancelled'
    turn.assistantMsg.turnStatus = 'cancelled'
    turn.assistantMsg.streaming = false
    return Promise.resolve()
  }

  /** 组件卸载时中止所有活跃流 */
  onBeforeUnmount(() => {
    flushAssistantTypewriter()
    flushPersistedSession()
    for (const turn of runningTurns.values()) {
      turn.abortController.abort()
    }
    for (const turn of queuedTurns) {
      turn.userMsg.turnStatus = 'cancelled'
      turn.assistantMsg.turnStatus = 'cancelled'
      turn.assistantMsg.streaming = false
      turn.resolve?.()
    }
    runningTurns.clear()
    queuedTurns.length = 0
    syncTurnCounters()
  })

  // ── 发送文本消息（可携带附件） ────────────────────────────────────────────

  async function send(text: string, attachments?: FileAttachment[]) {
    const trimmed = text.trim()
    if (!trimmed && !attachments?.length) return

    const concurrency = getTurnConcurrency()
    if (concurrency.overflow === 'reject' && runningTurns.size >= concurrency.maxParallelTurns) return

    const mode = getMode()
    const systemPrompt = getSystemPrompt()
    const sender = getSender()
    const historyMsgs = buildHistoryMsgs(mode, trimmed, attachments)
    const turnId = crypto.randomUUID()
    const seq = nextTurnSeq++
    const baseRevision = Math.max(0, historyMsgs.length - 1)
    const queuedAt = new Date().toISOString()

    error.value = null

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      ...(attachments !== undefined ? { attachments } : {}),
      timestamp: new Date(),
      turnId,
      turnSeq: seq,
      turnStatus: 'queued',
      baseRevision,
    }
    messages.value.push(userMsg)

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      streaming: true,
      turnId,
      turnSeq: seq,
      turnStatus: 'queued',
      baseRevision,
    }
    messages.value.push(assistantMsg)
    const reactiveUserMsg = messages.value[messages.value.length - 2] as ChatMessage
    const reactiveAssistantMsg = messages.value[messages.value.length - 1] as ChatMessage

    await scheduleTurn({
      turnId,
      seq,
      baseRevision,
      queuedAt,
      mode,
      ...(systemPrompt !== undefined ? { systemPrompt } : {}),
      sender,
      historyMsgs,
      userMsg: reactiveUserMsg,
      assistantMsg: reactiveAssistantMsg,
    })
  }

  // ── 文件上传 ─────────────────────────────────────────────────────────────

  async function uploadFile(file: File): Promise<FileAttachment> {
    if (!options?.uploadFile) {
      throw new Error('[useAiChat] 缺少 uploadFile 依赖。')
    }
    return await options.uploadFile(file)
  }

  // ── 清空会话 ─────────────────────────────────────────────────────────────

  function clearMessages() {
    // 中止全部活跃 SSE 流，防止 orphaned 写入（流仍持有旧 reactiveMsg 引用）
    for (const turn of runningTurns.values()) {
      turn.abortController.abort()
    }
    for (const turn of queuedTurns) {
      turn.resolve?.()
    }
    runningTurns.clear()
    queuedTurns.length = 0
    cancelAssistantTypewriter()
    messages.value = []
    sseEvents.value = []
    error.value = null
    syncTurnCounters()
    syncPersistedSession({ flush: true })
  }

  function clearToolLogs() {
    toolLogs.value = []
    fcCalls.value = []
    syncPersistedSession({ flush: true })
  }

  function clear() {
    clearMessages()
    clearToolLogs()
  }

  return {
    session,
    toolLogs,
    sseEvents,
    fcCalls,
    recoveryPolicy,
    collaborationPolicy,
    messages,
    isStreaming,
    activeTurnCount,
    queuedTurnCount,
    maxParallelTurns,
    canSend,
    error,
    appendToolLog,
    appendSseEvent,
    appendFcCall,
    setRecoveryPolicy,
    setCollaborationPolicy,
    send,
    uploadFile,
    clearMessages,
    clearToolLogs,
    clear,
  }
}
