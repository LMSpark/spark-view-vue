/**
 * 会话后端 HTTP 客户端统一实现。
 *
 * - SessionBackendImpl：运行时 stills 会话客户端（基于 createRequest）
 * - createGenerateSessionBackend：生成链会话客户端（基于 fetch）
 */

import { createFetchClient, createRequest } from '@spark-view/spark-utils'
import type { SessionBackend, LlmResponse } from './runtime/session-orchestrator'
import type { ToolCall, ToolDefinition } from './tool-calling'

let _getHeaders: (() => Record<string, string>) | null = null
let _onSseEvent: ((event: { sessionId: string; type: string; data: string }) => void) | null = null

export function configureSessionBackend(options: {
  getHeaders?: () => Record<string, string>
  onSseEvent?: (event: { sessionId: string; type: string; data: string }) => void
}): void {
  if (options.getHeaders) {
    _getHeaders = options.getHeaders
  }
  _onSseEvent = options.onSseEvent ?? null
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

  constructor(baseUrl = '/api/ai/sessions') {
    this.baseUrl = baseUrl

    this.http.interceptors.request.use({
      onRequest: (config) => {
        if (_getHeaders) {
          config.headers = { ...config.headers, ..._getHeaders() }
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
  ): Promise<string> {
    const resp = await this.http.post<{ sessionId: string }>(`${this.baseUrl}`, {
      protocolVersion: 3,
      systemPrompt,
      userPrompt,
      windowSize,
      mode: 'stills',
      tools: tools ?? null,
    })

    const sessionId = resp.sessionId
    this.sessionIds.add(sessionId)
    return sessionId
  }

  async executeTurn(sessionId: string): Promise<LlmResponse | null> {
    try {
      // 优先走 SSE 通道，确保与后端 /turn/stream 流式协议一致。
      return await this.executeTurnViaSse(sessionId)
    } catch (err) {
      const detail = toBackendErrorMessage(err)

      // 仅在 SSE 端点缺失/方法不允许时回退到非流式接口，避免掩盖真实 LLM 错误。
      const canFallback = detail.includes('HTTP 404')
        || detail.includes('HTTP 405')
        || detail.includes('INVALID_STREAM_ENDPOINT')

      if (canFallback) {
        console.warn('[SessionBackend] SSE turn unavailable, fallback to non-stream turn:', detail)
        return await this.executeTurnViaHttp(sessionId)
      }

      console.error('[SessionBackend] executeTurn failed:', detail, err)
      throw new Error(`会话轮次调用失败: ${detail}`)
    }
  }

  private async executeTurnViaHttp(sessionId: string): Promise<LlmResponse> {
    try {
      const resp = await this.http.post<{
        text: string
        reasoning?: string
        toolCalls?: ToolCall[]
      }>(`${this.baseUrl}/${sessionId}/turn`, {
        protocolVersion: 3,
      })

      const result: LlmResponse = { text: resp.text }
      if (resp.reasoning !== undefined) result.reasoning = resp.reasoning
      if (resp.toolCalls !== undefined) result.toolCalls = resp.toolCalls
      return result
    } catch (err) {
      const detail = toBackendErrorMessage(err)
      throw new Error(`会话轮次调用失败: ${detail}`)
    }
  }

  private async executeTurnViaSse(sessionId: string): Promise<LlmResponse> {
    const headers: Record<string, string> = _getHeaders ? _getHeaders() : {}
    const events = await this.sseClient.streamSSE({
      url: `${this.baseUrl}/${sessionId}/turn/stream`,
      method: 'POST',
      headers,
    })

    let finalResult: LlmResponse | null = null
    let streamError = ''

    for await (const event of events) {
      const eventType = event.event ?? 'message'
      const data = event.data
      if (!data) continue

      if (_onSseEvent) {
        _onSseEvent({
          sessionId,
          type: eventType,
          data,
        })
      }

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
          // result 非 JSON 时按纯文本兜底，避免直接丢失本轮回复。
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
  ): Promise<void> {
    await this.http.post(`${this.baseUrl}/${sessionId}/append`, {
      protocolVersion: 3,
      messages,
    })
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

export interface GenerateSessionBackendOptions {
  baseUrl: string
  token?: string
}

export function createGenerateSessionBackend(
  options: GenerateSessionBackendOptions,
): SessionBackend {
  const { baseUrl } = options
  const sessionIds: Set<string> = new Set()

  function headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (options.token) {
      h['Authorization'] = `Bearer ${options.token}`
    }
    return h
  }

  async function request<T>(path: string, init: RequestInit): Promise<T> {
    const url = `${baseUrl}${path}`
    const resp = await fetch(url, {
      ...init,
      headers: { ...headers(), ...(init.headers as Record<string, string> | undefined) },
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(`HTTP ${resp.status}: ${text}`)
    }
    return resp.json() as Promise<T>
  }

  return {
    async createSession(
      systemPrompt: string,
      userPrompt: string,
      windowSize: number,
      tools?: ToolDefinition[],
    ): Promise<string> {
      const body: Record<string, unknown> = {
        protocolVersion: 3,
        systemPrompt,
        userPrompt,
        windowSize,
        mode: 'generate',
      }
      if (tools) {
        body['tools'] = tools
      }
      const result = await request<{ sessionId: string }>('/api/ai/sessions', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      sessionIds.add(result.sessionId)
      return result.sessionId
    },

    async executeTurn(sessionId: string): Promise<LlmResponse | null> {
      try {
        const result = await request<{
          text?: string
          reasoning?: string
          toolCalls?: ToolCall[]
        }>(`/api/ai/sessions/${sessionId}/turn`, {
          method: 'POST',
          body: JSON.stringify({ protocolVersion: 3 }),
        })
        return {
          text: result.text ?? '',
          ...(result.reasoning !== undefined ? { reasoning: result.reasoning } : {}),
          ...(result.toolCalls !== undefined ? { toolCalls: result.toolCalls } : {}),
        }
      } catch (err) {
        const detail = toBackendErrorMessage(err)
        throw new Error(`会话轮次调用失败: ${detail}`)
      }
    },

    async appendMessages(
      sessionId: string,
      messages: Array<{ role: string; content: string; tool_call_id?: string; tool_calls?: ToolCall[] }>,
    ): Promise<void> {
      await request<unknown>(`/api/ai/sessions/${sessionId}/append`, {
        method: 'POST',
        body: JSON.stringify({ protocolVersion: 3, messages }),
      })
    },

    async getConversation(sessionId: string): Promise<Array<{ role: string; content: string }>> {
      const result = await request<{ conversation: Array<{ role: string; content: string }> }>(
        `/api/ai/sessions/${sessionId}/conversation`,
        { method: 'GET' },
      )
      return result.conversation
    },

    async destroySession(sessionId: string): Promise<void> {
      await request<unknown>(`/api/ai/sessions/${sessionId}`, { method: 'DELETE' })
      sessionIds.delete(sessionId)
    },

    async destroyAllSessions(): Promise<void> {
      if (sessionIds.size === 0) return
      const ids = [...sessionIds]
      await request<unknown>('/api/ai/sessions', {
        method: 'DELETE',
        body: JSON.stringify({ sessionIds: ids }),
      })
      sessionIds.clear()
    },
  }
}
