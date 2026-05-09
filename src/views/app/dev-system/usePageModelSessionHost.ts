import { onUnmounted, shallowRef } from 'vue'
import type { ShallowRef } from 'vue'
import { createFetchClient } from '@spark-view/spark-utils'
import {
  AiRuntime,
  PageDesignModule,
  type AiRuntimeApi,
  type AiRuntimeFunctionExposure,
  type AiRuntimeStartInstanceResult,
  type EditToolHost,
} from '@spark-view/spark-ai'
import { createAuthHeaders } from '@/services/http'

interface UsePageModelSessionHostOptions {
  getEditToolHost: () => EditToolHost
  getSessionKey: () => string
}

export interface PageModelFunctionContext {
  sessionKey: string
  instanceId: string
  moduleId: string
  moduleInstanceId: string
  availableFunctions: readonly AiRuntimeFunctionExposure[]
}

export interface PageModelBackendMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  tool_calls?: ReadonlyArray<Record<string, unknown>>
}

export interface PageModelBackendTurnResult {
  text: string
  reasoning?: string
  toolCalls?: ReadonlyArray<Record<string, unknown>>
  state?: string
  stateTransition?: string
  runtime?: unknown
}

export interface PageModelSessionHost {
  core: AiRuntimeApi
  context: ShallowRef<PageModelFunctionContext | null>
  ensureSession: () => Promise<PageModelFunctionContext>
  reset: () => Promise<void>
  resetSync: () => void
  setBackendSessionId: (sessionId: string | undefined) => void
  getResumeSessionOptions: () => { resumeSessionId?: string }
  hasSessionMismatch: (sessionKey?: string) => boolean
  createBackendSession: (options: {
    systemPrompt: string
    userPrompt: string
    tools: ReadonlyArray<Record<string, unknown>>
    signal?: AbortSignal
  }) => Promise<string>
  appendBackendMessages: (messages: readonly PageModelBackendMessage[], signal?: AbortSignal) => Promise<void>
  executeBackendTurn: (signal?: AbortSignal) => Promise<PageModelBackendTurnResult>
}

function createContext(sessionKey: string, session: AiRuntimeStartInstanceResult): PageModelFunctionContext {
  return {
    sessionKey,
    instanceId: session.instanceId,
    moduleId: session.moduleId,
    moduleInstanceId: session.moduleInstanceId,
    availableFunctions: session.availableFunctions,
  }
}

function createRecordIdFactory(): (kind: 'event' | 'message' | 'functionCall' | 'lifecycle' | 'exposure') => string {
  let record = 0
  return (kind) => `${kind}-${Date.now()}-${++record}`
}

export function usePageModelSessionHost(options: UsePageModelSessionHostOptions): PageModelSessionHost {
  const { getEditToolHost, getSessionKey } = options
  const http = createFetchClient()
  const core = new AiRuntime({ createRecordId: createRecordIdFactory() })
  core.registerModule(new PageDesignModule({ getEditToolHost }))

  const context = shallowRef<PageModelFunctionContext | null>(null)
  let backendSessionId: string | undefined

  async function reset(): Promise<void> {
    const current = context.value
    context.value = null
    backendSessionId = undefined
    if (current !== null) {
      await core.stopInstance({ instanceId: current.instanceId, mode: 'stop', reason: 'reset' })
    }
  }

  function resetSync(): void {
    context.value = null
    backendSessionId = undefined
  }

  async function ensureSession(): Promise<PageModelFunctionContext> {
    const sessionKey = getSessionKey()
    if (!sessionKey) {
      throw new Error('DevSystem AI 会话启动失败：缺少 activePageId。')
    }

    if (context.value !== null && context.value.sessionKey === sessionKey) {
      return context.value
    }

    if (context.value !== null) {
      await reset()
    }

    const session = await core.startInstance({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: sessionKey,
    })
    const nextContext = createContext(sessionKey, session)
    context.value = nextContext
    return nextContext
  }

  function setBackendSessionId(sessionId: string | undefined): void {
    backendSessionId = sessionId
  }

  function getResumeSessionOptions(): { resumeSessionId?: string } {
    return backendSessionId !== undefined ? { resumeSessionId: backendSessionId } : {}
  }

  function hasSessionMismatch(sessionKey = getSessionKey()): boolean {
    return context.value !== null && context.value.sessionKey !== sessionKey
  }

  async function createBackendSession(backendOptions: {
    systemPrompt: string
    userPrompt: string
    tools: ReadonlyArray<Record<string, unknown>>
    signal?: AbortSignal
  }): Promise<string> {
    const response = await http.post<{ sessionId: string }>('/api/ai/sessions', {
      protocolVersion: 3,
      systemPrompt: backendOptions.systemPrompt,
      userPrompt: backendOptions.userPrompt,
      windowSize: 30,
      mode: 'function',
      tools: backendOptions.tools,
    }, {
      headers: {
        'Content-Type': 'application/json',
        ...createAuthHeaders(),
      },
      ...(backendOptions.signal !== undefined ? { signal: backendOptions.signal } : {}),
    })
    backendSessionId = response.sessionId
    return response.sessionId
  }

  async function appendBackendMessages(messages: readonly PageModelBackendMessage[], signal?: AbortSignal): Promise<void> {
    if (backendSessionId === undefined) {
      throw new Error('追加 AI 会话消息失败：后端 session 尚未创建。')
    }
    await http.post(`/api/ai/sessions/${backendSessionId}/append`, {
      protocolVersion: 3,
      messages,
    }, {
      headers: {
        'Content-Type': 'application/json',
        ...createAuthHeaders(),
      },
      ...(signal !== undefined ? { signal } : {}),
    })
  }

  async function executeBackendTurn(signal?: AbortSignal): Promise<PageModelBackendTurnResult> {
    if (backendSessionId === undefined) {
      throw new Error('执行 AI 会话轮次失败：后端 session 尚未创建。')
    }
    return await http.post<PageModelBackendTurnResult>(`/api/ai/sessions/${backendSessionId}/turn`, {
      protocolVersion: 3,
      stream: false,
    }, {
      headers: {
        'Content-Type': 'application/json',
        ...createAuthHeaders(),
      },
      ...(signal !== undefined ? { signal } : {}),
    })
  }

  onUnmounted(() => {
    void reset()
  })

  return {
    core,
    context,
    ensureSession,
    reset,
    resetSync,
    setBackendSessionId,
    getResumeSessionOptions,
    hasSessionMismatch,
    createBackendSession,
    appendBackendMessages,
    executeBackendTurn,
  }
}
