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

export interface AppAiRuntimeSessionSnapshot {
  readonly sessionId: string
  readonly pageId: string
  readonly storageKey: string
  readonly target: {
    readonly businessRegistrationId: string
    readonly businessInstanceId: string
  }
  readonly session: AiRuntimeSessionRecord | null
}

export interface AppAiRuntimeMonitorSnapshot {
  readonly activeSessionId: string | null
  readonly sessions: readonly AppAiRuntimeSessionSnapshot[]
}

export interface AppAiRuntimeMonitor {
  readonly resolveRuntimeSession: AppAiPanelSessionResolver
  getSnapshot(): AppAiRuntimeMonitorSnapshot
  subscribe(listener: (snapshot: AppAiRuntimeMonitorSnapshot) => void): () => void
  focusSession(sessionId: string): AiSessionConfig | null
  appendHumanMessage(sessionId: string, content: string): AiRuntimeMessageHistoryEntry
  closeSession(sessionId: string, reason?: string): Promise<void>
}

export function createAppAiRuntimeMonitor(options: AppAiPanelResolverOptions): AppAiRuntimeMonitor {
  const sessions = new Map<string, {
    config: AiSessionConfig
    readonly session: AiHostBusinessSession
  }>()
  const configBySessionId = new Map<string, AiSessionConfig>()
  const listeners = new Set<(snapshot: AppAiRuntimeMonitorSnapshot) => void>()
  let activeSessionId: string | null = null

  const emit = () => {
    const snapshot = getSnapshot()
    for (const listener of listeners) listener(snapshot)
  }

  const resolveRuntimeSession: AppAiPanelSessionResolver = async (config) => {
    const target = resolveAiSessionTarget(config)
    const sessionKey = `${target.businessRegistrationId}:${target.businessInstanceId}`
    let entry = sessions.get(sessionKey)
    if (entry === undefined) {
      entry = {
        config,
        session: createAiHostBusinessSession(options, target),
      }
      sessions.set(sessionKey, entry)
    } else {
      entry.config = config
    }
    await entry.session.start()
    activeSessionId = entry.session.sessionId
    configBySessionId.set(entry.session.sessionId, config)
    emit()

    return {
      ...config,
      target,
      storageKey: entry.session.storageKey,
      pageId: config.pageId ?? entry.session.pageId,
      sender: async (request) => {
        await entry.session.send(toHostRequest(request))
        emit()
      },
    }
  }

  function getSnapshot(): AppAiRuntimeMonitorSnapshot {
    const runtimeSessions = options.registry.list().flatMap((runtime) => (
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
      activeSessionId: activeSessionId !== null && runtimeSessions.some((session) => session.sessionId === activeSessionId)
        ? activeSessionId
        : null,
      sessions: runtimeSessions,
    }
  }

  return {
    resolveRuntimeSession,
    getSnapshot,
    subscribe(listener) {
      listeners.add(listener)
      listener(getSnapshot())
      return () => {
        listeners.delete(listener)
      }
    },
    focusSession(sessionId) {
      if (findRuntimeSession(sessionId, options) === null) return null
      activeSessionId = sessionId
      emit()
      return configBySessionId.get(sessionId) ?? null
    },
    appendHumanMessage(sessionId, content) {
      const record = requireRuntimeSession(sessionId, options)
      const runtime = options.registry.get(record.moduleId)
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
      emit()
      return result
    },
    async closeSession(sessionId, reason = 'human intervention closed session') {
      const record = requireRuntimeSession(sessionId, options)
      const runtime = options.registry.get(record.moduleId)
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
      emit()
    },
  }
}

function findRuntimeSession(sessionId: string, options: AppAiPanelResolverOptions): AiRuntimeSessionRecord | null {
  for (const runtime of options.registry.list()) {
    const found = runtime.listSessions().find((session) => session.instanceId === sessionId)
    if (found !== undefined) return found
  }
  return null
}

function requireRuntimeSession(sessionId: string, options: AppAiPanelResolverOptions): AiRuntimeSessionRecord {
  const record = findRuntimeSession(sessionId, options)
  if (record === null) {
    throw new Error(`AI runtime session is not monitored: ${sessionId}`)
  }
  return record
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
