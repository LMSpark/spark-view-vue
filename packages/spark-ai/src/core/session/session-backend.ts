/**
 * 会话后端 HTTP 客户端统一实现。
 *
 * - SessionBackendImpl：运行时 stills 会话客户端（基于 createRequest）
 */

import { createFetchClient, createRequest, Logger } from '@spark-view/spark-utils'
import type {
  SessionBackend,
  LlmResponse,
  SessionBackendSseEvent,
  ToolCall,
  ToolDefinition,
} from './session-contracts'

const log = Logger('SessionBackend')

export interface SessionBackendImplOptions {
  getHeaders?: () => Record<string, string>
  onSseEvent?: (event: { sessionId: string; type: string; data: string }) => void
}

/**
 * 提取后端错误的可读摘要，避免上层只拿到“Network Error/null”这类弱信息。
 */
function toBackendErrorMessage(err: unknown): string {
  const fallback = err instanceof Error ? err.message : String(err)
  if (typeof err !== 'object' || err === null) {
    return fallback
  }
  const e = err as {
    message?: string
    status?: number
    code?: string
    response?: unknown
  }

  const status = typeof e.status === 'number' ? `HTTP ${e.status}` : ''
  const code = typeof e.code === 'string' && e.code.length > 0 ? e.code : ''

  const response = e.response
  if (typeof response === 'object' && response !== null) {
    const resp = e.response as {
      error?: { code?: string; message?: string; category?: string }
      state?: string
      stateTransition?: string
    }
    const errorCode = resp.error?.code ?? ''
    const errorMsg = resp.error?.message ?? ''
    const category = resp.error?.category ?? ''
    const state = typeof resp.state === 'string' ? resp.state : ''
    const stateTransition = typeof resp.stateTransition === 'string' ? resp.stateTransition : ''

    const parts = [
      status,
      code,
      errorCode,
      category,
      errorMsg,
      state ? `state=${state}` : '',
      stateTransition ? `transition=${stateTransition}` : '',
    ].filter(Boolean)

    if (parts.length > 0) {
      return parts.join(' | ')
    }
  }

  return [status, code, e.message ?? fallback].filter(Boolean).join(' | ') || fallback
}

export class SessionBackendImpl implements SessionBackend {
  private http = createRequest({ timeout: 300_000 })
  private sseClient = createFetchClient({ timeout: 300_000 })
  private sessionIds = new Set<string>()
  private baseUrl: string
  private readonly getHeaders: (() => Record<string, string>) | null
  private readonly onSseEvent: ((event: { sessionId: string; type: string; data: string }) => void) | null

  constructor(
    baseUrl = '/api/ai/sessions',
    options: SessionBackendImplOptions = {},
  ) {
    this.baseUrl = baseUrl
    this.getHeaders = options.getHeaders ?? null
    this.onSseEvent = options.onSseEvent ?? null

    this.http.interceptors.request.use({
      onRequest: (config) => {
        if (this.getHeaders) {
          config.headers = { ...config.headers, ...this.getHeaders() }
        }
        return config
      },
    })
  }

  async createSession(
    systemPrompt: string,
    userPrompt: string,
    windowSize: number,
    tools?: ToolDefinition[],
    signal?: AbortSignal,
  ): Promise<string> {
    const resp = await this.http.post<{ sessionId: string }>(`${this.baseUrl}`, {
      protocolVersion: 3,
      systemPrompt,
      userPrompt,
      windowSize,
      mode: 'stills',
      tools: tools ?? null,
    }, signal ? { signal } : undefined)

    const sessionId = resp.sessionId
    this.sessionIds.add(sessionId)
    return sessionId
  }

  async executeTurn(
    sessionId: string,
    options: { signal?: AbortSignal; onSseEvent?: (event: SessionBackendSseEvent) => void } = {},
  ): Promise<LlmResponse | null> {
    try {
      return await this.executeTurnViaSse(sessionId, options)
    } catch (err) {
      const detail = toBackendErrorMessage(err)
      log.error('executeTurn failed:', detail, err)
      throw new Error(`会话轮次调用失败: ${detail}`)
    }
  }

  private async executeTurnViaSse(
    sessionId: string,
    options: { signal?: AbortSignal; onSseEvent?: (event: SessionBackendSseEvent) => void } = {},
  ): Promise<LlmResponse> {
    const headers: Record<string, string> = this.getHeaders ? this.getHeaders() : {}
    const events = await this.sseClient.streamSSE({
      url: `${this.baseUrl}/${sessionId}/turn/stream`,
      method: 'POST',
      headers,
      ...(options.signal ? { signal: options.signal } : {}),
    })
    const onSseEvent = options.onSseEvent ?? this.onSseEvent

    let finalResult: LlmResponse | null = null
    let streamError = ''

    for await (const event of events) {
      const eventType = event.event ?? 'message'
      const data = event.data

      if (onSseEvent) {
        onSseEvent({
          sessionId,
          type: eventType,
          data,
        })
      }

      if (!data && eventType !== 'done') continue

      if (eventType === 'result') {
        try {
          const parsed = JSON.parse(data) as {
            text?: string
            reasoning?: string
            toolCalls?: ToolCall[]
          }
          finalResult = {
            text: parsed.text ?? '',
            ...(parsed.reasoning !== undefined ? { reasoning: parsed.reasoning } : {}),
            ...(parsed.toolCalls !== undefined ? { toolCalls: parsed.toolCalls } : {}),
          }
        } catch {
          finalResult = { text: data }
        }
      }

      if (eventType === 'error') {
        streamError = data
      }

      if (eventType === 'done') {
        break
      }
    }

    if (streamError) {
      throw new Error(`SSE error: ${streamError}`)
    }

    if (finalResult === null) {
      throw new Error('SSE 未返回 result 事件')
    }

    return finalResult
  }

  async appendMessages(
    sessionId: string,
    messages: Array<{
      role: string
      content: string
      tool_call_id?: string
      tool_calls?: ToolCall[]
    }>,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.http.post(`${this.baseUrl}/${sessionId}/append`, {
      protocolVersion: 3,
      messages,
    }, signal ? { signal } : undefined)
  }

  async getConversation(
    sessionId: string,
  ): Promise<Array<{ role: string; content: string }>> {
    const resp = await this.http.get<{ conversation: Array<{ role: string; content: string }> }>(
      `${this.baseUrl}/${sessionId}/conversation`
    )

    return resp.conversation
  }

  async destroySession(sessionId: string): Promise<void> {
    await this.http.delete(`${this.baseUrl}/${sessionId}`)
    this.sessionIds.delete(sessionId)
  }

  async destroyAllSessions(): Promise<void> {
    const ids = Array.from(this.sessionIds)
    for (const sessionId of ids) {
      await this.http.delete(`${this.baseUrl}/${sessionId}`)
    }
    this.sessionIds.clear()
  }
}

export function createSessionBackend(
  baseUrl?: string,
  options: SessionBackendImplOptions = {},
): SessionBackend {
  return new SessionBackendImpl(baseUrl, options)
}
