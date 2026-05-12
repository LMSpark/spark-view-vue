import { computed, ref, onBeforeUnmount } from 'vue'
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

export interface AiTurnConcurrencyConfig {
  /** 允许同时请求 LLM 的最大 turn 数。默认 1，保持旧的串行行为。 */
  maxParallelTurns?: number
  /** 达到并发上限后的策略。默认 reject；queue 会排队等待空闲槽位。 */
  overflow?: AiTurnOverflowPolicy
}

export interface AiTurnRequestMeta {
  turnId: string
  seq: number
  baseRevision: number
  queuedAt: string
  startedAt: string
  maxParallelTurns: number
}

export type RecoveryPolicy = 'layered' | 'manual' | 'strict'
export type CollaborationPolicy = 'auto' | 'critical-confirm' | 'plan-confirm' | 'step-confirm' | 'human-takeover'

export interface ToolLogEntry {
  type: 'info' | 'success' | 'error'
  tag: string
  text: string
  timestamp: string
}

export interface AiSseEventEntry {
  id: string
  timestamp: string
  sessionId?: string
  type: string
  data: string
}

export interface AiSseEventInput {
  timestamp?: string
  sessionId?: string
  type: string
  data: string
}

export interface AiFcCallRecord {
  id: string
  timestamp: string
  toolName: string
  args: unknown
  round: number
  callId?: string
  status: 'success' | 'error'
  result?: unknown
  error?: string
  durationMs?: number
  reportStatus?: AiFcErrorReportStatus
  reportId?: string
  reportError?: string
  reportedAt?: string
}

export interface AiFcCallInput {
  timestamp?: string
  toolName: string
  args: unknown
  round: number
  callId?: string
  status: 'success' | 'error'
  result?: unknown
  error?: unknown
  durationMs?: number
}

export type AiFcErrorReportStatus = 'pending' | 'reported' | 'failed'

export interface AiFcErrorReportResult {
  reportId?: string
  serverTimestamp?: number
}

export type AiFcErrorReporter = (
  record: AiFcCallRecord,
) => Promise<AiFcErrorReportResult | void>

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
  sseEvents: AiSseEventEntry[]
  fcCalls: AiFcCallRecord[]
  config: AiSessionMetaConfig
  policies: AiSessionPolicies
  updatedAt: string
}

type MaybeGetter<T> = T | (() => T)

export interface AiChatSendRequest {
  historyMsgs: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  mode: ChatMode
  turn?: AiTurnRequestMeta
  policies?: AiSessionPolicies
  systemPrompt?: string
  signal?: AbortSignal
  onReasoning?: (reasoning: string) => void
  onDelta?: (delta: string) => void
  onUsage?: (usageRaw: Record<string, unknown>) => void
  onSseEvent?: (event: AiSseEventInput) => void
  onFcCall?: (record: AiFcCallInput) => void
}

export type AiChatSender = (request: AiChatSendRequest) => Promise<void>

export interface StreamAiChatTextRequest {
  messages: Array<{ role: string; content: string }>
  mode?: ChatMode
  turn?: AiTurnRequestMeta
  systemPrompt?: string
  signal?: AbortSignal
  onReasoning?: (reasoning: string) => void
  onDelta?: (delta: string) => void
  onUsage?: (usageRaw: Record<string, unknown>) => void
  onSseEvent?: (event: AiSseEventInput) => void
  onFcCall?: (record: AiFcCallInput) => void
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
  turnConcurrency?: MaybeGetter<AiTurnConcurrencyConfig | undefined>
  streamAiChatText?: StreamAiChatText | undefined
  parseTokenUsage?: ((usageRaw: Record<string, unknown>) => TokenUsage) | undefined
  uploadFile?: ((file: File) => Promise<FileAttachment>) | undefined
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
    sseEvents?: AiSseEventEntry[]
    fcCalls?: AiFcCallRecord[]
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
    sseEvents: Array.isArray(parsed.sseEvents) ? parsed.sseEvents : [],
    fcCalls: Array.isArray(parsed.fcCalls) ? parsed.fcCalls : [],
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
  const getReportFcError = () => resolveOption(options?.reportFcError)

  const initialSnapshot = (() => {
    const storageKey = getStorageKey()
    if (!storageKey) {
      return {
        version: 2,
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
          sseEvents: [],
          fcCalls: [],
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
          sseEvents: [],
          fcCalls: [],
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
        sseEvents: [],
        fcCalls: [],
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
      version: 2,
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
          onSseEvent,
          onFcCall,
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
