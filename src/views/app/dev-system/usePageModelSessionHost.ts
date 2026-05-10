import { onUnmounted, shallowRef } from 'vue'
import type { ShallowRef } from 'vue'
import { createFetchClient } from '@spark-view/spark-utils'
import {
  PageDesignModule,
  type AiRuntimeFunctionExposure,
  type AiRuntimeFunctionCallResult,
  type AiRuntimeMessageHistoryEntry,
  type AiRuntimeMessageRole,
  type AiRuntimeMessageSource,
  type AiRuntimeStartInstanceResult,
  type EditToolHost,
} from '@spark-view/spark-ai'
import { createAuthHeaders } from '@/services/http'

interface UsePageModelSessionHostOptions {
  getEditToolHost: () => EditToolHost
  getSessionKey: () => string
}

/**
 * DevSystem AI 的 /turn 是非流式长轮次请求，后端 LLM read timeout 为 180-300s。
 * 前端不能沿用 FetchClient 默认 10s，否则模型还没返回就会被浏览器侧 abort。
 */
export const PAGE_MODEL_AI_SESSION_TIMEOUT_MS = 300_000

export interface PageModelFunctionContext {
  sessionKey: string
  scopeKey: string
  instanceId: string
  runtimeInstanceId: string
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
  context: ShallowRef<PageModelFunctionContext | null>
  ensureSession: () => Promise<PageModelFunctionContext>
  reset: () => Promise<void>
  resetSync: () => void
  appendRuntimeMessage: (message: {
    context?: PageModelFunctionContext
    role: AiRuntimeMessageRole
    content: string
    source?: AiRuntimeMessageSource
    metadata?: Record<string, unknown>
  }) => Promise<AiRuntimeMessageHistoryEntry>
  setBackendSessionId: (sessionId: string | undefined, scopeKey?: string) => void
  getResumeSessionOptions: (scopeKey?: string) => { resumeSessionId?: string }
  hasSessionMismatch: (sessionKey?: string) => boolean
  createBackendSession: (options: {
    context?: PageModelFunctionContext
    systemPrompt: string
    userPrompt: string
    tools: ReadonlyArray<Record<string, unknown>>
    signal?: AbortSignal
  }) => Promise<string>
  executeFunctionCall: (options: {
    scopeKey?: string
    instanceId: string
    action: string
    args: unknown
  }) => Promise<{ result: AiRuntimeFunctionCallResult<unknown> }>
  appendBackendMessages: (messages: readonly PageModelBackendMessage[], signal?: AbortSignal, scopeKey?: string) => Promise<void>
  executeBackendTurn: (signal?: AbortSignal, scopeKey?: string) => Promise<PageModelBackendTurnResult>
}

function createScopeKey(moduleId: string, moduleInstanceId: string): string {
  return `${moduleId}\u0000${moduleInstanceId}`
}

function createTraceScope(context: PageModelFunctionContext): Record<string, string> {
  return {
    moduleId: context.moduleId,
    moduleInstanceId: context.moduleInstanceId,
    instanceId: context.instanceId,
    runtimeInstanceId: context.runtimeInstanceId,
  }
}

function createContext(sessionKey: string, session: AiRuntimeStartInstanceResult): PageModelFunctionContext {
  const runtimeInstanceId = session.scope.runtimeInstanceId
  const scopeKey = createScopeKey(session.moduleId, session.moduleInstanceId)
  return {
    sessionKey,
    scopeKey,
    instanceId: session.instanceId,
    runtimeInstanceId,
    moduleId: session.moduleId,
    moduleInstanceId: session.moduleInstanceId,
    availableFunctions: session.availableFunctions,
  }
}

export function usePageModelSessionHost(options: UsePageModelSessionHostOptions): PageModelSessionHost {
  const { getEditToolHost, getSessionKey } = options
  const http = createFetchClient({ timeout: PAGE_MODEL_AI_SESSION_TIMEOUT_MS })
  const pageDesignModule = new PageDesignModule({ getEditToolHost })

  const context = shallowRef<PageModelFunctionContext | null>(null)
  const contextsByScopeKey = new Map<string, PageModelFunctionContext>()
  const backendSessionIdsByScopeKey = new Map<string, string>()

  function getCurrentScopeKey(): string | undefined {
    return context.value?.scopeKey
  }

  function resolveContext(scopeKey = getCurrentScopeKey()): PageModelFunctionContext | null {
    if (scopeKey === undefined) return null
    return contextsByScopeKey.get(scopeKey) ?? null
  }

  function reset(): Promise<void> {
    const current = context.value
    context.value = null
    if (current !== null) {
      contextsByScopeKey.delete(current.scopeKey)
      backendSessionIdsByScopeKey.delete(current.scopeKey)
      pageDesignModule.stopSession({
        moduleId: PageDesignModule.moduleId,
        moduleInstanceId: current.moduleInstanceId,
        instanceId: current.instanceId,
        reason: 'reset',
      })
    }
    return Promise.resolve()
  }

  function resetSync(): void {
    context.value = null
  }

  async function ensureSession(): Promise<PageModelFunctionContext> {
    const sessionKey = getSessionKey()
    if (!sessionKey) {
      throw new Error('DevSystem AI 会话启动失败：缺少 activePageId。')
    }

    if (context.value !== null && context.value.sessionKey === sessionKey) {
      return context.value
    }

    const scopeKey = createScopeKey(PageDesignModule.moduleId, sessionKey)
    const existing = contextsByScopeKey.get(scopeKey)
    if (existing !== undefined) {
      context.value = existing
      return existing
    }

    const session = await pageDesignModule.startSession({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: sessionKey,
      instanceId: sessionKey,
    })
    const nextContext = createContext(sessionKey, session)
    contextsByScopeKey.set(nextContext.scopeKey, nextContext)
    context.value = nextContext
    return nextContext
  }

  async function appendRuntimeMessage(message: {
    context?: PageModelFunctionContext
    role: AiRuntimeMessageRole
    content: string
    source?: AiRuntimeMessageSource
    metadata?: Record<string, unknown>
  }): Promise<AiRuntimeMessageHistoryEntry> {
    const sessionContext = message.context ?? context.value ?? await ensureSession()
    return pageDesignModule.appendMessage({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: sessionContext.moduleInstanceId,
      instanceId: sessionContext.instanceId,
      role: message.role,
      content: message.content,
      ...(message.source === undefined ? {} : { source: message.source }),
      ...(message.metadata === undefined ? {} : { metadata: message.metadata }),
    })
  }

  function setBackendSessionId(sessionId: string | undefined, scopeKey = getCurrentScopeKey()): void {
    if (scopeKey === undefined) return
    if (sessionId === undefined) {
      backendSessionIdsByScopeKey.delete(scopeKey)
      return
    }
    backendSessionIdsByScopeKey.set(scopeKey, sessionId)
  }

  function getResumeSessionOptions(scopeKey = getCurrentScopeKey()): { resumeSessionId?: string } {
    if (scopeKey === undefined) return {}
    const backendSessionId = backendSessionIdsByScopeKey.get(scopeKey)
    return backendSessionId !== undefined ? { resumeSessionId: backendSessionId } : {}
  }

  function hasSessionMismatch(sessionKey = getSessionKey()): boolean {
    return context.value !== null && context.value.sessionKey !== sessionKey
  }

  async function createBackendSession(backendOptions: {
    context?: PageModelFunctionContext
    systemPrompt: string
    userPrompt: string
    tools: ReadonlyArray<Record<string, unknown>>
    signal?: AbortSignal
  }): Promise<string> {
    const sessionContext = backendOptions.context ?? context.value ?? await ensureSession()
    const trace = createTraceScope(sessionContext)
    const response = await http.post<{ sessionId: string }>('/api/ai/sessions', {
      protocolVersion: 3,
      scope: trace,
      metadata: {
        source: 'dev-system-page-model',
        trace,
      },
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
    backendSessionIdsByScopeKey.set(sessionContext.scopeKey, response.sessionId)
    return response.sessionId
  }

  async function appendBackendMessages(messages: readonly PageModelBackendMessage[], signal?: AbortSignal, scopeKey = getCurrentScopeKey()): Promise<void> {
    const sessionContext = resolveContext(scopeKey)
    if (sessionContext === null) {
      throw new Error('追加 AI 会话消息失败：页面模型会话尚未启动。')
    }
    const backendSessionId = backendSessionIdsByScopeKey.get(sessionContext.scopeKey)
    if (backendSessionId === undefined) {
      throw new Error('追加 AI 会话消息失败：后端 session 尚未创建。')
    }
    const trace = createTraceScope(sessionContext)
    await http.post(`/api/ai/sessions/${backendSessionId}/append`, {
      protocolVersion: 3,
      scope: trace,
      messages,
    }, {
      headers: {
        'Content-Type': 'application/json',
        ...createAuthHeaders(),
      },
      ...(signal !== undefined ? { signal } : {}),
    })
  }

  async function executeFunctionCall(callOptions: {
    scopeKey?: string
    instanceId: string
    action: string
    args: unknown
  }): Promise<{ result: AiRuntimeFunctionCallResult<unknown> }> {
    const current = resolveContext(callOptions.scopeKey)
    if (current === null) {
      throw new Error('执行 AI 工具失败：页面模型会话尚未启动。')
    }
    const result = await pageDesignModule.executeFunctionCall({
      moduleId: PageDesignModule.moduleId,
      moduleInstanceId: current.moduleInstanceId,
      instanceId: callOptions.instanceId,
      action: callOptions.action,
      args: callOptions.args,
    })
    return { result }
  }

  async function executeBackendTurn(signal?: AbortSignal, scopeKey = getCurrentScopeKey()): Promise<PageModelBackendTurnResult> {
    const sessionContext = resolveContext(scopeKey)
    if (sessionContext === null) {
      throw new Error('执行 AI 会话轮次失败：页面模型会话尚未启动。')
    }
    const backendSessionId = backendSessionIdsByScopeKey.get(sessionContext.scopeKey)
    if (backendSessionId === undefined) {
      throw new Error('执行 AI 会话轮次失败：后端 session 尚未创建。')
    }
    const trace = createTraceScope(sessionContext)
    return await http.post<PageModelBackendTurnResult>(`/api/ai/sessions/${backendSessionId}/turn`, {
      protocolVersion: 3,
      scope: trace,
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
    context,
    ensureSession,
    reset,
    resetSync,
    appendRuntimeMessage,
    setBackendSessionId,
    getResumeSessionOptions,
    hasSessionMismatch,
    createBackendSession,
    executeFunctionCall,
    appendBackendMessages,
    executeBackendTurn,
  }
}
