import type {
  AiChatSendRequest,
  AiFcCallInput,
  AiResolvedSessionConfig,
  AiSessionConfig,
  AiSseEventInput,
} from '@spark-view/spark-component'
import {
  resolveAiSessionTarget,
} from '@spark-view/spark-component'
import type {
  AiHostChatRequest,
  AiHostBusinessSession,
  AiHostFcCallRecord,
  AiHostOptions,
  AiHostSseEvent,
} from '@spark-view/spark-ai/host'
import {
  createAiHostBusinessStorageKey,
  createAiHostBusinessSession,
} from '@spark-view/spark-ai/host'
import type { AiRuntimeMessageHistoryEntry, AiRuntimeSessionRecord } from '@spark-view/spark-ai/core'

export type AppAiPanelSessionResolver = (config: AiSessionConfig) => AiResolvedSessionConfig | Promise<AiResolvedSessionConfig>
export type AppAiPanelResolverOptions = AiHostOptions

export type AppAiRuntimeSessionSnapshot = {
  readonly sessionId: string
  readonly pageId: string
  readonly storageKey: string
  readonly target: {
    readonly businessRegistrationId: string
    readonly businessInstanceId: string
  }
  readonly session: AiRuntimeSessionRecord | null
}

export type AppAiRuntimeMonitorSnapshot = {
  readonly activeSessionId: string | null
  readonly sessions: readonly AppAiRuntimeSessionSnapshot[]
}

type AppAiRuntimeSessionEntry = {
  config: AiSessionConfig
  readonly session: AiHostBusinessSession
}

export class AppAiRuntimeMonitor {
  private readonly sessions = new Map<string, AppAiRuntimeSessionEntry>()

  private readonly configBySessionId = new Map<string, AiSessionConfig>()

  private readonly listeners = new Set<(snapshot: AppAiRuntimeMonitorSnapshot) => void>()

  private activeSessionId: string | null = null

  constructor(private readonly options: AppAiPanelResolverOptions) {}

  readonly resolveRuntimeSession: AppAiPanelSessionResolver = async (config) => {
    const target = resolveAiSessionTarget(config)
    const sessionKey = `${target.businessRegistrationId}:${target.businessInstanceId}`
    let entry = this.sessions.get(sessionKey)
    if (entry === undefined) {
      entry = {
        config,
        session: createAiHostBusinessSession(this.options, target),
      }
      this.sessions.set(sessionKey, entry)
    } else {
      entry.config = config
    }
    await entry.session.start()
    this.activeSessionId = entry.session.sessionId
    this.configBySessionId.set(entry.session.sessionId, config)
    this.emit()

    return {
      ...config,
      target,
      storageKey: entry.session.storageKey,
      pageId: config.pageId ?? entry.session.pageId,
      sender: async (request) => {
        await entry.session.send(toHostRequest(request))
        this.emit()
      },
    }
  }

  getSnapshot(): AppAiRuntimeMonitorSnapshot {
    const runtimeSessions = this.options.registry.list().flatMap((runtime) => (
      runtime.listSessions().map((session): AppAiRuntimeSessionSnapshot => ({
        sessionId: session.instanceId,
        pageId: session.moduleInstanceId,
        storageKey: createAiHostBusinessStorageKey({
          businessRegistrationId: session.moduleId,
          businessInstanceId: session.moduleInstanceId,
        }),
        target: {
          businessRegistrationId: session.moduleId,
          businessInstanceId: session.moduleInstanceId,
        },
        session,
      }))
    ))
    return {
      activeSessionId: this.activeSessionId !== null && runtimeSessions.some((session) => session.sessionId === this.activeSessionId)
        ? this.activeSessionId
        : null,
      sessions: runtimeSessions,
    }
  }

  subscribe(listener: (snapshot: AppAiRuntimeMonitorSnapshot) => void): () => void {
    this.listeners.add(listener)
    listener(this.getSnapshot())
    return () => {
      this.listeners.delete(listener)
    }
  }

  focusSession(sessionId: string): AiSessionConfig | null {
    if (this.findRuntimeSession(sessionId) === null) return null
    this.activeSessionId = sessionId
    this.emit()
    return this.configBySessionId.get(sessionId) ?? null
  }

  appendHumanMessage(sessionId: string, content: string): AiRuntimeMessageHistoryEntry {
    const record = this.requireRuntimeSession(sessionId)
    const runtime = this.options.registry.get(record.moduleId)
    if (runtime === undefined) {
      throw new Error(`AI business runtime is not registered: ${record.moduleId}`)
    }
    const trimmed = content.trim()
    if (trimmed === '') {
      throw new Error('人工干预内容不能为空。')
    }
    const result = runtime.appendMessage({
      moduleId: record.moduleId,
      moduleInstanceId: record.moduleInstanceId,
      instanceId: record.instanceId,
      role: 'user',
      content: trimmed,
      source: 'ui',
      metadata: { intervention: 'human' },
    })
    this.emit()
    return result
  }

  async closeSession(sessionId: string, reason = 'human intervention closed session'): Promise<void> {
    const record = this.requireRuntimeSession(sessionId)
    const runtime = this.options.registry.get(record.moduleId)
    if (runtime === undefined) {
      throw new Error(`AI business runtime is not registered: ${record.moduleId}`)
    }
    await runtime.endBusinessInstance?.({
      moduleId: record.moduleId,
      moduleInstanceId: record.moduleInstanceId,
      instanceId: record.instanceId,
    }, {
      status: 'abort',
      reason,
      releaseInstance: false,
    })
    this.emit()
  }

  private emit(): void {
    const snapshot = this.getSnapshot()
    for (const listener of this.listeners) listener(snapshot)
  }

  private findRuntimeSession(sessionId: string): AiRuntimeSessionRecord | null {
    for (const runtime of this.options.registry.list()) {
      const found = runtime.listSessions().find((session) => session.instanceId === sessionId)
      if (found !== undefined) return found
    }
    return null
  }

  private requireRuntimeSession(sessionId: string): AiRuntimeSessionRecord {
    const record = this.findRuntimeSession(sessionId)
    if (record === null) {
      throw new Error(`AI runtime session is not monitored: ${sessionId}`)
    }
    return record
  }
}

export function createAppAiRuntimeMonitor(options: AppAiPanelResolverOptions): AppAiRuntimeMonitor {
  return new AppAiRuntimeMonitor(options)
}

export function createAppAiPanelResolver(options: AppAiPanelResolverOptions): AppAiPanelSessionResolver {
  return createAppAiRuntimeMonitor(options).resolveRuntimeSession
}

function toHostRequest(request: AiChatSendRequest): AiHostChatRequest {
  const hostRequest: AiHostChatRequest = {
    historyMsgs: request.historyMsgs,
  }
  if (request.turn !== undefined) hostRequest.turn = request.turn
  if (request.systemPrompt !== undefined) hostRequest.systemPrompt = request.systemPrompt
  if (request.signal !== undefined) hostRequest.signal = request.signal
  if (request.onDelta !== undefined) hostRequest.onDelta = request.onDelta
  if (request.onReasoning !== undefined) hostRequest.onReasoning = request.onReasoning
  if (request.onUsage !== undefined) hostRequest.onUsage = request.onUsage
  hostRequest.onSseEvent = (event) => request.onSseEvent?.(adaptSseEvent(event))
  if (request.onFcCall !== undefined) {
    const onFcCall = request.onFcCall
    hostRequest.onFcCall = (record: AiHostFcCallRecord) => {
      const input: AiFcCallInput = {
        toolName: record.toolName,
        args: record.args,
        turnId: record.turnId,
        round: record.round,
        status: record.status,
        result: record.result,
        durationMs: record.durationMs,
      }
      if (record.callId !== undefined) input.callId = record.callId
      onFcCall(input)
    }
  }
  return hostRequest
}

function adaptSseEvent(event: AiHostSseEvent): AiSseEventInput {
  return {
    type: event.type,
    data: typeof event.data === 'string' ? event.data : JSON.stringify(event.data),
    streamKey: event.streamKey,
    scope: event.scope,
  }
}
